/* ============================================================
   SMART INFO
============================================================ */

function operationalStopDetails(stopNumber, fallbackName) {

    if (stopNumber === null || stopNumber === undefined || String(stopNumber).trim() === '') {
        return null;
    }

    var record = findStopRecordByNumber(stopNumber);
    var properties = record && record.feature ? record.feature.properties || {} : {};

    return {
        number: String(properties.stopNumber ?? stopNumber),
        name: properties.name || fallbackName || 'Sightseeing stop',
        record: record
    };
}


function formatOperationalStop(stop) {

    return stop ? stop.number + '. ' + stop.name : '--';
}


/*
   Resolve the card from operational state only. PARKED has first
   priority. ARRIVING is allowed only for the authoritative next
   stop and only inside the 100 m physical GPS radius.
*/
function resolveVehicleOperationalStatus(nextArrival) {

    var backendStateApplies = backendVehicleStateMatchesActiveGps();
    var etaState = getFreshVehicleEtaState();
    var currentStop = operationalStopDetails(
        backendStateApplies && vehicleStopState
            ? vehicleStopState.current_stop_number
            : null,
        backendStateApplies && vehicleStopState
            ? vehicleStopState.current_stop_name
            : null
    );
    var previousStop = operationalStopDetails(
        backendStateApplies && vehicleStopState
            ? vehicleStopState.last_completed_stop_number
            : null,
        backendStateApplies && etaState
            ? etaState.from_stop_name
            : null
    );
    var nextProperties =
        nextArrival && nextArrival.stop && nextArrival.stop.feature
        ? nextArrival.stop.feature.properties || {}
        : {};
    var nextStop = operationalStopDetails(
        nextProperties.stopNumber,
        nextProperties.name || (etaState && etaState.next_stop_name)
    );
    var physicalDistanceToNextKm = null;

    if (vanPosition && nextArrival && nextArrival.stop && nextArrival.stop.feature) {
        physicalDistanceToNextKm = turf.distance(
            turf.point([vanPosition.lng, vanPosition.lat]),
            turf.point(nextArrival.stop.feature.geometry.coordinates),
            { units: 'kilometers' }
        );
    }

    var state = 'unknown';
    var stopStateReady = backendStateApplies && vehicleStopStateLoaded && vehicleStopState;

    if (currentStop) {
        state = 'parked';
    }
    else if (
        stopStateReady
        &&
        !isVanGPSStale()
        &&
        nextStop
        &&
        physicalDistanceToNextKm !== null
        &&
        physicalDistanceToNextKm <= 0.100
    ) {
        state = 'arriving';
    }
    else if (previousStop && nextStop) {
        state = 'en_route';
    }

    return {
        state: state,
        currentStop: currentStop,
        previousStop: previousStop,
        nextStop: nextStop,
        physicalDistanceToNextKm: physicalDistanceToNextKm,
        etaMinutes: nextArrival ? nextArrival.etaMinutes : null,
        remainingDistanceKm: nextArrival ? nextArrival.distanceKm : null
    };
}


function renderVehicleOperationalStatus(status) {

    var card = document.getElementById('next-card');
    var stateLabel = document.getElementById('next-label');
    var messageLabel = document.getElementById('van-message-label');
    var mainMessage = document.getElementById('van-movement-status');
    var destinationLabel = document.getElementById('next-destination-label');
    var destination = document.getElementById('next-stop-name');

    card.classList.remove('parked', 'en-route', 'arriving', 'unknown');
    card.classList.add(status.state.replace('_', '-'));

    if (status.state === 'parked') {
        stateLabel.innerText = 'AT STOP';
        messageLabel.innerText = 'Van parked at';
        mainMessage.innerText = formatOperationalStop(status.currentStop);
        destinationLabel.innerText = 'Next';
    }
    else if (status.state === 'arriving') {
        stateLabel.innerText = 'ARRIVING';
        messageLabel.innerText = 'Van arriving at';
        mainMessage.innerText = formatOperationalStop(status.nextStop);
        destinationLabel.innerText = 'Going to';
    }
    else if (status.state === 'en_route') {
        stateLabel.innerText = 'EN ROUTE';
        messageLabel.innerText = 'Van departed from';
        mainMessage.innerText = formatOperationalStop(status.previousStop);
        destinationLabel.innerText = 'Going to';
    }
    else {
        stateLabel.innerText = 'VAN STATUS';
        messageLabel.innerText = 'Live vehicle';
        mainMessage.innerText = 'Calculating route position...';
        destinationLabel.innerText = 'Next stop';
    }

    destination.innerText = formatOperationalStop(status.nextStop);
    document.getElementById('eta-value').innerText = formatETA(status.etaMinutes);
    document.getElementById('next-stop-distance').innerText = formatDistance(
        status.state === 'arriving'
        ? status.physicalDistanceToNextKm
        : status.remainingDistanceKm
    );
}


