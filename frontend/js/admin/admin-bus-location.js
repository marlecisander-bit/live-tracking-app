(function() {
    let busMarker = null;
    let busPosition = null;
    let requestInFlight = false;

    function showProviderStatus(snapshot, failed) {
        const panel = document.getElementById('gps-provider-status');
        if (!panel || !window.appConfig.providerSelectionEnabled) return;
        const status = window.gpsProviderStatus.describe(snapshot, Date.now(), failed);
        panel.hidden = false;
        panel.dataset.state = status.state;
        setTelemetry('gps-provider-selected', status.selected);
        setTelemetry('gps-provider-signal', status.signal);
        setTelemetry('gps-provider-message', status.message);
        setTelemetry('gps-source-active', status.active);
        if (window.adminVanCard) window.adminVanCard.render(snapshot && snapshot.position, failed);
    }

    function setTelemetry(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value == null || value === '' ? '--' : String(value);
    }

    function showPosition(latitude, longitude, speed, recordedAt, sourceName, telemetry) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
        busPosition = L.latLng(latitude, longitude);
        const map = adminGetMap();
        const icon = busMarker ? null : L.divIcon({ className: '', html: '<div class="admin-bus-marker">' + window.vehicleIconMarkup() + '</div>', iconSize: [44,44], iconAnchor: [22,22] });
        if (!busMarker) busMarker = L.marker(busPosition, { icon: icon, zIndexOffset: 3000 }).addTo(map);
        else busMarker.setLatLng(busPosition);
        window.updateVehicleFacing(busMarker, busPosition, speed, sourceName);

        document.getElementById('gps-speed').textContent = (Number(speed) || 0).toFixed(0) + ' km/h';
        const timestamp = recordedAt ? new Date(recordedAt) : new Date();
        document.getElementById('gps-update').textContent = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleTimeString() : '--';
        document.getElementById('gps-source-active').textContent = sourceName;
        if (window.adminVanCard) window.adminVanCard.render(telemetry || { source_recorded_at: recordedAt });
        return true;
    }

    async function refreshBusLocation() {
        if (document.hidden || !window.app.state.currentUser) return;
        {
            if (requestInFlight) return;
            requestInFlight = true;
            const projectId = window.appConfig.projectId, vehicleId = window.appConfig.vehicleId;
            try {
                const snapshot = await window.selectedTracking.read(window.app.supabase.getClient(), vehicleId);
                if (projectId !== window.appConfig.projectId || vehicleId !== window.appConfig.vehicleId || !window.app.state.currentUser) return;
                const row = snapshot.position;
                if (row) showPosition(Number(row.latitude), Number(row.longitude), row.speed_kmh, row.source_recorded_at,
                    'ScorpionTrack');
                else {
                    if (busMarker) { adminGetMap().removeLayer(busMarker); busMarker = null; }
                    busPosition = null;
                    document.getElementById('gps-source-active').textContent = 'Waiting for selected provider';
                }
                            showProviderStatus(snapshot, false);
            } catch (error) {
                if (projectId === window.appConfig.projectId && vehicleId === window.appConfig.vehicleId && window.app.state.currentUser) showProviderStatus(null, true);
            }
            finally { requestInFlight = false; }
            return;
        }

    }

    document.addEventListener('selectedtrackingchange', function(event) {
        if (window.appConfig.selectedTrackingRealtimeEnabled && event.detail.vehicleId === window.appConfig.vehicleId) refreshBusLocation();
    });

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
        if (window.gpsSource) window.gpsSource.bind(document.getElementById('admin-gps-source'));
        document.addEventListener('visibilitychange', function() {
            refreshBusLocation();
        });
        document.addEventListener('projectchange', function() {
            showProviderStatus({ selection: window.appConfig.projectGpsSource }, false);
            requestInFlight = false;
            busPosition = null;
            if (busMarker) {
                adminGetMap().removeLayer(busMarker);
                busMarker = null;
            }
            refreshBusLocation();
        });
        refreshBusLocation();
        window.setInterval(refreshBusLocation, window.appConfig.gpsUpdateInterval || 5000);
    });
})();
