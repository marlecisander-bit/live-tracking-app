-- Multi-tenant ownership. Existing data is retained in one default project.
create extension if not exists pgcrypto;

do $$ begin
  alter publication supabase_realtime add table public.vehicle_positions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  default_vehicle_id text,
  is_public boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  external_id text not null unique,
  name text not null default 'Sightseeing Van',
  created_at timestamptz not null default now()
);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.organization_members m where m.organization_id = target_organization_id and m.user_id = auth.uid()) $$;

create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.organization_members m where m.organization_id = target_organization_id and m.user_id = auth.uid() and m.role = any(allowed_roles)) $$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_organization_role(uuid,text[]) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid,text[]) to authenticated;

create or replace function public.invite_organization_member(target_organization_id uuid, member_email text, member_role text default 'editor')
returns void language plpgsql security definer set search_path = public,auth
as $$
declare target_user_id uuid;
begin
  if not public.has_organization_role(target_organization_id,array['owner','admin']) then raise exception 'Only owners and admins can manage access'; end if;
  if member_role not in ('admin','editor','viewer') then raise exception 'Invalid member role'; end if;
  select id into target_user_id from auth.users where lower(email)=lower(trim(member_email)) limit 1;
  if target_user_id is null then raise exception 'That email must sign up before it can be invited'; end if;
  insert into public.organization_members(organization_id,user_id,role)
  values(target_organization_id,target_user_id,member_role)
  on conflict (organization_id,user_id) do update set role=excluded.role;
end $$;
revoke all on function public.invite_organization_member(uuid,text,text) from public;
grant execute on function public.invite_organization_member(uuid,text,text) to authenticated;

create or replace function public.create_workspace(workspace_name text, workspace_slug text, first_project_name text, first_project_slug text)
returns setof public.projects language plpgsql security definer set search_path = public
as $$
declare new_org uuid; new_project public.projects;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.organizations(name,slug,created_by) values(trim(workspace_name),workspace_slug,auth.uid()) returning id into new_org;
  insert into public.organization_members(organization_id,user_id,role) values(new_org,auth.uid(),'owner');
  insert into public.projects(organization_id,name,slug,default_vehicle_id,created_by)
  values(new_org,trim(first_project_name),first_project_slug,first_project_slug||'-van-1',auth.uid()) returning * into new_project;
  insert into public.vehicles(project_id,external_id,name) values(new_project.id,new_project.default_vehicle_id,trim(first_project_name)||' Van');
  return next new_project;
end $$;
revoke all on function public.create_workspace(text,text,text,text) from public;
grant execute on function public.create_workspace(text,text,text,text) to authenticated;

do $$
declare default_org uuid; default_project uuid;
begin
  insert into public.organizations(name,slug,created_by)
  values ('Sightseeing Shkodra','sightseeing-shkodra',(select id from auth.users order by created_at limit 1))
  on conflict (slug) do update set name=excluded.name
  returning id into default_org;

  insert into public.organization_members(organization_id,user_id,role)
  select default_org,id,'owner' from auth.users
  on conflict (organization_id,user_id) do nothing;

  insert into public.projects(organization_id,name,slug,default_vehicle_id,created_by)
  values (default_org,'Sightseeing Shkodra','sightseeing-shkodra','sightseeing-shkodra-van-1',(select id from auth.users order by created_at limit 1))
  on conflict (slug) do update set default_vehicle_id=coalesce(public.projects.default_vehicle_id,excluded.default_vehicle_id)
  returning id into default_project;

  insert into public.vehicles(project_id,external_id,name)
  values(default_project,'sightseeing-shkodra-van-1','Sightseeing Van')
  on conflict (external_id) do update set project_id=excluded.project_id;

  -- Tables created by earlier deployments are upgraded only when present.
  perform 1;
  if to_regclass('public.map_versions') is not null then
    alter table public.map_versions add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update public.map_versions set project_id=default_project where project_id is null;
    alter table public.map_versions alter column project_id set not null;
  end if;
  if to_regclass('public.gps_history') is not null then
    alter table public.gps_history add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update public.gps_history set project_id=default_project where project_id is null;
    alter table public.gps_history alter column project_id set not null;
  end if;
  if to_regclass('public.vehicle_positions') is not null then
    alter table public.vehicle_positions add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update public.vehicle_positions set project_id=default_project where project_id is null;
    alter table public.vehicle_positions alter column project_id set not null;
  end if;
  if to_regclass('public.stop_events') is not null then
    alter table public.stop_events add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update public.stop_events set project_id=default_project where project_id is null;
    alter table public.stop_events alter column project_id set not null;
  end if;
  if to_regclass('public.segment_runs') is not null then
    alter table public.segment_runs add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update public.segment_runs set project_id=default_project where project_id is null;
    alter table public.segment_runs alter column project_id set not null;
  end if;
  if to_regclass('public.vehicle_eta_state') is not null then
    alter table public.vehicle_eta_state add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update public.vehicle_eta_state set project_id=default_project where project_id is null;
    alter table public.vehicle_eta_state alter column project_id set not null;
  end if;
  if to_regclass('public.vehicle_stop_state') is not null then
    alter table public.vehicle_stop_state add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update public.vehicle_stop_state set project_id=default_project where project_id is null;
    alter table public.vehicle_stop_state alter column project_id set not null;
  end if;
