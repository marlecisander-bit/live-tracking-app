-- RLS does not govern TRUNCATE. Browser roles never need table-wide deletion.
-- Additive authorization hardening; no records or service-role grants changed.
do $$
declare application_table text;
begin
 foreach application_table in array array[
   'organizations','organization_members','projects','vehicles','map_versions',
   'live_map_settings','gps_history','vehicle_positions','stop_events','segment_runs',
   'vehicle_eta_state','vehicle_stop_state','tracking_devices',
   'tracking_pipeline_capabilities','tracking_source_runs','tracking_jobs','tour_runs'
 ] loop
   if to_regclass('public.' || application_table) is not null then
     execute format('revoke truncate on table public.%I from public, anon, authenticated', application_table);
   end if;
 end loop;
end $$;
