-- Per-user/project rate budget checked with the caller's actual JWT identity.
create table public.editor_request_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  bucket timestamptz not null,
  requests integer not null check(requests between 1 and 12),
  primary key(user_id,project_id)
);
alter table public.editor_request_limits enable row level security;
revoke all on public.editor_request_limits from public,anon,authenticated;
grant all on public.editor_request_limits to service_role;
create function public.consume_poi_request(target_project_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare allowed boolean; current_bucket timestamptz=date_trunc('minute',clock_timestamp());
begin
  if auth.uid() is null or not exists(
    select 1 from public.projects p where p.id=target_project_id
    and public.has_organization_role(p.organization_id,array['owner','admin','editor'])
  ) then raise exception 'Editor access required' using errcode='42501'; end if;
  insert into public.editor_request_limits(user_id,project_id,bucket,requests)
  values(auth.uid(),target_project_id,current_bucket,1)
  on conflict(user_id,project_id) do update set bucket=excluded.bucket,
    requests=case when editor_request_limits.bucket=excluded.bucket then editor_request_limits.requests+1 else 1 end
    where editor_request_limits.bucket<>excluded.bucket or editor_request_limits.requests<12
  returning true into allowed;
  return coalesce(allowed,false);
end $$;
revoke all on function public.consume_poi_request(uuid) from public,anon;
grant execute on function public.consume_poi_request(uuid) to authenticated;
