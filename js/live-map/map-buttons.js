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

                button.setAttribute('aria-pressed', 'false');

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

        document.getElementById(buttonId).setAttribute('aria-pressed', 'true');

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

function toggleStatusCard() {
    var card = document.getElementById('next-card');
    var button = document.getElementById('status-card-toggle');
    if (!card || !button) return;

    var expanded = card.classList.toggle('expanded');
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute(
        'aria-label',
        expanded ? 'Show less vehicle information' : 'Show more vehicle information'
    );
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
