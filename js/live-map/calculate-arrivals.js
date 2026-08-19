/* ============================================================
   ARRIVALS
============================================================ */

function calculateUpcomingArrivals(
    vanLocationKm,
    currentLeg
) {


    var arrivals =
        [];


    if (
        !currentLeg
    ) {

        return arrivals;

    }


    var effectiveSpeed =
        getEffectiveSpeed();


    var cumulativeDistance =
        remainingCurrentLegDistance(

            vanLocationKm,

            currentLeg

        );


    arrivals.push({

        sequenceIndex:
            currentLeg.index + 1,

        stop:
            currentLeg.to,

        distanceKm:
            cumulativeDistance,

        etaMinutes:

            (
                cumulativeDistance /
                effectiveSpeed
            )
            *
            60

    });


    for (
        var i =
            currentLeg.index + 1;

        i <
            operationalLegs.length;

        i++
    ) {


        cumulativeDistance +=
            operationalLegs[i]
            .lengthKm;


        arrivals.push({

            sequenceIndex:
                i + 1,

            stop:
                operationalLegs[i].to,

            distanceKm:
                cumulativeDistance,

            etaMinutes:

                (
                    cumulativeDistance /
                    effectiveSpeed
                )
                *
                60

        });

    }


    return arrivals;

}




/* ============================================================
   PRODUCTION STATUS HELPERS
============================================================ */

function getGPSAgeMs() {

    if (!lastVanGPSReceivedAt) {
        return null;
    }

    return Date.now() - lastVanGPSReceivedAt;
}


function isVanGPSStale() {

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

    if (reason) {

        setRouteStatusBanner(
            reason,
            'error'
        );
    }
}


/* ============================================================
   BACKEND ETA STATE
   public.vehicle_eta_state is produced by eta-engine.
============================================================ */

function getVehicleEtaAgeMs() {

    if (
        !vehicleEtaState
        ||
        !vehicleEtaState.calculated_at
    ) {
        return null;
    }

    var timestamp =
        new Date(
            vehicleEtaState.calculated_at
        ).getTime();

    if (!Number.isFinite(timestamp)) {
        return null;
    }

    return Math.max(
        0,
        Date.now() - timestamp
    );
}


function isVehicleEtaFresh() {

    var age =
        getVehicleEtaAgeMs();

    if (
        age === null
        ||
        age > VEHICLE_ETA_STALE_AFTER_MS
    ) {
        return false;
    }

    if (
        currentPublishedId !== null
        &&
        vehicleEtaState
        &&
        vehicleEtaState.map_version_id !== null
        &&
        vehicleEtaState.map_version_id !== undefined
        &&
        Number(vehicleEtaState.map_version_id) !==
        Number(currentPublishedId)
    ) {
        return false;
    }

    return true;
}


function getFreshVehicleEtaState() {

    return isVehicleEtaFresh()
        ?
        vehicleEtaState
        :
        null;
}


function clearEtaProgressUI() {

    var wrap =
        document.getElementById(
            'eta-progress-wrap'
        );

    if (!wrap) {
        return;
    }

    wrap.classList.remove(
        'visible'
    );

    document
        .getElementById(
            'eta-progress-value'
        )
        .innerText =
        '--';

    document
        .getElementById(
            'eta-progress-bar'
        )
        .style.width =
        '0%';
}


function updateEtaProgressUI(
    etaState
) {

    if (!etaState) {
        clearEtaProgressUI();
        return;
    }

    var progress =
        Number(
            etaState.progress_percent
        );

    if (!Number.isFinite(progress)) {
        clearEtaProgressUI();
        return;
    }

    progress =
        Math.max(
            0,
            Math.min(
                100,
                progress
            )
        );

    document
        .getElementById(
            'eta-progress-wrap'
        )
        .classList
        .add(
            'visible'
        );

    document
        .getElementById(
            'eta-progress-value'
        )
        .innerText =
        Math.round(progress) +
        '%';

    document
        .getElementById(
            'eta-progress-bar'
        )
        .style.width =
        progress +
        '%';
}


function etaStateMatchesStop(
    stopNumber
) {

    var etaState =
        getFreshVehicleEtaState();

    if (
        !etaState
        ||
        stopNumber === null
        ||
        stopNumber === undefined
    ) {
        return false;
    }

    return String(
        etaState.next_stop_number
        ?? ''
    ).trim()
    ===
    String(stopNumber).trim();
}


function applyBackendEtaToArrival(
    arrival
) {

    var etaState =
        getFreshVehicleEtaState();

    if (
        !etaState
        ||
        !arrival
        ||
        !arrival.stop
        ||
        !arrival.stop.feature
    ) {
        return arrival;
    }

    var p =
        arrival.stop
        .feature
        .properties || {};

    if (
        !etaStateMatchesStop(
            p.stopNumber
        )
    ) {
        return arrival;
    }

    var remainingMeters =
        Number(
            etaState.remaining_distance_m
        );

    var etaMinutes =
        Number(
            etaState.eta_minutes
        );

    if (Number.isFinite(remainingMeters)) {
        arrival.distanceKm =
            Math.max(
                0,
                remainingMeters / 1000
            );
    }

    if (Number.isFinite(etaMinutes)) {
        arrival.etaMinutes =
            Math.max(
                0,
                etaMinutes
            );
    }

    arrival.backendEta =
        true;

    arrival.backendConfidence =
        etaState.confidence || null;

    return arrival;
}


async function loadVehicleEtaState() {

    try {

        const {
            data,
            error
        } =
            await supabaseClient
            .from(
                'vehicle_eta_state'
            )
            .select(
                'vehicle_id,from_stop_number,from_stop_name,' +
                'next_stop_number,next_stop_name,' +
                'segment_distance_m,remaining_distance_m,' +
                'progress_percent,live_speed_kmh,estimated_speed_kmh,' +
                'eta_seconds,eta_minutes,eta_source,confidence,' +
                'gps_history_id,map_version_id,calculated_at'
            )
            .eq(
                'vehicle_id',
                VEHICLE_ID
            )
            .maybeSingle();

        if (error) {

            console.error(
                'vehicle_eta_state error:',
                error
            );

            return;
        }

        vehicleEtaState =
            data || null;

        vehicleEtaStateLoaded =
            true;

        syncRouteContextWithBackendState();

        if (
            vanPosition
            &&
            routeContexts.length > 0
        ) {
            updateSmartRouteInformation();
        }

    }
    catch(error) {

        console.error(
            'Unable to load vehicle_eta_state:',
            error
        );
    }
}
