/* ============================================================
   REALTIME MAP UPDATES
============================================================ */

function subscribeToPublishedChanges() {


    try {


        supabaseClient

            .channel(
                'sightseeing-public-map'
            )

            .on(

                'postgres_changes',

                {

                    event:
                        'INSERT',

                    schema:
                        'public',

                    table:
                        'map_versions',

                    filter:
                        'project_id=eq.' + window.PROJECT_ID

                },

                function(payload) {


                    if (
                        payload.new
                        &&
                        payload.new.status ===
                        'published'
                    ) {


                        loadPublishedMap(
                            true
                        );

                    }

                }

            )

            .subscribe();


    }


    catch(error) {

        console.log(error);

    }

}



function startPublishedMapPolling() {


    setInterval(

        function() {

            if (document.hidden) return;


            loadPublishedMap(
                true
            );

        },

        MAP_CHECK_INTERVAL

    );

}
