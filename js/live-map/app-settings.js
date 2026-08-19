/*
   All adjustable Live Map settings are kept here.
   Their values come from js/shared/app-config.js.
*/

var VEHICLE_ID = window.appConfig.vehicleId;
var SCORPION_TOKEN = window.appConfig.scorpionTrackingToken;
var VAN_FOLLOW_ZOOM = window.appConfig.vanFollowZoom;

var GPS_UPDATE_INTERVAL = window.appConfig.gpsUpdateInterval;
var VEHICLE_STATE_UPDATE_INTERVAL = window.appConfig.vehicleStateUpdateInterval;
var VEHICLE_ETA_UPDATE_INTERVAL = window.appConfig.vehicleEtaUpdateInterval;
var MAP_CHECK_INTERVAL = window.appConfig.publishedMapCheckInterval;

var GPS_STALE_AFTER_MS = window.appConfig.gpsStaleAfterMs;
var VEHICLE_ETA_STALE_AFTER_MS = window.appConfig.vehicleEtaStaleAfterMs;

var DEFAULT_SERVICE_SPEED_KMH = window.appConfig.defaultServiceSpeedKmh;
var STOP_ARRIVAL_RADIUS_KM = window.appConfig.stopArrivalRadiusKm;
var OFF_ROUTE_WARNING_KM = window.appConfig.offRouteWarningKm;
var OFF_ROUTE_CONFIRM_READINGS = window.appConfig.offRouteConfirmReadings;
var MAX_SPEED_SAMPLES = window.appConfig.maximumSpeedSamples;
