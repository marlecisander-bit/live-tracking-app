create table public.tracking_provider_bindings (
 id uuid primary key default gen_random_uuid(),
 provider text not null default 'scorpiontrack' check(provider='scorpiontrack'),
 tracker_uid text not null unique check(char_length(tracker_uid) between 1 and 200),
 vehicle_id text not null references public.vehicles(external_id),
 project_id uuid not null references public.projects(id),
 credential_env text not null check(credential_env ~ '^SCORPION_TOKEN_[A-Z0-9_]+$'),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.tracking_provider_bindings enable row level security;
revoke all on public.tracking_provider_bindings from public,anon,authenticated;
grant all on public.tracking_provider_bindings to service_role;
create trigger validate_provider_binding before insert or update on public.tracking_provider_bindings
for each row execute function public.validate_tracking_device_binding();
alter table public.gps_history add column provider_binding_id uuid references public.tracking_provider_bindings(id);
-- The old (vehicle,time) uniqueness is stricter, so these keys cannot already contain duplicates.
-- Distinct providers may legitimately report at the same timestamp.
create unique index gps_history_provider_recorded_unique on public.gps_history(vehicle_id,source,source_recorded_at);
drop index public.gps_history_vehicle_source_recorded_unique;

create function public.ingest_scorpion_point(binding_id uuid,point jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare binding public.tracking_provider_bindings; existing public.gps_history; inserted public.gps_history;
 recorded timestamptz; lat double precision; lon double precision; speed double precision; heading double precision;
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
 select * into existing from gps_history where vehicle_id=binding.vehicle_id and source='scorpiontrack' and source_recorded_at=recorded;
 if existing.id is not null then
  if existing.latitude is distinct from lat or existing.longitude is distinct from lon or existing.speed_kmh is distinct from speed or existing.heading is distinct from heading then raise exception 'Conflicting provider replay' using errcode='23505';end if;
  return jsonb_build_object('ok',true,'stored',false,'duplicate',true,'gps_history_id',existing.id);
 end if;
 insert into gps_history(project_id,vehicle_id,provider_binding_id,source,source_recorded_at,latitude,longitude,speed_kmh,heading)
 values(binding.project_id,binding.vehicle_id,binding.id,'scorpiontrack',recorded,lat,lon,speed,heading) returning * into inserted;
 return jsonb_build_object('ok',true,'stored',true,'gps_history_id',inserted.id,'selected',inserted.tracking_source_run_id is not null,'input_age_seconds',extract(epoch from clock_timestamp()-recorded));
end $$;
revoke all on function public.ingest_scorpion_point(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_scorpion_point(uuid,jsonb) to service_role;

create or replace function public.selected_tracking_snapshot(target_vehicle text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('selection',s.gps_source,
 'position',(select jsonb_build_object('latitude',h.latitude,'longitude',h.longitude,'speed_kmh',h.speed_kmh,
 'bearing_deg',coalesce(h.bearing_deg,h.heading),'source_recorded_at',h.source_recorded_at,'received_at',h.received_at,'source',h.source)
 from active_gps_history h where h.vehicle_id=v.external_id and h.project_id=p.id order by h.source_recorded_at desc limit 1),
 'stop',(select to_jsonb(st) from selected_stop_state st where st.vehicle_id=v.external_id and st.project_id=p.id),
 'eta',(select to_jsonb(e) from selected_eta_state e where e.vehicle_id=v.external_id and e.project_id=p.id))
 from vehicles v join projects p on p.id=v.project_id left join live_map_settings s on s.project_slug=p.slug
 where v.external_id=target_vehicle and (p.is_public or is_organization_member(p.organization_id));
$$;
