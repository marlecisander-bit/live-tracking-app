-- Emergency RPC disable only. Retains metadata, snapshots and maps; no unsafe legacy writer reopening.
-- Requires maintenance notice/read-only admin until reviewed correction is installed.
BEGIN;
SET LOCAL lock_timeout='100ms';SET LOCAL statement_timeout='2s';
REVOKE EXECUTE ON FUNCTION public.save_tracking_map(uuid,bigint,bigint,bigint,text,jsonb,uuid) FROM authenticated;
COMMIT;
-- Functional frontend rollback uses a connected artifact compatible with this RPC.
-- This disable does not undo committed CMS saves; do not remove cms_request_id/index or restore legacy INSERT permission.
