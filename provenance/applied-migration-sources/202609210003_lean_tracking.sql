begin;
-- The existing GPS table also serves as the bounded transient worker inbox.
-- Legacy rows remain diagnostic; new unsampled rows are reclaimed after commit.
alter table public.gps_history add column diagnostic_sample boolean not null default true,
 add column lean_input boolean not null default false,
 add column cumulative_distance_m double precision,
 add column cumulative_driving_seconds double precision,
 add column cumulative_stationary_seconds double precision,
 add column cumulative_gaps bigint;
alter table public.stop_events add column map_version_id bigint references public.map_versions(id),
 add column cumulative_distance_m double precision,
 add column cumulative_driving_seconds double precision,
 add column cumulative_stationary_seconds double precision,
 add column cumulative_gaps bigint;
alter table public.segment_runs add column map_version_id bigint references public.map_versions(id),
 add column distance_quality text not null default 'legacy_sampled';
alter table public.tour_runs add column distance_m double precision,
 add column distance_quality text not null default 'legacy_unavailable';
alter table public.tracking_runtime_config add column max_pending_inputs integer not null default 1440 check(max_pending_inputs between 50 and 7200),
 add column distance_gap_seconds integer not null default 120 check(distance_gap_seconds between 20 and 180);

create table public.tracking_distance_cursor (
 vehicle_id text primary key references public.vehicles(external_id),project_id uuid not null references public.projects(id),
 last_input_id bigint not null,tracking_source_run_id bigint not null references public.tracking_source_runs(id),
 recorded_at timestamptz not null,latitude double precision not null,longitude double precision not null,accuracy_m double precision,
 distance_m double precision not null default 0,driving_seconds double precision not null default 0,
 stationary_seconds double precision not null default 0,gaps bigint not null default 0,
 speed_samples jsonb not null default '[]',started_at timestamptz not null
);
create table public.tracking_daily_totals (
 vehicle_id text not null references public.vehicles(external_id),project_id uuid not null references public.projects(id),
 business_date date not null,first_observation_at timestamptz not null,last_observation_at timestamptz not null,
 distance_m double precision not null default 0 check(distance_m>=0),
 driving_seconds double precision not null default 0 check(driving_seconds>=0),
 stationary_seconds double precision not null default 0 check(stationary_seconds>=0),
 observations bigint not null default 0,gaps bigint not null default 0,max_speed_kmh double precision,
 primary key(vehicle_id,business_date)
);
alter table public.tracking_distance_cursor enable row level security;
alter table public.tracking_daily_totals enable row level security;
revoke all on public.tracking_distance_cursor,public.tracking_daily_totals from public,anon,authenticated;
grant all on public.tracking_distance_cursor,public.tracking_daily_totals to service_role;
grant select on public.tracking_daily_totals to authenticated;
create policy "Members read daily tracking totals" on public.tracking_daily_totals for select to authenticated
 using(exists(select 1 from public.projects p where p.id=project_id and public.is_organization_member(p.organization_id)));

create function public.accumulate_tracking_input() returns trigger language plpgsql security definer set search_path=public as $$
declare old public.tracking_distance_cursor; cfg public.tracking_runtime_config;
 dt double precision; metres double precision=0; driving double precision=0; stopped double precision=0; gap bigint=0;
 moving boolean; start_time timestamptz; part_end timestamptz; fraction double precision; day date; samples jsonb;
