/* ============================================================
   SPEED
============================================================ */

function recordSpeed(speed) {


    var value =
        Number(speed);


    if (
        !Number.isFinite(value)
        ||
        value < 0
        ||
        value > 80
    ) {

        return;

    }


    speedHistory.push(
        value
    );


    if (
        speedHistory.length >
        MAX_SPEED_SAMPLES
    ) {

        speedHistory.shift();

    }

}



function getEffectiveSpeed() {


    if (
        speedHistory.length < 4
    ) {

        return DEFAULT_SERVICE_SPEED_KMH;

    }


    var useful =
        speedHistory.filter(

            function(speed) {

                return speed > 2;

            }

        );


    if (
        useful.length < 3
    ) {

        return DEFAULT_SERVICE_SPEED_KMH;

    }


    var total =
        useful.reduce(

            function(sum,value) {

                return sum + value;

            },

            0

        );


    var average =
        total /
        useful.length;


    /* A few low-speed readings after leaving a stop must not turn into the
       assumed pace for the whole remaining route. Use the configured tour
       service speed as the conservative planning floor. */
    return Math.max(
        DEFAULT_SERVICE_SPEED_KMH,
        Math.min(
            35,
            average
        )
    );

}



function getArrivalPlanningSpeed() {

    var etaState =
        typeof getFreshVehicleEtaState === 'function'
            ? getFreshVehicleEtaState()
            : null;


    if (etaState) {

        var remainingKm =
            Number(etaState.remaining_distance_m) /
            1000;


        var etaMinutes =
            Number(etaState.eta_minutes);


        if (
            Number.isFinite(remainingKm)
            &&
            remainingKm > 0.05
            &&
            Number.isFinite(etaMinutes)
            &&
            etaMinutes > 0.25
        ) {

            var routePaceSpeed =
                remainingKm /
                (etaMinutes / 60);


            if (
                Number.isFinite(routePaceSpeed)
                &&
                routePaceSpeed >= 8
                &&
                routePaceSpeed <= 35
            ) {

                return routePaceSpeed;

            }

        }


        var estimatedSpeed =
            Number(etaState.estimated_speed_kmh);


        if (
            Number.isFinite(estimatedSpeed)
            &&
            estimatedSpeed >= 8
            &&
            estimatedSpeed <= 35
        ) {

            return estimatedSpeed;

        }

    }


    return getEffectiveSpeed();

}



/* ============================================================
   ANGLES
============================================================ */

function normalizeAngle(angle) {


    return (
        (
            angle % 360
        )
        +
        360
    )
    % 360;

}



function angleDifference(
    a,
    b
) {


    var diff =
        Math.abs(

            normalizeAngle(a)
            -
            normalizeAngle(b)

        );


    return Math.min(
        diff,
        360 - diff
    );

}



/* ============================================================
   ROUTE BEARING
============================================================ */

function getRouteBearingAt(
    locationKm
) {


    if (
        !activeRouteFeature
        ||
        routeLengthKm <= 0
    ) {

        return null;

    }


    var before =
        Math.max(
            0,
            locationKm - 0.03
        );


    var after =
        Math.min(
            routeLengthKm,
            locationKm + 0.03
        );


    if (
        after <= before
    ) {

        return null;

    }


    var p1 =
        turf.along(

            activeRouteFeature,

            before,

            {
                units:
                    'kilometers'
            }

        );


    var p2 =
        turf.along(

            activeRouteFeature,

            after,

            {
                units:
                    'kilometers'
            }

        );


    return normalizeAngle(

        turf.bearing(
            p1,
            p2
        )

    );

}



/* ============================================================
   LEG DETECTION
============================================================ */

