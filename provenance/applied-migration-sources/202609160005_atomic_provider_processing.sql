-- The scheduled provider detector is the sole stop/event writer.
create function public.provider_processing_context(target_vehicle text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare current_state public.vehicle_stop_state; previous_point public.gps_history;
 next_point public.gps_history; active_run bigint; selected_map public.map_versions;
begin
 select r.id into active_run from tracking_source_runs r where r.vehicle_id=target_vehicle and r.ended_at is null;
 if active_run is null then return null;end if;
 select * into current_state from vehicle_stop_state where vehicle_id=target_vehicle;
 select * into previous_point from gps_history where id=current_state.last_gps_history_id and tracking_source_run_id=active_run;
 select * into next_point from gps_history where tracking_source_run_id=active_run
 and (previous_point.id is null or source_recorded_at>previous_point.source_recorded_at)
 order by source_recorded_at,id limit 1;
 if next_point.id is null then return null;end if;
 select * into selected_map from map_versions where project_id=next_point.project_id and status='published'
 order by published_at desc nulls last,id desc limit 1;
 if selected_map.id is null then raise exception 'Published map required';end if;
 return jsonb_build_object('gps',to_jsonb(next_point),'state',case when current_state.vehicle_id is null then null else to_jsonb(current_state) end,
 'planner_state',case when previous_point.id is null then null else to_jsonb(current_state) end,
 'previous_gps',case when previous_point.id is null then null else to_jsonb(previous_point) end,'map_version',to_jsonb(selected_map));
end $$;
revoke all on function public.provider_processing_context(text) from public,anon,authenticated;
grant execute on function public.provider_processing_context(text) to service_role;

create function public.commit_provider_transition(point_id bigint,expected_state jsonb,next_state jsonb,new_events jsonb,version_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare gps public.gps_history; context jsonb; current_state jsonb; payload jsonb=next_state;
 item jsonb; columns_sql text; select_sql text; updates_sql text; inserted_id jsonb; event_index integer=0;
begin
 select * into gps from gps_history where id=point_id;
 if gps.id is null then raise exception 'Unknown input';end if;
 -- Same lock order as source selection: settings, then the vehicle.
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=gps.project_id for update of s;
 perform 1 from vehicles where external_id=gps.vehicle_id and project_id=gps.project_id for update;
 if not found then raise exception 'Vehicle binding missing';end if;
 select to_jsonb(s) into current_state from vehicle_stop_state s where s.vehicle_id=gps.vehicle_id;
 if current_state->>'last_gps_history_id'=point_id::text then return jsonb_build_object('status','duplicate');end if;
 if current_state is distinct from expected_state then return jsonb_build_object('status','retry');end if;
 context=provider_processing_context(gps.vehicle_id);
 if context is null or (context->'gps'->>'id')::bigint<>point_id then return jsonb_build_object('status','stale');end if;
 if (context->'map_version'->>'id')::bigint<>version_id then return jsonb_build_object('status','retry');end if;
 if payload->>'vehicle_id' is distinct from gps.vehicle_id or (payload->>'project_id')::uuid is distinct from gps.project_id
 or (payload->>'last_gps_history_id')::bigint is distinct from point_id or (payload->>'map_version_id')::bigint is distinct from version_id then raise exception 'State identity mismatch';end if;
 if jsonb_typeof(new_events)<>'array' or jsonb_array_length(new_events)>2 then raise exception 'Invalid event plan';end if;
 perform set_config('app.provider_transition','true',true);
 for item in select value from jsonb_array_elements(new_events) loop
  event_index=event_index+1;
  if item ? 'id' or item->>'vehicle_id' is distinct from gps.vehicle_id or (item->>'project_id')::uuid is distinct from gps.project_id
  or (item->>'gps_history_id')::bigint is distinct from point_id or (item->>'event_at')::timestamptz is distinct from gps.source_recorded_at then raise exception 'Event identity mismatch';end if;
  select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into columns_sql,select_sql from jsonb_object_keys(item) key;
  execute format('insert into stop_events(%s) select %s from jsonb_populate_record(null::stop_events,$1) r returning to_jsonb(id)',columns_sql,select_sql) into inserted_id using item;
  if payload->>'arrival_event_id'=(-event_index)::text then payload=jsonb_set(payload,'{arrival_event_id}',inserted_id);end if;
 end loop;
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into columns_sql,select_sql,updates_sql from jsonb_object_keys(payload) key;
 execute format('insert into vehicle_stop_state(%s) select %s from jsonb_populate_record(null::vehicle_stop_state,$1) r on conflict(vehicle_id) do update set %s',columns_sql,select_sql,updates_sql) using payload;
 return jsonb_build_object('status','processed','events',event_index);
end $$;
revoke all on function public.commit_provider_transition(bigint,jsonb,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.commit_provider_transition(bigint,jsonb,jsonb,jsonb,bigint) to service_role;

create function public.commit_provider_eta(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare gps public.gps_history; latest_id bigint; old_eta public.vehicle_eta_state;
 columns_sql text; select_sql text; updates_sql text;
begin
 select * into gps from gps_history where id=(payload->>'gps_history_id')::bigint;
 if gps.id is null or payload->>'vehicle_id' is distinct from gps.vehicle_id or (payload->>'project_id')::uuid is distinct from gps.project_id then raise exception 'ETA identity mismatch';end if;
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=gps.project_id for update of s;
 perform 1 from vehicles where external_id=gps.vehicle_id for update;
 select h.id into latest_id from active_gps_history h where h.vehicle_id=gps.vehicle_id order by h.source_recorded_at desc,h.id desc limit 1;
 if latest_id is distinct from gps.id then return jsonb_build_object('status','stale');end if;
 select * into old_eta from vehicle_eta_state where vehicle_id=gps.vehicle_id;
 if old_eta.gps_history_id=gps.id and old_eta.calculated_at>=(payload->>'calculated_at')::timestamptz then return jsonb_build_object('status','stale');end if;
 if not exists(select 1 from map_versions m where m.id=(payload->>'map_version_id')::bigint and m.project_id=gps.project_id) then raise exception 'ETA map mismatch';end if;
 perform set_config('app.provider_transition','true',true);
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into columns_sql,select_sql,updates_sql from jsonb_object_keys(payload) key;
 execute format('insert into vehicle_eta_state(%s) select %s from jsonb_populate_record(null::vehicle_eta_state,$1) r on conflict(vehicle_id) do update set %s',columns_sql,select_sql,updates_sql) using payload;
 return jsonb_build_object('status','processed');
end $$;
revoke all on function public.commit_provider_eta(jsonb) from public,anon,authenticated;
grant execute on function public.commit_provider_eta(jsonb) to service_role;

create or replace function public.guard_selected_tracking_write() returns trigger
language plpgsql security definer set search_path=public as $$
declare point_id bigint; gps public.gps_history; previous_id bigint; previous_gps public.gps_history;
begin
 if current_setting('app.provider_transition',true) is distinct from 'true' then raise exception 'Use the atomic provider transition RPC';end if;
 point_id=case when tg_table_name='vehicle_stop_state' then (to_jsonb(new)->>'last_gps_history_id')::bigint else (to_jsonb(new)->>'gps_history_id')::bigint end;
 select * into gps from active_gps_history where id=point_id and vehicle_id=new.vehicle_id and project_id=new.project_id;
 if gps.id is null then raise exception 'Tracking input is not in the active provider period';end if;
 if tg_op='UPDATE' and tg_table_name<>'stop_events' then
  previous_id=case when tg_table_name='vehicle_stop_state' then (to_jsonb(old)->>'last_gps_history_id')::bigint else (to_jsonb(old)->>'gps_history_id')::bigint end;
  select * into previous_gps from gps_history where id=previous_id;
  if previous_gps.tracking_source_run_id=gps.tracking_source_run_id and gps.source_recorded_at<previous_gps.source_recorded_at then raise exception 'Stale tracking state';end if;
 end if;
 return new;
end $$;
