// Prepared replacement-project configuration. Public client key only.
window.appConfig = {
  "leanTrackingEnabled": true,
  "minimalTrackingAdmin": true,
  "supabaseUrl": "https://dmqdiazosamyrnkmbtcd.supabase.co",
  "supabaseKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcWRpYXpvc2FteXJua21idGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTMwMjcsImV4cCI6MjEwODc2OTAyN30.c8qgrcCg7chm71aHA0lLsZ7qbCWPMUCgc515eCZBzpQ",
  "mapCenter": {
    "lat": 42.0683,
    "lng": 19.5126,
    "zoom": 13
  },
  "vehicleId": "sightseeing-shkodra-van-1",
  "defaultProjectSlug": "sightseeing-shkodra",
  "projectId": null,
  "projectSlug": null,
  "scorpionTrackingToken": "",
  "defaultGpsSource": "scorpion",
  "projectGpsSource": null,
  "providerSelectionEnabled": true,
  "selectedTrackingRealtimeEnabled": true,
  "vanFollowZoom": 17,
  "gpsUpdateInterval": 5000,
  "trackingFallbackIntervalMs": 5000,
  "vehicleStateUpdateInterval": 5000,
  "vehicleEtaUpdateInterval": 5000,
  "publishedMapCheckInterval": 30000,
  "gpsStaleAfterMs": 90000,
  "vehicleEtaStaleAfterMs": 90000,
  "defaultServiceSpeedKmh": 18,
  "stopArrivalRadiusKm": 0.08,
  "offRouteWarningKm": 0.4,
  "offRouteConfirmReadings": 3,
  "maximumSpeedSamples": 24,
  "trackingV2": {
    "delayedSeconds": 90,
    "degradedSeconds": 180,
    "offlineSeconds": 600,
    "approachMetres": 200,
    "approachExitMetres": 240,
    "arrivalMetres": 200,
    "arrivalExitMetres": 220,
    "arrivalDwellSeconds": 10,
    "predictionSeconds": 10,
    "maxPredictionMetres": 50,
    "segmentBaselinesMinutes": {},
    "defaultDwellMinutes": 0,
    "historicalContextSeconds": 600,
    "parkedSeconds": 25
  },
  "allowedParentOrigins": [
    "https://sightseeingshkodra.app",
    "https://www.sightseeingshkodra.app",
    "https://sightseeingshkodra.com",
    "https://www.sightseeingshkodra.com"
  ]
};
window.SUPABASE_URL=window.appConfig.supabaseUrl;
window.SUPABASE_KEY=window.appConfig.supabaseKey;

// Capture recovery intent before Supabase Auth consumes the callback fragment.
window.appConfig.ownerRecoveryRequested = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";

// Fixed website preview parents are trusted only by a loopback-served child.
if (["http://localhost:4199", "http://127.0.0.1:4199"].includes(window.location.origin)) {
  window.appConfig.allowedParentOrigins.push("http://localhost:3011", "http://127.0.0.1:3011");
}
