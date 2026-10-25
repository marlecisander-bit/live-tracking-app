-- Candidate only. Requires the distribution proposal. No schedule or deletion runs here.
-- Current input is bounded to one row per vehicle/provider; archival is independent.
create table public.tracking_runtime_config (
 singleton boolean primary key default true check(singleton),
 acquisition_seconds integer not null default 5 check(acquisition_seconds between 5 and 30),
 delayed_seconds integer not null default 20 check(delayed_seconds between 15 and 180),
 offline_seconds integer not null default 120 check(offline_seconds between 60 and 900),
 stationary_seconds integer not null default 25 check(stationary_seconds between 20 and 60),
 archive_seconds integer not null default 30 check(archive_seconds between 30 and 60),
 moving_kmh numeric not null default 3 check(moving_kmh between 1 and 10),
 jitter_metres numeric not null default 12 check(jitter_metres between 5 and 30)
);
insert into public.tracking_runtime_config default values;
alter table public.tracking_runtime_config enable row level security;
revoke all on public.tracking_runtime_config from public,anon,authenticated;
grant all on public.tracking_runtime_config to service_role;

create table public.tracking_provider_current (
 vehicle_id text not null references public.vehicles(external_id),
 project_id uuid not null references public.projects(id),
 source text not null check(source in ('pixel-android','scorpiontrack')),
 source_recorded_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp(),
 tracking_source_run_id bigint references public.tracking_source_runs(id),
 latitude double precision not null,longitude double precision not null,
 speed_kmh double precision,accuracy_m double precision,bearing_deg double precision,
 anchor_lat double precision not null,anchor_lon double precision not null,
 low_since timestamptz, moving_streak integer not null default 0,
 movement_state text not null check(movement_state in ('MOVING','STATIONARY','PARKED_AT_STOP','UNKNOWN')),
 stop_number text,stop_name text,stop_since timestamptz,
 last_archived_at timestamptz,
 payload jsonb not null,
 primary key(vehicle_id,source)
);
alter table public.tracking_provider_current enable row level security;
revoke all on public.tracking_provider_current from public,anon,authenticated;
grant all on public.tracking_provider_current to service_role;
create table public.tracking_status_events (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.projects(id),vehicle_id text not null references public.vehicles(external_id),
 source text not null,event_type text not null,event_at timestamptz not null,
 stop_event_id bigint unique references public.stop_events(id),created_at timestamptz not null default clock_timestamp()
);
alter table public.tracking_status_events enable row level security;
revoke all on public.tracking_status_events from public,anon,authenticated;
grant select on public.tracking_status_events to authenticated;
grant all on public.tracking_status_events to service_role;
grant usage,select on sequence public.tracking_status_events_id_seq to service_role;
create policy "Members read tracking transitions" on public.tracking_status_events for select to authenticated
using(exists(select 1 from projects p where p.id=project_id and is_organization_member(p.organization_id)));
alter table public.tracking_provider_current add column reported_health text;
create trigger validate_current_binding before insert or update on public.tracking_provider_current
for each row execute function public.validate_tracking_device_binding();
create trigger z_select_tracking_input before insert or update of source_recorded_at on public.tracking_provider_current
for each row execute function public.select_tracking_input();

create function public.accept_current_tracking(report jsonb) returns jsonb
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
  if metres<closest and metres<=(case when old.stop_number=feature->'properties'->>'stopNumber' then 90 else 60 end) then
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
 movement_state=excluded.movement_state,stop_number=excluded.stop_number,stop_name=excluded.stop_name,stop_since=excluded.stop_since,
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
revoke all on function public.accept_current_tracking(jsonb) from public,anon,authenticated;
grant execute on function public.accept_current_tracking(jsonb) to service_role;

