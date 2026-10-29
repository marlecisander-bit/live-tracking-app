-- Reviewed candidate only. No automatic application. Serializes all CMS writers per project.
BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='5s';
ALTER TABLE public.map_versions ADD COLUMN cms_request_id uuid;
CREATE UNIQUE INDEX map_cms_request ON public.map_versions(project_id,cms_request_id) WHERE cms_request_id IS NOT NULL;
CREATE FUNCTION tracking_private.cms_distance(a jsonb,b jsonb) RETURNS double precision LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT 2*6371000*asin(sqrt(least(1.0,power(sin(radians((b->>1)::float8-(a->>1)::float8)/2),2)+cos(radians((a->>1)::float8))*cos(radians((b->>1)::float8))*power(sin(radians((b->>0)::float8-(a->>0)::float8)/2),2))))
$$;
CREATE FUNCTION tracking_private.validate_cms_map(d jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,tracking_private AS $$
DECLARE f jsonb;p jsonb;g jsonb;c jsonb;s jsonb;route jsonb;stops jsonb[]:=ARRAY[]::jsonb[];ids text[]:=ARRAY[]::text[];nums int[]:=ARRAY[]::int[];n int;vertices int:=0;routes int:=0;line jsonb;seq jsonb;expected jsonb;prev float8:=-1;best float8;bestdist float8;offst float8;seglen float8;ax float8;ay float8;bx float8;byy float8;dx float8;dy float8;t float8;dist float8;i int;j int;total float8;
BEGIN
 IF d->>'type' IS DISTINCT FROM 'FeatureCollection' OR jsonb_typeof(d->'features') IS DISTINCT FROM 'array' OR octet_length(d::text)>5242880 OR jsonb_array_length(d->'features')>1000 THEN RAISE EXCEPTION 'Invalid or oversized map' USING ERRCODE='22023';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(d->'features') LOOP
  p:=f->'properties';g:=f->'geometry';
  IF f->>'type' IS DISTINCT FROM 'Feature' OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'objectId') IS DISTINCT FROM 'string' OR length(trim(p->>'objectId')) NOT BETWEEN 1 AND 150 OR (p->>'objectId')=ANY(ids) OR jsonb_typeof(p->'name') IS DISTINCT FROM 'string' OR length(trim(p->>'name')) NOT BETWEEN 1 AND 100 OR coalesce(g->>'type','') NOT IN('Point','LineString') THEN RAISE EXCEPTION 'Invalid map feature' USING ERRCODE='22023';END IF;
  ids:=array_append(ids,p->>'objectId');
  IF g->>'type'='Point' THEN
   IF coalesce(p->>'pointType','') NOT IN('stop','poi') THEN RAISE EXCEPTION 'Invalid point type' USING ERRCODE='22023';END IF;
   IF p->>'pointType'='stop' AND p->'active' IS DISTINCT FROM 'false'::jsonb THEN
    IF coalesce(p->>'stopNumber','') !~ '^[1-5]$' THEN RAISE EXCEPTION 'Stops must be numbered 1-5' USING ERRCODE='22023';END IF;
    n:=(p->>'stopNumber')::int;IF n=ANY(nums) THEN RAISE EXCEPTION 'Duplicate stop number' USING ERRCODE='22023';END IF;nums:=array_append(nums,n);stops[n]:=f;
   END IF;
  ELSE
   IF jsonb_typeof(g->'coordinates') IS DISTINCT FROM 'array' OR jsonb_array_length(g->'coordinates')<2 THEN RAISE EXCEPTION 'Invalid route line' USING ERRCODE='22023';END IF;
   IF p->'active' IS DISTINCT FROM 'false'::jsonb THEN routes:=routes+1;route:=f;END IF;
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(CASE WHEN g->>'type'='Point' THEN jsonb_build_array(g->'coordinates') ELSE g->'coordinates' END) LOOP
   IF jsonb_typeof(c) IS DISTINCT FROM 'array' OR jsonb_array_length(c) NOT BETWEEN 2 AND 3 THEN RAISE EXCEPTION 'Invalid coordinate' USING ERRCODE='22023';END IF;
   FOR j IN 0..jsonb_array_length(c)-1 LOOP IF jsonb_typeof(c->j) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Non-numeric coordinate' USING ERRCODE='22023';END IF;END LOOP;
   IF abs((c->>0)::numeric)>180 OR abs((c->>1)::numeric)>90 THEN RAISE EXCEPTION 'Coordinate outside limits' USING ERRCODE='22023';END IF;
   vertices:=vertices+1;IF vertices>100000 THEN RAISE EXCEPTION 'Too many coordinates' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 IF cardinality(nums)<>5 OR routes<>1 OR route->'properties'->>'objectType' IS DISTINCT FROM 'route' THEN RAISE EXCEPTION 'Exactly five stops and one route required' USING ERRCODE='22023';END IF;
 FOR i IN 1..5 LOOP FOR j IN 1..i-1 LOOP IF stops[i]->'geometry'->'coordinates'=stops[j]->'geometry'->'coordinates' THEN RAISE EXCEPTION 'Duplicate stop coordinate' USING ERRCODE='22023';END IF;END LOOP;END LOOP;
 SELECT jsonb_agg(stops[x]->'properties'->>'objectId' ORDER BY x) INTO expected FROM generate_series(1,5) x;
 expected:=expected||jsonb_build_array(stops[1]->'properties'->>'objectId');seq:=route->'properties'->'stopSequence';
 IF seq IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Invalid stop order or loop' USING ERRCODE='22023';END IF;
 line:=route->'geometry'->'coordinates';
 IF cms_distance(line->0,stops[1]->'geometry'->'coordinates')>200 OR cms_distance(line->-1,stops[1]->'geometry'->'coordinates')>200 OR cms_distance(line->0,line->-1)>20 THEN RAISE EXCEPTION 'Route loop not closed at origin' USING ERRCODE='22023';END IF;
 FOR i IN 1..5 LOOP
  c:=stops[i]->'geometry'->'coordinates';offst:=0;best:=NULL;bestdist:=NULL;
  FOR j IN 1..jsonb_array_length(line)-1 LOOP
   seglen:=cms_distance(line->(j-1),line->j);
   IF seglen>0 THEN
    ax:=radians((line->(j-1)->>0)::float8-(c->>0)::float8)*6371000*cos(radians((c->>1)::float8));ay:=radians((line->(j-1)->>1)::float8-(c->>1)::float8)*6371000;
    bx:=radians((line->j->>0)::float8-(c->>0)::float8)*6371000*cos(radians((c->>1)::float8));byy:=radians((line->j->>1)::float8-(c->>1)::float8)*6371000;
    dx:=bx-ax;dy:=byy-ay;t:=greatest(0,least(1,-(ax*dx+ay*dy)/nullif(dx*dx+dy*dy,0)));dist:=sqrt(power(ax+t*dx,2)+power(ay+t*dy,2));
    IF offst+t*seglen>prev+0.01 AND dist<=200 AND (bestdist IS NULL OR dist<bestdist) THEN best:=offst+t*seglen;bestdist:=dist;END IF;
   END IF;offst:=offst+seglen;
  END LOOP;
  IF best IS NULL THEN RAISE EXCEPTION 'Stop not on route in forward order' USING ERRCODE='22023';END IF;prev:=best;
 END LOOP;
