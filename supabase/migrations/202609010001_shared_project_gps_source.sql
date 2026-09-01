-- Shared public-map preferences. This table is intentionally independent of
-- the optional multi-tenant `projects` schema so legacy installations work.
create table if not exists public.live_map_settings (
  project_slug text primary key,
  gps_source text not null default 'automatic'
    check (gps_source in ('automatic', 'pixel', 'scorpion')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.live_map_settings enable row level security;

drop policy if exists "Public reads live map settings" on public.live_map_settings;
create policy "Public reads live map settings"
  on public.live_map_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users create live map settings" on public.live_map_settings;
create policy "Authenticated users create live map settings"
  on public.live_map_settings for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "Authenticated users update live map settings" on public.live_map_settings;
create policy "Authenticated users update live map settings"
  on public.live_map_settings for update
  to authenticated
  using (true)
  with check (auth.uid() is not null);

grant select on public.live_map_settings to anon, authenticated;
grant insert, update on public.live_map_settings to authenticated;

insert into public.live_map_settings(project_slug, gps_source)
values ('sightseeing-shkodra', 'scorpion')
on conflict (project_slug) do update
set gps_source = excluded.gps_source,
    updated_at = now();
