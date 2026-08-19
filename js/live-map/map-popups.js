/* ============================================================
   POINT POPUP
============================================================ */

function createPointPopup(
    layer,
    p
) {


    layer.bindPopup(

        buildPointPopupHTML(

            p,

            null,

            null,

            null

        )

    );

}



function buildPointPopupHTML(
    p,
    routeDistance,
    eta,
    userDistance
) {


    var html =
        '<div style="min-width:220px">';


    if (
        p.pointType ===
        'stop'
    ) {


        html +=

            '<div style="' +

            'font-size:10px;' +

            'font-weight:bold;' +

            'color:#d90000;' +

            'margin-bottom:4px;' +

            '">' +

            'STOP ' +

            escapeHTML(
                p.stopNumber
            ) +

            '</div>';

    }


    html +=

        '<div style="' +

        'font-size:17px;' +

        'font-weight:bold;' +

        '">' +

        escapeHTML(
            p.name
        ) +

        '</div>';


    if (
        p.pointType ===
        'stop'
        &&
        routeDistance !== null
    ) {


        html +=

            '<div style="' +

            'margin-top:10px;' +

            'padding:10px;' +

            'background:#f5f5f5;' +

            'border-radius:8px;' +

            '">' +

            '<strong>Next van</strong>' +

            '<br>' +

            formatETA(
                eta
            )

            +

            ' · '

            +

            formatDistance(
                routeDistance
            )

            +

            '</div>';

    }


    if (
        userDistance !== null
    ) {


        html +=

            '<div style="' +

            'margin-top:8px;' +

            'color:#555;' +

            '">' +

            'You are ' +

            '<strong>' +

            formatDistance(
                userDistance
            ) +

            '</strong>' +

            ' away' +

            '</div>';

    }


    if (
        p.description
    ) {


        html +=

            '<div style="' +

            'margin-top:10px;' +

            'padding-top:10px;' +

            'border-top:1px solid #ddd;' +

            'line-height:1.45;' +

            '">' +

            escapeHTML(
                p.description
            ) +

            '</div>';

    }


    html +=
        '</div>';


    return html;

}
