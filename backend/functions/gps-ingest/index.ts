import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

function finiteOrNull(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const receivedToken = request.headers.get('x-device-token') || '';
  if (receivedToken.length < 32 || receivedToken.length > 512) return json({ error: 'Unauthorized device' }, 401);

  try {
    const body = await request.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server configuration missing' }, 500);
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(receivedToken)));
    const credentialHash = Array.from(hashBytes, value => value.toString(16).padStart(2, '0')).join('');
    const lookup = await supabase.from('tracking_devices').select('id,project_id,vehicle_id,device_name,active,revoked_at')
      .eq('credential_hash', credentialHash).maybeSingle();
    if (lookup.error && !['42P01','PGRST205'].includes(lookup.error.code)) return json({ error: 'Device authorization unavailable' }, 503);
    let binding = lookup.data;
    if (binding && (!binding.active || binding.revoked_at)) return json({ error: 'Device credential revoked' }, 401);
    if (!binding) {
      const legacyToken = Deno.env.get('GPS_DEVICE_TOKEN') || '';
      const legacyVehicle = Deno.env.get('GPS_LEGACY_VEHICLE_ID');
      const legacyDevice = Deno.env.get('GPS_LEGACY_DEVICE_ID');
      if (Deno.env.get('GPS_LEGACY_ENABLED') !== 'true' || legacyToken.length < 32 || !safeEqual(receivedToken, legacyToken) || !legacyVehicle || !legacyDevice) {
        return json({ error: 'Unauthorized device' }, 401);
      }
      binding = { id: null, vehicle_id: legacyVehicle, device_name: legacyDevice, project_id: null };
    }
    if ((body.vehicle_id != null && body.vehicle_id !== binding.vehicle_id) ||
        (body.device_id != null && body.device_id !== binding.id && body.device_id !== binding.device_name) ||
        (body.project_id != null && body.project_id !== binding.project_id)) {
      return json({ error: 'Device identity does not match its assigned vehicle' }, 403);
    }
    const eventId = String(body.event_id || "");
    const vehicleId = binding.vehicle_id;
    const deviceId = String(binding.id || binding.device_name);
    const latitude = finiteOrNull(body.latitude);
    const longitude = finiteOrNull(body.longitude);
    const accuracy = finiteOrNull(body.accuracy_m);
    const speed = finiteOrNull(body.speed_kmh);
    const speedAccuracy = finiteOrNull(body.speed_accuracy_mps);
    const bearing = finiteOrNull(body.bearing_deg);
    const bearingAccuracy = finiteOrNull(body.bearing_accuracy_deg);
    const derivedCourse = finiteOrNull(body.derived_course_deg);
    const altitude = finiteOrNull(body.altitude_m);
    const verticalAccuracy = finiteOrNull(body.vertical_accuracy_m);
    const battery = finiteOrNull(body.battery_percent);
    const satellitesVisible = finiteOrNull(body.satellites_visible);
    const satellitesUsed = finiteOrNull(body.satellites_used);
    const sequence = finiteOrNull(body.sequence);
    const cn0Median = finiteOrNull(body.cn0_median_dbhz);
    const fixRate = finiteOrNull(body.fix_rate_hz);
    const ttffMs = finiteOrNull(body.ttff_ms);
    const batteryTemperature = finiteOrNull(body.battery_temperature_c);
    const recordedAt = new Date(body.source_recorded_at);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
      return json({ error: "Invalid event_id" }, 400);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(vehicleId)) {
      return json({ error: "Invalid vehicle_id" }, 400);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(deviceId)) {
      return json({ error: "Invalid device_id" }, 400);
    }
    if (latitude === null || latitude < -90 || latitude > 90 ||
        longitude === null || longitude < -180 || longitude > 180) {
      return json({ error: "Invalid coordinates" }, 400);
    }
    if (!Number.isFinite(recordedAt.getTime())) return json({ error: "Invalid GPS timestamp" }, 400);
    if (recordedAt.getTime() > Date.now() + 60_000 || recordedAt.getTime() < Date.now() - 24 * 60 * 60_000) {
      return json({ error: "GPS timestamp is outside the accepted 24-hour window" }, 400);
    }
    if (accuracy === null || accuracy < 0 || accuracy > 50) return json({ error: "GPS accuracy must be within 50 metres" }, 400);
    if (speed !== null && (speed < 0 || speed > 250)) return json({ error: "Invalid speed" }, 400);
    if (speedAccuracy !== null && (speedAccuracy < 0 || speedAccuracy > 100)) return json({ error: "Invalid speed accuracy" }, 400);
    if (bearing !== null && (bearing < 0 || bearing >= 360)) return json({ error: "Invalid bearing" }, 400);
    if (bearingAccuracy !== null && (bearingAccuracy < 0 || bearingAccuracy > 360)) return json({ error: "Invalid bearing accuracy" }, 400);
    if (derivedCourse !== null && (derivedCourse < 0 || derivedCourse >= 360)) return json({ error: "Invalid derived course" }, 400);
    if (sequence === null || sequence < 1 || !Number.isSafeInteger(sequence)) return json({ error: "Invalid sequence" }, 400);
    if (battery !== null && (battery < 0 || battery > 100)) return json({ error: "Invalid battery level" }, 400);
    if (satellitesVisible !== null && (satellitesVisible < 0 || satellitesVisible > 200)) {
      return json({ error: "Invalid visible satellite count" }, 400);
    }
    if (satellitesUsed !== null && (satellitesUsed < 0 || satellitesUsed > (satellitesVisible ?? 200))) {
      return json({ error: "Invalid used satellite count" }, 400);
    }
    if (body.is_mock === true) return json({ error: "Mock locations are not accepted" }, 400);

    const vehicleResult = await supabase.from("vehicles")
      .select("project_id")
      .eq("external_id", vehicleId)
      .maybeSingle();
    if (vehicleResult.error || !vehicleResult.data) return json({ error: "Vehicle is not registered to a project" }, 404);
    const projectId = vehicleResult.data.project_id;
    if (binding.project_id && binding.project_id !== projectId) return json({ error: 'Device project binding is invalid' }, 403);
    const report = {
      event_id: eventId,
      sequence_number: sequence,
      device_id: deviceId,
      vehicle_id: vehicleId,
      project_id: projectId,
      latitude,
      longitude,
      accuracy_m: accuracy,
      vertical_accuracy_m: verticalAccuracy,
      speed_kmh: speed,
      speed_accuracy_mps: speedAccuracy,
      bearing_deg: bearing,
      bearing_accuracy_deg: bearingAccuracy,
      derived_course_deg: derivedCourse,
      heading_source: String(body.heading_source || "UNKNOWN").slice(0, 30),
      altitude_m: altitude,
      battery_percent: battery === null ? null : Math.round(battery),
      external_power: body.external_power === true,
      battery_temperature_c: batteryTemperature,
      thermal_status: String(body.thermal_status || "UNKNOWN").slice(0, 30),
      provider: String(body.provider || "fused").slice(0, 30),
      satellites_visible: satellitesVisible === null ? null : Math.round(satellitesVisible),
      satellites_used: satellitesUsed === null ? null : Math.round(satellitesUsed),
      constellations: String(body.constellations || "Unknown").slice(0, 300),
      frequency_bands: String(body.frequency_bands || "Unknown").slice(0, 100),
      cn0_median_dbhz: cn0Median,
      fix_rate_hz: fixRate,
      ttff_ms: ttffMs === null ? null : Math.round(ttffMs),
      quality_state: String(body.quality_state || "UNKNOWN").slice(0, 20),
      motion_state: String(body.motion_state || "UNKNOWN").slice(0, 20),
      elapsed_realtime_nanos: finiteOrNull(body.elapsed_realtime_nanos),
      source: "pixel-android",
      source_recorded_at: recordedAt.toISOString(),
    };

    if (binding.id) {
      const committed = await supabase.rpc('ingest_bound_device', {credential_digest: credentialHash, report});
      if (committed.error) {
        const code=committed.error.code;
        return json({error:committed.error.message}, code==='28000'?401:code==='42501'?403:code==='23505'?409:code==='22023'?422:503);
      }
      return json(committed.data);
    }
    // Explicit legacy compatibility only. Staging disables this branch.
    const latest = await supabase
      .from("vehicle_positions")
      .select("source_recorded_at,sequence_number,latitude,longitude,accuracy_m")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (latest.error) return json({ error: "Could not read current vehicle position" }, 500);

    const latestTime = latest.data?.source_recorded_at
      ? new Date(latest.data.source_recorded_at).getTime()
      : Number.NEGATIVE_INFINITY;
    const elapsedSeconds = (recordedAt.getTime() - latestTime) / 1000;
    if (latest.data && elapsedSeconds > 0 && elapsedSeconds < 120) {
      const rad = Math.PI / 180;
      const dLat = (latitude - latest.data.latitude) * rad;
      const dLng = (longitude - latest.data.longitude) * rad;
      const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * rad) *
        Math.cos(latest.data.latitude * rad) * Math.sin(dLng / 2) ** 2;
      const metres = 12742000 * Math.asin(Math.sqrt(Math.min(1, haversine)));
      const uncertainty = Math.max(0, latest.data.accuracy_m || 0) + accuracy;
      if (Math.max(0, metres - uncertainty) / elapsedSeconds * 3.6 > 180) {
        return json({ error: "Implausible GPS jump" }, 422);
      }
    }
    if (recordedAt.getTime() >= latestTime) {
      const { error: positionError } = await supabase.from("vehicle_positions").upsert({
        vehicle_id: vehicleId,
        project_id: projectId,
        device_id: deviceId,
        gps_history_id: null,
        sequence_number: sequence,
        latitude,
        longitude,
        accuracy_m: accuracy,
        speed_kmh: speed,
        speed_accuracy_mps: speedAccuracy,
        bearing_deg: bearing,
        bearing_accuracy_deg: bearingAccuracy,
        derived_course_deg: derivedCourse,
        heading_source: String(body.heading_source || "UNKNOWN").slice(0, 30),
        altitude_m: altitude,
        vertical_accuracy_m: verticalAccuracy,
        quality_state: String(body.quality_state || "UNKNOWN").slice(0, 20),
        motion_state: String(body.motion_state || "UNKNOWN").slice(0, 20),
        battery_percent: battery === null ? null : Math.round(battery),
        external_power: body.external_power === true,
        battery_temperature_c: batteryTemperature,
        thermal_status: String(body.thermal_status || "UNKNOWN").slice(0, 30),
        provider: String(body.provider || "fused").slice(0, 30),
        satellites_visible: satellitesVisible === null ? null : Math.round(satellitesVisible),
        satellites_used: satellitesUsed === null ? null : Math.round(satellitesUsed),
        constellations: String(body.constellations || "Unknown").slice(0, 300),
        frequency_bands: String(body.frequency_bands || "Unknown").slice(0, 100),
        cn0_median_dbhz: cn0Median,
        fix_rate_hz: fixRate,
        ttff_ms: ttffMs === null ? null : Math.round(ttffMs),
        elapsed_realtime_nanos: finiteOrNull(body.elapsed_realtime_nanos),
        source: "pixel-android",
        source_recorded_at: recordedAt.toISOString(),
        received_at: new Date().toISOString(),
      });
      if (positionError) return json({ error: "Could not update vehicle position", detail: positionError.message }, 500);
    }

    // Live state is always updated first. Permanent history is sampled every
    // five seconds, or immediately when quality/motion changes.
    const previousHistory = await supabase
      .from("gps_history")
      .select("id,source_recorded_at,quality_state,motion_state")
      .eq("vehicle_id", vehicleId)
      .eq("project_id", projectId)
      .order("source_recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousHistory.error) return json({ error: "Could not inspect telemetry history" }, 500);

    const previousHistoryTime = previousHistory.data?.source_recorded_at
      ? new Date(previousHistory.data.source_recorded_at).getTime()
      : Number.NEGATIVE_INFINITY;
    const shouldArchive = recordedAt.getTime() >= previousHistoryTime && (
      recordedAt.getTime() - previousHistoryTime >= 5_000 ||
      previousHistory.data?.quality_state !== report.quality_state ||
      previousHistory.data?.motion_state !== report.motion_state
    );

    let historyId: number | null = null;
    if (shouldArchive) {
      const { data: inserted, error: insertError } = await supabase
        .from("gps_history")
        .upsert(report, { onConflict: "event_id", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();
      if (insertError) return json({ error: "Could not archive GPS report", detail: insertError.message }, 500);
      historyId = inserted?.id ?? null;
      if (historyId !== null && recordedAt.getTime() >= latestTime) {
        const linked = await supabase.from("vehicle_positions").update({ gps_history_id: historyId })
          .eq("vehicle_id", vehicleId).eq("project_id", projectId)
          .eq("source_recorded_at", recordedAt.toISOString()).eq("sequence_number", sequence);
        if (linked.error) console.warn('Could not link archived GPS report to current position');
      }
    }

    // Best-effort wakeup; durable jobs remain pending on failure. A trusted scheduled
    // drain is required before cutover so the final failed wakeup can recover.
    if (Deno.env.get('CENTRAL_PROCESSING_ENABLED') === 'true') {
      try {
        const wake = await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/central-stop-processor', {
          method: 'POST', headers: { 'x-tracking-secret': Deno.env.get('TRACKING_PROCESSOR_SECRET') || '' },
          signal: AbortSignal.timeout(5000),
        });
        if (!wake.ok) console.warn('Tracking queue wakeup failed; scheduled drain required');
      } catch { console.warn('Tracking queue wakeup unavailable; scheduled drain required'); }
    }
    if (binding.id) {
      const seen = await supabase.from('tracking_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', binding.id);
      if (seen.error) console.warn('Device last-seen update failed');
    }
    return json({
      ok: true,
      event_id: eventId,
      accepted_sequence: sequence,
      server_received_at: new Date().toISOString(),
      archived: shouldArchive,
      gps_history_id: historyId,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400);
  }
});
