-- Additive transition. Does not rotate credentials or enable the new processor.
create table public.tracking_devices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  vehicle_id text not null references public.vehicles(external_id) on delete restrict,
  device_name text not null check(char_length(device_name) between 1 and 100),
  credential_hash text not null unique check(credential_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
alter table public.tracking_devices enable row level security;
revoke all on public.tracking_devices from public, anon, authenticated;
grant all on public.tracking_devices to service_role;
create index tracking_devices_vehicle_idx on public.tracking_devices(vehicle_id,project_id);

create function public.validate_tracking_device_binding() returns trigger
language plpgsql set search_path=public as $$ begin
  if not exists(select 1 from public.vehicles where external_id=new.vehicle_id and project_id=new.project_id) then
    raise exception 'Device vehicle/project binding is invalid';
  end if;
  return new;
end $$;
create trigger validate_tracking_device_binding before insert or update on public.tracking_devices
for each row execute function public.validate_tracking_device_binding();

-- Membership mutations go through the checked RPC, including legacy invitation clients.
revoke insert,update,delete on public.organization_members from anon,authenticated;
create or replace function public.invite_organization_member(target_organization_id uuid, member_email text, member_role text default 'editor')
returns void language plpgsql security definer set search_path=public,auth as $$
declare target_user_id uuid;
begin
  perform 1 from public.organizations where id=target_organization_id for update;
  if not public.has_organization_role(target_organization_id,array['owner','admin']) then raise exception 'Only owners and admins can manage access'; end if;
  if member_role is null or member_role not in ('admin','editor','viewer') then raise exception 'Invalid member role'; end if;
  select id into target_user_id from auth.users where lower(email)=lower(trim(member_email)) limit 1;
  if target_user_id is null then raise exception 'That email must sign up before it can be invited'; end if;
  if exists(select 1 from public.organization_members where organization_id=target_organization_id and user_id=target_user_id and role='owner') then
    raise exception 'Owner membership requires a dedicated ownership transfer';
  end if;
  insert into public.organization_members(organization_id,user_id,role) values(target_organization_id,target_user_id,member_role)
  on conflict(organization_id,user_id) do update set role=excluded.role;
end $$;
revoke all on function public.invite_organization_member(uuid,text,text) from public,anon;
grant execute on function public.invite_organization_member(uuid,text,text) to authenticated;

create function public.prevent_tenant_reassignment() returns trigger
language plpgsql set search_path=public as $$ begin
  if tg_table_name='projects' then
    if new.organization_id<>old.organization_id then raise exception 'Project ownership transfer is not supported'; end if;
  else
    if new.project_id<>old.project_id or new.external_id<>old.external_id then raise exception 'Vehicle reassignment requires a dedicated migration'; end if;
  end if;
  return new;
end $$;
create trigger prevent_project_reassignment before update on public.projects for each row execute function public.prevent_tenant_reassignment();
create trigger prevent_vehicle_reassignment before update on public.vehicles for each row execute function public.prevent_tenant_reassignment();

create function public.create_project_with_vehicle(target_organization_id uuid, project_name text, project_slug text)
returns setof public.projects language plpgsql security definer set search_path=public as $$
declare created public.projects;
begin
  if not public.has_organization_role(target_organization_id,array['owner','admin']) then raise exception 'Only owners and admins can create projects'; end if;
  if char_length(project_slug)>55 then raise exception 'Project slug is too long'; end if;
  insert into public.projects(organization_id,name,slug,default_vehicle_id,created_by)
  values(target_organization_id,trim(project_name),project_slug,project_slug||'-van-1',auth.uid()) returning * into created;
  insert into public.vehicles(project_id,external_id,name) values(created.id,created.default_vehicle_id,trim(project_name)||' Van');
  return next created;
end $$;
revoke all on function public.create_project_with_vehicle(uuid,text,text) from public,anon;
grant execute on function public.create_project_with_vehicle(uuid,text,text) to authenticated;

-- This is a deployment capability, not an editable GPS-source preference.
create table public.tracking_pipeline_capabilities (
  project_id uuid primary key references public.projects(id) on delete cascade,
  central_verified boolean not null default false,
  verified_at timestamptz,
  check (not central_verified or verified_at is not null)
);
alter table public.tracking_pipeline_capabilities enable row level security;
revoke all on public.tracking_pipeline_capabilities from public,anon,authenticated;
grant select on public.tracking_pipeline_capabilities to anon,authenticated;
grant all on public.tracking_pipeline_capabilities to service_role;
create policy "Read accessible pipeline capabilities" on public.tracking_pipeline_capabilities for select to anon,authenticated
using(exists(select 1 from public.projects p where p.id=project_id));