END $$;
CREATE FUNCTION public.save_tracking_map(p_project uuid,p_expected_head bigint,p_expected_published bigint,p_expected_draft bigint,p_status text,p_map jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior public.map_versions;h public.map_versions;pub bigint;draft bigint;r public.map_versions;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_tracking_admin(p_project) THEN RAISE EXCEPTION 'Map editing permission denied' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_status NOT IN('draft','published') OR p_status IS NULL THEN RAISE EXCEPTION 'Invalid save request' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM public.map_versions WHERE project_id=p_project AND cms_request_id=p_request;
 IF FOUND THEN
  IF prior.created_by IS DISTINCT FROM auth.uid() OR prior.status IS DISTINCT FROM p_status OR prior.map_data IS DISTINCT FROM p_map THEN RAISE EXCEPTION 'Request ID reused with different content' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('id',prior.id,'status',prior.status,'created_at',prior.created_at,'published_at',prior.published_at,'replayed',true);
 END IF;
 SELECT * INTO h FROM public.map_versions WHERE project_id=p_project ORDER BY id DESC LIMIT 1;
 SELECT id INTO pub FROM public.map_versions WHERE project_id=p_project AND status='published' ORDER BY published_at DESC NULLS LAST,id DESC LIMIT 1;
 SELECT id INTO draft FROM public.map_versions WHERE project_id=p_project AND status='draft' ORDER BY id DESC LIMIT 1;
 IF h.id IS DISTINCT FROM p_expected_head OR pub IS DISTINCT FROM p_expected_published OR draft IS DISTINCT FROM p_expected_draft THEN RAISE EXCEPTION 'Another editor saved a newer version. Reload before saving.' USING ERRCODE='40001';END IF;
 PERFORM tracking_private.validate_cms_map(p_map);
 IF p_status='published' AND (h.status IS DISTINCT FROM 'draft' OR h.map_data IS DISTINCT FROM p_map) THEN RAISE EXCEPTION 'Publish only the latest saved draft' USING ERRCODE='22023';END IF;
 INSERT INTO public.map_versions(project_id,status,map_data,created_by,published_at,cms_request_id) VALUES(p_project,p_status,p_map,auth.uid(),CASE WHEN p_status='published' THEN clock_timestamp() END,p_request) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'created_at',r.created_at,'published_at',r.published_at,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION tracking_private.cms_distance(jsonb,jsonb),tracking_private.validate_cms_map(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_tracking_map(uuid,bigint,bigint,bigint,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_tracking_map(uuid,bigint,bigint,bigint,text,jsonb,uuid) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.map_versions FROM anon,authenticated,service_role;
REVOKE USAGE,SELECT ON SEQUENCE public.map_versions_id_seq FROM authenticated;
DROP POLICY map_insert ON public.map_versions;
COMMIT;
