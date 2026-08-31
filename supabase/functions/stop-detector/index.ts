import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ARRIVAL_RADIUS_M = 60;
const DEPARTURE_RADIUS_M = 90;
const CONFIRM_READINGS = 2;
const MAX_GPS_AGE_SECONDS = 180;
const ROUTE_ORIGIN_STOP_NUMBER = "1";
const ROUTE_RESET_MAX_SPEED_KMH = 3;
const ROUTE_RESET_IMMEDIATE_RADIUS_M = 25;
const ROUTE_RESET_IMMEDIATE_MAX_SPEED_KMH = 1;
const SEQUENCE_PASS_RADIUS_M = 60;
const SEQUENCE_PASS_MIN_SPEED_KMH = 3;
const MAX_PASS_SEGMENT_SECONDS = 180;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function getStopNumber(feature: any) {
  return String(feature?.properties?.stopNumber ?? "").trim();
}

function getStopName(feature: any) {
  return String(feature?.properties?.name ?? "Stop");
}

function getStopObjectId(feature: any) {
  const properties = feature?.properties ?? {};
  if (properties.objectId) return String(properties.objectId);
  if (properties.stopNumber !== undefined && properties.stopNumber !== null && String(properties.stopNumber).trim()) {
    return `stop-number:${String(properties.stopNumber).trim()}`;
  }
  return `stop-name:${String(properties.name ?? "unknown")}`;
}

function buildOperationalSequence(stops: any[]) {
  const uniqueStops = new Map<string, any>();
  for (const stop of stops) {
    const number = getStopNumber(stop);
    if (number && !uniqueStops.has(number)) uniqueStops.set(number, stop);
  }
  return Array.from(uniqueStops.values()).sort((a, b) => {
    const aNumber = Number(getStopNumber(a));
    const bNumber = Number(getStopNumber(b));
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
    return getStopName(a).localeCompare(getStopName(b));
  });
}

function findStopIndex(sequence: any[], stopId: string | null, stopNumber: string | null) {
  return sequence.findIndex((stop) =>
    Boolean(stopId && getStopObjectId(stop) === stopId) ||
    Boolean(stopNumber && getStopNumber(stop) === stopNumber)
  );
}

function stopDistance(gps: any, stop: any) {
  const coordinates = stop?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return Infinity;
  return distanceMeters(
    Number(gps.latitude),
    Number(gps.longitude),
    Number(coordinates[1]),
    Number(coordinates[0]),
  );
}

