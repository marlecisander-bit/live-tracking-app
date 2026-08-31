-- Keep every parameter displayed by the Pixel tracker in the current live row.
alter table public.vehicle_positions add column if not exists vertical_accuracy_m real;
alter table public.vehicle_positions add column if not exists provider text;
alter table public.vehicle_positions add column if not exists satellites_visible smallint;
alter table public.vehicle_positions add column if not exists constellations text;
alter table public.vehicle_positions add column if not exists cn0_median_dbhz real;
alter table public.vehicle_positions add column if not exists fix_rate_hz real;
alter table public.vehicle_positions add column if not exists ttff_ms bigint;
alter table public.vehicle_positions add column if not exists elapsed_realtime_nanos bigint;
alter table public.vehicle_positions add column if not exists source text;