function renderVehicleLoadingStatus(message) {

    document.getElementById('next-card').className = 'unknown';
    document.getElementById('next-label').innerText = 'VAN STATUS';
    document.getElementById('van-message-label').innerText = 'Live vehicle';
    document.getElementById('van-movement-status').innerText = message;
    document.getElementById('next-destination-label').innerText = 'Next stop';
    document.getElementById('next-stop-name').innerText = '--';
    document.getElementById('eta-value').innerText = '--';
    document.getElementById('next-stop-distance').innerText = '--';
}

function updateSmartRouteInformation() {

    if (
        !vanPosition
        ||
        routeContexts.length ===
        0
        ||
        stopRecords.length <
        2
    ) {

        renderVehicleLoadingStatus('Locating sightseeing van...');


        clearEtaProgressUI();


        return;

    }


    /*
       ========================================================
       BACKEND AUTHORITY

       If stop-detector already knows the expected Stop,
       select the route segment whose leg ENDS at that Stop.

       Example:
       expected_next_stop_number = 2
       -> use operational leg 1 -> 2

       Passing close to Stop 4 cannot change Next Stop.
       ========================================================
    */

    updateRouteCycleResetFromVanPosition();


    var expectedStopNumber =
        getExpectedNextStopNumber();


    var backendLegMatch =
        null;


    if (
        expectedStopNumber
    ) {

        backendLegMatch =
            syncRouteContextWithBackendState(expectedStopNumber);

    }


    /*
       If backend is still bootstrapping, retain the existing
       geometric multi-route selection as a safe fallback.
    */

    if (
        !backendLegMatch
    ) {

        selectBestRouteContextForVan();

    }


    if (
        !activeRouteFeature
        ||
        operationalSequence.length <
        2
        ||
        operationalLegs.length ===
        0
    ) {

        renderVehicleLoadingStatus('Waiting for route data...');


        return;

    }


    var vanPoint =
        turf.point([
            vanPosition.lng,
            vanPosition.lat
        ]);


    var snapped =
        turf.nearestPointOnLine(

            activeRouteFeature,

            vanPoint,

            {
                units:
                    'kilometers'
            }

        );


    var offRouteDistanceKm =
        turf.distance(

            vanPoint,

            snapped,

            {
                units:
                    'kilometers'
            }

        );


    if (
        offRouteDistanceKm >
        OFF_ROUTE_WARNING_KM
    ) {

        offRouteStreak++;

    }
    else {

        offRouteStreak =
            0;

    }


    if (
        isVanGPSStale()
    ) {

        setETAUnavailable(
            'Van location is delayed. Live ETA is temporarily unavailable.'
        );

    }

    else if (
        offRouteStreak >=
        OFF_ROUTE_CONFIRM_READINGS
    ) {

        setETAUnavailable(
            'Updating route… ETA will resume automatically.'
        );

    }

    else {

        setRouteStatusBanner(
            '',
            ''
        );

    }


    var vanLocationKm =
        Number(
            snapped
            .properties
            .location
        );


    var currentLeg =
        null;


    /*
       Backend leg has first priority.
    */

    if (
        backendLegMatch
        &&
        backendLegMatch.leg
    ) {

        currentLeg =
            backendLegMatch.leg;


        currentOperationalLegIndex =
            currentLeg.index;

    }


    /*
       Geometric fallback only while backend has no expected Stop.
    */

    if (
        !currentLeg
    ) {

        currentLeg =
            detectCurrentOperationalLeg(
                vanLocationKm
            );

    }


    if (
        !currentLeg
    ) {

        renderVehicleLoadingStatus('Calculating route position...');


        return;

    }


    var arrivals =
        calculateUpcomingArrivals(

            vanLocationKm,

            currentLeg

        );


    if (
        !arrivals
        ||
        arrivals.length ===
        0
    ) {

        return;

    }


    /*
       ========================================================
       NEXT STOP RESOLUTION

       When backend state is available, the expected public
       Stop number is authoritative.
       ========================================================
    */

    var next =
        null;


    if (
        expectedStopNumber
    ) {

        for (
            var i = 0;
            i < arrivals.length;
            i++
        ) {

            var candidate =
                arrivals[i];


            if (
                !candidate
                ||
                !candidate.stop
                ||
                !candidate.stop.feature
            ) {

                continue;

            }


            var cp =
                candidate.stop
                .feature
                .properties || {};


            if (
                String(
                    cp.stopNumber
                    ?? ''
                ).trim()
                ===
                String(
                    expectedStopNumber
                ).trim()
            ) {

                next =
                    candidate;


                break;

            }

        }

    }


    /*
       Defensive fallback:
       if an unusual route configuration means the expected
       Stop is not in calculated arrivals, calculate against the
       backend-selected leg directly.
    */

    if (
        !next
        &&
        backendLegMatch
        &&
        backendLegMatch.leg
    ) {

        var fallbackLeg =
            backendLegMatch.leg;


        var remainingDistance =
            remainingCurrentLegDistance(

                vanLocationKm,

                fallbackLeg

            );


        var effectiveSpeed =
            getEffectiveSpeed();


        next = {

            sequenceIndex:
                fallbackLeg.index + 1,

            stop:
                fallbackLeg.to,

            distanceKm:
                Math.max(
                    0,
                    remainingDistance
                ),

            etaMinutes:
                effectiveSpeed > 0
                ?
                (
                    Math.max(
                        0,
                        remainingDistance
                    )
                    /
                    effectiveSpeed
                )
                *
                60
                :
                null

        };

    }


    /*
       Final fallback while stop-detector is bootstrapping.
    */

    if (!next) {

        next =
            arrivals[0];

    }


    if (
        !next
        ||
        !next.stop
        ||
        !next.stop.feature
    ) {

        return;

    }


    /*
       Fresh backend ETA overrides the local speed-based estimate
       for the immediate next stop only.
    */
    applyBackendEtaToArrival(
        next
    );


    var operationalStatus =
        resolveVehicleOperationalStatus(next);


    if (operationalStatus.state === 'arriving') {
        operationalStatus.etaMinutes = 0;
    }


    renderVehicleOperationalStatus(operationalStatus);


    if (
        isVanGPSStale()
        ||
        offRouteStreak >= OFF_ROUTE_CONFIRM_READINGS
    ) {
        document.getElementById('eta-value').innerText = '--';
    }


    updateEtaProgressUI(
        getFreshVehicleEtaState()
    );


    document
        .getElementById(
            'next-direction'
        )
        .innerText =

        operationalStatus.state === 'parked'
        ?
        'Parked'
        :
        routeProperties.directionMode ===
        'twoway'
        ?
        (
            currentLeg.direction >=
            0
            ?
            'Outbound'
            :
            'Return'
        )
        :
        'Route';


    /*
       Keep the existing Stops panel / popups / nearest tourist
       stop logic intact.
    */

    renderArrivalList(
        arrivals
    );


    updateStopPopups(
        arrivals
    );


    updateNearestStopCard();

}
