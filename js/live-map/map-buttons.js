/* ============================================================
   ACTIVE BUTTON
============================================================ */

function setActiveControl(buttonId) {


    document
        .querySelectorAll(
            '.map-control-btn'
        )
        .forEach(

            function(button) {

                button
                    .classList
                    .remove(
                        'active'
                    );

            }

        );


    if (
        buttonId
    ) {


        document
            .getElementById(
                buttonId
            )
            .classList
            .add(
                'active'
            );

    }

}



/* ============================================================
   CONTROL HANDLERS
============================================================ */

function handleFindMe() {


    followVan =
        false;


    updateFollowIndicator();


    setActiveControl(
        'btn-find-me'
    );


    findUser();

}



function handleFindVan() {


    setActiveControl(
        'btn-find-van'
    );


    followVan =
        true;


    updateFollowIndicator();


    findVan();

}



function handleRoute() {


    followVan =
        false;


    updateFollowIndicator();


    setActiveControl(
        'btn-route'
    );


    showFullRoute();

}



function handleStops() {


    followVan =
        false;


    updateFollowIndicator();


    setActiveControl(
        'btn-stops'
    );


    openStopsPanel();

}



/* ============================================================
   FOLLOW VAN
============================================================ */

function updateFollowIndicator() {


    var indicator =
        document
        .getElementById(
            'follow-indicator'
        );


    indicator.style.display =
        followVan
        ?
        'block'
        :
        'none';

}


/*
   Manual map interaction always gives control back to the visitor.
   The Find Van button can be used at any time to resume following.
*/
function stopFollowingVan() {

    if (
        !followVan
    ) {
        return;
    }

    followVan =
        false;

    updateFollowIndicator();

    setActiveControl(
        null
    );

}



/*
   If user manually moves map,
   stop following the van.
*/

map.on(

    'dragstart',

    function() {

        stopFollowingVan();

    }

);


/*
   A tap, mouse press, or wheel gesture means the visitor wants to
   explore the map manually. Pointer events cover mouse, touch, and pen.
*/
map
    .getContainer()
    .addEventListener(
        'pointerdown',
        stopFollowingVan,
        { passive: true }
    );


map
    .getContainer()
    .addEventListener(
        'wheel',
        stopFollowingVan,
        { passive: true }
    );