create function public.record_tracking_health(target_vehicle text) returns void
language plpgsql security definer set search_path=public as $$
declare c public.tracking_provider_current; cfg public.tracking_runtime_config; health text; age numeric;
begin
 perform 1 from vehicles where external_id=target_vehicle for update;
 select * into cfg from tracking_runtime_config;
 select v.* into c from tracking_provider_current v join tracking_source_runs r on r.id=v.tracking_source_run_id
 where v.vehicle_id=target_vehicle and r.ended_at is null;
 if c.vehicle_id is null then return;end if;
 age=extract(epoch from clock_timestamp()-c.source_recorded_at);
 health=case when age>cfg.offline_seconds then 'GPS_OFFLINE' when age>cfg.delayed_seconds then 'GPS_DELAYED' else 'HEALTHY' end;
 if health is distinct from c.reported_health then
  if health<>'HEALTHY' or c.reported_health in ('GPS_DELAYED','GPS_OFFLINE') then
   insert into tracking_status_events(project_id,vehicle_id,source,event_type,event_at)
   values(c.project_id,c.vehicle_id,c.source,case when health='HEALTHY' then 'GPS_RECOVERED' else health end,clock_timestamp());
  end if;
  update tracking_provider_current set reported_health=health where vehicle_id=c.vehicle_id and source=c.source;
 end if;
end $$;
revoke all on function public.record_tracking_health(text) from public,anon,authenticated;
grant execute on function public.record_tracking_health(text) to service_role;

create function public.record_origin_reset() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.event_type='arrival' and new.stop_number='1' then
  insert into tracking_status_events(project_id,vehicle_id,source,event_type,event_at,stop_event_id)
  select new.project_id,new.vehicle_id,h.source,'ROUTE_RESET',new.event_at,new.id from gps_history h where h.id=new.gps_history_id
  on conflict(stop_event_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.record_origin_reset() from public,anon,authenticated;
create trigger record_origin_reset after insert on public.stop_events for each row execute function public.record_origin_reset();

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
 'speed_kmh',current_input.speed_kmh,'bearing_deg',current_input.bearing_deg,'source',current_input.source,
 'source_recorded_at',current_input.source_recorded_at,'received_at',current_input.received_at,
 'movement_state',current_input.movement_state,'current_stop_number',case when current_input.movement_state='PARKED_AT_STOP' then current_input.stop_number end,
 'current_stop_name',case when current_input.movement_state='PARKED_AT_STOP' then current_input.stop_name end,
 'delayed_seconds',cfg.delayed_seconds,'offline_seconds',cfg.offline_seconds) end,
 'stop',(select to_jsonb(st) from selected_stop_state st where st.vehicle_id=target_vehicle and st.project_id=owner_project),
 'eta',case when current_input.movement_state in ('STATIONARY','PARKED_AT_STOP') then null else
 (select to_jsonb(e) from selected_eta_state e where e.vehicle_id=target_vehicle and e.project_id=owner_project) end)
 into value from projects p left join live_map_settings s on s.project_slug=p.slug where p.id=owner_project;
 insert into tracking_live_snapshots(vehicle_id,project_id,snapshot) values(target_vehicle,owner_project,value)
 on conflict(vehicle_id) do update set snapshot=excluded.snapshot,revision=tracking_live_snapshots.revision+1,updated_at=clock_timestamp()
 where tracking_live_snapshots.snapshot is distinct from excluded.snapshot;
end $$;
create trigger refresh_current_snapshot after insert or update on public.tracking_provider_current
for each row execute function public.refresh_tracking_live_after_write();
create or replace function public.selected_tracking_snapshot(target_vehicle text) returns jsonb
language sql stable security definer set search_path=public as $$
 select t.snapshot from tracking_live_snapshots t join projects p on p.id=t.project_id
 where t.vehicle_id=target_vehicle and (p.is_public or is_organization_member(p.organization_id));
$$;