function stopSegmentDistance(previousGps: any, gps: any, stop: any) {
  if (!previousGps) return stopDistance(gps, stop);
  const coordinates = stop?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return Infinity;

  const stopLat = Number(coordinates[1]);
  const stopLon = Number(coordinates[0]);
  const latitudeScale = 111320;
  const longitudeScale = latitudeScale * Math.cos(stopLat * Math.PI / 180);
  const toLocalPoint = (latitude: number, longitude: number) => ({
    x: (longitude - stopLon) * longitudeScale,
    y: (latitude - stopLat) * latitudeScale,
  });

  const start = toLocalPoint(Number(previousGps.latitude), Number(previousGps.longitude));
  const end = toLocalPoint(Number(gps.latitude), Number(gps.longitude));
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return stopDistance(gps, stop);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(end.x, end.y);

  const projection = Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / lengthSquared));
  return Math.hypot(start.x + projection * dx, start.y + projection * dy);
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        },
      });
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase environment variables" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let input: any = {};
    if (req.method === "POST") {
      try { input = await req.json(); } catch (_) { input = {}; }
    }
    const requestedVehicleId = String(input.vehicle_id || new URL(req.url).searchParams.get("vehicle_id") || "sightseeing-shkodra-van-1");
    const requestedProjectId = String(input.project_id || new URL(req.url).searchParams.get("project_id") || "");
    let vehicleQuery = supabase.from("vehicles").select("external_id,project_id").eq("external_id", requestedVehicleId);
    if (requestedProjectId) vehicleQuery = vehicleQuery.eq("project_id", requestedProjectId);
    const { data: vehicle, error: vehicleError } = await vehicleQuery.maybeSingle();
    if (vehicleError || !vehicle) return jsonResponse({ error: "Vehicle project was not found" }, 404);
    const VEHICLE_ID = vehicle.external_id;
    const PROJECT_ID = vehicle.project_id;

    const { data: gpsHistory, error: gpsError } = await supabase
      .from("gps_history")
      .select("*")
      .eq("vehicle_id", VEHICLE_ID)
      .eq("project_id", PROJECT_ID)
      .order("received_at", { ascending: false })
      .limit(2);

    if (gpsError) return jsonResponse({ error: "Could not read gps_history", detail: gpsError.message }, 500);
    const gps = gpsHistory?.[0] ?? null;
    const previousGps = gpsHistory?.[1] ?? null;
    if (!gps) return jsonResponse({ ok: true, processed: false, reason: "No GPS data" });

    const gpsTimestamp = gps.source_recorded_at ?? gps.received_at;
    const gpsTimeMs = new Date(gpsTimestamp).getTime();
    const gpsAgeSeconds = Number.isFinite(gpsTimeMs)
      ? Math.max(0, Math.round((Date.now() - gpsTimeMs) / 1000))
      : 999999;

    if (gpsAgeSeconds > MAX_GPS_AGE_SECONDS) {
      return jsonResponse({ ok: true, processed: false, reason: "GPS data is stale", gps_age_seconds: gpsAgeSeconds });
    }

    const { data: mapVersion, error: mapError } = await supabase
      .from("map_versions")
      .select("id,map_data,published_at")
      .eq("status", "published")
      .eq("project_id", PROJECT_ID)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (mapError) return jsonResponse({ error: "Could not read map_versions", detail: mapError.message }, 500);
    if (!mapVersion?.map_data) return jsonResponse({ ok: true, processed: false, reason: "No published map" });

    const features = Array.isArray(mapVersion.map_data?.features) ? mapVersion.map_data.features : [];
    const stops = features.filter((feature: any) =>
      feature?.properties?.active !== false &&
      feature?.geometry?.type === "Point" &&
      feature?.properties?.pointType === "stop" &&
      Array.isArray(feature?.geometry?.coordinates) &&
      feature.geometry.coordinates.length >= 2
    );
    const sequence = buildOperationalSequence(stops);
    if (!sequence.length) return jsonResponse({ ok: true, processed: false, reason: "No stops found" });

    const { data: existingState, error: stateError } = await supabase
      .from("vehicle_stop_state")
      .select("*")
      .eq("vehicle_id", VEHICLE_ID)
      .eq("project_id", PROJECT_ID)
      .maybeSingle();

    if (stateError) return jsonResponse({ error: "Could not read vehicle_stop_state", detail: stateError.message }, 500);
    if (existingState?.last_gps_history_id != null && String(existingState.last_gps_history_id) === String(gps.id)) {
      return jsonResponse({
        ok: true,
        processed: false,
        detector_version: "2.5-segment-resync",
        reason: "GPS point already processed",
      });
    }

    const state: any = existingState ?? {
      vehicle_id: VEHICLE_ID,
      project_id: PROJECT_ID,
      current_stop_id: null,
      current_stop_name: null,
      current_stop_number: null,
      entered_at: null,
      arrival_event_id: null,
      candidate_stop_id: null,
      candidate_stop_name: null,
      candidate_stop_number: null,
      candidate_started_at: null,
      candidate_gps_history_id: null,
      inside_streak: 0,
      outside_streak: 0,
      last_gps_history_id: null,
      last_completed_stop_id: null,
      last_completed_stop_number: null,
      expected_next_stop_id: null,
      expected_next_stop_number: null,
      sequence_index: null,
      map_version_id: null,
    };

    if (state.map_version_id !== null && Number(state.map_version_id) !== Number(mapVersion.id)) {
      state.expected_next_stop_id = null;
      state.expected_next_stop_number = null;
      state.sequence_index = null;
      state.candidate_stop_id = null;
      state.candidate_stop_name = null;
      state.candidate_stop_number = null;
      state.candidate_started_at = null;
      state.candidate_gps_history_id = null;
      state.inside_streak = 0;
      state.outside_streak = 0;
    }
    state.map_version_id = mapVersion.id;

    function setExpectedFromIndex(index: number) {
      const stop = sequence[index];
      if (!stop) {
        state.expected_next_stop_id = null;
        state.expected_next_stop_number = null;
        state.sequence_index = null;
        return null;
      }
      state.expected_next_stop_id = getStopObjectId(stop);
      state.expected_next_stop_number = getStopNumber(stop);
      state.sequence_index = index;
      return stop;
    }

    function setExpectedAfterStop(stopId: string | null, stopNumber: string | null) {
      const completedIndex = findStopIndex(sequence, stopId, stopNumber);
      if (completedIndex < 0) return null;
      return setExpectedFromIndex((completedIndex + 1) % sequence.length);
    }

    let expectedStop: any = null;
    if (state.expected_next_stop_id || state.expected_next_stop_number) {
      const index = findStopIndex(sequence, state.expected_next_stop_id, state.expected_next_stop_number);
      if (index >= 0) {
        expectedStop = sequence[index];
        state.sequence_index = index;
      }
    }
    if (!expectedStop && (state.last_completed_stop_id || state.last_completed_stop_number)) {
      expectedStop = setExpectedAfterStop(state.last_completed_stop_id, state.last_completed_stop_number);
    }

    let eventCreated: any = null;

    /* Confirm departure from the current stop before looking for arrival. */
    if (state.current_stop_id || state.current_stop_number) {
      const currentIndex = findStopIndex(sequence, state.current_stop_id, state.current_stop_number);
      const currentStop = currentIndex >= 0 ? sequence[currentIndex] : null;
      if (currentStop) {
        const currentDistance = stopDistance(gps, currentStop);
        if (currentDistance > DEPARTURE_RADIUS_M) {
          state.outside_streak = Number(state.outside_streak || 0) + 1;
          if (state.outside_streak >= CONFIRM_READINGS) {
            let dwellSeconds: number | null = null;
            if (state.entered_at) {
              const enteredTime = new Date(state.entered_at).getTime();
              if (Number.isFinite(enteredTime)) dwellSeconds = Math.max(0, Math.round((gpsTimeMs - enteredTime) / 1000));
            }

            const completedStopId = state.current_stop_id;
            const completedStopName = state.current_stop_name;
            const completedStopNumber = state.current_stop_number;
            const { data: departureEvent, error: departureError } = await supabase
              .from("stop_events")
              .insert({
                vehicle_id: VEHICLE_ID,
                project_id: PROJECT_ID,
                stop_id: completedStopNumber || completedStopId,
                stop_name: completedStopName,
                stop_number: completedStopNumber,
                event_type: "departure",
                event_at: gpsTimestamp,
                gps_history_id: gps.id,
                latitude: gps.latitude,
                longitude: gps.longitude,
                distance_m: Math.round(currentDistance),
                dwell_seconds: dwellSeconds,
              })
              .select()
              .single();

            if (departureError) return jsonResponse({ error: "Could not create departure", detail: departureError.message }, 500);

            state.last_completed_stop_id = completedStopId;
            state.last_completed_stop_number = completedStopNumber;
            expectedStop = setExpectedAfterStop(completedStopId, completedStopNumber);
            eventCreated = {
              type: "departure",
              event_id: departureEvent.id,
              stop: completedStopName,
              stop_number: completedStopNumber,
              dwell_seconds: dwellSeconds,
              expected_next_stop: expectedStop
                ? { number: getStopNumber(expectedStop), name: getStopName(expectedStop) }
                : null,
            };

            state.current_stop_id = null;
            state.current_stop_name = null;
            state.current_stop_number = null;
            state.entered_at = null;
            state.arrival_event_id = null;
            state.outside_streak = 0;
            state.inside_streak = 0;
            state.candidate_stop_id = null;
            state.candidate_stop_name = null;
            state.candidate_stop_number = null;
            state.candidate_started_at = null;
            state.candidate_gps_history_id = null;
          }
        } else {
          state.outside_streak = 0;
        }
      }
    }

    if (!state.current_stop_id && !state.current_stop_number) {
      let confirmUnexpectedStopImmediately = false;
      let sequenceAdvancedByPass = false;

      /* Bootstrap only when physically inside a real stop. */
      if (!expectedStop) {
        let closestStop: any = null;
        let closestDistance = Infinity;
        for (const stop of sequence) {
          const distance = stopDistance(gps, stop);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestStop = stop;
          }
        }
        if (closestStop && closestDistance <= ARRIVAL_RADIUS_M) expectedStop = closestStop;
      }

      /*
         Stop 1 is the one controlled exception to the expected-stop rule.
         It restarts a completed or interrupted circular route, but only at
         low speed and after the normal two-reading confirmation below.
      */
      const originIndex = sequence.findIndex((stop: any) => getStopNumber(stop) === ROUTE_ORIGIN_STOP_NUMBER);
      const originStop = originIndex >= 0 ? sequence[originIndex] : null;
      const gpsSpeed = Number(gps.speed_kmh);
      const previousGpsTimestamp = previousGps?.source_recorded_at ?? previousGps?.received_at;
      const previousGpsTimeMs = previousGpsTimestamp ? new Date(previousGpsTimestamp).getTime() : NaN;
      const passSegmentSeconds = Number.isFinite(previousGpsTimeMs)
        ? Math.max(0, Math.round((gpsTimeMs - previousGpsTimeMs) / 1000))
        : Infinity;
      const mayUseGpsSegment = passSegmentSeconds <= MAX_PASS_SEGMENT_SECONDS;
      const speedAllowsReset = !Number.isFinite(gpsSpeed) || gpsSpeed <= ROUTE_RESET_MAX_SPEED_KMH;
      const originDistance = originStop ? stopDistance(gps, originStop) : Infinity;
      const authoritativeExpectedIndex = expectedStop
        ? findStopIndex(sequence, getStopObjectId(expectedStop), getStopNumber(expectedStop))
        : -1;
      if (
        originStop &&
        expectedStop &&
        getStopNumber(expectedStop) !== ROUTE_ORIGIN_STOP_NUMBER &&
        originDistance <= ARRIVAL_RADIUS_M &&
        speedAllowsReset
      ) {
        expectedStop = originStop;
        confirmUnexpectedStopImmediately =
          originDistance <= ROUTE_RESET_IMMEDIATE_RADIUS_M &&
          (!Number.isFinite(gpsSpeed) || gpsSpeed <= ROUTE_RESET_IMMEDIATE_MAX_SPEED_KMH);
      }

      /*
         If the driver intentionally skips one or more stops, allow the
         sequence to synchronize at the stop actually visited. A normal
         drive-by is ignored: the van must be inside the arrival radius and
         moving no faster than the route-reset speed. The usual two-reading
         confirmation still applies unless the reading is exceptionally
         strong (within 25 m at no more than 1 km/h).
      */
      let closestOperationalStop: any = null;
      let closestOperationalDistance = Infinity;
      let closestOperationalPassDistance = Infinity;
      for (const stop of sequence) {
        const distance = stopDistance(gps, stop);
        const passDistance = mayUseGpsSegment
          ? stopSegmentDistance(previousGps, gps, stop)
          : distance;
        if (passDistance < closestOperationalPassDistance) {
          closestOperationalPassDistance = passDistance;
          closestOperationalDistance = distance;
          closestOperationalStop = stop;
        }
      }

      /*
         A moving van may cross a stop between two GPS readings. Measure the
         complete recent GPS segment and synchronize to the stop actually
         crossed, even when one or more earlier stops were skipped.
      */
      const closestOperationalIndex = closestOperationalStop
        ? findStopIndex(
            sequence,
            getStopObjectId(closestOperationalStop),
            getStopNumber(closestOperationalStop),
          )
        : -1;
      const movingThroughStop =
        Number.isFinite(gpsSpeed) && gpsSpeed > SEQUENCE_PASS_MIN_SPEED_KMH;
      const closestOperationalNumber = closestOperationalStop
        ? getStopNumber(closestOperationalStop)
        : null;
      const isNewPassedStop = Boolean(
        closestOperationalNumber &&
        closestOperationalNumber !== String(state.last_completed_stop_number ?? "")
      );

      if (
        closestOperationalStop &&
        authoritativeExpectedIndex >= 0 &&
        closestOperationalIndex >= 0 &&
        closestOperationalNumber !== ROUTE_ORIGIN_STOP_NUMBER &&
        isNewPassedStop &&
        closestOperationalPassDistance <= SEQUENCE_PASS_RADIUS_M &&
        movingThroughStop
      ) {
        const passedId = getStopObjectId(closestOperationalStop);
        const passedNumber = getStopNumber(closestOperationalStop);
        const passedName = getStopName(closestOperationalStop);

        state.last_completed_stop_id = passedId;
        state.last_completed_stop_number = passedNumber;
        expectedStop = setExpectedAfterStop(passedId, passedNumber);
        state.candidate_stop_id = null;
        state.candidate_stop_name = null;
        state.candidate_stop_number = null;
        state.candidate_started_at = null;
        state.candidate_gps_history_id = null;
        state.inside_streak = 0;
        state.outside_streak = 0;
        sequenceAdvancedByPass = true;
        eventCreated = {
          type: "sequence_pass",
          stop: passedName,
          stop_number: passedNumber,
          distance_m: Math.round(closestOperationalPassDistance),
          expected_next_stop: expectedStop
            ? { number: getStopNumber(expectedStop), name: getStopName(expectedStop) }
            : null,
        };
      }

      if (
        !sequenceAdvancedByPass &&
        closestOperationalStop &&
        expectedStop &&
        getStopNumber(closestOperationalStop) !== getStopNumber(expectedStop) &&
        getStopNumber(closestOperationalStop) !== ROUTE_ORIGIN_STOP_NUMBER &&
        closestOperationalDistance <= ARRIVAL_RADIUS_M &&
        speedAllowsReset
      ) {
        expectedStop = closestOperationalStop;
        confirmUnexpectedStopImmediately =
          closestOperationalDistance <= ROUTE_RESET_IMMEDIATE_RADIUS_M &&
          (!Number.isFinite(gpsSpeed) || gpsSpeed <= ROUTE_RESET_IMMEDIATE_MAX_SPEED_KMH);
      }

      if (expectedStop && !sequenceAdvancedByPass) {
        const expectedDistance = stopDistance(gps, expectedStop);
        const expectedId = getStopObjectId(expectedStop);
        const expectedNumber = getStopNumber(expectedStop);
        const expectedName = getStopName(expectedStop);

        if (expectedDistance <= ARRIVAL_RADIUS_M) {
          if (state.candidate_stop_id === expectedId) {
            state.inside_streak = Number(state.inside_streak || 0) + 1;
          } else {
            state.candidate_stop_id = expectedId;
            state.candidate_stop_name = expectedName;
            state.candidate_stop_number = expectedNumber;
            state.candidate_started_at = gpsTimestamp;
            state.candidate_gps_history_id = gps.id;
            state.inside_streak = 1;
          }

          /*
             Stationary ScorpionTrack heartbeats can be eight minutes apart.
             A point within 25 m at no more than 1 km/h is strong enough to
             confirm an intentional stop without a second heartbeat.
          */
          if (confirmUnexpectedStopImmediately) {
            state.inside_streak = CONFIRM_READINGS;
          }

          state.outside_streak = 0;

          if (state.inside_streak >= CONFIRM_READINGS) {
            const { data: arrivalEvent, error: arrivalError } = await supabase
              .from("stop_events")
              .insert({
                vehicle_id: VEHICLE_ID,
                project_id: PROJECT_ID,
                stop_id: expectedNumber || expectedId,
                stop_name: expectedName,
                stop_number: expectedNumber,
                event_type: "arrival",
                event_at: gpsTimestamp,
                gps_history_id: gps.id,
                latitude: gps.latitude,
                longitude: gps.longitude,
                distance_m: Math.round(expectedDistance),
              })
              .select()
              .single();

            if (arrivalError) return jsonResponse({ error: "Could not create arrival", detail: arrivalError.message }, 500);

            state.current_stop_id = expectedId;
            state.current_stop_name = expectedName;
            state.current_stop_number = expectedNumber;
            state.entered_at = gpsTimestamp;
            state.arrival_event_id = arrivalEvent.id;
            state.expected_next_stop_id = expectedId;
            state.expected_next_stop_number = expectedNumber;
            const confirmedIndex = findStopIndex(sequence, expectedId, expectedNumber);
            if (confirmedIndex >= 0) state.sequence_index = confirmedIndex;
            state.candidate_stop_id = null;
            state.candidate_stop_name = null;
            state.candidate_stop_number = null;
            state.candidate_started_at = null;
            state.candidate_gps_history_id = null;
            state.inside_streak = 0;
            state.outside_streak = 0;
            eventCreated = {
              type: "arrival",
              event_id: arrivalEvent.id,
              stop: expectedName,
              stop_number: expectedNumber,
              distance_m: Math.round(expectedDistance),
            };
          }
        } else {
          state.candidate_stop_id = null;
          state.candidate_stop_name = null;
          state.candidate_stop_number = null;
          state.candidate_started_at = null;
          state.candidate_gps_history_id = null;
          state.inside_streak = 0;
        }
      }
    }

    state.last_gps_history_id = gps.id;
    state.updated_at = new Date().toISOString();
    const { error: saveStateError } = await supabase
      .from("vehicle_stop_state")
      .upsert(state, { onConflict: "vehicle_id" });

    if (saveStateError) return jsonResponse({ error: "Could not save vehicle state", detail: saveStateError.message }, 500);

    let expectedInfo: any = null;
    if (state.expected_next_stop_id || state.expected_next_stop_number) {
      const index = findStopIndex(sequence, state.expected_next_stop_id, state.expected_next_stop_number);
      if (index >= 0) {
        const stop = sequence[index];
        expectedInfo = {
          id: getStopObjectId(stop),
          number: getStopNumber(stop),
          name: getStopName(stop),
          distance_m: Math.round(stopDistance(gps, stop)),
        };
      }
    }

    return jsonResponse({
      ok: true,
      processed: true,
      detector_version: "2.5-segment-resync",
      gps_history_id: gps.id,
      gps_age_seconds: gpsAgeSeconds,
      map_version_id: mapVersion.id,
      sequence: sequence.map((stop: any) => ({
        id: getStopObjectId(stop),
        number: getStopNumber(stop),
        name: getStopName(stop),
      })),
      current_stop: state.current_stop_name
        ? { id: state.current_stop_id, number: state.current_stop_number, name: state.current_stop_name }
        : null,
      last_completed_stop: state.last_completed_stop_id || state.last_completed_stop_number
        ? { id: state.last_completed_stop_id, number: state.last_completed_stop_number }
        : null,
      expected_next_stop: expectedInfo,
      sequence_index: state.sequence_index,
      event: eventCreated,
    });
  } catch (error) {
    console.error("stop-detector error:", error);
    return jsonResponse({
      ok: false,
      error: "Unexpected stop-detector error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
