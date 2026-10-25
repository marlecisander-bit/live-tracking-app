-- Non-destructive hardening. Requires the existing multi-tenant migrations.
-- Review against the live schema before deployment; no historical rows are deleted.

drop policy if exists "Authenticated users create live map settings" on public.live_map_settings;
drop policy if exists "Authenticated users update live map settings" on public.live_map_settings;
create policy "Project admins create live settings" on public.live_map_settings
for insert to authenticated with check (
  updated_by = auth.uid() and exists (
    select 1 from public.projects p where p.slug = project_slug
    and public.has_organization_role(p.organization_id, array['owner','admin'])
  )
);
create policy "Project admins update live settings" on public.live_map_settings
for update to authenticated using (
  exists (select 1 from public.projects p where p.slug = project_slug
    and public.has_organization_role(p.organization_id, array['owner','admin']))
) with check (
  updated_by = auth.uid() and exists (
    select 1 from public.projects p where p.slug = project_slug
    and public.has_organization_role(p.organization_id, array['owner','admin']))
);

-- A signed-in tourist must retain the same public read access as an anonymous one.
create policy "Signed in visitors view public projects" on public.projects
for select to authenticated using (is_public);
create policy "Signed in visitors view public vehicles" on public.vehicles
for select to authenticated using (
  exists(select 1 from public.projects p where p.id=project_id and p.is_public)
);

-- Restrict the existing permissive management policy; admins cannot appoint owners.
create policy "Only owners appoint owners" on public.organization_members
as restrictive for insert to authenticated with check (
  role <> 'owner' or public.has_organization_role(organization_id,array['owner'])
);
create policy "Only owners change owners" on public.organization_members
as restrictive for update to authenticated
using (role <> 'owner' or public.has_organization_role(organization_id,array['owner']))
with check (role <> 'owner' or public.has_organization_role(organization_id,array['owner']));

-- SECURITY DEFINER invitation RPC bypasses RLS, so protect existing owners here too.
create or replace function public.protect_organization_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and old.role = 'owner' and
    (new.role <> old.role or new.user_id <> old.user_id or new.organization_id <> old.organization_id) then
    raise exception 'Owner membership requires a dedicated ownership transfer';
  end if;
  return new;
end $$;
create trigger protect_organization_owner before update on public.organization_members
for each row execute function public.protect_organization_owner();

-- Compare against the locked row, preventing a concurrent older upsert from winning.
create or replace function public.keep_vehicle_position_monotonic()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.source_recorded_at < old.source_recorded_at then return null; end if;
  if new.source_recorded_at = old.source_recorded_at and
     new.device_id is not distinct from old.device_id and
     coalesce(new.sequence_number,0) < coalesce(old.sequence_number,0) then return null; end if;
  return new;
end $$;
create trigger keep_vehicle_position_monotonic before update on public.vehicle_positions
for each row execute function public.keep_vehicle_position_monotonic();

create index if not exists gps_history_project_vehicle_received_idx
on public.gps_history(project_id,vehicle_id,received_at,id);
create index if not exists gps_history_project_vehicle_recorded_idx
on public.gps_history(project_id,vehicle_id,source_recorded_at desc);
create index if not exists organization_members_user_idx on public.organization_members(user_id,organization_id);
create index if not exists projects_organization_idx on public.projects(organization_id);
create index if not exists vehicles_project_idx on public.vehicles(project_id);
do $$ begin
  if to_regclass('public.map_versions') is not null then
    create index if not exists map_versions_project_published_idx
    on public.map_versions(project_id,published_at desc) where status='published';
    create index if not exists map_versions_project_created_idx on public.map_versions(project_id,created_at desc);
  end if;
  if to_regclass('public.stop_events') is not null then
    create index if not exists stop_events_project_vehicle_event_idx on public.stop_events(project_id,vehicle_id,event_at,id);
  end if;
end $$;
