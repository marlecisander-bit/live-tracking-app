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


L.tileLayer(

    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

    {

        attribution:
            '&copy; OpenStreetMap contributors'

    }

).addTo(map);
