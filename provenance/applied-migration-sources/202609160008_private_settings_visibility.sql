-- A private project's selection and editor identity are private too.
drop policy if exists "Public reads live map settings" on public.live_map_settings;
create policy "Accessible projects read live settings" on public.live_map_settings
for select to anon,authenticated using (
 exists(select 1 from public.projects p where p.slug=project_slug)
);
-- The projects SELECT policies enforce public visibility or organization membership.
