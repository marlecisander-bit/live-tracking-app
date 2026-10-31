-- Local candidate. Apply before publishing the matching worker/frontend. No cron changes.
BEGIN;
CREATE TABLE public.vehicle_service_hours (
 vehicle_id text PRIMARY KEY REFERENCES public.vehicles(external_id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 time_zone text NOT NULL DEFAULT 'Europe/Tirane' CHECK(time_zone='Europe/Tirane'),
 week jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION tracking_private.valid_service_week(w jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE d jsonb;
BEGIN
 IF jsonb_typeof(w) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(w)<>7 THEN RETURN false; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(w) LOOP
  IF d='null'::jsonb THEN CONTINUE; END IF;
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR d-array['open','close']<>'{}'::jsonb
    OR coalesce(d->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(d->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR d->>'open'=d->>'close' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE public.vehicle_service_hours ADD CHECK(tracking_private.valid_service_week(week));
ALTER TABLE public.vehicle_service_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_hours ON public.vehicle_service_hours FOR SELECT USING(EXISTS(SELECT 1 FROM public.vehicles v JOIN public.projects p ON p.id=v.project_id WHERE v.external_id=vehicle_id AND (p.is_public OR public.is_tracking_admin(p.id))));
GRANT SELECT ON public.vehicle_service_hours TO anon,authenticated;
REVOKE ALL ON public.vehicle_service_hours FROM service_role;
GRANT SELECT ON public.vehicle_service_hours TO service_role;
CREATE FUNCTION public.save_vehicle_service_hours(target_vehicle text, hours_enabled boolean, hours_week jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,tracking_private AS $$
DECLARE p uuid; r public.vehicle_service_hours;
BEGIN
 SELECT project_id INTO p FROM public.vehicles WHERE external_id=target_vehicle;
 IF p IS NULL OR NOT public.is_tracking_admin(p) THEN RAISE EXCEPTION 'Tracking administrator required' USING ERRCODE='42501'; END IF;
 IF hours_enabled IS NULL OR NOT tracking_private.valid_service_week(hours_week) THEN RAISE EXCEPTION 'Invalid weekly hours'; END IF;
 INSERT INTO public.vehicle_service_hours(vehicle_id,enabled,week) VALUES(target_vehicle,hours_enabled,hours_week)
 ON CONFLICT(vehicle_id) DO UPDATE SET enabled=excluded.enabled,week=excluded.week,updated_at=clock_timestamp() RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.save_vehicle_service_hours(text,boolean,jsonb) FROM public,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_vehicle_service_hours(text,boolean,jsonb) TO authenticated;
CREATE FUNCTION tracking_private.service_is_open(target_vehicle text, at_time timestamptz DEFAULT clock_timestamp()) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.vehicle_service_hours; t timestamp; n integer; m text; d jsonb; prev jsonb;
BEGIN
 SELECT * INTO r FROM public.vehicle_service_hours WHERE vehicle_id=target_vehicle;
 IF NOT FOUND OR NOT r.enabled THEN RETURN true; END IF;
 t:=at_time AT TIME ZONE r.time_zone; n:=extract(isodow FROM t)::integer-1; m:=to_char(t,'HH24:MI');
 d:=r.week->n; prev:=r.week->((n+6)%7);
 RETURN coalesce((d->>'open'<d->>'close' AND m>=d->>'open' AND m<d->>'close') OR (d->>'open'>d->>'close' AND m>=d->>'open') OR (prev->>'open'>prev->>'close' AND m<prev->>'close'),false);
END $$;
CREATE FUNCTION tracking_private.service_closes_at(target_vehicle text, at_time timestamptz DEFAULT clock_timestamp()) RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,tracking_private AS $$
DECLARE r public.vehicle_service_hours; candidate timestamptz; result timestamptz; day date; d jsonb; i integer;
BEGIN
 SELECT * INTO r FROM public.vehicle_service_hours WHERE vehicle_id=target_vehicle;
 IF NOT FOUND OR NOT r.enabled THEN RETURN null; END IF;
 FOR i IN -1..7 LOOP
  day:=(at_time AT TIME ZONE r.time_zone)::date+i; d:=r.week->(extract(isodow FROM day)::integer-1);
  IF d='null'::jsonb THEN CONTINUE; END IF;
  candidate:=((day+CASE WHEN d->>'open'>d->>'close' THEN 1 ELSE 0 END)+(d->>'close')::time) AT TIME ZONE r.time_zone;
  IF candidate>at_time AND NOT tracking_private.service_is_open(target_vehicle,candidate) AND (result IS NULL OR candidate<result) THEN result:=candidate; END IF;
 END LOOP;
 RETURN result;
END $$;
-- Wrap, rather than replace, the installed fencing/recovery implementation.
ALTER FUNCTION public.tracking_claim(text) RENAME TO tracking_claim_without_hours;
ALTER FUNCTION public.tracking_commit(text,bigint,uuid,bigint,jsonb) RENAME TO tracking_commit_without_hours;
REVOKE ALL ON FUNCTION public.tracking_claim_without_hours(text),public.tracking_commit_without_hours(text,bigint,uuid,bigint,jsonb) FROM public,anon,authenticated,service_role;
CREATE FUNCTION public.tracking_claim(target_vehicle text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,tracking_private AS $$
DECLARE result jsonb;
BEGIN
 PERFORM 1 FROM public.vehicle_service_hours WHERE vehicle_id=target_vehicle FOR SHARE;
 IF NOT tracking_private.service_is_open(target_vehicle) THEN RETURN '{"serviceClosed":true}'::jsonb; END IF;
 PERFORM set_config('tracking.enforce_hours','on',true);
 result:=public.tracking_claim_without_hours(target_vehicle);
 IF result IS NULL THEN RETURN null; END IF;
 RETURN result||jsonb_build_object('serviceClosesAt',tracking_private.service_closes_at(target_vehicle));
EXCEPTION WHEN SQLSTATE 'PST01' THEN RETURN '{"serviceClosed":true}'::jsonb;
END $$;
CREATE FUNCTION public.tracking_commit(target_vehicle text,expected_revision bigint,lease_token uuid,map_version bigint,payload jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,tracking_private AS $$
BEGIN
 PERFORM 1 FROM public.vehicle_service_hours WHERE vehicle_id=target_vehicle FOR SHARE;
 IF NOT tracking_private.service_is_open(target_vehicle) THEN RETURN 'outside_operating_hours'; END IF;
 PERFORM set_config('tracking.enforce_hours','on',true);
 RETURN public.tracking_commit_without_hours(target_vehicle,expected_revision,lease_token,map_version,payload);
EXCEPTION WHEN SQLSTATE 'PST01' THEN RETURN 'outside_operating_hours';
END $$;
REVOKE ALL ON FUNCTION public.tracking_claim(text),public.tracking_commit(text,bigint,uuid,bigint,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_claim(text),public.tracking_commit(text,bigint,uuid,bigint,jsonb) TO service_role;
-- Catch a closing boundary crossed inside a claim/commit. Exception rolls its writes back.
CREATE FUNCTION tracking_private.enforce_service_hours() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,tracking_private AS $$
BEGIN
 IF current_setting('tracking.enforce_hours',true)='on' AND NOT tracking_private.service_is_open(NEW.vehicle_id) THEN RAISE EXCEPTION 'Outside operating hours' USING ERRCODE='PST01'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER service_hours_runtime BEFORE INSERT OR UPDATE ON tracking_private.runtime FOR EACH ROW EXECUTE FUNCTION tracking_private.enforce_service_hours();
CREATE TRIGGER service_hours_snapshot BEFORE INSERT OR UPDATE ON public.tracking_live_snapshots FOR EACH ROW EXECUTE FUNCTION tracking_private.enforce_service_hours();
REVOKE ALL ON FUNCTION tracking_private.service_is_open(text,timestamptz),tracking_private.service_closes_at(text,timestamptz),tracking_private.enforce_service_hours(),tracking_private.valid_service_week(jsonb) FROM public,anon,authenticated,service_role;
COMMIT;
