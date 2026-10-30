/* ============================================================
   LOAD PUBLISHED MAP
============================================================ */

var publishedMapRequestInFlight = false;
async function loadPublishedMap(showUpdateMessage = false) {
    if (publishedMapRequestInFlight || document.hidden) return;
    publishedMapRequestInFlight = true;
    try {
        let query = supabaseClient.from('map_versions')
            .select('id,published_at,created_at').eq('status', 'published');
        if (window.PROJECT_ID) query = query.eq('project_id', window.PROJECT_ID);
        const latest = await query.order('published_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        if (latest.error) throw latest.error;
        if (!latest.data) { showToast('No published map'); return; }
        if (currentPublishedId !== null && String(latest.data.id) === String(currentPublishedId)) return;
        let contentQuery = supabaseClient.from('map_versions').select('id,map_data,published_at,created_at')
            .eq('id', latest.data.id).eq('status', 'published');
        if (window.PROJECT_ID) contentQuery = contentQuery.eq('project_id', window.PROJECT_ID);
        const result = await contentQuery.maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return;
        renderPublishedMap(result.data.map_data);
        currentPublishedId = result.data.id;
        currentPublishedDate = result.data.published_at || result.data.created_at;
        // Rendering can finish after the snapshot arrived. Reconcile only once the map identity is installed.
        updateSmartRouteInformation();
        if (showUpdateMessage && !firstMapLoad) showToast('Map updated');
        firstMapLoad = false;
    } catch (error) {
        console.error('Published map load failed', error);
        showToast('Map data unavailable');
    } finally {
        publishedMapRequestInFlight = false;
        hideMapLoading();
    }
}

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
                                        p
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



    updateNearestStopCard();


    if (firstMapLoad && followVan) {
        // The route and first GPS snapshot load independently. A late route
        // response must not zoom out after the van has already been centered.
        if (vanPosition) {
            map.setView(vanPosition, VAN_FOLLOW_ZOOM, { animate: false });
        } else {
            showFullRoute(); // Temporary overview until the first position arrives.
        }
    }

}
