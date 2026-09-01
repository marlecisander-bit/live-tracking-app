window.appConfig = {
    supabaseUrl: 'https://jpcjdqwyrrcusuvypwic.supabase.co',
    supabaseKey: 'sb_publishable_2DouxC7wM67d0bzN09Oikg_kjYzQQ-c',
    mapCenter: {
        lat: 42.0683,
        lng: 19.5126,
        zoom: 13
    },
    vehicleId: 'sightseeing-shkodra-van-1',
    defaultProjectSlug: 'sightseeing-shkodra',
    projectId: null,
    projectSlug: null,
    scorpionTrackingToken: '95929I1129059978741228',
    defaultGpsSource: 'scorpion',
    projectGpsSource: null,
    pixelGpsFreshAfterMs: 30000,
    vanFollowZoom: 16,
    gpsUpdateInterval: 2000,
    vehicleStateUpdateInterval: 5000,
    vehicleEtaUpdateInterval: 5000,
    publishedMapCheckInterval: 30000,
    gpsStaleAfterMs: 90000,
    vehicleEtaStaleAfterMs: 90000,
    defaultServiceSpeedKmh: 18,
    stopArrivalRadiusKm: 0.08,
    offRouteWarningKm: 0.40,
    offRouteConfirmReadings: 3,
    maximumSpeedSamples: 24
};

window.SUPABASE_URL = window.appConfig.supabaseUrl;
window.SUPABASE_KEY = window.appConfig.supabaseKey;
