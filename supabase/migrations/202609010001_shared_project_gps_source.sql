-- Keep the selected tracker consistent across the admin page and every public
-- live-map device. Browser localStorage remains only a legacy/admin fallback.
alter table public.projects
  add column if not exists gps_source text not null default 'automatic';

alter table public.projects
  drop constraint if exists projects_gps_source_check;

alter table public.projects
  add constraint projects_gps_source_check
  check (gps_source in ('automatic', 'pixel', 'scorpion'));

-- Preserve the operator's current selection for the production tour.
update public.projects
set gps_source = 'scorpion'
where slug = 'sightseeing-shkodra';
