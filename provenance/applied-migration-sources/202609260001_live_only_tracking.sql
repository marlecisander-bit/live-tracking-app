-- Live-only candidate. Offline packaging only; no automatic deployment.
-- Existing historical data remains frozen for explicit backup/disposal review.
-- Deploy the matching worker and frontend together; stop old ETA/segment schedules at cutover.
begin;
alter table public.vehicle_stop_state add column operational_state jsonb;
drop trigger if exists snapshot_tracking_event_counters on public.stop_events;
drop trigger if exists finalize_tracking_segment on public.stop_events;
drop trigger if exists retain_tracking_tour_distance on public.tour_runs;
drop trigger if exists retain_provider_tour on public.vehicle_stop_state;
CREATE OR REPLACE FUNCTION public.accumulate_tracking_input()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old public.tracking_distance_cursor; cfg public.tracking_runtime_config;
 dt double precision; metres double precision=0; driving double precision=0; stopped double precision=0; gap bigint=0;
 moving boolean; start_time timestamptz; part_end timestamptz; fraction double precision; day date; samples jsonb;
begin
 new.diagnostic_sample=false;
 if not new.lean_input or new.tracking_source_run_id is null then return new;end if;
 select * into cfg from tracking_runtime_config;
 -- Ingestion already holds settings then vehicle locks; retries cannot count twice.
 select * into old from tracking_distance_cursor where vehicle_id=new.vehicle_id for update;
 if old.tracking_source_run_id=new.tracking_source_run_id and old.recorded_at>=new.source_recorded_at then raise exception 'Non-monotonic analytics input';end if;
 if (select count(*) from (select h.id from gps_history h
  where h.vehicle_id=new.vehicle_id and h.lean_input
  and (not h.diagnostic_sample or exists(select 1 from tracking_source_runs active where active.id=h.tracking_source_run_id and active.ended_at is null))
  and not exists(select 1 from vehicle_stop_state s join gps_history cursor on cursor.id=s.last_gps_history_id
    where s.vehicle_id=h.vehicle_id and cursor.tracking_source_run_id=h.tracking_source_run_id and cursor.source_recorded_at>=h.source_recorded_at)
  limit cfg.max_pending_inputs) pending)>=cfg.max_pending_inputs then
  raise exception 'Tracking buffer full; processing recovery required' using errcode='54000';
 end if;
 dt=extract(epoch from new.source_recorded_at-old.recorded_at);
 if old.vehicle_id is not null then
  if old.tracking_source_run_id<>new.tracking_source_run_id or dt>cfg.distance_gap_seconds then gap=1;
  else
   metres=12742000*asin(sqrt(least(1.0,power(sin(radians(new.latitude-old.latitude)/2),2)+cos(radians(new.latitude))*cos(radians(old.latitude))*power(sin(radians(new.longitude-old.longitude)/2),2))));
   if greatest(0,metres-coalesce(new.accuracy_m,0)-coalesce(old.accuracy_m,0))/dt>50 then
    raise exception 'Implausible analytics GPS jump' using errcode='22023';
   end if;
   moving=coalesce(new.speed_kmh>cfg.moving_kmh,false) or metres>greatest(cfg.jitter_metres,coalesce(new.accuracy_m,0),coalesce(old.accuracy_m,0));
   if moving then driving=dt;else stopped=dt;metres=0;end if;
   if metres<=greatest(3,coalesce(new.accuracy_m,0),coalesce(old.accuracy_m,0)) then metres=0;end if;
  end if;
 end if;
 new.cumulative_distance_m=null;
 new.cumulative_driving_seconds=null;
 new.cumulative_stationary_seconds=null;
 new.cumulative_gaps=null;
 samples=case when old.tracking_source_run_id=new.tracking_source_run_id and gap=0 then old.speed_samples else '[]'::jsonb end;
 select coalesce(jsonb_agg(v order by n),'[]'::jsonb) into samples from (
  select v,n from jsonb_array_elements(coalesce(samples,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('speed_kmh',new.speed_kmh,'source_recorded_at',new.source_recorded_at))) with ordinality as a(v,n)
  where (v->>'source_recorded_at')::timestamptz>=new.source_recorded_at-interval '2 minutes' order by n desc limit 24
 ) bounded;
 insert into tracking_distance_cursor values(new.vehicle_id,new.project_id,new.id,new.tracking_source_run_id,new.source_recorded_at,new.latitude,new.longitude,new.accuracy_m,
 0,0,0,0,samples,coalesce(old.started_at,new.source_recorded_at))
 on conflict(vehicle_id) do update set last_input_id=excluded.last_input_id,tracking_source_run_id=excluded.tracking_source_run_id,
 recorded_at=excluded.recorded_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,
 distance_m=excluded.distance_m,driving_seconds=excluded.driving_seconds,stationary_seconds=excluded.stationary_seconds,gaps=excluded.gaps,speed_samples=excluded.speed_samples;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.accept_current_tracking(report jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old public.tracking_provider_current; next public.tracking_provider_current;
 cfg public.tracking_runtime_config; delta numeric; distance numeric; moving boolean;
 archive boolean; selected_run bigint; feature jsonb; metres numeric; closest numeric=1e12; stop_no text; stop_label text;
 fix_time timestamptz=(report->>'source_recorded_at')::timestamptz;
begin
 select * into cfg from tracking_runtime_config;
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=(report->>'project_id')::uuid for update of s;
 perform 1 from vehicles where external_id=report->>'vehicle_id' and project_id=(report->>'project_id')::uuid for update;
 if not found then raise exception 'Invalid live binding' using errcode='42501';end if;
 if fix_time is null or fix_time>clock_timestamp()+interval '60 seconds' or fix_time<clock_timestamp()-interval '24 hours'
 or report->>'source' not in ('pixel-android','scorpiontrack')
 or (report->>'latitude')::double precision not between -90 and 90
 or (report->>'longitude')::double precision not between -180 and 180
 or report->>'latitude' is null or report->>'longitude' is null
 or (report->>'accuracy_m')::numeric<0 or (report->>'accuracy_m')::numeric>50
 then raise exception 'Invalid live fix' using errcode='22023';end if;
 select * into old from tracking_provider_current where vehicle_id=report->>'vehicle_id' and source=report->>'source';
 if old.source_recorded_at=fix_time then
  if old.payload is distinct from report then raise exception 'Conflicting live replay' using errcode='23505';end if;
  return jsonb_build_object('duplicate',true,'archive',false);
 end if;
 if old.source_recorded_at>fix_time then return jsonb_build_object('stale',true,'archive',false);end if;
 next=jsonb_populate_record(null::tracking_provider_current,report);
 next.payload=report;next.received_at=clock_timestamp();next.last_archived_at=old.last_archived_at;
 next.reported_health=old.reported_health;
 next.anchor_lat=coalesce(old.anchor_lat,next.latitude);next.anchor_lon=coalesce(old.anchor_lon,next.longitude);
 delta=extract(epoch from fix_time-old.source_recorded_at);
 -- UI eligibility is independent of sampling and never confirms an event.
 -- Scorpion does not report horizontal accuracy; unknown is provisional-only.
 next.ui_observation_valid=(next.accuracy_m between 0 and 50 or (next.accuracy_m is null and next.source='scorpiontrack'));
 if old.vehicle_id is not null and delta>0 then
  next.ui_observation_valid=next.ui_observation_valid and
   greatest(0,12742000*asin(sqrt(least(1.0,power(sin(radians(next.latitude-old.latitude)/2),2)+cos(radians(next.latitude))*cos(radians(old.latitude))*power(sin(radians(next.longitude-old.longitude)/2),2))))-coalesce(next.accuracy_m,0)-coalesce(old.accuracy_m,0))/delta<=50;
 end if;
 if not next.ui_observation_valid then raise exception 'Implausible live GPS jump or unknown device accuracy' using errcode='22023';end if;
 -- A pre-gap anchor cannot establish movement after a reporting outage.
 if delta>cfg.delayed_seconds then next.anchor_lat=next.latitude;next.anchor_lon=next.longitude;end if;
 distance=12742000*asin(sqrt(least(1.0,power(sin(radians(next.latitude-next.anchor_lat)/2),2)+cos(radians(next.latitude))*cos(radians(next.anchor_lat))*power(sin(radians(next.longitude-next.anchor_lon)/2),2))));
 moving=coalesce(next.speed_kmh>cfg.moving_kmh,false) or distance>greatest(cfg.jitter_metres,coalesce(next.accuracy_m,0));
 next.moving_streak=case when moving then case when delta<=cfg.delayed_seconds then old.moving_streak+1 else 1 end else 0 end;
 next.low_since=case when moving then null when delta<=cfg.delayed_seconds then coalesce(old.low_since,fix_time) else fix_time end;
 next.movement_state=case when next.moving_streak>=2 then 'MOVING'
  when not moving and fix_time-next.low_since>=make_interval(secs=>cfg.stationary_seconds) then 'STATIONARY'
  when next.moving_streak=1 and delta<=cfg.delayed_seconds and old.movement_state in ('STATIONARY','PARKED_AT_STOP') then 'STATIONARY'
  when delta<=cfg.delayed_seconds and old.movement_state='MOVING' then 'MOVING' else 'UNKNOWN' end;
 -- Use configured stops, excluding inactive/invalid geometries. No inferred stop names.
 next.stop_number=null;next.stop_name=null;next.stop_since=null;
 -- Freeze stationary display at its anchor, not its drifting sub-threshold coordinates.
 if next.movement_state='MOVING' then next.anchor_lat=next.latitude;next.anchor_lon=next.longitude;end if;
 archive=old.vehicle_id is null or old.movement_state is distinct from next.movement_state or old.stop_number is distinct from stop_no
  or delta>cfg.delayed_seconds
  or (next.movement_state='MOVING' and fix_time-old.last_archived_at>=make_interval(secs=>cfg.archive_seconds));
 if archive then next.last_archived_at=fix_time;end if;
 insert into tracking_provider_current select next.* on conflict(vehicle_id,source) do update set
 source_recorded_at=excluded.source_recorded_at,received_at=excluded.received_at,latitude=excluded.latitude,longitude=excluded.longitude,
 speed_kmh=excluded.speed_kmh,accuracy_m=excluded.accuracy_m,bearing_deg=excluded.bearing_deg,
 anchor_lat=excluded.anchor_lat,anchor_lon=excluded.anchor_lon,low_since=excluded.low_since,moving_streak=excluded.moving_streak,
 ui_observation_valid=excluded.ui_observation_valid,movement_state=excluded.movement_state,stop_number=excluded.stop_number,stop_name=excluded.stop_name,stop_since=excluded.stop_since,
 last_archived_at=excluded.last_archived_at,payload=excluded.payload,tracking_source_run_id=excluded.tracking_source_run_id;
 select tracking_source_run_id into selected_run from tracking_provider_current where vehicle_id=next.vehicle_id and source=next.source;
 if selected_run is not null and selected_run is distinct from old.tracking_source_run_id then
  archive=true;
  update tracking_provider_current set last_archived_at=fix_time where vehicle_id=next.vehicle_id and source=next.source;
 end if;
 if selected_run is not null and old.movement_state is distinct from next.movement_state then
  insert into tracking_status_events(project_id,vehicle_id,source,event_type,event_at)
  values(next.project_id,next.vehicle_id,next.source,case next.movement_state when 'MOVING' then 'MOVEMENT_STARTED' when 'PARKED_AT_STOP' then 'PARKED' else next.movement_state end,fix_time);
 end if;
 if selected_run is not null and selected_run is distinct from old.tracking_source_run_id then
  insert into tracking_status_events(project_id,vehicle_id,source,event_type,event_at) values(next.project_id,next.vehicle_id,next.source,'GPS_PROVIDER_CHANGED',fix_time);
 end if;
 perform record_tracking_health(next.vehicle_id);
 return jsonb_build_object('archive',archive,'movement_state',next.movement_state);
end $function$
;
create or replace view public.selected_stop_state with (security_invoker=true) as select s.* from public.vehicle_stop_state s join public.active_gps_history h on h.id=s.last_gps_history_id;
CREATE OR REPLACE FUNCTION public.refresh_tracking_live_snapshot(target_vehicle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare value jsonb; owner_project uuid; current_input public.tracking_provider_current; cfg public.tracking_runtime_config;
begin
 select project_id into owner_project from vehicles where external_id=target_vehicle for update;
 if owner_project is null then return;end if;
 select * into cfg from tracking_runtime_config;
 select c.* into current_input from tracking_provider_current c join tracking_source_runs r on r.id=c.tracking_source_run_id
 where c.vehicle_id=target_vehicle and c.project_id=owner_project and r.ended_at is null order by c.source_recorded_at desc limit 1;
 select jsonb_build_object('selection',s.gps_source,
 'position',case when current_input.vehicle_id is null then null else jsonb_build_object(
 'latitude',case when current_input.movement_state in ('STATIONARY','PARKED_AT_STOP') then current_input.anchor_lat else current_input.latitude end,
 'longitude',case when current_input.movement_state in ('STATIONARY','PARKED_AT_STOP') then current_input.anchor_lon else current_input.longitude end,
 'ui_observation_valid',current_input.ui_observation_valid,'accuracy_m',current_input.accuracy_m,
 'observation_latitude',current_input.latitude,'observation_longitude',current_input.longitude,
 'source_run_id',current_input.tracking_source_run_id,'speed_kmh',current_input.speed_kmh,'bearing_deg',current_input.bearing_deg,'source',current_input.source,
 'source_recorded_at',current_input.source_recorded_at,'received_at',current_input.received_at,
 'movement_state',current_input.movement_state,'current_stop_number',case when current_input.movement_state='PARKED_AT_STOP' then current_input.stop_number end,
 'current_stop_name',case when current_input.movement_state='PARKED_AT_STOP' then current_input.stop_name end,
 'reported_stop_number',current_input.stop_number,'reported_stop_name',current_input.stop_name,
 'reported_stopped',coalesce(current_input.speed_kmh between 0 and 1 and current_input.stop_number is not null and current_input.movement_state<>'MOVING',false),
 'delayed_seconds',cfg.delayed_seconds,'offline_seconds',cfg.offline_seconds) end,
 'stop',(select to_jsonb(st) from selected_stop_state st where st.vehicle_id=target_vehicle and st.project_id=owner_project),
 'eta',case when current_input.movement_state in ('STATIONARY','PARKED_AT_STOP') then null else
 (select to_jsonb(e) from selected_eta_state e where e.vehicle_id=target_vehicle and e.project_id=owner_project) end)
 into value from projects p left join live_map_settings s on s.project_slug=p.slug where p.id=owner_project;

 -- One worker-owned stop/ETA projection for public map and admin consumers.
 if value#>>'{stop,operational_state,version}'='3' then
  value=jsonb_set(value,'{stop,operational_state}',(value#>'{stop,operational_state}')-'samples');
  value=jsonb_set(value,'{position}',(value->'position')||jsonb_build_object(
   'current_stop_number',value#>'{stop,operational_state,currentStop}',
   'current_stop_name',value#>'{stop,current_stop_name}',
   'reported_stop_number',value#>'{stop,operational_state,currentStop}',
   'reported_stop_name',value#>'{stop,current_stop_name}',
   'reported_stopped',value#>>'{stop,operational_state,status}'='PARKED',
   'movement_state',case when value#>>'{stop,operational_state,status}'='PARKED' then 'PARKED_AT_STOP' else current_input.movement_state end));
  value=jsonb_set(value,'{eta}',case when value#>>'{stop,operational_state,etaSeconds}' is null then 'null'::jsonb else jsonb_build_object(
   'vehicle_id',target_vehicle,'project_id',owner_project,'map_version_id',value#>'{stop,map_version_id}',
   'next_stop_number',value#>'{stop,operational_state,nextStop}',
   'eta_seconds',value#>'{stop,operational_state,etaSeconds}',
   'eta_minutes',(value#>>'{stop,operational_state,etaSeconds}')::numeric/60,
   'remaining_distance_m',value#>'{stop,operational_state,distanceToNextMetres}',
   'calculated_at',value#>'{stop,operational_state,timestamp}','eta_source','live_route','confidence','MEDIUM') end);
 else value=jsonb_set(value,'{eta}','null'::jsonb);end if;
 insert into tracking_live_snapshots(vehicle_id,project_id,snapshot) values(target_vehicle,owner_project,value)
 on conflict(vehicle_id) do update set snapshot=excluded.snapshot,revision=tracking_live_snapshots.revision+1,updated_at=clock_timestamp()
 where tracking_live_snapshots.snapshot is distinct from excluded.snapshot;
end $function$
;
CREATE OR REPLACE FUNCTION public.commit_provider_transition(point_id bigint, expected_state jsonb, next_state jsonb, new_events jsonb, version_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare gps public.gps_history; context jsonb; current_state jsonb; payload jsonb=next_state;
 item jsonb; columns_sql text; select_sql text; updates_sql text; inserted_id jsonb; event_index integer=0;
begin
 select * into gps from gps_history where id=point_id;
 if gps.id is null then return jsonb_build_object('status','stale');end if;
 -- Same lock order as source selection: settings, then the vehicle.
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=gps.project_id for update of s;
 perform 1 from vehicles where external_id=gps.vehicle_id and project_id=gps.project_id for update;
 if not found then raise exception 'Vehicle binding missing';end if;
 select to_jsonb(s) into current_state from vehicle_stop_state s where s.vehicle_id=gps.vehicle_id;
 if current_state->>'last_gps_history_id'=point_id::text then return jsonb_build_object('status','duplicate');end if;
 if current_state is distinct from expected_state then return jsonb_build_object('status','retry');end if;
 context=provider_processing_context(gps.vehicle_id);
 if context is null or (context->'gps'->>'id')::bigint<>point_id then return jsonb_build_object('status','stale');end if;
 if (context->'map_version'->>'id')::bigint<>version_id then return jsonb_build_object('status','retry');end if;
 if payload->>'vehicle_id' is distinct from gps.vehicle_id or (payload->>'project_id')::uuid is distinct from gps.project_id
 or (payload->>'last_gps_history_id')::bigint is distinct from point_id or (payload->>'map_version_id')::bigint is distinct from version_id then raise exception 'State identity mismatch';end if;

 -- Reject an old worker after cutover; it must not resume historical event writes.
 if new_events is distinct from '[]'::jsonb or payload#>>'{operational_state,version}' is distinct from '3'
 then raise exception 'Live-only worker version required';end if;
 if coalesce(payload#>>'{operational_state,status}','') not in ('APPROACHING','ARRIVING','PARKED','DEPARTED')
 or coalesce(payload#>>'{operational_state,nextStop}','') not in ('1','2','3','4','5')
 or payload#>>'{operational_state,sourceRun}' is distinct from gps.tracking_source_run_id::text
 or payload#>>'{operational_state,mapVersion}' is distinct from version_id::text
 or (payload#>>'{operational_state,timestamp}')::timestamptz is distinct from gps.source_recorded_at
 then raise exception 'Operational state identity mismatch';end if;
 perform set_config('app.provider_transition','true',true);
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into columns_sql,select_sql,updates_sql from jsonb_object_keys(payload) key;
 execute format('insert into vehicle_stop_state(%s) select %s from jsonb_populate_record(null::vehicle_stop_state,$1) r on conflict(vehicle_id) do update set %s',columns_sql,select_sql,updates_sql) using payload;
 return jsonb_build_object('status','processed','events',event_index);
end $function$
;
revoke select on public.gps_history,public.active_gps_history,public.selected_gps_history,public.selected_stop_state from anon;
update public.tracking_runtime_config set delayed_seconds=90,offline_seconds=300;
drop function if exists public.lean_tracking_analytics(text,integer);
drop function if exists public.public_segment_eta_statistics(uuid,bigint);
-- No CASCADE and no history deletion. Retired tables are not active business writers.
commit;
