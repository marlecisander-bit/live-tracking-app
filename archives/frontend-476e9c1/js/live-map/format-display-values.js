/* ============================================================
   FORMATTERS
============================================================ */

// Presentation only. Ranges require explicit bounds; never derive them from confidence.
function formatETA(minutes, options) {
    options = options || {};
    if (options.atStop) return 'At Stop';
    var unavailable = 'ETA calculating\u2026';
    var valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    if (options.confidence === 'LOW') return unavailable;
    if (options.range) {
        var min = options.range.min, max = options.range.max;
        if (!valid(min) || !valid(max) || min > max) return unavailable;
        if (max < 1) return 'Arriving now';
        var low = Math.max(1, Math.round(min)), high = Math.max(1, Math.round(max));
        return '~' + low + (low === high ? '' : '\u2013' + high) + ' min';
    }
    if (!valid(minutes)) return unavailable;
    if (minutes < 1) return 'Arriving now';
    return '~' + Math.round(minutes) + ' min';
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
