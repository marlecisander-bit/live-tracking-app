-- Broadcast live vehicle changes to subscribed admin and public maps.
do $$
begin
  alter publication supabase_realtime add table public.vehicle_positions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
