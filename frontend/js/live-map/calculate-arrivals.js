// ETA is calculated once in the operational worker, not by each tourist browser.
function calculateUpcomingArrivals(){
 const op=getNormalizedLiveState();if(!op||op.currentStop!==null||isVanGPSStale())return [];
 const stop=findStopRecordByNumber(op.nextStop);if(!stop)return [];
 return [{stop,sequenceIndex:operationalSequence.findIndex(s=>String(s.feature.properties.stopNumber)===String(op.nextStop)),etaMinutes:op.etaSeconds===null?null:op.etaSeconds/60,distanceKm:op.distanceToNextMetres===null?null:op.distanceToNextMetres/1000}];
}
function applyBackendEtaToArrival(arrival){return arrival;}
function getGPSAgeMs() {

    if (!lastVanGPSReceivedAt) {
        return null;
    }

    return Date.now() - lastVanGPSReceivedAt;
}


function isVanGPSStale() {

    if (typeof canonicalLivePosition !== 'undefined' && canonicalLivePosition && canonicalLivePosition.movement_state && window.trackingState) {
        return ['GPS_DELAYED', 'GPS_OFFLINE'].includes(window.trackingState.classify(canonicalLivePosition));
    }

    var age =
        getGPSAgeMs();

    return (
        age !== null
        &&
        age > GPS_STALE_AFTER_MS
    );
}


function formatGPSAge(ageMs) {

    if (
        ageMs === null
        ||
        !Number.isFinite(ageMs)
    ) {
        return '';
    }

    var seconds =
        Math.max(
            0,
            Math.round(
                ageMs / 1000
            )
        );

    if (seconds < 60) {
        return seconds + 's';
    }

    var minutes =
        Math.round(
            seconds / 60
        );

    return minutes + 'm';
}


function setRouteStatusBanner(
    message,
    type
) {

    var banner =
        document.getElementById(
            'route-status-banner'
        );

    if (
        !message
    ) {

        banner.className =
            '';

        banner.innerText =
            '';

        return;
    }

    banner.className =
        'visible' +
        (
            type
            ?
            ' ' + type
            :
            ''
        );

    banner.innerText =
        message;
}


function setETAUnavailable(
    reason
) {

    document
        .getElementById(
            'eta-value'
        )
        .innerText =
        '--';

    // Clear a prior warning when freshness silently suppresses ETA.
    setRouteStatusBanner(reason || '', reason ? 'error' : '');
    if (window.publicPresentation) window.publicPresentation.refresh();
}


/* ============================================================
   BACKEND ETA STATE
   public.vehicle_eta_state is produced by eta-engine.
============================================================ */

