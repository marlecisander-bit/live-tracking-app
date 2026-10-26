// ETA is calculated once in the operational worker, not by each tourist browser.
function calculateUpcomingArrivals(){
 const model=window.publicOperationalStatus;
 if(!model||model.etaConfidence!=='valid'||!model.nextStop)return [];
 const stop=findStopRecordByNumber(model.nextStop.number);if(!stop)return [];
 return [{stop,etaMinutes:model.etaSeconds/60,etaText:model.etaText,distanceKm:null}];
}
function applyBackendEtaToArrival(arrival){return arrival;}
function getGPSAgeMs() {

    if (!lastVanGPSReceivedAt) {
        return null;
    }

    return Date.now() - lastVanGPSReceivedAt;
}


function isVanGPSStale() {
    return window.publicOperationalStatus?.gps !== 'live';
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


// Compatibility hook: all public timing still comes from the shared view model.
function setETAUnavailable(){
    if (window.publicPresentation) window.publicPresentation.refresh();
}
