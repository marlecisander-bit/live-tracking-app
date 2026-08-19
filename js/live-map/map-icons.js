/* ============================================================
   ICONS
============================================================ */

function createStopIcon(number) {


    return L.divIcon({

        className: '',

        html:

            '<div class="stop-marker">' +

            escapeHTML(
                number || 'S'
            ) +

            '</div>',

        iconSize:
            [38,38],

        iconAnchor:
            [19,19],

        popupAnchor:
            [0,-22]

    });

}



function createPOIIcon() {


    return L.divIcon({

        className: '',

        html:

            '<div class="poi-marker">' +
            '•' +
            '</div>',

        iconSize:
            [28,28],

        iconAnchor:
            [14,14],

        popupAnchor:
            [0,-17]

    });

}



function createVanIcon(direction) {


    var heading =
        Number(direction) || 0;


    return L.divIcon({

        className: '',

        html:

            '<div class="van-marker-wrap">' +

                '<div class="van-heading" ' +

                'style="transform:rotate(' +
                heading +
                'deg)">' +

                    '▲' +

                '</div>' +

                '<div class="van-marker-circle">' +

                    '<svg viewBox="0 0 24 24">' +

                        '<path d="' +

                        'M4 7.5 ' +
                        'C4 6.7 4.7 6 5.5 6 ' +
                        'H14.5 ' +
                        'C15.2 6 15.8 6.3 16.2 6.8 ' +
                        'L19.4 10.8 ' +
                        'C19.8 11.3 20 11.9 20 12.5 ' +
                        'V16H18.5' +

                        '"></path>' +

                        '<path d="M4 7.5V16H5.5"></path>' +

                        '<path d="M7.5 16H14.5"></path>' +

                        '<path d="M15.8 7V11H19"></path>' +

                        '<circle cx="7" cy="16.5" r="1.8"></circle>' +

                        '<circle cx="16" cy="16.5" r="1.8"></circle>' +

                    '</svg>' +

                '</div>' +

            '</div>',

        iconSize:
            [54,54],

        iconAnchor:
            [27,27],

        popupAnchor:
            [0,-30]

    });

}



function createUserIcon() {


    return L.divIcon({

        className: '',

        html:

            '<div class="user-location-wrapper">' +

                '<div class="user-location-pulse"></div>' +

                '<div class="user-location-dot"></div>' +

            '</div>',

        iconSize:
            [32,32],

        iconAnchor:
            [16,16],

        popupAnchor:
            [0,-18]

    });

}
