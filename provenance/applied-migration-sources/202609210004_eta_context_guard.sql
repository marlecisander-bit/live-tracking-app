-- Additive candidate follow-up: reject superseded current/map/route ETA calculations.
begin;
create or replace function public.commit_provider_eta(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare gps public.gps_history; latest_id bigint; old_eta public.vehicle_eta_state;
 current_position public.tracking_provider_current; route_state jsonb; published_id bigint;
 columns_sql text; select_sql text; updates_sql text;
begin
 select * into gps from gps_history where id=(payload->>'gps_history_id')::bigint;
 if gps.id is null then return jsonb_build_object('status','stale');end if;
 if payload->>'vehicle_id' is distinct from gps.vehicle_id or (payload->>'project_id')::uuid is distinct from gps.project_id then raise exception 'ETA identity mismatch';end if;
 perform 1 from live_map_settings s join projects p on p.slug=s.project_slug where p.id=gps.project_id for update of s;
 perform 1 from vehicles where external_id=gps.vehicle_id for update;
 select h.id into latest_id from active_gps_history h where h.vehicle_id=gps.vehicle_id order by h.source_recorded_at desc,h.id desc limit 1;
 if latest_id is distinct from gps.id then return jsonb_build_object('status','stale');end if;
 select c.* into current_position from tracking_provider_current c join tracking_source_runs r on r.id=c.tracking_source_run_id and r.ended_at is null
 where c.vehicle_id=gps.vehicle_id and c.source=gps.source;
 if current_position.source_recorded_at is distinct from gps.source_recorded_at
 or current_position.tracking_source_run_id is distinct from gps.tracking_source_run_id
 or current_position.source_recorded_at < clock_timestamp()-make_interval(secs=>(select delayed_seconds from tracking_runtime_config))
 then return jsonb_build_object('status','stale');end if;
 select to_jsonb(s) into route_state from vehicle_stop_state s where s.vehicle_id=gps.vehicle_id;
 if not (payload ? '_route_state') or route_state is distinct from payload->'_route_state'
 then return jsonb_build_object('status','stale');end if;
 select id into published_id from map_versions where project_id=gps.project_id and status='published' order by published_at desc nulls last,id desc limit 1;
 if published_id is distinct from (payload->>'map_version_id')::bigint
 then return jsonb_build_object('status','stale');end if;
 payload=payload-'_route_state';
 select * into old_eta from vehicle_eta_state where vehicle_id=gps.vehicle_id;
 if old_eta.gps_history_id=gps.id and old_eta.calculated_at>=(payload->>'calculated_at')::timestamptz then return jsonb_build_object('status','stale');end if;
 if not exists(select 1 from map_versions m where m.id=(payload->>'map_version_id')::bigint and m.project_id=gps.project_id) then raise exception 'ETA map mismatch';end if;
 perform set_config('app.provider_transition','true',true);
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into columns_sql,select_sql,updates_sql from jsonb_object_keys(payload) key;
 execute format('insert into vehicle_eta_state(%s) select %s from jsonb_populate_record(null::vehicle_eta_state,$1) r on conflict(vehicle_id) do update set %s',columns_sql,select_sql,updates_sql) using payload;
 return jsonb_build_object('status','processed');
end $$;
commit;
