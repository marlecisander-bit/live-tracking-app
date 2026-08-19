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
   stop-detector v2.1 is the authority for the van stop sequence.
============================================================ */

var vehicleStopState =
    null;


var vehicleStopStateLoaded =
    false;


/* ============================================================
   BACKEND ETA STATE
============================================================ */

var vehicleEtaState =
    null;

var vehicleEtaStateLoaded =
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
    false;



var speedHistory =
    [];
