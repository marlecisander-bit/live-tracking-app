/*
   All adjustable Live Map settings are kept here.
   Their values come from js/shared/app-config.js.
*/

if (new URLSearchParams(window.location.search).get('embed') === '1') {
    document.documentElement.classList.add('embed-mode');
}

/* iOS browsers can report a stale percentage height while their toolbars are
   visible. Keep the map pinned to the current visual viewport instead. */
(function keepLiveMapAtViewportHeight() {
    var resizeFrame = null;

    function updateViewportHeight() {
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(function() {
            var viewport = window.visualViewport;
            var height = viewport && viewport.height
                ? viewport.height
                : window.innerHeight;

            if (height > 0) {
                document.documentElement.style.setProperty(
                    '--live-viewport-height',
                    Math.round(height) + 'px'
                );
            }
        });
    }

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight, { passive: true });
    window.addEventListener('orientationchange', updateViewportHeight, { passive: true });
    window.addEventListener('pageshow', updateViewportHeight, { passive: true });
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) updateViewportHeight();
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateViewportHeight, { passive: true });
    }
})();

var VEHICLE_ID = window.appConfig.vehicleId;
var SCORPION_TOKEN = window.appConfig.scorpionTrackingToken;
var VAN_FOLLOW_ZOOM = window.appConfig.vanFollowZoom;

var GPS_UPDATE_INTERVAL = window.appConfig.gpsUpdateInterval;
var VEHICLE_STATE_UPDATE_INTERVAL = window.appConfig.vehicleStateUpdateInterval;
var VEHICLE_ETA_UPDATE_INTERVAL = window.appConfig.vehicleEtaUpdateInterval;
var MAP_CHECK_INTERVAL = window.appConfig.publishedMapCheckInterval;

var GPS_STALE_AFTER_MS = window.appConfig.gpsStaleAfterMs;
var PIXEL_GPS_FRESH_AFTER_MS = window.appConfig.pixelGpsFreshAfterMs || 30000;
var VEHICLE_ETA_STALE_AFTER_MS = window.appConfig.vehicleEtaStaleAfterMs;

var DEFAULT_SERVICE_SPEED_KMH = window.appConfig.defaultServiceSpeedKmh;
var STOP_ARRIVAL_RADIUS_KM = window.appConfig.stopArrivalRadiusKm;
var OFF_ROUTE_WARNING_KM = window.appConfig.offRouteWarningKm;
var OFF_ROUTE_CONFIRM_READINGS = window.appConfig.offRouteConfirmReadings;
var MAX_SPEED_SAMPLES = window.appConfig.maximumSpeedSamples;