begin
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
 new.cumulative_distance_m=coalesce(old.distance_m,0)+metres;
 new.cumulative_driving_seconds=coalesce(old.driving_seconds,0)+driving;
 new.cumulative_stationary_seconds=coalesce(old.stationary_seconds,0)+stopped;
 new.cumulative_gaps=coalesce(old.gaps,0)+gap;
 samples=case when old.tracking_source_run_id=new.tracking_source_run_id and gap=0 then old.speed_samples else '[]'::jsonb end;
 select coalesce(jsonb_agg(v order by n),'[]'::jsonb) into samples from (
  select v,n from jsonb_array_elements(coalesce(samples,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('speed_kmh',new.speed_kmh,'source_recorded_at',new.source_recorded_at))) with ordinality as a(v,n)
  where (v->>'source_recorded_at')::timestamptz>=new.source_recorded_at-interval '2 minutes' order by n desc limit 24
 ) bounded;
 insert into tracking_distance_cursor values(new.vehicle_id,new.project_id,new.id,new.tracking_source_run_id,new.source_recorded_at,new.latitude,new.longitude,new.accuracy_m,
 new.cumulative_distance_m,new.cumulative_driving_seconds,new.cumulative_stationary_seconds,new.cumulative_gaps,samples,coalesce(old.started_at,new.source_recorded_at))
 on conflict(vehicle_id) do update set last_input_id=excluded.last_input_id,tracking_source_run_id=excluded.tracking_source_run_id,
 recorded_at=excluded.recorded_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,
 distance_m=excluded.distance_m,driving_seconds=excluded.driving_seconds,stationary_seconds=excluded.stationary_seconds,gaps=excluded.gaps,speed_samples=excluded.speed_samples;
 -- Split observed intervals at local midnight (including DST); never fabricate an outage path.
 start_time=case when old.vehicle_id is null or gap>0 then new.source_recorded_at else old.recorded_at end;
 loop
  day=(start_time at time zone 'Europe/Tirane')::date;
  part_end=least(new.source_recorded_at,(day+1)::timestamp at time zone 'Europe/Tirane');
  fraction=case when dt>0 and gap=0 then extract(epoch from part_end-start_time)/dt else 0 end;
  insert into tracking_daily_totals(vehicle_id,project_id,business_date,first_observation_at,last_observation_at,distance_m,driving_seconds,stationary_seconds,observations,gaps,max_speed_kmh)
  values(new.vehicle_id,new.project_id,day,start_time,part_end,metres*fraction,driving*fraction,stopped*fraction,
    case when part_end=new.source_recorded_at then 1 else 0 end,gap,case when part_end=new.source_recorded_at and new.speed_kmh between 0 and 180 then new.speed_kmh end)
  on conflict(vehicle_id,business_date) do update set first_observation_at=least(tracking_daily_totals.first_observation_at,excluded.first_observation_at),
   last_observation_at=greatest(tracking_daily_totals.last_observation_at,excluded.last_observation_at),distance_m=tracking_daily_totals.distance_m+excluded.distance_m,
   driving_seconds=tracking_daily_totals.driving_seconds+excluded.driving_seconds,stationary_seconds=tracking_daily_totals.stationary_seconds+excluded.stationary_seconds,
   observations=tracking_daily_totals.observations+excluded.observations,gaps=tracking_daily_totals.gaps+excluded.gaps,max_speed_kmh=greatest(tracking_daily_totals.max_speed_kmh,excluded.max_speed_kmh);
  exit when part_end>=new.source_recorded_at;start_time=part_end;
 end loop;
 return new;
end $$;
create trigger zz_accumulate_tracking_input before insert on public.gps_history for each row execute function public.accumulate_tracking_input();

create function public.snapshot_tracking_event_counters() returns trigger language plpgsql security definer set search_path=public as $$
declare g public.gps_history;
begin
 select * into g from gps_history where id=new.gps_history_id;
 select id into new.map_version_id from map_versions where project_id=new.project_id and status='published' order by published_at desc nulls last,id desc limit 1;
 new.cumulative_distance_m=g.cumulative_distance_m;new.cumulative_driving_seconds=g.cumulative_driving_seconds;
 new.cumulative_stationary_seconds=g.cumulative_stationary_seconds;new.cumulative_gaps=g.cumulative_gaps;
 return new;
end $$;
create trigger snapshot_tracking_event_counters before insert on public.stop_events for each row execute function public.snapshot_tracking_event_counters();