function locationWithinLeg(
    vanLocationKm,
    leg
) {


    var a =
        leg.from.locationKm;


    var b =
        leg.to.locationKm;


    var tolerance =
        0.12;


    if (
        routeProperties.directionMode ===
        'twoway'
    ) {


        var low =
            Math.min(
                a,b
            )
            -
            tolerance;


        var high =
            Math.max(
                a,b
            )
            +
            tolerance;


        return (
            vanLocationKm >= low
            &&
            vanLocationKm <= high
        );

    }


    if (
        b >= a
    ) {


        return (
            vanLocationKm >=
            a - tolerance
            &&
            vanLocationKm <=
            b + tolerance
        );

    }


    return (
        vanLocationKm >=
        a - tolerance
        ||
        vanLocationKm <=
        b + tolerance
    );

}



function detectCurrentOperationalLeg(
    vanLocationKm,
    vanPoint
) {


    if (
        operationalLegs.length === 0
    ) {

        return null;

    }


    var routeBearing =
        getRouteBearingAt(
            vanLocationKm
        );


    var best =
        null;


    var bestScore =
        Infinity;


    operationalLegs.forEach(

        function(leg) {

            var legProjection = vanPoint
                ? projectVanPointOntoLeg(vanPoint, leg)
                : null;
            var positionMatch = legProjection
                ? legProjection.distanceKm <= OFF_ROUTE_WARNING_KM
                : locationWithinLeg(vanLocationKm, leg);
            var score = legProjection
                ? legProjection.distanceKm * 1000
                : (positionMatch ? 0 : 500);

            if (!positionMatch) {
                score += 500;
            }


            if (
                routeBearing !== null
                &&
                vanHeading !== null
            ) {


                var expected = legProjection
                    ? getRouteBearingAt(legProjection.locationKm)
                    : routeBearing;


                if (
                    leg.direction < 0
                ) {


                    expected =
                        normalizeAngle(
                            expected + 180
                        );

                }


                if (expected !== null) {
                    score +=
                        angleDifference(
                            vanHeading,
                            expected
                        );
                }

            }


            if (
                currentOperationalLegIndex !==
                null
                &&
                leg.index ===
                currentOperationalLegIndex
            ) {


                score -=
                    18;

            }


            if (
                score <
                bestScore
            ) {


                bestScore =
                    score;


                best =
                    leg;

            }

        }

    );


    if (best) {


        currentOperationalLegIndex =
            best.index;

    }


    return best;

}


/* Project a GPS point onto one specific operational leg. This disambiguates
   roads used in both directions, where a whole-route nearest-point search can
   otherwise return the outbound occurrence while the van is returning. */
function projectVanPointOntoLeg(vanPoint, leg) {
    if (!activeRouteFeature || !vanPoint || !leg) {
        return null;
    }

    var startKm = Math.min(leg.from.locationKm, leg.to.locationKm);
    var endKm = Math.max(leg.from.locationKm, leg.to.locationKm);

    if (!Number.isFinite(startKm) || !Number.isFinite(endKm) || endKm <= startKm) {
        return null;
    }

    var legLine = turf.lineSliceAlong(
        activeRouteFeature,
        startKm,
        endKm,
        { units: 'kilometers' }
    );
    var snapped = turf.nearestPointOnLine(
        legLine,
        vanPoint,
        { units: 'kilometers' }
    );

    return {
        locationKm: startKm + Number(snapped.properties.location),
        distanceKm: turf.distance(
            vanPoint,
            snapped,
            { units: 'kilometers' }
        )
    };
}



/* ============================================================
   DISTANCE
============================================================ */

function remainingCurrentLegDistance(
    vanLocationKm,
    leg
) {


    var distance =
        0;


    if (
        routeProperties.directionMode ===
        'twoway'
    ) {


        if (
            leg.direction >= 0
        ) {


            distance =
                leg.to.locationKm -
                vanLocationKm;

        }


        else {


            distance =
                vanLocationKm -
                leg.to.locationKm;

        }


        distance =
            Math.max(
                0,
                distance
            );

    }


    else {


        distance =
            leg.to.locationKm -
            vanLocationKm;


        if (
            distance < 0
        ) {


            distance +=
                routeLengthKm;

        }

    }


    return distance;

}
