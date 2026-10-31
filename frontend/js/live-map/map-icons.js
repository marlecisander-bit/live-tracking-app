/* Stop artwork consumes the same persisted properties as admin and the list. */
function createStopIcon(properties) {
 const p=typeof properties==='object'?properties:{stopNumber:properties},appearance=window.stopDesign.resolve(p),safe=window.mapContentSafety.escape;
 return L.divIcon({className:'tourist-stop-icon',html:'<div class="stop-pin-origin" style="--stop-color:'+appearance.color+'"><svg class="stop-leader" viewBox="-64 -64 176 192" aria-hidden="true"><line x1="24" y1="48" x2="24" y2="48"/></svg><div class="photo-stop">'+window.stopDesign.portrait(p,true)+'</div></div>',iconSize:[48,64],iconAnchor:[24,48],popupAnchor:[0,-49]});
}

function createPOIIcon(properties) {




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