create function public.finalize_tracking_segment() returns trigger language plpgsql security definer set search_path=public as $$
declare departure public.stop_events; run_id bigint; version_id bigint; seconds integer; distance double precision;
begin
 if new.event_type<>'arrival' or new.cumulative_distance_m is null then return new;end if;
 select tracking_source_run_id into run_id from gps_history where id=new.gps_history_id;
 select d.* into departure from stop_events d join gps_history h on h.id=d.gps_history_id
 where d.vehicle_id=new.vehicle_id and d.project_id=new.project_id and d.event_type='departure' and d.event_at<new.event_at
 and h.tracking_source_run_id=run_id and d.map_version_id=new.map_version_id order by d.event_at desc,d.id desc limit 1;
 if departure.id is null or departure.cumulative_distance_m is null or exists(select 1 from segment_runs where departure_event_id=departure.id) then return new;end if;
 seconds=extract(epoch from new.event_at-departure.event_at)::integer;
 distance=greatest(0,new.cumulative_distance_m-departure.cumulative_distance_m);
 insert into segment_runs(project_id,vehicle_id,from_stop_id,from_stop_name,from_stop_number,to_stop_id,to_stop_name,to_stop_number,
 departure_event_id,arrival_event_id,departed_at,arrived_at,travel_seconds,distance_km,avg_speed_kmh,stopped_seconds,distance_quality,map_version_id)
 values(new.project_id,new.vehicle_id,departure.stop_id,departure.stop_name,departure.stop_number,new.stop_id,new.stop_name,new.stop_number,
 departure.id,new.id,departure.event_at,new.event_at,seconds,distance/1000,case when seconds>0 then distance/seconds*3.6 end,
 greatest(0,new.cumulative_stationary_seconds-departure.cumulative_stationary_seconds)::integer,
 case when new.cumulative_gaps=departure.cumulative_gaps then 'observed_gps' else 'partial_gap' end,new.map_version_id)
 on conflict(departure_event_id) do nothing;
 return new;
end $$;
create trigger finalize_tracking_segment after insert on public.stop_events for each row execute function public.finalize_tracking_segment();

create function public.retain_tracking_tour_distance() returns trigger language plpgsql security definer set search_path=public as $$
declare start_counter double precision; start_gaps bigint; end_counter double precision; end_gaps bigint;
begin
 if new.status='completed' then
 select cumulative_distance_m,cumulative_gaps into start_counter,start_gaps from stop_events where id=new.start_event_id;
 select cumulative_distance_m,cumulative_gaps into end_counter,end_gaps from stop_events where id=new.completion_event_id;
 if start_counter is not null and end_counter is not null then
  new.distance_m=greatest(0,end_counter-start_counter);new.distance_quality=case when start_gaps=end_gaps then 'observed_gps' else 'partial_gap' end;
 end if;
 end if;return new;
end $$;
create trigger retain_tracking_tour_distance before insert or update on public.tour_runs for each row execute function public.retain_tracking_tour_distance();

-- Service-only ETA input: current coordinates, bounded live speeds, opaque transient input identity.
create function public.provider_live_eta_context(target_vehicle text) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('gps',to_jsonb(c)||jsonb_build_object('id',h.id,'heading',c.bearing_deg),
 'recent_speeds',coalesce(d.speed_samples,'[]'::jsonb))
 from tracking_provider_current c join tracking_source_runs r on r.id=c.tracking_source_run_id and r.ended_at is null
 join gps_history h on h.vehicle_id=c.vehicle_id and h.source=c.source and h.source_recorded_at=c.source_recorded_at and h.tracking_source_run_id=r.id
 left join tracking_distance_cursor d on d.vehicle_id=c.vehicle_id and d.tracking_source_run_id=r.id
 cross join tracking_runtime_config cfg
 where c.vehicle_id=target_vehicle and c.source_recorded_at>=now()-make_interval(secs=>cfg.delayed_seconds) and c.ui_observation_valid;
$$;

