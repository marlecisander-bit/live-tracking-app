-- STAGING CANDIDATE. Install only with the coordinated provider-aware consumers.
-- Requires the audited access migrations. Existing history is never backfilled.
begin;
create table public.tracking_source_runs (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.projects(id),
 vehicle_id text not null references public.vehicles(external_id),
 source text not null check (source in ('pixel-android','scorpiontrack')),
 selection text not null check (selection in ('pixel','scorpion','automatic')),
 started_at timestamptz not null default now(), ended_at timestamptz
);
create unique index tracking_source_runs_active on public.tracking_source_runs(vehicle_id) where ended_at is null;
alter table public.tracking_source_runs enable row level security;
create policy "Members read source history" on public.tracking_source_runs for select to authenticated
 using (exists(select 1 from public.projects p where p.id=project_id and public.is_organization_member(p.organization_id)));
grant select on public.tracking_source_runs to authenticated;
grant all on public.tracking_source_runs to service_role;
grant usage,select on sequence public.tracking_source_runs_id_seq to service_role;
alter table public.gps_history add column tracking_source_run_id bigint references public.tracking_source_runs(id);
create index gps_history_provider_time on public.gps_history(vehicle_id,source,source_recorded_at desc);
create index gps_history_source_run on public.gps_history(tracking_source_run_id,source_recorded_at desc);

-- One project settings lock serializes ingestion and selection changes. Explicit
-- selections never fall back. Automatic prefers a Pixel fix <=30s old, otherwise
-- accepts Scorpion <=180s old. Missing configuration selects neither provider.
create function public.select_tracking_input() returns trigger language plpgsql security definer set search_path=public as $$
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
   if new.source='scorpiontrack' and exists(select 1 from public.gps_history h
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
-- Runs after assign_project_from_vehicle (PostgreSQL trigger name order).
create trigger z_select_tracking_input before insert on public.gps_history for each row execute function public.select_tracking_input();

create function public.end_tracking_selection() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.gps_source is distinct from old.gps_source then
   update public.tracking_source_runs r set ended_at=now() from public.projects p
   where p.id=r.project_id and p.slug=new.project_slug and r.ended_at is null;
 end if;
 return new;
end $$;
create trigger end_tracking_selection after update on public.live_map_settings for each row execute function public.end_tracking_selection();

create view public.selected_gps_history with (security_invoker=true) as
 select h.* from public.gps_history h where h.tracking_source_run_id is not null;
create view public.active_gps_history with (security_invoker=true) as
 select h.* from public.gps_history h join public.tracking_source_runs r on r.id=h.tracking_source_run_id where r.ended_at is null;
create view public.selected_stop_events with (security_invoker=true) as
 select e.*,h.tracking_source_run_id,h.source from public.stop_events e
 join public.gps_history h on h.id=e.gps_history_id where h.tracking_source_run_id is not null;
create view public.selected_stop_state with (security_invoker=true) as
 select s.* from public.vehicle_stop_state s join public.active_gps_history h on h.id=s.last_gps_history_id;
create view public.selected_eta_state with (security_invoker=true) as
 select e.* from public.vehicle_eta_state e join public.active_gps_history h on h.id=e.gps_history_id;
create view public.selected_segment_runs with (security_invoker=true) as
 select s.* from public.segment_runs s
 join public.selected_stop_events d on d.id=s.departure_event_id
 join public.selected_stop_events a on a.id=s.arrival_event_id
 where d.tracking_source_run_id=a.tracking_source_run_id;
create view public.selected_completed_departures with (security_invoker=true) as
 select d.* from public.selected_stop_events d where d.event_type='departure'
 and not exists(select 1 from public.segment_runs s where s.departure_event_id=d.id)
 and exists(select 1 from public.selected_stop_events a where a.tracking_source_run_id=d.tracking_source_run_id
   and a.vehicle_id=d.vehicle_id and a.event_type='arrival' and a.event_at>d.event_at);
grant select on public.selected_completed_departures to service_role;
grant select on public.selected_gps_history,public.active_gps_history,public.selected_stop_events,
 public.selected_stop_state,public.selected_eta_state,public.selected_segment_runs to authenticated,service_role;

-- Public readers get a narrow snapshot through explicit visibility checks;
-- raw GPS history remains private. No caller may select a different source.
create function public.selected_tracking_snapshot(target_vehicle text) returns jsonb
 language sql stable security definer set search_path=public as $$
 select jsonb_build_object('selection',s.gps_source,
 'position',(select jsonb_build_object('latitude',h.latitude,'longitude',h.longitude,'speed_kmh',h.speed_kmh,
   'bearing_deg',h.heading,'source_recorded_at',h.source_recorded_at,'received_at',h.received_at,'source',h.source)
   from public.active_gps_history h where h.vehicle_id=v.external_id and h.project_id=p.id order by h.source_recorded_at desc limit 1),
 'stop',(select to_jsonb(st) from public.selected_stop_state st where st.vehicle_id=v.external_id and st.project_id=p.id),
 'eta',(select to_jsonb(e) from public.selected_eta_state e where e.vehicle_id=v.external_id and e.project_id=p.id))
 from public.vehicles v join public.projects p on p.id=v.project_id
 left join public.live_map_settings s on s.project_slug=p.slug
 where v.external_id=target_vehicle and (p.is_public or public.is_organization_member(p.organization_id));
$$;
revoke all on function public.selected_tracking_snapshot(text) from public;
grant execute on function public.selected_tracking_snapshot(text) to anon,authenticated,service_role;
revoke all on function public.select_tracking_input(),public.end_tracking_selection() from public;
create function public.guard_selected_tracking_write() returns trigger
 language plpgsql security definer set search_path=public as $$
declare point_id bigint; accepted_run bigint;
begin
 point_id := case when tg_table_name='vehicle_stop_state' then (to_jsonb(new)->>'last_gps_history_id')::bigint
   else (to_jsonb(new)->>'gps_history_id')::bigint end;
 perform 1 from public.live_map_settings s join public.projects p on p.slug=s.project_slug
   where p.id=new.project_id for update of s;
 select h.tracking_source_run_id into accepted_run from public.active_gps_history h
   where h.id=point_id and h.vehicle_id=new.vehicle_id and h.project_id=new.project_id;
 if accepted_run is null then raise exception 'Tracking input is not in the active provider period'; end if;
 return new;
end $$;
create trigger guard_selected_input before insert or update on public.vehicle_stop_state for each row execute function public.guard_selected_tracking_write();
create trigger guard_selected_input before insert or update on public.vehicle_eta_state for each row execute function public.guard_selected_tracking_write();
create trigger guard_selected_input before insert or update on public.stop_events for each row execute function public.guard_selected_tracking_write();
revoke all on function public.guard_selected_tracking_write() from public;
commit;
