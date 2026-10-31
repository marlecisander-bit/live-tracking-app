/* ============================================================
   MAP
============================================================ */

var map =
    L.map(
        'map',
        {
            zoomControl: true
        }
    )
    .setView(
        [42.0683, 19.5126],
        13
    );


var baseTiles = L.tileLayer(

    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

    {

        attribution:
            '&copy; OpenStreetMap contributors'

    }

).addTo(map);

// Retry raster tiles once per offline/online cycle; camera and tracking stay untouched.
(function () {
    var failed = false, disconnected = navigator.onLine === false;
    function tileFailed() { failed = true; }
    function offline() { disconnected = true; }
    function online() {
        if (!disconnected || navigator.onLine === false) return;
        disconnected = false;
        if (!failed || !map.hasLayer(baseTiles)) return;
        failed = false;
        baseTiles.redraw();
    }
    baseTiles.on('tileerror', tileFailed);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    map.once('unload', function () {
        baseTiles.off('tileerror', tileFailed);
        window.removeEventListener('offline', offline);
        window.removeEventListener('online', online);
    });
})();