-- Reclaim processed, unsampled buffer rows. Event/cursor anchors remain bounded or operational.
create function public.reclaim_tracking_buffer(target_vehicle text,batch_size integer default 500) returns integer
language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
 if batch_size<1 or batch_size>1000 or batch_size is null then raise exception 'Invalid batch size';end if;
 with candidates as (
 select h.id from gps_history h where h.vehicle_id=target_vehicle and h.lean_input and not h.diagnostic_sample
 and not exists(select 1 from stop_events e where e.gps_history_id=h.id)
 and not exists(select 1 from vehicle_positions v where v.gps_history_id=h.id)
 and not exists(select 1 from vehicle_stop_state s where s.last_gps_history_id=h.id or s.candidate_gps_history_id=h.id)
 and not exists(select 1 from vehicle_eta_state e where e.gps_history_id=h.id)
 and not exists(select 1 from tracking_distance_cursor c where c.last_input_id=h.id)
 and exists(select 1 from gps_history newer where newer.vehicle_id=h.vehicle_id and newer.source=h.source and newer.source_recorded_at>h.source_recorded_at)
 and not exists(select 1 from tracking_source_runs r where r.id=h.tracking_source_run_id and r.ended_at is null
  and not exists(select 1 from vehicle_stop_state s join gps_history cursor on cursor.id=s.last_gps_history_id
   where s.vehicle_id=h.vehicle_id and cursor.tracking_source_run_id=r.id and cursor.source_recorded_at>=h.source_recorded_at))
 order by h.id limit batch_size for update of h skip locked
 ) delete from gps_history h using candidates c where h.id=c.id;
 get diagnostics removed=row_count;return removed;
end $$;
create function public.reclaim_tracking_after_transition() returns trigger language plpgsql security definer set search_path=public as $$
begin perform reclaim_tracking_buffer(new.vehicle_id,100);return new;end $$;
create trigger zz_reclaim_tracking_after_transition after insert or update on public.vehicle_stop_state
 for each row execute function public.reclaim_tracking_after_transition();

-- New routines default to PUBLIC EXECUTE unless explicitly revoked.
revoke all on function public.accumulate_tracking_input(),public.snapshot_tracking_event_counters(),public.finalize_tracking_segment(),
 public.retain_tracking_tour_distance(),public.provider_live_eta_context(text),public.reclaim_tracking_buffer(text,integer),public.reclaim_tracking_after_transition()
 from public,anon,authenticated;
