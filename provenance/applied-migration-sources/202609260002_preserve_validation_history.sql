-- Preserve all pre-cutover inputs during hosted validation; reclaim only new temporary inputs.
begin;
alter table public.tracking_runtime_config add column live_only_cutover_input_id bigint;
update public.tracking_runtime_config set live_only_cutover_input_id=coalesce((select max(id) from public.gps_history),0);
CREATE OR REPLACE FUNCTION public.reclaim_tracking_buffer(target_vehicle text, batch_size integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare removed integer;
begin
 if batch_size<1 or batch_size>1000 or batch_size is null then raise exception 'Invalid batch size';end if;
 with candidates as (
 select h.id from gps_history h where h.vehicle_id=target_vehicle and h.lean_input and not h.diagnostic_sample
 and h.id>coalesce((select live_only_cutover_input_id from tracking_runtime_config limit 1),9223372036854775807)
 and not exists(select 1 from stop_events e where e.gps_history_id=h.id)
 and not exists(select 1 from vehicle_positions v where v.gps_history_id=h.id)
 and not exists(select 1 from vehicle_stop_state s where s.last_gps_history_id=h.id or s.candidate_gps_history_id=h.id)
 and not exists(select 1 from vehicle_eta_state e where e.gps_history_id=h.id)
 and not exists(select 1 from tracking_distance_cursor c where c.last_input_id=h.id)
 and exists(select 1 from gps_history newer where newer.vehicle_id=h.vehicle_id and newer.source=h.source and newer.source_recorded_at>h.source_recorded_at)
 and not exists(select 1 from tracking_source_runs r where r.id=h.tracking_source_run_id and r.ended_at is null
  and not exists(select 1 from vehicle_stop_state s join gps_history cursor on cursor.id=s.last_gps_history_id
   where s.vehicle_id=h.vehicle_id and cursor.tracking_source_run_id=r.id and cursor.source_recorded_at>=h.source_recorded_at))
 order by h.id limit batch_size for update of h skip locked
 ) delete from gps_history h using candidates c where h.id=c.id;
 get diagnostics removed=row_count;return removed;
end $function$
;
commit;
