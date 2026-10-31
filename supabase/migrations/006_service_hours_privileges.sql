-- Pin the hours table ACL independently of managed-project default privileges.
-- All changes continue through the existing administrator-authorized save RPC.
BEGIN;
REVOKE ALL ON TABLE public.vehicle_service_hours FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.vehicle_service_hours TO anon,authenticated,service_role;
COMMIT;
