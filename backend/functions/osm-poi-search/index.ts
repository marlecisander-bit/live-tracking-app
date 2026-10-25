import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const filters: Record<string, string> = {
  tourist: "[tourism=attraction]",
  historic: "[historic]",
  museums: "[tourism=museum]",
  religious: "[amenity=place_of_worship]",
  viewpoints: "[tourism=viewpoint]",
  nature: "[leisure=park]",
  food: '[amenity~"restaurant|cafe"]',
  accommodation: '[tourism~"hotel|hostel|guest_house"]',
  all: "[tourism]",
};

// Per-isolate cache of public OSM results. Authentication and rate checks always run first.
const searchCache = new Map<string, { expires: number; data: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 32;
const endpointRetryAfter = new Map<string, number>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withinRadius(element: Record<string, any>, lat: number, lng: number, radius: number) {
  const pointLat = Number(element.lat ?? element.center?.lat);
  const pointLng = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(pointLat) || !Number.isFinite(pointLng)) return false;
  const radians = Math.PI / 180;
  const dLat = (pointLat - lat) * radians;
  const dLng = (pointLng - lng) * radians;
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat * radians) * Math.cos(pointLat * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)) <= radius;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({error:'Authentication required'},401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:userData,error:authError}=await client.auth.getUser(authorization.slice(7));
  if(authError || !userData.user) return json({error:'Authentication required'},401);

  try {
    const raw = await request.text();
    if(new TextEncoder().encode(raw).length>4096) return json({error:'Search request too large'},413);
    let received;
    try { received=JSON.parse(raw); } catch { return json({error:'Invalid JSON'},400); }
    let body = typeof received === "string" ? JSON.parse(received) : received;
    if (body && typeof body.body === "string") body = JSON.parse(body.body);
    else if (body && body.body && typeof body.body === "object") body = body.body;
    if (!body || typeof body !== "object") body = {};
    if(typeof body.project_id!=='string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.project_id)) return json({error:'Choose a project'},400);
    const {data:permitted,error:accessError}=await client.rpc('consume_poi_request',{target_project_id:body.project_id});
    if(accessError) return json({error:'Editor access required'},403);
    if(!permitted) return json({error:'Too many searches. Try again in a minute.'},429);

    const category = String(body.category || "tourist");
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radius = Math.min(20000, Math.max(500, Number(body.radius) || 5000));
    if (body.lat == null || body.lng == null || body.lat === '' || body.lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return json({
        error: "Invalid search coordinates",
        expected: { lat: 42.0683, lng: 19.5126 },
        received: { lat: body && body.lat, lng: body && body.lng },
      }, 400);
    }

    const filter = filters[category] || filters.tourist;
    // Unnamed map geometry is not useful in the POI import list and can make
    // broad heritage/attraction searches substantially more expensive.
    const importableFilter = `${filter}[name]`;
    const latDelta = radius / 111320;
    const lngDelta = radius / (111320 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
    const south = (lat - latDelta).toFixed(6);
    const west = (lng - lngDelta).toFixed(6);
    const north = (lat + latDelta).toFixed(6);
    const east = (lng + lngDelta).toFixed(6);
    const bounds = `${south},${west},${north},${east}`;
    const query = `[out:json][timeout:6];(node${importableFilter}(${bounds});way${importableFilter}(${bounds}););out center tags qt;`;
    const cacheKey = JSON.stringify([category, lat, lng, radius]);
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return json(cached.data);
    searchCache.delete(cacheKey);
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ];
    let lastError = "No OpenStreetMap search service responded";
    const failures: string[] = [];

    for (const endpoint of endpoints) {
      if ((endpointRetryAfter.get(endpoint) || 0) > Date.now()) {
        failures.push(`${new URL(endpoint).hostname}: cooling down`);
        continue;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "User-Agent": "Sightseeing-Shkodra-Map/1.0 (POI manager)",
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 406 || response.status === 429) endpointRetryAfter.set(endpoint, Date.now() + 30000);
          lastError = `OpenStreetMap service returned HTTP ${response.status}`;
          failures.push(`${new URL(endpoint).hostname}: HTTP ${response.status}`);
          continue;
        }
        const data = await response.json();
        if (!Array.isArray(data.elements) || data.remark) {
          lastError = "OpenStreetMap returned incomplete results";
          failures.push(new URL(endpoint).hostname + ': incomplete response');
          continue;
        }
        data.elements = data.elements.filter((element: Record<string, any>) =>
          withinRadius(element, lat, lng, radius)
        );
        if (searchCache.size >= MAX_CACHE_ENTRIES) searchCache.delete(searchCache.keys().next().value!);
        searchCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data });
        return json(data);
      } catch (error) {
        lastError = error instanceof Error && error.name === "AbortError"
          ? "OpenStreetMap search timed out"
          : error instanceof Error ? error.message : String(error);
        failures.push(`${new URL(endpoint).hostname}: ${lastError}`);
      } finally {
        clearTimeout(timeout);
      }
    }

    return json({ error: "POI search is temporarily unavailable. Retry in 30 seconds. Your map has not changed.", cause: lastError, attempts: failures }, 503);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "POI search failed" }, 500);
  }
});