create or replace function public.select_tracking_input() returns trigger language plpgsql security definer set search_path=public as $$
declare choice text; current_run public.tracking_source_runs; previous_time timestamptz;
begin
 new.tracking_source_run_id := null;
 select s.gps_source into choice from public.live_map_settings s
 join public.projects p on p.slug=s.project_slug
 join public.vehicles v on v.project_id=p.id and v.external_id=new.vehicle_id
 where p.id=new.project_id for update of s;
 if choice is null or new.source not in ('pixel-android','scorpiontrack')
   or new.source_recorded_at is null or new.source_recorded_at>now()+interval '60 seconds'
   or new.source_recorded_at<now()-interval '180 seconds' then return new; end if;
 if choice='pixel' and new.source<>'pixel-android' then return new; end if;
 if choice='scorpion' and new.source<>'scorpiontrack' then return new; end if;
 if choice='automatic' then
   if new.source='pixel-android' and new.source_recorded_at<now()-interval '30 seconds' then return new; end if;
   if new.source='scorpiontrack' and exists(select 1 from public.tracking_provider_current h
     where h.vehicle_id=new.vehicle_id and h.project_id=new.project_id and h.source='pixel-android'
       and h.source_recorded_at between now()-interval '30 seconds' and now()+interval '60 seconds') then return new; end if;
 end if;
 if choice not in ('pixel','scorpion','automatic') then return new; end if;
 select * into current_run from public.tracking_source_runs where vehicle_id=new.vehicle_id and ended_at is null;
 select max(h.source_recorded_at) into previous_time from public.gps_history h where h.tracking_source_run_id=current_run.id;
 if previous_time is not null and new.source_recorded_at<=previous_time then return new; end if;
 if current_run.id is null or current_run.source<>new.source or current_run.selection<>choice then
   update public.tracking_source_runs set ended_at=now() where id=current_run.id;
   insert into public.tracking_source_runs(project_id,vehicle_id,source,selection)
     values(new.project_id,new.vehicle_id,new.source,choice) returning * into current_run;
 end if;
 new.tracking_source_run_id:=current_run.id;
 return new;
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
  return jsonb_build_object('ok',true,'duplicate',true,'accepted_sequence',seq,'gps_history_id',receipt.gps_history_id,'archived',receipt.gps_history_id is not null);
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
 if archive then
  report=report||jsonb_build_object('motion_state',live_result->>'movement_state');
  select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into columns_sql,select_sql from jsonb_object_keys(report) key;
  execute format('insert into gps_history(%s) select %s from jsonb_populate_record(null::gps_history,$1) r returning id',columns_sql,select_sql) into history_id using report;
 end if;
 position_payload=(report-'event_id')||jsonb_build_object('gps_history_id',history_id,'received_at',clock_timestamp());
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
 if not coalesce((live_result->>'archive')::boolean,false) then
  perform refresh_tracking_live_snapshot(binding.vehicle_id);
  return jsonb_build_object('ok',true,'stored',false,'live_updated',not coalesce((live_result->>'duplicate')::boolean,false) and not coalesce((live_result->>'stale')::boolean,false));
 end if;
 select * into existing from gps_history where vehicle_id=binding.vehicle_id and source='scorpiontrack' and source_recorded_at=recorded;
 if existing.id is not null then
  if existing.latitude is distinct from lat or existing.longitude is distinct from lon or existing.speed_kmh is distinct from speed or existing.heading is distinct from heading then raise exception 'Conflicting provider replay' using errcode='23505';end if;
  return jsonb_build_object('ok',true,'stored',false,'duplicate',true,'gps_history_id',existing.id);
 end if;
 insert into gps_history(project_id,vehicle_id,provider_binding_id,source,source_recorded_at,latitude,longitude,speed_kmh,heading,motion_state)
 values(binding.project_id,binding.vehicle_id,binding.id,'scorpiontrack',recorded,lat,lon,speed,heading,live_result->>'movement_state') returning * into inserted;
 return jsonb_build_object('ok',true,'stored',true,'gps_history_id',inserted.id,'selected',inserted.tracking_source_run_id is not null,'input_age_seconds',extract(epoch from clock_timestamp()-recorded));
end $$;

