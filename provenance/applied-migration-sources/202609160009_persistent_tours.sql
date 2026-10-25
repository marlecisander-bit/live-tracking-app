-- Tours belong to their original map and selected source period, never today's map.
create table public.tour_runs (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.projects(id),
 vehicle_id text not null references public.vehicles(external_id),
 map_version_id bigint not null references public.map_versions(id),
 tracking_source_run_id bigint not null references public.tracking_source_runs(id),
 source text not null,
 started_at timestamptz not null,
 completed_at timestamptz,
 start_event_id bigint not null unique references public.stop_events(id),
 completion_event_id bigint unique references public.stop_events(id),
 required_stops text[] not null,
 next_stop_index integer not null default 2,
 status text not null default 'active' check(status in ('active','completed','incomplete')),
 duration_seconds numeric,
 business_date date generated always as ((completed_at at time zone 'Europe/Tirane')::date) stored,
 check ((status='completed')=(completed_at is not null)),
 check(completed_at is null or completed_at>=started_at)
);
create unique index tour_runs_one_active_vehicle on public.tour_runs(vehicle_id) where status='active';
create index tour_runs_report on public.tour_runs(project_id,vehicle_id,completed_at) where status='completed';
alter table public.tour_runs enable row level security;
revoke all on public.tour_runs from public,anon,authenticated;
grant select on public.tour_runs to authenticated;
grant all on public.tour_runs to service_role;
grant usage,select on sequence public.tour_runs_id_seq to service_role;
create policy "Members read retained tours" on public.tour_runs for select to authenticated
 using(exists(select 1 from public.projects p where p.id=project_id and public.is_organization_member(p.organization_id)));

create function public.retain_provider_tour() returns trigger
language plpgsql security definer set search_path=public as $$
declare g public.gps_history; e public.stop_events; run public.tour_runs; stops text[];
begin
 if tg_op='UPDATE' and old.last_gps_history_id is not distinct from new.last_gps_history_id then return new;end if;
 select * into g from gps_history where id=new.last_gps_history_id;
 if g.tracking_source_run_id is null then return new;end if;
 -- Called after the locked, atomic state/event commit; any failure rolls it all back.
 update tour_runs set status='incomplete' where vehicle_id=new.vehicle_id and status='active'
 and (map_version_id<>new.map_version_id or tracking_source_run_id<>g.tracking_source_run_id);
 for e in select * from stop_events where gps_history_id=g.id and vehicle_id=g.vehicle_id and project_id=g.project_id order by id loop
  select * into run from tour_runs where vehicle_id=g.vehicle_id and status='active' for update;
  if e.stop_number='1' and e.event_type='departure' and run.id is null then
   select array_agg(n order by n::numeric) into stops from (
    select distinct f->'properties'->>'stopNumber' n from map_versions m,
    lateral jsonb_array_elements(coalesce(m.map_data->'features','[]'::jsonb)) f
    where m.id=new.map_version_id and f->'geometry'->>'type'='Point'
    and f->'properties'->>'pointType'='stop' and coalesce(f->'properties'->>'active','true')<>'false'
    and f->'properties'->>'stopNumber' ~ '^[1-9][0-9]*$'
   ) numbered;
   if array_length(stops,1)>=2 and stops[1]='1' then
    insert into tour_runs(project_id,vehicle_id,map_version_id,tracking_source_run_id,source,started_at,start_event_id,required_stops)
    values(g.project_id,g.vehicle_id,new.map_version_id,g.tracking_source_run_id,g.source,e.event_at,e.id,stops)
    on conflict(start_event_id) do nothing;
   end if;
  elsif run.id is not null and e.event_type='arrival' and e.event_at>=run.started_at then
   if e.stop_number='1' then
    if run.next_stop_index>array_length(run.required_stops,1) then
     update tour_runs set status='completed',completed_at=e.event_at,completion_event_id=e.id,
     duration_seconds=extract(epoch from e.event_at-started_at) where id=run.id;
    else update tour_runs set status='incomplete' where id=run.id;end if;
   elsif e.stop_number=run.required_stops[run.next_stop_index] then
    update tour_runs set next_stop_index=next_stop_index+1 where id=run.id;
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.retain_provider_tour() from public,anon,authenticated;
create trigger retain_provider_tour after insert or update on public.vehicle_stop_state
 for each row execute function public.retain_provider_tour();

-- Report periods use source/event time and one business timezone, including late input.
create function public.analytics_period_start(days integer) returns timestamptz
language sql stable set search_path=public as $$
 select case when days is null then null else
 ((now() at time zone 'Europe/Tirane')::date - (greatest(1,least(days,366))-1))::timestamp at time zone 'Europe/Tirane' end;
$$;
revoke all on function public.analytics_period_start(integer) from public,anon;
grant execute on function public.analytics_period_start(integer) to authenticated,service_role;
