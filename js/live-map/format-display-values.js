/* ============================================================
   FORMATTERS
============================================================ */

function formatETA(minutes) {


    if (
        minutes === null
        ||
        !Number.isFinite(
            minutes
        )
    ) {

        return '--';

    }


    if (
        minutes <= 0.6
    ) {

        return 'Arriving now';

    }


    return (
        '~' +
        Math.max(
            1,
            Math.round(
                minutes
            )
        )
        +
        ' min'
    );

}



function formatDistance(km) {


    if (
        km === null
        ||
        !Number.isFinite(
            km
        )
    ) {

        return '--';

    }


    if (
        km < 1
    ) {


        return (

            Math.round(
                km * 1000
            )

            +

            ' m'

        );

    }


    return (

        km.toFixed(1)

        +

        ' km'

    );

}



/* ============================================================
   ROUTE STYLE
============================================================ */

function getDashArray(style) {


    if (
        style === 'dashed'
    ) {

        return '12,8';

    }


    if (
        style === 'dotted'
    ) {

        return '2,8';

    }


    return null;

}
