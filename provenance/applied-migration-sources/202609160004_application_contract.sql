-- Shared clean/upgrade contract. Creates dependencies but never schedules work.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
alter view public.stop_visit_history set (security_invoker=true);
alter view public.latest_vehicle_position set (security_invoker=true);
revoke all on public.stop_visit_history,public.latest_vehicle_position from public,anon,authenticated;
grant select on public.stop_visit_history,public.latest_vehicle_position to anon,authenticated;
revoke all on function public.is_organization_member(uuid),public.has_organization_role(uuid,text[]),public.create_workspace(text,text,text,text) from public,anon;
grant execute on function public.is_organization_member(uuid),public.has_organization_role(uuid,text[]),public.create_workspace(text,text,text,text) to authenticated,service_role;
-- Trigger functions are invoked by their triggers, never directly by browser RPC.
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prorettype='trigger'::regtype loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
-- Future hosted table defaults must not reintroduce browser-wide destructive grants.
alter default privileges for role postgres in schema public revoke truncate on tables from public,anon,authenticated;
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('revoke truncate on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