-- Raw telemetry only; preserve every operational event.
create or replace function public.prune_tracking_history(batch_size integer default 500) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='5s' as $$
declare removed integer; events_removed integer;
begin
 if batch_size is null or batch_size<1 or batch_size>1000 then raise exception 'Batch size must be 1..1000';end if;
 if not pg_try_advisory_xact_lock(20260919,1) then return jsonb_build_object('busy',true);end if;
 with candidates as (
  select h.id from gps_history h where h.received_at<now()-interval '48 hours'
  and h.source_recorded_at<now()-interval '48 hours'
  and not exists(select 1 from stop_events e where e.gps_history_id=h.id)
  and not exists(select 1 from vehicle_positions v where v.gps_history_id=h.id)
  and not exists(select 1 from vehicle_stop_state s where s.last_gps_history_id=h.id or s.candidate_gps_history_id=h.id)
  and not exists(select 1 from vehicle_eta_state e where e.gps_history_id=h.id)
  -- Keep latest provider point for source ordering, replay and recovery, even parked >48h.
  and exists(select 1 from gps_history newer where newer.vehicle_id=h.vehicle_id and newer.source=h.source and newer.source_recorded_at>h.source_recorded_at)
  -- Never delete an active provider period's unprocessed input.
  and not exists(select 1 from tracking_source_runs r where r.id=h.tracking_source_run_id and r.ended_at is null
   and not exists(select 1 from vehicle_stop_state s join gps_history cursor on cursor.id=s.last_gps_history_id
    where s.vehicle_id=h.vehicle_id and cursor.tracking_source_run_id=r.id and cursor.source_recorded_at>=h.source_recorded_at))
  -- Segment worker may be delayed; preserve its input interval conservatively.
  and not exists(select 1 from stop_events d where d.vehicle_id=h.vehicle_id and d.event_type='departure' and d.event_at<=h.source_recorded_at
   and not exists(select 1 from segment_runs sr where sr.departure_event_id=d.id))
  order by h.received_at,h.id limit batch_size for update of h skip locked
 ) delete from gps_history h using candidates c where h.id=c.id;
 get diagnostics removed=row_count;
 events_removed=0; -- Operational events are never deleted by raw telemetry retention.
 return jsonb_build_object('gps_deleted',removed,'events_deleted',events_removed,'batch_limit',batch_size);
end $$;

-- Pass runtime dwell/freshness thresholds to the existing pure stop planner.
create or replace function public.provider_processing_context(target_vehicle text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare current_state public.vehicle_stop_state; previous_point public.gps_history;
 next_point public.gps_history; active_run bigint; selected_map public.map_versions;
begin
 select r.id into active_run from tracking_source_runs r where r.vehicle_id=target_vehicle and r.ended_at is null;
 if active_run is null then return null;end if;
 select * into current_state from vehicle_stop_state where vehicle_id=target_vehicle;
 select * into previous_point from gps_history where id=current_state.last_gps_history_id and tracking_source_run_id=active_run;
 select * into next_point from gps_history where tracking_source_run_id=active_run
 and (previous_point.id is null or source_recorded_at>previous_point.source_recorded_at)
 order by source_recorded_at,id limit 1;
 if next_point.id is null then return null;end if;
 select * into selected_map from map_versions where project_id=next_point.project_id and status='published'
 order by published_at desc nulls last,id desc limit 1;
 if selected_map.id is null then raise exception 'Published map required';end if;
 return jsonb_build_object('gps',to_jsonb(next_point),'state',case when current_state.vehicle_id is null then null else to_jsonb(current_state) end,
 'planner_state',case when previous_point.id is null then null else to_jsonb(current_state) end,
 'previous_gps',case when previous_point.id is null then null else to_jsonb(previous_point) end,'map_version',to_jsonb(selected_map),'config',(select jsonb_build_object('originDwellSeconds',stationary_seconds,'delayedSeconds',delayed_seconds) from tracking_runtime_config));
end $$;
