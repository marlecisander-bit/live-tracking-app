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
            // A late response in the same source run cannot replace the accepted position or planner.
            if(row&&canonicalLivePosition&&row.source_run_id===canonicalLivePosition.source_run_id&&Date.parse(row.source_recorded_at)<Date.parse(canonicalLivePosition.source_recorded_at)){
                updateSmartRouteInformation();return;
            }
            if(row){publicGpsQuality=publicQualityFilter.check(row,String(requestedProject)+'/'+row.source_run_id,Date.now());if(publicGpsQuality==='REJECTED'){window.publicPresentation?.setLocationUnavailable(true);updateGPSStatus();return;}
             // Route adherence gates predictions in the shared model, not the validity of a fresh GPS fix.
}
            vehicleStopState = snapshot.stop || null;
            vehicleEtaState = snapshot.eta || null;
            vehicleStopStateLoaded = true;
            canonicalLivePosition = row;
            if (window.publicPresentation) window.publicPresentation.setLocationUnavailable(!row);
            if (vanMarker) vanMarker.setOpacity(row ? 1 : 0);
            if (row) updateVanMarker({lat: row.latitude, lng: row.longitude, viteza: row.speed_kmh,
                directie: row.bearing_deg, source_recorded_at: row.source_recorded_at},
                'ScorpionTrack');
            else {
                vanPosition = null;
                lastVanGPSReceivedAt = null;
                updateGPSStatus();
                updateSmartRouteInformation();
            }
        } catch (error) { console.warn('Selected tracking unavailable', error);
            if (window.publicPresentation) window.publicPresentation.setLocationUnavailable(true);
            updateGPSStatus();
        }
        finally { vanPositionRequestInFlight = false; }
}
function getTrackerRecordedAt(data) {
    // The canonical contract names exactly one source clock; receipt/fetch time is never a fix.
    var recorded = data && data.source_recorded_at;
    var parsed = typeof recorded === 'string' ? Date.parse(recorded) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}



/* ============================================================
   UPDATE VAN
============================================================ */

function moveVanMarkerSmoothly(targetPosition, snapImmediately) {
 var status=typeof getTouristInformation==='function'?getTouristInformation():null;
 if(status&&(status.gps!=='live'||!status.markerVisible||!['moving','approaching','departing'].includes(status.passengerState))){
   publicMarkerController?.stop();publicMarkerController=null;
   if(status.markerVisible&&vanMarker)vanMarker.setLatLng(targetPosition);
   return 0;
 }
 if(snapImmediately&&publicMarkerController){publicMarkerController.stop();publicMarkerController=null;}
 if(!publicMarkerController)publicMarkerController=window.markerMotion.create({
  predictionSeconds:0,maxPredictionMetres:0,
  canAnimate:at=>{var stamp=Date.parse(canonicalLivePosition?.source_recorded_at);return !document.hidden&&Number.isFinite(stamp)&&at-stamp<=Number(window.appConfig.trackingV2.delayedSeconds||90)*1000&&at-stamp>=-60000;},
  onExpiry:()=>window.publicPresentation?.refresh(),
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
    // Local expiry updates every surface even without a new GPS observation.
    if (typeof updateSmartRouteInformation==='function') updateSmartRouteInformation();
}
setInterval(updateGPSStatus,5000);
