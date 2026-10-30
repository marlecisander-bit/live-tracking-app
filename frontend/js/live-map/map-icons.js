/* Stop artwork consumes the same persisted properties as admin and the list. */
function createStopIcon(properties) {
 const p=typeof properties==='object'?properties:{stopNumber:properties},appearance=window.stopDesign.resolve(p),safe=window.mapContentSafety.escape;
 const rgb=appearance.color.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));
 const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],ink=luminance>.179?'#000':'#fff';
 return L.divIcon({className:'tourist-stop-icon',html:'<div class="stop-pin-origin" style="--stop-color:'+appearance.color+';--pin-ink:'+ink+'"><svg class="stop-leader" viewBox="-64 -64 176 192" aria-hidden="true"><line x1="24" y1="48" x2="24" y2="48"/></svg><div class="numbered-stop"><span class="stop-pin"><span>'+safe(p.stopNumber)+'</span></span><span class="stop-name-pill">'+safe(p.name)+'</span></div></div>',iconSize:[48,64],iconAnchor:[24,48],popupAnchor:[0,-49]});
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
