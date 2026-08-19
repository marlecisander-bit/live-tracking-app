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


        map.fitBounds(

            sightseeingLayers
            .getBounds(),

            {

                paddingTopLeft:
                    [35,150],

                paddingBottomRight:
                    [35,130]

            }

        );

    }


    catch(error) {

        console.log(error);

    }

}
