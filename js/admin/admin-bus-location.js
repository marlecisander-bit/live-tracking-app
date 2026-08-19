(function() {
    let busMarker = null;
    let busPosition = null;

    function refreshBusLocation() {
        const callbackName = 'adminScorpionGPS_' + Date.now();
        const script = document.createElement('script');
        window[callbackName] = function(data) {
            try {
                const marker = data && data.markers && data.markers[0];
                if (!marker) return;
                const lat = Number(marker.lat), lng = Number(marker.lng), speed = Number(marker.viteza) || 0;
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                busPosition = L.latLng(lat, lng);
                const map = adminGetMap();
                const icon = L.divIcon({ className: '', html: '<div class="admin-bus-marker">🚐</div>', iconSize: [44,44], iconAnchor: [22,22] });
                if (!busMarker) busMarker = L.marker(busPosition, { icon: icon, zIndexOffset: 3000 }).addTo(map);
                else busMarker.setLatLng(busPosition).setIcon(icon);
                document.getElementById('gps-speed').textContent = speed.toFixed(0) + ' km/h';
                document.getElementById('gps-update').textContent = new Date().toLocaleTimeString();
            } finally {
                delete window[callbackName];
                script.remove();
            }
        };
        script.src = 'https://track.scorpiontrack.ro/TrackingTool/src/getPosition.ashx?callback=' + encodeURIComponent(callbackName) + '&t=' + encodeURIComponent(window.appConfig.scorpionTrackingToken) + '&format=json&_=' + Date.now();
        script.onerror = function() { delete window[callbackName]; script.remove(); };
        document.body.appendChild(script);
    }

    const actions = {
        findVan: function() {
            if (busPosition) adminGetMap().setView(busPosition, 16);
            else {
                refreshBusLocation();
                window.app.helpers.showToast('Refreshing van location...');
            }
        },
        loadVanPosition: refreshBusLocation
    };
    window.app.registerActionGroup('adminBusLocation', actions);

    document.addEventListener('DOMContentLoaded', function() {
        refreshBusLocation();
        window.setInterval(refreshBusLocation, window.appConfig.gpsUpdateInterval || 5000);
    });
})();
