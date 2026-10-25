begin;
alter table public.tracking_provider_current add column ui_observation_valid boolean not null default false;
create or replace function public.accept_current_tracking(report jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
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
 for feature in select f from map_versions m cross join lateral jsonb_array_elements(m.map_data->'features') f
 where m.id=(select id from map_versions where project_id=next.project_id and status='published' order by published_at desc nulls last,id desc limit 1)
 and f->'geometry'->>'type'='Point' and f->'properties'->>'pointType'='stop' and coalesce(f->'properties'->>'active','true')<>'false'
 loop
  if jsonb_typeof(feature->'geometry'->'coordinates'->0)<>'number' or jsonb_typeof(feature->'geometry'->'coordinates'->1)<>'number' then continue;end if;
  metres=12742000*asin(sqrt(least(1.0,power(sin(radians(next.latitude-(feature->'geometry'->'coordinates'->>1)::double precision)/2),2)+cos(radians(next.latitude))*cos(radians((feature->'geometry'->'coordinates'->>1)::double precision))*power(sin(radians(next.longitude-(feature->'geometry'->'coordinates'->>0)::double precision)/2),2))));
  if metres<closest and metres<=(case when old.stop_number=feature->'properties'->>'stopNumber' then 130 else 100 end) then
   closest=metres;stop_no=feature->'properties'->>'stopNumber';stop_label=feature->'properties'->>'name';
  end if;
 end loop;
 next.stop_number=stop_no;next.stop_name=stop_label;
 next.stop_since=case when stop_no is not null and stop_no=old.stop_number and delta<=cfg.delayed_seconds then coalesce(old.stop_since,fix_time) when stop_no is not null then fix_time end;
 if next.movement_state='STATIONARY' and stop_no is not null and fix_time-next.stop_since>=make_interval(secs=>cfg.stationary_seconds) then next.movement_state='PARKED_AT_STOP';end if;
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
end $$;
create or replace function public.refresh_tracking_live_snapshot(target_vehicle text) returns void
language plpgsql security definer set search_path=public as $$
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
 insert into tracking_live_snapshots(vehicle_id,project_id,snapshot) values(target_vehicle,owner_project,value)
 on conflict(vehicle_id) do update set snapshot=excluded.snapshot,revision=tracking_live_snapshots.revision+1,updated_at=clock_timestamp()
 where tracking_live_snapshots.snapshot is distinct from excluded.snapshot;
end $$;
commit;
