/* Stop artwork consumes the same persisted properties as admin and the list. */
function createStopIcon(properties) {
 return window.stopDesign.icon(typeof properties === 'object' ? properties : {stopNumber:properties});
}

function createPOIIcon(properties) {

    var sticker = window.mapContentSafety.pngSticker(properties && properties.sticker);

    if (sticker) {
        return L.divIcon({
            className: '',
            html: '<div class="poi-sticker-marker"><img src="' + sticker + '" alt=""></div>',
            iconSize: [58,58],
            iconAnchor: [29,29],
            popupAnchor: [0,-32]
        });
    }


    return L.divIcon({

        className: '',

        html:

            '<div class="poi-marker">' +
            '&bull;' +
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
                    window.vehicleIconMarkup() +

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
