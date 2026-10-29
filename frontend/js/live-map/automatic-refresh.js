/* ============================================================
   REALTIME MAP UPDATES
============================================================ */

function subscribeToPublishedChanges() {
    // This project's map_versions table is not in the Realtime publication.
    // Keep the existing visible-page 30-second polling as the CMS sync path.
    // GPS uses its independent current-snapshot Realtime subscription.
    return null;
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
