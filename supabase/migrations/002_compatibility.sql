-- Read-only compatibility views, no per-fix second state tables.
create view public.live_map_settings with(security_invoker=true) as select slug project_slug,'scorpion'::text gps_source from public.projects;
create view public.tracking_pipeline_capabilities with(security_invoker=true) as select id project_id,false central_verified from public.projects;
grant select on public.live_map_settings,public.tracking_pipeline_capabilities to anon,authenticated,service_role;
-- Keep central_verified false: this is the existing provider/public-snapshot route, not the old competing central engine.