grant execute on function public.provider_live_eta_context(text),public.reclaim_tracking_buffer(text,integer) to service_role;

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
create or replace function public.ingest_bound_device(credential_digest text,report jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare device public.tracking_devices; receipt public.device_report_receipts; latest public.vehicle_positions;
 previous public.gps_history; seq bigint; recorded timestamptz; payload_hash text; archive boolean; history_id bigint;
 lat double precision; lon double precision; accuracy double precision; elapsed double precision; metres double precision;
 columns_sql text; select_sql text; updates_sql text; position_payload jsonb; live_result jsonb;
begin
 select * into device from tracking_devices where credential_hash=credential_digest for update;
 if device.id is null or not device.active or device.revoked_at is not null then raise exception 'Unauthorized device' using errcode='28000';end if;
 if report->>'vehicle_id' is distinct from device.vehicle_id or (report->>'project_id')::uuid is distinct from device.project_id
 or report->>'device_id' is distinct from device.id::text or report->>'source'<>'pixel-android' then raise exception 'Device identity mismatch' using errcode='42501';end if;
 seq=(report->>'sequence_number')::bigint;recorded=(report->>'source_recorded_at')::timestamptz;
 lat=(report->>'latitude')::double precision;lon=(report->>'longitude')::double precision;accuracy=(report->>'accuracy_m')::double precision;
 if seq is null or seq<1 or seq>9007199254740991 or recorded is null or recorded>clock_timestamp()+interval '60 seconds' or recorded<clock_timestamp()-interval '24 hours'
 or lat is null or lat not between -90 and 90 or lon is null or lon not between -180 and 180 or accuracy is null or accuracy not between 0 and 50 then raise exception 'Invalid device report' using errcode='22023';end if;
 payload_hash=encode(sha256(convert_to(report::text,'UTF8')),'hex');
 select * into receipt from device_report_receipts where device_id=device.id and sequence_number=seq;
 if receipt.device_id is not null then
  if receipt.payload_sha256<>payload_hash then raise exception 'Conflicting sequence replay' using errcode='23505';end if;
  return jsonb_build_object('ok',true,'duplicate',true,'accepted_sequence',seq,'gps_history_id',receipt.gps_history_id,'archived',coalesce((select diagnostic_sample from gps_history where id=receipt.gps_history_id),false));
 end if;
 if seq<=device.last_sequence_number then raise exception 'Stale device sequence' using errcode='23505';end if;
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=device.project_id for update of s;
 perform 1 from vehicles where external_id=device.vehicle_id and project_id=device.project_id for update;
 if not found then raise exception 'Device vehicle binding missing';end if;
 select * into latest from vehicle_positions where vehicle_id=device.vehicle_id;
 if latest.source_recorded_at is not null and recorded<=latest.source_recorded_at then raise exception 'Stale device timestamp' using errcode='23505';end if;
 elapsed=extract(epoch from recorded-latest.source_recorded_at);
 if elapsed>0 and elapsed<120 then
  metres=12742000*asin(sqrt(least(1.0,power(sin(radians(lat-latest.latitude)/2),2)+cos(radians(lat))*cos(radians(latest.latitude))*power(sin(radians(lon-latest.longitude)/2),2))));
  if greatest(0,metres-coalesce(latest.accuracy_m,0)-accuracy)/elapsed*3.6>180 then raise exception 'Implausible GPS jump' using errcode='22023';end if;
 end if;
 select * into previous from gps_history where vehicle_id=device.vehicle_id and source='pixel-android' order by source_recorded_at desc nulls last,id desc limit 1;
 live_result=accept_current_tracking(report);
 archive=coalesce((live_result->>'archive')::boolean,false);
 if archive or exists(select 1 from tracking_provider_current where vehicle_id=device.vehicle_id and source='pixel-android' and tracking_source_run_id is not null) then
  report=report||jsonb_build_object('motion_state',live_result->>'movement_state','diagnostic_sample',archive,'lean_input',true);
  select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into columns_sql,select_sql from jsonb_object_keys(report) key;
  execute format('insert into gps_history(%s) select %s from jsonb_populate_record(null::gps_history,$1) r returning id',columns_sql,select_sql) into history_id using report;
 end if;
 position_payload=(report-'event_id'-'diagnostic_sample'-'lean_input')||jsonb_build_object('gps_history_id',history_id,'received_at',clock_timestamp());
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into columns_sql,select_sql,updates_sql from jsonb_object_keys(position_payload) key;
 execute format('insert into vehicle_positions(%s) select %s from jsonb_populate_record(null::vehicle_positions,$1) r on conflict(vehicle_id) do update set %s',columns_sql,select_sql,updates_sql) using position_payload;
 insert into device_report_receipts(device_id,sequence_number,event_id,payload_sha256,source_recorded_at,gps_history_id)
 values(device.id,seq,(report->>'event_id')::uuid,payload_hash,recorded,history_id);
 update tracking_devices set last_sequence_number=seq,last_seen_at=clock_timestamp() where id=device.id;
 return jsonb_build_object('ok',true,'event_id',report->>'event_id','accepted_sequence',seq,'server_received_at',clock_timestamp(),'archived',archive,'gps_history_id',history_id);
end $$;
create or replace function public.ingest_scorpion_point(binding_id uuid,point jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare binding public.tracking_provider_bindings; existing public.gps_history; inserted public.gps_history;
 recorded timestamptz; lat double precision; lon double precision; speed double precision; heading double precision; live_result jsonb;
begin
 select * into binding from tracking_provider_bindings where id=binding_id for update;
 if binding.id is null or not binding.active then raise exception 'Inactive provider binding' using errcode='42501';end if;
 if point->>'tracker_uid' is distinct from binding.tracker_uid then raise exception 'Tracker identity mismatch' using errcode='42501';end if;
 recorded=(point->>'source_recorded_at')::timestamptz;lat=(point->>'latitude')::double precision;lon=(point->>'longitude')::double precision;
 speed=(point->>'speed_kmh')::double precision;heading=(point->>'heading')::double precision;
 if recorded is null or recorded>clock_timestamp()+interval '60 seconds' or recorded<clock_timestamp()-interval '24 hours'
 or lat is null or lat not between -90 and 90 or lon is null or lon not between -180 and 180
 or speed is null or speed not between 0 and 250 or heading is null or heading not between 0 and 360 then raise exception 'Invalid provider fix' using errcode='22023';end if;
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=binding.project_id for update of s;
 perform 1 from vehicles where external_id=binding.vehicle_id and project_id=binding.project_id for update;
 if not found then raise exception 'Provider vehicle binding missing';end if;
 live_result=accept_current_tracking(jsonb_build_object('project_id',binding.project_id,'vehicle_id',binding.vehicle_id,'source','scorpiontrack','source_recorded_at',recorded,'latitude',lat,'longitude',lon,'speed_kmh',speed,'bearing_deg',heading));
 if coalesce((live_result->>'duplicate')::boolean,false) or coalesce((live_result->>'stale')::boolean,false) or (not coalesce((live_result->>'archive')::boolean,false) and not exists(select 1 from tracking_provider_current where vehicle_id=binding.vehicle_id and source='scorpiontrack' and tracking_source_run_id is not null)) then
  perform refresh_tracking_live_snapshot(binding.vehicle_id);
  return jsonb_build_object('ok',true,'stored',false,'live_updated',not coalesce((live_result->>'duplicate')::boolean,false) and not coalesce((live_result->>'stale')::boolean,false));
 end if;
 select * into existing from gps_history where vehicle_id=binding.vehicle_id and source='scorpiontrack' and source_recorded_at=recorded;
 if existing.id is not null then
  if existing.latitude is distinct from lat or existing.longitude is distinct from lon or existing.speed_kmh is distinct from speed or existing.heading is distinct from heading then raise exception 'Conflicting provider replay' using errcode='23505';end if;
  return jsonb_build_object('ok',true,'stored',false,'duplicate',true,'gps_history_id',existing.id);
 end if;
 insert into gps_history(project_id,vehicle_id,provider_binding_id,source,source_recorded_at,latitude,longitude,speed_kmh,heading,motion_state,diagnostic_sample,lean_input)
 values(binding.project_id,binding.vehicle_id,binding.id,'scorpiontrack',recorded,lat,lon,speed,heading,live_result->>'movement_state',coalesce((live_result->>'archive')::boolean,false),true) returning * into inserted;
 return jsonb_build_object('ok',true,'stored',true,'gps_history_id',inserted.id,'selected',inserted.tracking_source_run_id is not null,'input_age_seconds',extract(epoch from clock_timestamp()-recorded));
end $$;
create or replace function public.prune_tracking_history(batch_size integer default 500) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='5s' as $$
declare removed integer; events_removed integer; transient_removed integer=0; receipts_removed integer=0; target text;
begin
 if batch_size is null or batch_size<1 or batch_size>1000 then raise exception 'Batch size must be 1..1000';end if;
 if not pg_try_advisory_xact_lock(20260919,1) then return jsonb_build_object('busy',true);end if;
 for target in select distinct vehicle_id from gps_history where lean_input and not diagnostic_sample order by vehicle_id limit 20 loop
 exit when transient_removed>=batch_size;transient_removed=transient_removed+reclaim_tracking_buffer(target,batch_size-transient_removed);end loop;
 with candidates as (
  select h.id from gps_history h where h.received_at<now()-interval '48 hours'
  and h.source_recorded_at<now()-interval '48 hours'
  and not exists(select 1 from stop_events e where e.gps_history_id=h.id)
  and not exists(select 1 from vehicle_positions v where v.gps_history_id=h.id)
  and not exists(select 1 from vehicle_stop_state s where s.last_gps_history_id=h.id or s.candidate_gps_history_id=h.id)
  and not exists(select 1 from vehicle_eta_state e where e.gps_history_id=h.id)
  and not exists(select 1 from tracking_distance_cursor c where c.last_input_id=h.id)
  -- Keep latest provider point for source ordering, replay and recovery, even parked >48h.
  and exists(select 1 from gps_history newer where newer.vehicle_id=h.vehicle_id and newer.source=h.source and newer.source_recorded_at>h.source_recorded_at)
  -- Never delete an active provider period's unprocessed input.
  and not exists(select 1 from tracking_source_runs r where r.id=h.tracking_source_run_id and r.ended_at is null
   and not exists(select 1 from vehicle_stop_state s join gps_history cursor on cursor.id=s.last_gps_history_id
    where s.vehicle_id=h.vehicle_id and cursor.tracking_source_run_id=r.id and cursor.source_recorded_at>=h.source_recorded_at))
  -- Segment worker may be delayed; preserve its input interval conservatively.
  and not exists(select 1 from stop_events d where not h.lean_input and d.cumulative_distance_m is null and d.vehicle_id=h.vehicle_id and d.event_type='departure' and d.event_at<=h.source_recorded_at
   and not exists(select 1 from segment_runs sr where sr.departure_event_id=d.id))
  order by h.received_at,h.id limit batch_size for update of h skip locked
 ) delete from gps_history h using candidates c where h.id=c.id;
 get diagnostics removed=row_count;
 with expired as (select r.device_id,r.sequence_number from device_report_receipts r join tracking_devices d on d.id=r.device_id
  where r.received_at<now()-interval '48 hours' and r.source_recorded_at<now()-interval '48 hours' and r.sequence_number<d.last_sequence_number
  order by r.received_at limit batch_size for update of r skip locked)
 delete from device_report_receipts r using expired e where r.device_id=e.device_id and r.sequence_number=e.sequence_number;
 get diagnostics receipts_removed=row_count;
 events_removed=0; -- Operational events are never deleted by raw telemetry retention.
 return jsonb_build_object('gps_deleted',removed,'transient_deleted',transient_removed,'receipts_deleted',receipts_removed,'events_deleted',events_removed,'batch_limit',batch_size);
end $$;

create function public.lean_tracking_analytics(target_vehicle text,days integer default 1) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare owner_project uuid; start_day date; result jsonb;
begin
 select v.project_id into owner_project from vehicles v join projects p on p.id=v.project_id
 where v.external_id=target_vehicle and is_organization_member(p.organization_id);
 if owner_project is null then raise exception 'Not authorized for vehicle analytics' using errcode='42501';end if;
 if days is not null and (days<1 or days>366) then raise exception 'Invalid reporting period';end if;
 start_day=case when days is not null then (now() at time zone 'Europe/Tirane')::date-(days-1) end;
 select jsonb_build_object('distance_m',sum(distance_m),'driving_seconds',sum(driving_seconds),
 'stationary_seconds',sum(stationary_seconds),'observations',coalesce(sum(observations),0),'gaps',coalesce(sum(gaps),0),
 'first_observation_at',min(first_observation_at),'last_observation_at',max(last_observation_at),'days',count(*),
 'max_speed_kmh',max(max_speed_kmh),'method','observed_gps','timezone','Europe/Tirane') into result
 from tracking_daily_totals where vehicle_id=target_vehicle and project_id=owner_project
 and (start_day is null or business_date>=start_day) and business_date<=(now() at time zone 'Europe/Tirane')::date;
 return result||jsonb_build_object('segments',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select from_stop_name||' ? '||to_stop_name as name,count(*) as count,avg(travel_seconds) as seconds,avg(distance_km) as distance_km
 from segment_runs where vehicle_id=target_vehicle and project_id=owner_project and distance_quality<>'legacy_sampled'
 and (start_day is null or (arrived_at at time zone 'Europe/Tirane')::date>=start_day) and arrived_at<=now()
 group by from_stop_id,to_stop_id,from_stop_name,to_stop_name) x),'[]'::jsonb));