end $$;

-- Legacy/background writers that only send vehicle_id are assigned safely.
create or replace function public.assign_project_from_vehicle()
returns trigger language plpgsql set search_path = public
as $$ begin
  if new.project_id is null and new.vehicle_id is not null then
    select v.project_id into new.project_id from public.vehicles v where v.external_id=new.vehicle_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['gps_history','vehicle_positions','stop_events','segment_runs','vehicle_eta_state','vehicle_stop_state'] loop
    if to_regclass('public.'||t) is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='vehicle_id') then
      execute format('drop trigger if exists assign_project_from_vehicle on public.%I',t);
      execute format('create trigger assign_project_from_vehicle before insert or update on public.%I for each row execute function public.assign_project_from_vehicle()',t);
    end if;
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.vehicles enable row level security;

create policy "Members view organizations" on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy "Owners update organizations" on public.organizations for update to authenticated using (public.has_organization_role(id,array['owner'])) with check (public.has_organization_role(id,array['owner']));
create policy "Users create organizations" on public.organizations for insert to authenticated with check (created_by=auth.uid());
create policy "Members view memberships" on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy "Admins manage memberships" on public.organization_members for all to authenticated using (public.has_organization_role(organization_id,array['owner','admin'])) with check (public.has_organization_role(organization_id,array['owner','admin']));
create policy "Public views public projects" on public.projects for select to anon using (is_public);
create policy "Members view projects" on public.projects for select to authenticated using (public.is_organization_member(organization_id));
create policy "Admins create projects" on public.projects for insert to authenticated with check (public.has_organization_role(organization_id,array['owner','admin']));
create policy "Admins update projects" on public.projects for update to authenticated using (public.has_organization_role(organization_id,array['owner','admin'])) with check (public.has_organization_role(organization_id,array['owner','admin']));
create policy "Members view vehicles" on public.vehicles for select to authenticated using (exists(select 1 from public.projects p where p.id=project_id and public.is_organization_member(p.organization_id)));
create policy "Public views public project vehicles" on public.vehicles for select to anon using (exists(select 1 from public.projects p where p.id=project_id and p.is_public));
create policy "Admins manage vehicles" on public.vehicles for all to authenticated using (exists(select 1 from public.projects p where p.id=project_id and public.has_organization_role(p.organization_id,array['owner','admin']))) with check (exists(select 1 from public.projects p where p.id=project_id and public.has_organization_role(p.organization_id,array['owner','admin'])));

grant select,insert,update on public.organizations,public.organization_members,public.projects,public.vehicles to authenticated;
grant select on public.projects,public.vehicles to anon;

-- Apply project isolation to application tables without assuming they all exist.
do $$
declare t text; policy_name text;
begin
  foreach t in array array['map_versions','gps_history','vehicle_positions','stop_events','segment_runs','vehicle_eta_state','vehicle_stop_state'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      for policy_name in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I',policy_name,t);
      end loop;
      execute format('create policy "Tenant members read" on public.%I for select to authenticated using (exists(select 1 from public.projects p where p.id=project_id and public.is_organization_member(p.organization_id)))',t);
      execute format('create policy "Public reads public project data" on public.%I for select to anon,authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.is_public))',t);
    end if;
  end loop;
end $$;

-- Operational history and analytics remain private to organization members.
do $$
declare t text;
begin
  foreach t in array array['gps_history','stop_events','segment_runs'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists "Public reads public project data" on public.%I',t);
    end if;
  end loop;
end $$;

-- Map editing is restricted to editors and above. Public visitors only see published maps.
do $$ begin
  if to_regclass('public.map_versions') is not null then
    drop policy if exists "Public reads public project data" on public.map_versions;
    create policy "Public reads published project maps" on public.map_versions for select to anon,authenticated using (status='published' and exists(select 1 from public.projects p where p.id=project_id and p.is_public));
    drop policy if exists "Tenant editors create maps" on public.map_versions;
    create policy "Tenant editors create maps" on public.map_versions for insert to authenticated with check (exists(select 1 from public.projects p where p.id=project_id and public.has_organization_role(p.organization_id,array['owner','admin','editor'])));
    drop policy if exists "Tenant editors update maps" on public.map_versions;
    create policy "Tenant editors update maps" on public.map_versions for update to authenticated using (exists(select 1 from public.projects p where p.id=project_id and public.has_organization_role(p.organization_id,array['owner','admin','editor']))) with check (exists(select 1 from public.projects p where p.id=project_id and public.has_organization_role(p.organization_id,array['owner','admin','editor'])));
  end if;
end $$;
