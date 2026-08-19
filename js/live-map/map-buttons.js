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
   If user manually moves map,
   stop following the van.
*/

map.on(

    'dragstart',

    function() {


        followVan =
            false;


        updateFollowIndicator();


        setActiveControl(
            null
        );

    }

);
