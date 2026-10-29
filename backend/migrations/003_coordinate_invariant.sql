-- Close altitude-based duplicate-stop bypass. Same function owner/ACL/security/search_path.
BEGIN;
SET LOCAL lock_timeout='100ms';SET LOCAL statement_timeout='5s';
CREATE OR REPLACE FUNCTION tracking_private.validate_cms_map(d jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,tracking_private AS $$
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
 FOR i IN 1..5 LOOP FOR j IN 1..i-1 LOOP IF cms_distance(stops[i]->'geometry'->'coordinates',stops[j]->'geometry'->'coordinates')=0 THEN RAISE EXCEPTION 'Duplicate stop coordinate' USING ERRCODE='22023';END IF;END LOOP;END LOOP;
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
COMMIT;
