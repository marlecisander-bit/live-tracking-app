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
