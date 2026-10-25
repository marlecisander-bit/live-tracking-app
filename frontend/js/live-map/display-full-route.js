/* ============================================================
   SHOW ROUTE
============================================================ */

function showFullRoute() {


    if (
        sightseeingLayers
        .getLayers()
        .length === 0
    ) {

        return;

    }


    try {

        let topPadding = 24;
        let bottomPadding = 24;
        if (document.getElementById('app').hasAttribute('data-presentation')) {
            const bounds = document.getElementById('map').getBoundingClientRect();
            const status = document.getElementById('next-card').getBoundingClientRect();
            const controls = document.getElementById('map-controls').getBoundingClientRect();
            // Keep route endpoints clear of the floating tools; geometry is unchanged.
            topPadding = Math.max(24, Math.ceil(status.bottom - bounds.top + 20));
            bottomPadding = Math.max(24, Math.ceil(bounds.bottom - controls.top + 20));
        }


        map.fitBounds(

            sightseeingLayers
            .getBounds(),

            {

                paddingTopLeft:
                    [24,topPadding],

                paddingBottomRight:
                    [24,bottomPadding]

            }

        );

    }


    catch(error) {

        console.log(error);

    }

}
