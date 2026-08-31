/* ============================================================
   STOPS PANEL
============================================================ */

function openStopsPanel() {

    window.stopsPanelPreviousFocus = document.activeElement;


    document
        .getElementById(
            'stops-panel'
        )
        .classList
        .add(
            'open'
        );

    document.getElementById('stops-panel').setAttribute('aria-hidden', 'false');


    document
        .getElementById(
            'panel-backdrop'
        )
        .classList
        .add(
            'visible'
        );


    renderArrivalList();

    window.setTimeout(function() {
        document.getElementById('stops-panel').focus();
    }, 260);

}



function closeStopsPanel() {


    document
        .getElementById(
            'stops-panel'
        )
        .classList
        .remove(
            'open'
        );

    document.getElementById('stops-panel').setAttribute('aria-hidden', 'true');


    document
        .getElementById(
            'panel-backdrop'
        )
        .classList
        .remove(
            'visible'
        );


    setActiveControl(
        null
    );

    if (window.stopsPanelPreviousFocus && window.stopsPanelPreviousFocus.focus) {
        window.stopsPanelPreviousFocus.focus();
    }

}



function renderArrivalList(
    calculatedArrivals
) {


    var container =
        document
        .getElementById(
            'stop-arrivals-list'
        );


    var arrivals =
        calculatedArrivals;


    if (
        !arrivals
        &&
        vanPosition
        &&
        activeRouteFeature
    ) {


        var snapped =
            turf.nearestPointOnLine(

                activeRouteFeature,

                turf.point(
                    [
                        vanPosition.lng,
                        vanPosition.lat
                    ]
                ),

                {
                    units:
                        'kilometers'
                }

            );


        var vanLocationKm =
            Number(
                snapped.properties.location
            );


        var currentLeg =
            detectCurrentOperationalLeg(
                vanLocationKm
            );


        arrivals =
            calculateUpcomingArrivals(
                vanLocationKm,
                currentLeg
            );

    }


    if (
        !arrivals
    ) {


        container.innerHTML =
            '<div style="padding:20px;text-align:center;color:#888">' +
            'Waiting for van GPS...' +
            '</div>';


        return;

    }


    container.innerHTML =
        '';


    var arrivalBySequence =
        {};


    arrivals.forEach(

        function(arrival) {


            arrivalBySequence[
                arrival.sequenceIndex
            ] =
                arrival;

        }

    );


    operationalSequence.forEach(

        function(
            stop,
            index
        ) {


            var p =
                stop.feature
                .properties || {};


            var arrival =
                arrivalBySequence[
                    index
                ];


            var item =
                document
                .createElement(
                    'button'
                );

            item.type = 'button';


            item.className =
                'arrival-item';


            var authoritativeNextStopNumber =
                getExpectedNextStopNumber();


            if (
                (
                    authoritativeNextStopNumber
                    &&
                    String(
                        p.stopNumber
                        ?? ''
                    ).trim()
                    ===
                    String(
                        authoritativeNextStopNumber
                    ).trim()
                )
                ||
                (
                    !authoritativeNextStopNumber
                    &&
                    arrivals.length > 0
                    &&
                    index ===
                    arrivals[0].sequenceIndex
                )
            ) {


                item
                    .classList
                    .add(
                        'next'
                    );

            }


            if (
                currentOperationalLegIndex !==
                null
                &&
                index <=
                currentOperationalLegIndex
            ) {


                item
                    .classList
                    .add(
                        'passed'
                    );

            }


            var order =
                document
                .createElement(
                    'div'
                );


            order.className =
                'arrival-order';


            order.innerText =
                index + 1;


            var info =
                document
                .createElement(
                    'div'
                );


            info.innerHTML =

                '<div class="arrival-name">' +

                escapeHTML(
                    p.name ||
                    'Stop'
                ) +

                '</div>' +

                '<div class="arrival-public-number">' +

                (
                    p.stopNumber
                    ?
                    'Stop ' +
                    escapeHTML(
                        p.stopNumber
                    )
                    :
                    'Sightseeing Stop'
                )

                +

                '</div>';


            var timing =
                document
                .createElement(
                    'div'
                );


            if (arrival) {


                /*
                   Immediate NEXT stop uses eta-engine.
                   Later stops keep the existing local cumulative ETA
                   until multi-stop backend ETA is introduced.
                */
                applyBackendEtaToArrival(
                    arrival
                );


                timing.className =
                    'arrival-time';


                timing.innerHTML =

                    formatETA(
                        arrival.etaMinutes
                    )

                    +

                    '<span class="arrival-distance">' +

                    formatDistance(
                        arrival.distanceKm
                    )

                    +

                    '</span>';

            }


            else {


                timing.className =
                    'arrival-passed';


                timing.innerText =
                    'Passed';

            }


            item.onclick =
                function() {


                    closeStopsPanel();


                    map.setView(

                        L.latLng(

                            stop.feature
                            .geometry
                            .coordinates[1],

                            stop.feature
                            .geometry
                            .coordinates[0]

                        ),

                        16

                    );


                    stop.layer
                        .openPopup();

                };


            item.appendChild(
                order
            );


            item.appendChild(
                info
            );


            item.appendChild(
                timing
            );


            container.appendChild(
                item
            );

        }

    );

}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && document.getElementById('stops-panel').classList.contains('open')) {
        closeStopsPanel();
    }
});



/* ============================================================
   STOP POPUPS
============================================================ */

function updateStopPopups(
    arrivals
) {


    var bestArrivalByStopId =
        {};


    arrivals.forEach(

        function(arrival) {


            var id =
                arrival.stop.id;


            if (!id) {

                return;

            }


            if (
                !bestArrivalByStopId[id]
                ||
                arrival.distanceKm <
                bestArrivalByStopId[id]
                .distanceKm
            ) {


                bestArrivalByStopId[id] =
                    arrival;

            }

        }

    );


    stopRecords.forEach(

        function(record) {


            var p =
                record.feature
                .properties || {};


            var arrival =
                record.id
                ?
                bestArrivalByStopId[
                    record.id
                ]
                :
                null;


            if (arrival) {
                applyBackendEtaToArrival(
                    arrival
                );
            }


            var userDistance =
                null;


            if (
                userPosition
            ) {


                userDistance =
                    turf.distance(

                        turf.point(
                            [
                                userPosition.lng,
                                userPosition.lat
                            ]
                        ),

                        turf.point(
                            record.feature
                            .geometry
                            .coordinates
                        ),

                        {
                            units:
                                'kilometers'
                        }

                    );

            }


            record.layer.bindPopup(

                buildPointPopupHTML(

                    p,

                    arrival
                    ?
                    arrival.distanceKm
                    :
                    null,

                    arrival
                    ?
                    arrival.etaMinutes
                    :
                    null,

                    userDistance

                )

            );

        }

    );

}
