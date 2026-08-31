/* ============================================================
   LOAD PUBLISHED MAP
============================================================ */

async function loadPublishedMap(
    showUpdateMessage = false
) {


    var mapQuery = supabaseClient

        .from(
            'map_versions'
        )

        .select(
            'id,map_data,published_at,created_at'
        )

        .eq(
            'status',
            'published'
        )

        ;
    if (window.PROJECT_ID) mapQuery = mapQuery.eq('project_id', window.PROJECT_ID);
    const { data, error } = await mapQuery.order(
            'published_at',
            {
                ascending: false,
                nullsFirst: false
            }
        )

        .limit(1)

        .maybeSingle();



    if (error) {


        console.error(
            error
        );


        hideMapLoading();


        showToast(
            'Map data unavailable'
        );


        return;
    }



    if (!data) {


        hideMapLoading();


        showToast(
            'No published map'
        );


        return;
    }



    if (
        currentPublishedId !== null
        &&
        Number(data.id) ===
        Number(currentPublishedId)
    ) {


        hideMapLoading();


        return;
    }



    currentPublishedId =
        data.id;


    currentPublishedDate =
        data.published_at ||
        data.created_at;


    renderPublishedMap(
        data.map_data
    );


    hideMapLoading();



    if (
        showUpdateMessage
        &&
        !firstMapLoad
    ) {


        showToast(
            'Map updated'
        );

    }


    firstMapLoad =
        false;

}



/* ============================================================
   RENDER MAP
============================================================ */

function renderPublishedMap(data) {


    sightseeingLayers
        .clearLayers();


    activeRouteFeature =
        null;


    routeContexts =
        [];


    activeRouteContext =
        null;


    routeProperties =
        {};


    routeLengthKm =
        0;


    stopRecords =
        [];


    stopById =
        {};


    operationalSequence =
        [];


    operationalLegs =
        [];


    currentOperationalLegIndex =
        null;



    if (
        !data
        ||
        !Array.isArray(
            data.features
        )
    ) {

        return;

    }



    var activeFeatures =

        data.features.filter(

            function(feature) {

                var p =
                    feature.properties || {};

                return p.active !== false;

            }

        );



    /* Route segments are collected after all Stop records have
       been created by Leaflet. This allows every route to keep
       its own Stop Order and its own stop positions. */


    var activeData = {

        type:
            'FeatureCollection',

        features:
            activeFeatures

    };



    var geoLayer =

        L.geoJSON(
            activeData,
            {


                pointToLayer:
                    function(
                        feature,
                        latlng
                    ) {


                        var p =
                            feature.properties ||
                            {};


                        if (
                            p.pointType ===
                            'poi'
                        ) {


                            return L.marker(

                                latlng,

                                {
                                    icon:
                                        createPOIIcon(p)
                                }

                            );

                        }


                        return L.marker(

                            latlng,

                            {
                                icon:
                                    createStopIcon(
                                        p.stopNumber
                                    )
                            }

                        );

                    },



                style:
                    function(feature) {


                        var p =
                            feature.properties ||
                            {};


                        if (
                            feature.geometry
                            &&
                            (
                                feature.geometry.type ===
                                'LineString'
                                ||
                                feature.geometry.type ===
                                'MultiLineString'
                            )
                        ) {


                            return {

                                color:
                                    p.color ||
                                    '#d90000',

                                weight:
                                    Number(
                                        p.weight
                                    ) || 6,

                                opacity:
                                    0.92,

                                dashArray:
                                    getDashArray(
                                        p.lineStyle
                                    ),

                                lineCap:
                                    'round',

                                lineJoin:
                                    'round'

                            };

                        }


                        return {};

                    },



                onEachFeature:
                    function(
                        feature,
                        layer
                    ) {


                        var p =
                            feature.properties ||
                            {};


                        if (
                            feature.geometry
                            &&
                            feature.geometry.type ===
                            'Point'
                        ) {


                            if (
                                p.pointType ===
                                'stop'
                            ) {


                                var record = {

                                    id:
                                        p.objectId ||
                                        null,

                                    feature:
                                        feature,

                                    layer:
                                        layer,

                                    locationKm:
                                        null

                                };


                                stopRecords.push(
                                    record
                                );


                                if (
                                    record.id
                                ) {


                                    stopById[
                                        record.id
                                    ] =
                                        record;

                                }

                            }


                            createPointPopup(
                                layer,
                                p
                            );

                        }

                    }

            }

        );



    geoLayer.eachLayer(

        function(layer) {

            sightseeingLayers
                .addLayer(
                    layer
                );

        }

    );



    buildAllRouteContexts(
        activeFeatures
    );


    if (
        routeContexts.length > 0
    ) {

        activateRouteContext(
            routeContexts[0],
            true
        );

    }


    if (vanPosition) {

        selectBestRouteContextForVan();

    }


    updateSmartRouteInformation();


    /*
       Refresh ETA after a map change so map_version_id validation
       immediately uses the newly published map.
    */
    loadVehicleEtaState();


    updateNearestStopCard();


    if (
        firstMapLoad
    ) {

        showFullRoute();

    }

}
