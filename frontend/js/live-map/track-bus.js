/* ============================================================
   VAN GPS
============================================================ */

var canonicalLivePosition = null;
var publicGpsQuality = 'ACCEPTABLE';
var publicQualityFilter = window.markerMotion.qualityFilter();
var publicMarkerController = null;
var lastSpeedSampleTime=null;
async function loadVanPosition() {

        if (document.hidden || vanPositionRequestInFlight) return;
        // pageshow can precede async project resolution; never subscribe to the default vehicle first.
        if (window.publicProject?.ready) { try { await window.publicProject.ready; } catch { return; } }
        if (document.hidden || vanPositionRequestInFlight) return;
        vanPositionRequestInFlight = true;
        var requestedVehicle = VEHICLE_ID, requestedProject = window.PROJECT_ID;
        try {
            var snapshot = await window.selectedTracking.read(supabaseClient, requestedVehicle);
            if (requestedVehicle !== VEHICLE_ID || requestedProject !== window.PROJECT_ID) return;
            var row = snapshot.position;
            if(row){publicGpsQuality=publicQualityFilter.check(row,String(requestedProject)+'/'+row.source_run_id,Date.now());if(publicGpsQuality==='REJECTED')return;
             if(activeRouteFeature){try{var projected=turf.nearestPointOnLine(activeRouteFeature,turf.point([row.longitude,row.latitude]),{units:'kilometers'});if(projected.properties.dist>.15)publicGpsQuality='POOR';}catch{}}
}
            vehicleStopState = snapshot.stop || null;
            vehicleStopStateLoaded = true;
            canonicalLivePosition = row;
            if (window.publicPresentation) window.publicPresentation.setLocationUnavailable(!row);
            if (vanMarker) vanMarker.setOpacity(row ? 1 : 0);
            if (row) updateVanMarker({lat: row.latitude, lng: row.longitude, viteza: row.speed_kmh,
                directie: row.bearing_deg, source_recorded_at: row.source_recorded_at},
                row.source === 'pixel-android' ? 'Google Pixel' : 'ScorpionTrack');
            else {
                vanPosition = null;
                lastVanGPSReceivedAt = null;
                updateGPSStatus();
                updateSmartRouteInformation();
            }
        } catch (error) { console.warn('Selected tracking unavailable', error);
            if (window.publicPresentation) window.publicPresentation.setLocationUnavailable(true);
        }
        finally { vanPositionRequestInFlight = false; }
}
function getTrackerRecordedAt(data) {
    var candidates = [
        data && data.source_recorded_at,
        data && data.received_at,
        data && data.recorded_at,
        data && data.gpsTime,
        data && data.timestamp,
        data && data.datetime,
        data && data.dataOra
    ];

    for (var index = 0; index < candidates.length; index += 1) {
        var candidate = candidates[index];
        if (candidate === null || candidate === undefined || candidate === '') continue;
        var numeric = Number(candidate);
        var parsed = Number.isFinite(numeric)
            ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric)
            : new Date(candidate);
        if (Number.isFinite(parsed.getTime())) return parsed.getTime();
    }

    return null;
}



/* ============================================================
   UPDATE VAN
============================================================ */

function moveVanMarkerSmoothly(targetPosition, snapImmediately) {
 if(snapImmediately&&publicMarkerController){publicMarkerController.stop();publicMarkerController=null;}
 if(!publicMarkerController)publicMarkerController=window.markerMotion.create({
  predictionSeconds:window.appConfig.trackingV2.predictionSeconds,maxPredictionMetres:window.appConfig.trackingV2.maxPredictionMetres,
  reduced:()=>document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  stopDistance:()=>{if(!vehicleStopState)return 0;var n=vehicleStopState.expected_next_stop_number,r=stopRecords.find(r=>String(r.feature.properties.stopNumber)===String(n));return r?Math.max(0,vanPosition.distanceTo(L.latLng(r.feature.geometry.coordinates[1],r.feature.geometry.coordinates[0]))-240):0;},
  render:(p,h)=>{if(!vanMarker)return;vanMarker.setLatLng(L.latLng(p.lat,p.lng));var arrow=vanMarker.getElement()?.querySelector('.van-heading');if(arrow)arrow.style.transform='rotate('+h+'deg)';}
 });
 var feature=activeRouteFeature,route=feature?{
  project:p=>{var n=turf.nearestPointOnLine(feature,turf.point([p.lng,p.lat]),{units:'kilometers'});return {km:n.properties.location,distance:n.properties.dist*1000};},
  at:km=>{var c=turf.along(feature,Math.max(0,Math.min(routeLengthKm,km)),{units:'kilometers'}).geometry.coordinates;return {lat:c[1],lng:c[0]};},
  bearing:km=>turf.bearing(turf.along(feature,km),turf.along(feature,Math.min(routeLengthKm,km+.01)))
 }:null;
 publicMarkerController.update(Object.assign({},canonicalLivePosition||{source_recorded_at:new Date(lastVanGPSReceivedAt).toISOString(),speed_kmh:vanSpeed,bearing_deg:vanHeading},{latitude:targetPosition.lat,longitude:targetPosition.lng}),route,Date.now());
 return 1;
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&publicMarkerController)publicMarkerController.stop();});
window.addEventListener('pagehide',()=>{if(publicMarkerController)publicMarkerController.stop();});

