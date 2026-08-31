/* ============================================================
   VARIABLES
============================================================ */

var sightseeingLayers =
    L.featureGroup()
    .addTo(map);


var activeRouteFeature =
    null;


/* All published route segments. The live map dynamically
   chooses the segment nearest to the van. */
var routeContexts =
    [];


var activeRouteContext =
    null;


var routeProperties =
    {};


var routeLengthKm =
    0;


var stopRecords =
    [];


var stopById =
    {};


var operationalSequence =
    [];


var operationalLegs =
    [];


var currentOperationalLegIndex =
    null;


/* ============================================================
   BACKEND OPERATIONAL STATE
   stop-detector v2.5 is the authority for the van stop sequence.
============================================================ */

var vehicleStopState =
    null;


var vehicleStopStateLoaded =
    false;

var vehicleStopStateRequestInFlight =
    false;

var stopDetectorRequestInFlight =
    false;

var lastStopDetectorRequestAt =
    0;


/* A return to Stop 1 starts a new operational route cycle. */
var routeCycleResetActive =
    false;

var vanWasAtRouteOrigin =
    false;


/* ============================================================
   BACKEND ETA STATE
============================================================ */

var vehicleEtaState =
    null;

var vehicleEtaStateLoaded =
    false;

var vehicleEtaRequestInFlight =
    false;

var currentPublishedId =
    null;


var currentPublishedDate =
    null;


var firstMapLoad =
    true;



/* ============================================================
   GPS
============================================================ */

var vanMarker =
    null;


var vanPosition =
    null;


var vanHeading =
    null;


var vanSpeed =
    0;


var lastVanGPSReceivedAt =
    null;

var vanPositionRequestInFlight =
    false;

var lastVanRequestErrorAt =
    0;

var activeVanGpsSource =
    null;


var userMarker =
    null;


var userPosition =
    null;




var userAccuracyMeters =
    null;


var offRouteStreak =
    0;


var userAccuracyCircle =
    null;


var userLocationStarted =
    false;




var nearestStopRecord =
    null;


var nearestStopDistanceKm =
    null;


var watchID =
    null;


var followVan =
    true;



var speedHistory =
    [];
