-- Installation identity is tracking_devices.id. Never add uniqueness to unexamined legacy history.
alter table public.tracking_devices add column last_sequence_number bigint not null default 0;
update public.tracking_devices d set last_sequence_number=greatest(
 coalesce((select max(h.sequence_number) from public.gps_history h where h.device_id=d.id::text),0),
 coalesce((select max(p.sequence_number) from public.vehicle_positions p where p.device_id=d.id::text),0));
create table public.device_report_receipts (
 device_id uuid not null references public.tracking_devices(id) on delete restrict,
 sequence_number bigint not null check(sequence_number>0),
 event_id uuid not null unique,
 payload_sha256 text not null,
 source_recorded_at timestamptz not null,
 received_at timestamptz not null default now(),
 gps_history_id bigint references public.gps_history(id) on delete set null,
 primary key(device_id,sequence_number)
);
alter table public.device_report_receipts enable row level security;
revoke all on public.device_report_receipts from public,anon,authenticated;
grant all on public.device_report_receipts to service_role;

create function public.ingest_bound_device(credential_digest text,report jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare device public.tracking_devices; receipt public.device_report_receipts; latest public.vehicle_positions;
 previous public.gps_history; seq bigint; recorded timestamptz; payload_hash text; archive boolean; history_id bigint;
 lat double precision; lon double precision; accuracy double precision; elapsed double precision; metres double precision;
 columns_sql text; select_sql text; updates_sql text; position_payload jsonb;
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
 archive=previous.id is null or recorded-previous.source_recorded_at>=interval '5 seconds'
 or previous.quality_state is distinct from report->>'quality_state' or previous.motion_state is distinct from report->>'motion_state';
 if archive then
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
revoke all on function public.ingest_bound_device(text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_bound_device(text,jsonb) to service_role;
