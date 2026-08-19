/* ============================================================
   SMART INFO
============================================================ */

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

        document
            .getElementById(
                'next-stop-name'
            )
            .innerText =
            'Waiting for route data...';


        document
            .getElementById(
                'eta-value'
            )
            .innerText =
            '--';


        document
            .getElementById(
                'next-stop-distance'
            )
            .innerText =
            '--';


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

    var expectedStopNumber =
        getExpectedNextStopNumber();


    var backendLegMatch =
        null;


    if (
        expectedStopNumber
    ) {

        backendLegMatch =
            syncRouteContextWithBackendState();

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

        document
            .getElementById(
                'next-stop-name'
            )
            .innerText =
            'Waiting for route data...';


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

        document
            .getElementById(
                'next-stop-name'
            )
            .innerText =
            'Calculating route position...';


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


    var p =
        next.stop
        .feature
        .properties || {};


    var physicalDistance =
        turf.distance(

            vanPoint,

            turf.point(
                next.stop
                .feature
                .geometry
                .coordinates
            ),

            {
                units:
                    'kilometers'
            }

        );


    /*
       If the van is physically inside the expected Stop radius,
       display 0 distance / 0 ETA.
    */

    if (
        physicalDistance <=
        STOP_ARRIVAL_RADIUS_KM
    ) {

        next.distanceKm =
            0;


        next.etaMinutes =
            0;

    }


    /*
       Fresh backend ETA overrides the local speed-based estimate
       for the immediate next stop only.
    */
    applyBackendEtaToArrival(
        next
    );


    document
        .getElementById(
            'next-stop-name'
        )
        .innerText =

        (
            p.stopNumber
            ?
            p.stopNumber +
            '. '
            :
            ''
        )

        +

        (
            p.name ||
            'Next Stop'
        );


    document
        .getElementById(
            'next-stop-distance'
        )
        .innerText =
        formatDistance(
            next.distanceKm
        );


    updateEtaProgressUI(
        getFreshVehicleEtaState()
    );


    if (
        !isVanGPSStale()
        &&
        offRouteStreak <
        OFF_ROUTE_CONFIRM_READINGS
    ) {

        document
            .getElementById(
                'eta-value'
            )
            .innerText =
            formatETA(
                next.etaMinutes
            );

    }


    document
        .getElementById(
            'next-direction'
        )
        .innerText =

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
