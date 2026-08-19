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

        return 10;

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


    return Math.max(
        8,
        Math.min(
            35,
            average
        )
    );

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
    vanLocationKm
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


            var positionMatch =
                locationWithinLeg(
                    vanLocationKm,
                    leg
                );


            var score =
                positionMatch
                ?
                0
                :
                500;


            if (
                routeBearing !== null
                &&
                vanHeading !== null
            ) {


                var expected =
                    routeBearing;


                if (
                    leg.direction < 0
                ) {


                    expected =
                        normalizeAngle(
                            expected + 180
                        );

                }


                score +=
                    angleDifference(
                        vanHeading,
                        expected
                    );

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
