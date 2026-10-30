BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='5s';
CREATE OR REPLACE FUNCTION public.tracking_claim(target_vehicle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tracking_private'
AS $function$
declare r tracking_private.runtime; v public.vehicles; b tracking_private.bindings; m public.map_versions; t uuid;
begin
 select * into v from public.vehicles where external_id=target_vehicle;
 if not found then return null;end if;
 select * into b from tracking_private.bindings where vehicle_id=target_vehicle and active;
 if not found then return null;end if;
 select * into m from public.map_versions where project_id=v.project_id and status='published' order by published_at desc nulls last,id desc limit 1;
 if not found then return null;end if;
 insert into tracking_private.runtime(vehicle_id) values(target_vehicle) on conflict do nothing;
 select * into r from tracking_private.runtime where vehicle_id=target_vehicle for update;
 if r.lease_until>clock_timestamp() then return null;end if;
 if r.latest is not null and not exists(select 1 from public.tracking_live_snapshots where vehicle_id=target_vehicle) then perform tracking_private.publish_current(target_vehicle);end if;
 t:=gen_random_uuid();
 update tracking_private.runtime set lease=t,lease_until=clock_timestamp()+interval '4500 milliseconds' where vehicle_id=target_vehicle;
 return jsonb_build_object('vehicle',v,'binding',jsonb_build_object('tracker_uid',b.tracker_uid,'credential_env',b.credential_env),'mapVersion',jsonb_build_object('id',m.id,'map_data',m.map_data),'runtime',to_jsonb(r),'lease',t);
end $function$;
CREATE OR REPLACE FUNCTION public.tracking_commit(target_vehicle text, expected_revision bigint, lease_token uuid, map_version bigint, payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tracking_private'
AS $function$
declare r tracking_private.runtime; v public.vehicles; g jsonb; s jsonb; op jsonb; snap jsonb; p_at timestamptz; mv bigint; c text;
begin
 select * into r from tracking_private.runtime where vehicle_id=target_vehicle for update;
 if not found or r.revision<>expected_revision or r.lease is distinct from lease_token or r.lease_until is null or r.lease_until<clock_timestamp() then return 'fenced';end if;
 select * into v from public.vehicles where external_id=target_vehicle;
 select id into mv from public.map_versions where project_id=v.project_id and status='published' order by published_at desc nulls last,id desc limit 1;
 if mv is distinct from map_version then return 'map_changed';end if;
 g:=payload->'gps';s:=payload->'state';op:=s->'operational_state';c:=payload->>'continuity';
 if (g->>'vehicle_id') is distinct from target_vehicle or (g->>'project_id') is distinct from v.project_id::text or (s->>'vehicle_id') is distinct from target_vehicle or (s->>'project_id') is distinct from v.project_id::text then raise exception 'Context identity mismatch';end if;
 if g is null or s is null or op is null or c is null or g->>'id' is null or op->>'mapVersion' is null or g->>'source_recorded_at' is null or g->>'latitude' is null or g->>'longitude' is null or g->>'speed_kmh' is null or jsonb_typeof(op->'samples') is distinct from 'array' or jsonb_typeof(op->'completedStops') is distinct from 'array' then raise exception 'Missing bounded envelope fields';end if;
 if g-array['id','vehicle_id','project_id','tracking_source_run_id','received_at','source_recorded_at','latitude','longitude','speed_kmh','heading','accuracy_m']<>'{}'::jsonb then raise exception 'Unexpected observation attributes';end if;
 if pg_column_size(payload)>48000 or c not in('known','unknown') or (g->>'tracking_source_run_id') is distinct from r.source_run::text or (g->>'id')::bigint<>r.revision+1 or (op->>'mapVersion')::bigint<>map_version or (op->>'sourceRun') is distinct from r.source_run::text or (op->>'timestamp') is distinct from (g->>'source_recorded_at') or jsonb_array_length(op->'samples')>24 or jsonb_array_length(op->'completedStops')>5 then raise exception 'Invalid bounded operational envelope';end if;
 p_at:=(g->>'source_recorded_at')::timestamptz;
 if p_at>clock_timestamp()+interval '60 seconds' or p_at<clock_timestamp()-interval '24 hours' or r.latest is not null and p_at<=(r.latest->>'source_recorded_at')::timestamptz then return 'duplicate_or_invalid_time';end if;
 if not ((g->>'latitude')::double precision between -90 and 90 and (g->>'longitude')::double precision between -180 and 180 and (g->>'speed_kmh')::double precision between 0 and 250) then raise exception 'Invalid fix';end if;
 -- Only one private current fix and planner envelope. No append-only GPS/receipt/event table.
 update tracking_private.runtime set latest=g,planner_state=s,continuity=c,revision=revision+1 where vehicle_id=target_vehicle;
 perform tracking_private.publish_current(target_vehicle);
 return 'committed';
end $function$;
CREATE OR REPLACE FUNCTION tracking_private.binding_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tracking_private'
AS $function$
declare n bigint;
begin
 if new.tracker_uid is distinct from old.tracker_uid or new.credential_env is distinct from old.credential_env or new.active is distinct from old.active then
 update tracking_private.runtime set source_run=gen_random_uuid(),revision=revision+1,lease=null,lease_until=null,latest=null,planner_state=null,continuity='unknown' where vehicle_id=new.vehicle_id returning revision into n;
 update public.tracking_live_snapshots set revision=n,snapshot=jsonb_build_object('selection','scorpion','position',null,'stop',null,'eta',null),updated_at=clock_timestamp() where vehicle_id=new.vehicle_id;
 end if;return new;
end $function$;
COMMIT;