end $$;
revoke all on function public.lean_tracking_analytics(text,integer) from public,anon;
grant execute on function public.lean_tracking_analytics(text,integer) to authenticated;
create or replace function public.commit_provider_transition(point_id bigint,expected_state jsonb,next_state jsonb,new_events jsonb,version_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
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
 if jsonb_typeof(new_events)<>'array' or jsonb_array_length(new_events)>2 then raise exception 'Invalid event plan';end if;
 perform set_config('app.provider_transition','true',true);
 for item in select value from jsonb_array_elements(new_events) loop
  event_index=event_index+1;
  if item ? 'id' or item->>'vehicle_id' is distinct from gps.vehicle_id or (item->>'project_id')::uuid is distinct from gps.project_id
  or (item->>'gps_history_id')::bigint is distinct from point_id or (item->>'event_at')::timestamptz is distinct from gps.source_recorded_at then raise exception 'Event identity mismatch';end if;
  select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into columns_sql,select_sql from jsonb_object_keys(item) key;
  execute format('insert into stop_events(%s) select %s from jsonb_populate_record(null::stop_events,$1) r returning to_jsonb(id)',columns_sql,select_sql) into inserted_id using item;
  if payload->>'arrival_event_id'=(-event_index)::text then payload=jsonb_set(payload,'{arrival_event_id}',inserted_id);end if;
 end loop;
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into columns_sql,select_sql,updates_sql from jsonb_object_keys(payload) key;
 execute format('insert into vehicle_stop_state(%s) select %s from jsonb_populate_record(null::vehicle_stop_state,$1) r on conflict(vehicle_id) do update set %s',columns_sql,select_sql,updates_sql) using payload;
 return jsonb_build_object('status','processed','events',event_index);
end $$;
create or replace function public.commit_provider_eta(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare gps public.gps_history; latest_id bigint; old_eta public.vehicle_eta_state;
 columns_sql text; select_sql text; updates_sql text;
begin
 select * into gps from gps_history where id=(payload->>'gps_history_id')::bigint;
 if gps.id is null then return jsonb_build_object('status','stale');end if;
 if payload->>'vehicle_id' is distinct from gps.vehicle_id or (payload->>'project_id')::uuid is distinct from gps.project_id then raise exception 'ETA identity mismatch';end if;
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=gps.project_id for update of s;
 perform 1 from vehicles where external_id=gps.vehicle_id for update;
 select h.id into latest_id from active_gps_history h where h.vehicle_id=gps.vehicle_id order by h.source_recorded_at desc,h.id desc limit 1;
 if latest_id is distinct from gps.id then return jsonb_build_object('status','stale');end if;
 select * into old_eta from vehicle_eta_state where vehicle_id=gps.vehicle_id;
 if old_eta.gps_history_id=gps.id and old_eta.calculated_at>=(payload->>'calculated_at')::timestamptz then return jsonb_build_object('status','stale');end if;
 if not exists(select 1 from map_versions m where m.id=(payload->>'map_version_id')::bigint and m.project_id=gps.project_id) then raise exception 'ETA map mismatch';end if;
 perform set_config('app.provider_transition','true',true);
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into columns_sql,select_sql,updates_sql from jsonb_object_keys(payload) key;
 execute format('insert into vehicle_eta_state(%s) select %s from jsonb_populate_record(null::vehicle_eta_state,$1) r on conflict(vehicle_id) do update set %s',columns_sql,select_sql,updates_sql) using payload;
 return jsonb_build_object('status','processed');
end $$;
commit;