function updateVanMarker(data, gpsSourceName) {

    if (!data || [data.lat, data.lng].some(function(value) {
        return (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '';
    })) return;
    var incomingTime = getTrackerRecordedAt(data);
    if (incomingTime !== null && incomingTime > Date.now() + 60000) return;
    if (incomingTime !== null && activeVanGpsSource === gpsSourceName && lastVanGPSReceivedAt !== null && incomingTime < lastVanGPSReceivedAt) return;

    var previousVanPosition = vanPosition;
    var previousVanHeading = vanHeading;


    var latitude =
        Number(
            data.lat
        );


    var longitude =
        Number(
            data.lng
        );


    var speed =
        Number(
            data.viteza
        ) || 0;


    var direction =
        Number(
            data.directie
        );


    if (
        !Number.isFinite(
            latitude
        )
        ||
        !Number.isFinite(
            longitude
        )
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {

        return;

    }


    vanHeading =
        Number.isFinite(
            direction
        )
        ?
        normalizeAngle(
            direction
        )
        :
        null;


    vanSpeed =
        speed;


    lastVanGPSReceivedAt =
        getTrackerRecordedAt(data) || Date.now();

    var nextGpsSource = gpsSourceName || 'GPS';
    var gpsSourceChanged = Boolean(
        activeVanGpsSource && activeVanGpsSource !== nextGpsSource
    );

    /* Do not average speeds collected by two different trackers. */
    if (gpsSourceChanged) {
        speedHistory.length = 0;
    }

    activeVanGpsSource = nextGpsSource;


    if(lastSpeedSampleTime!==lastVanGPSReceivedAt || gpsSourceChanged){recordSpeed(speed);lastSpeedSampleTime=lastVanGPSReceivedAt;}


    vanPosition =
        L.latLng(
            latitude,
            longitude
        );


    if (
        !vanMarker
    ) {


        vanMarker =
            L.marker(

                vanPosition,

                {

                    icon:
                        createVanIcon(
                            direction
                        ),

                    zIndexOffset:
                        2000

                }

            )
            .addTo(map);
        moveVanMarkerSmoothly(vanPosition, true);

    }


    else {


        var markerAnimationDuration = moveVanMarkerSmoothly(
            vanPosition,
            gpsSourceChanged
        );


        if (
            previousVanHeading === null
            || vanHeading === null
            || Math.abs(previousVanHeading - vanHeading) >= 5
        ) {
            /* Heading is rendered by the visual controller without rebuilding the icon. */
        }

    }


    window.updateVehicleFacing(vanMarker, vanPosition, speed, activeVanGpsSource);

    if (
        followVan
    ) {


        var movementMeters = previousVanPosition
            ? previousVanPosition.distanceTo(vanPosition)
            : Infinity;

        if (!previousVanPosition || map.getZoom() !== VAN_FOLLOW_ZOOM) {
            map.setView(vanPosition, VAN_FOLLOW_ZOOM, { animate: false });
        } else if (movementMeters >= 20) {
            map.panTo(vanPosition, {
                animate: true,
                duration: markerAnimationDuration > 0
                    ? markerAnimationDuration / 1000
                    : 0.35
            });
        }

    }


    selectBestRouteContextForVan();


    updateGPSStatus();


    updateSmartRouteInformation();

}



/* ============================================================
   GPS STATUS
============================================================ */

function updateGPSStatus() {


    var badge =
        document
        .getElementById(
            'live-badge'
        );


    var text =
        document
        .getElementById(
            'live-badge-text'
        );


    var age =
        getGPSAgeMs();

    if (typeof canonicalLivePosition !== 'undefined' && canonicalLivePosition && canonicalLivePosition.movement_state && window.trackingState) {
        var state = window.trackingState.classify(canonicalLivePosition);
        var unhealthy = state === 'GPS_DELAYED' || state === 'GPS_OFFLINE';
        badge.classList.toggle('stale', unhealthy);
        text.innerText = state === 'PARKED_AT_STOP'
            ? 'PARKED · STOP ' + canonicalLivePosition.current_stop_number
            : state === 'STATIONARY' ? 'Stationary'
            : state === 'GPS_DELAYED' ? 'DELAYED · ' + formatGPSAge(age)
            : state === 'GPS_OFFLINE' ? 'Live tracking temporarily unavailable'
            : 'LIVE · ' + formatGPSAge(age);
        if (unhealthy) setETAUnavailable();
        else if (vanPosition && activeRouteFeature) updateSmartRouteInformation();
        return;
    }


    if (
        age === null
    ) {
        badge.classList.add('stale');

        text.innerText =
            'WAITING FOR GPS';

        return;

    }


    var ageText =
        formatGPSAge(
            age
        );


    if (
        age >
        (window.appConfig.providerSelectionEnabled ? 180000 : GPS_STALE_AFTER_MS)
    ) {


        badge
            .classList
            .add(
                'stale'
            );


        text.innerText =
                (window.appConfig.providerSelectionEnabled && age > 600000 ? 'NO RECENT GPS · ' : 'DELAYED · ') +
            ageText;


        setETAUnavailable();

    }


    else {


        badge
            .classList
            .remove(
                'stale'
            );


        text.innerText =
                'LIVE · ' +
            ageText;


        /*
           Recalculate so ETA is restored
           automatically after GPS recovers.
        */

        if (
            vanPosition
            &&
            activeRouteFeature
        ) {

            updateSmartRouteInformation();

        }

    }

}



setInterval(

    updateGPSStatus,

    10000

);
