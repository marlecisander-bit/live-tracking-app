-- Opt-in staging experiment. Not part of the certified release manifest yet.
-- No schedules enabled, no ingestion or processor algorithm replaced.
create table public.tracking_live_snapshots (
 vehicle_id text primary key references public.vehicles(external_id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 snapshot jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.tracking_live_snapshots enable row level security;
revoke all on public.tracking_live_snapshots from public,anon,authenticated;
grant select on public.tracking_live_snapshots to anon,authenticated;
grant all on public.tracking_live_snapshots to service_role;
create policy "Visible selected snapshot" on public.tracking_live_snapshots for select to anon,authenticated
 using (exists(select 1 from public.projects p where p.id=project_id));
-- projects RLS is the visibility authority, including public access for signed-in visitors.

create function public.refresh_tracking_live_snapshot(target_vehicle text) returns void
language plpgsql security definer set search_path=public as $$
declare value jsonb; owner_project uuid;
begin
 -- Writers already lock this vehicle. Same transaction publishes position/state changes.
 select v.project_id into owner_project from vehicles v where v.external_id=target_vehicle for update;
 if owner_project is null then return;end if;
 select jsonb_build_object('selection',s.gps_source,
 'position',(select jsonb_build_object('latitude',h.latitude,'longitude',h.longitude,'speed_kmh',h.speed_kmh,
 'bearing_deg',coalesce(h.bearing_deg,h.heading),'source_recorded_at',h.source_recorded_at,'received_at',h.received_at,'source',h.source)
 from active_gps_history h where h.vehicle_id=target_vehicle and h.project_id=owner_project order by h.source_recorded_at desc,h.id desc limit 1),
 'stop',(select to_jsonb(st) from selected_stop_state st where st.vehicle_id=target_vehicle and st.project_id=owner_project),
 'eta',(select to_jsonb(e) from selected_eta_state e where e.vehicle_id=target_vehicle and e.project_id=owner_project))
 into value from projects p left join live_map_settings s on s.project_slug=p.slug where p.id=owner_project;
 insert into tracking_live_snapshots(vehicle_id,project_id,snapshot) values(target_vehicle,owner_project,value)
 on conflict(vehicle_id) do update set snapshot=excluded.snapshot,revision=tracking_live_snapshots.revision+1,updated_at=clock_timestamp()
 where tracking_live_snapshots.snapshot is distinct from excluded.snapshot;
end $$;
revoke all on function public.refresh_tracking_live_snapshot(text) from public,anon,authenticated;
grant execute on function public.refresh_tracking_live_snapshot(text) to service_role;

create function public.refresh_tracking_live_after_write() returns trigger
language plpgsql security definer set search_path=public as $$
declare vehicle text;
begin
 if tg_table_name='live_map_settings' then
  for vehicle in select v.external_id from vehicles v join projects p on p.id=v.project_id where p.slug=new.project_slug order by v.external_id loop
   perform refresh_tracking_live_snapshot(vehicle);
  end loop;
 elsif tg_table_name='gps_history' then
  if new.tracking_source_run_id is not null then perform refresh_tracking_live_snapshot(new.vehicle_id);end if;
 else perform refresh_tracking_live_snapshot(new.vehicle_id);
 end if;
 return new;
end $$;
revoke all on function public.refresh_tracking_live_after_write() from public,anon,authenticated;
create trigger refresh_live_snapshot after insert on public.gps_history for each row execute function public.refresh_tracking_live_after_write();
create trigger refresh_live_snapshot after insert or update on public.vehicle_stop_state for each row execute function public.refresh_tracking_live_after_write();
create trigger refresh_live_snapshot after insert or update on public.vehicle_eta_state for each row execute function public.refresh_tracking_live_after_write();
-- Alphabetical AFTER trigger order: end_tracking_selection must run first.
create trigger z_refresh_live_snapshot after insert or update on public.live_map_settings for each row execute function public.refresh_tracking_live_after_write();
select public.refresh_tracking_live_snapshot(external_id) from public.vehicles order by external_id;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.tracking_live_snapshots;
 end if;
end $$;

-- Bounded opt-in maintenance. Preserve raw anchors required by existing selected views.
-- Existing stop_events_unique_gps_event_idx begins with gps_history_id and covers
-- the non-null anchor lookup; do not add a redundant write-side index.
create function public.prune_tracking_history(batch_size integer default 500) returns jsonb
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
 with candidates as (
  select e.id from stop_events e where e.event_at<now()-interval '90 days' and e.created_at<now()-interval '90 days'
  and not exists(select 1 from segment_runs s where s.departure_event_id=e.id or s.arrival_event_id=e.id)
  and not exists(select 1 from tour_runs t where t.start_event_id=e.id or t.completion_event_id=e.id)
  and not exists(select 1 from vehicle_stop_state s where s.arrival_event_id=e.id)
  and e.event_type<>'departure' -- unresolved departures may still need segment completion
  order by e.event_at,e.id limit batch_size for update of e skip locked
 ) delete from stop_events e using candidates c where e.id=c.id;
 get diagnostics events_removed=row_count;
 return jsonb_build_object('gps_deleted',removed,'events_deleted',events_removed,'batch_limit',batch_size);
end $$;
revoke all on function public.prune_tracking_history(integer) from public,anon,authenticated;
grant execute on function public.prune_tracking_history(integer) to service_role;
-- Install a staging-only schedule separately after cleanup tests and evidence capture.
