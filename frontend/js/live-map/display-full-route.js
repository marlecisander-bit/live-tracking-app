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
        let rightPadding=24;
        let bottomPadding = 24;
        if (document.getElementById('app').hasAttribute('data-presentation')) {
            const bounds = document.getElementById('map').getBoundingClientRect();
            const status = document.getElementById('next-card').getBoundingClientRect();
            const controls = document.getElementById('map-controls').getBoundingClientRect();
            // Keep route endpoints clear of the floating tools; geometry is unchanged.
            if(bounds.width<768&&bounds.height>480)topPadding=Math.max(24,Math.ceil(status.bottom-bounds.top+68));else rightPadding=Math.min(Math.ceil(status.width+116),bounds.width-120);
            bottomPadding = Math.max(24, Math.ceil(bounds.bottom - controls.top + 64));
        }


        map.fitBounds(

            sightseeingLayers
            .getBounds(),

            {

                paddingTopLeft:
                    [24,topPadding],

                paddingBottomRight:
                    [rightPadding,bottomPadding]

            }

        );

    }


    catch(error) {

        console.log(error);

    }

}
