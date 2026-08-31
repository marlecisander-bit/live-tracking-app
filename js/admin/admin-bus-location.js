(function() {
    let busMarker = null;
    let busPosition = null;
    let requestInFlight = false;
    let pixelPositionChannel = null;

    function setTelemetry(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value == null || value === '' ? '--' : String(value);
    }

    function numberWithUnit(value, decimals, unit) {
        if (value == null || value === '') return '--';
        const number = Number(value);
        return Number.isFinite(number) ? number.toFixed(decimals) + unit : '--';
    }

    function showPixelTelemetry(row) {
        const recordedMs = new Date(row.source_recorded_at).getTime();
        const receivedMs = new Date(row.received_at).getTime();
        setTelemetry('gps-battery', numberWithUnit(row.battery_percent, 0, '%'));
        setTelemetry('gps-quality', row.quality_state);
        setTelemetry('gps-satellites', row.satellites_used);
        setTelemetry('gps-device-id', row.device_id);
        setTelemetry('gps-motion', row.motion_state);
        setTelemetry('gps-latitude', numberWithUnit(row.latitude, 6, ''));
        setTelemetry('gps-longitude', numberWithUnit(row.longitude, 6, ''));
        setTelemetry('gps-accuracy', numberWithUnit(row.accuracy_m, 1, ' m'));
        setTelemetry('gps-vertical-accuracy', numberWithUnit(row.vertical_accuracy_m, 1, ' m'));
        setTelemetry('gps-altitude', numberWithUnit(row.altitude_m, 1, ' m'));
        setTelemetry('gps-bearing', numberWithUnit(row.bearing_deg, 1, '°'));
        setTelemetry('gps-bearing-accuracy', numberWithUnit(row.bearing_accuracy_deg, 1, '°'));
        setTelemetry('gps-derived-course', numberWithUnit(row.derived_course_deg, 1, '°'));
        setTelemetry('gps-heading-source', row.heading_source);
        setTelemetry('gps-speed-accuracy', numberWithUnit(row.speed_accuracy_mps, 1, ' m/s'));
        setTelemetry('gps-power', row.external_power == null ? '--' : (row.external_power ? 'Connected' : 'Battery'));
        setTelemetry('gps-battery-temperature', numberWithUnit(row.battery_temperature_c, 1, ' °C'));
        setTelemetry('gps-thermal', row.thermal_status);
        setTelemetry('gps-provider', row.provider);
        setTelemetry('gps-telemetry-source', row.source);
        setTelemetry('gps-satellites-visible', row.satellites_visible);
        setTelemetry('gps-constellations', row.constellations);
        setTelemetry('gps-frequency-bands', row.frequency_bands);
        setTelemetry('gps-cn0', numberWithUnit(row.cn0_median_dbhz, 1, ' dB-Hz'));
        setTelemetry('gps-fix-rate', numberWithUnit(row.fix_rate_hz, 1, ' Hz'));
        setTelemetry('gps-ttff', numberWithUnit(row.ttff_ms, 0, ' ms'));
        setTelemetry('gps-sequence', row.sequence_number);
        setTelemetry('gps-elapsed-realtime', numberWithUnit(
            row.elapsed_realtime_nanos == null ? null : Number(row.elapsed_realtime_nanos) / 1000000000,
            1,
            ' s'
        ));
        setTelemetry('gps-transport-delay', Number.isFinite(recordedMs) && Number.isFinite(receivedMs)
            ? Math.max(0, (receivedMs - recordedMs) / 1000).toFixed(1) + ' s' : '--');
    }

    function clearPixelTelemetry() {
        ['gps-battery', 'gps-quality', 'gps-satellites', 'gps-device-id', 'gps-motion',
            'gps-latitude', 'gps-longitude', 'gps-accuracy', 'gps-vertical-accuracy',
            'gps-altitude', 'gps-bearing', 'gps-bearing-accuracy', 'gps-derived-course',
            'gps-heading-source', 'gps-speed-accuracy', 'gps-power', 'gps-battery-temperature',
            'gps-thermal', 'gps-provider', 'gps-telemetry-source', 'gps-satellites-visible', 'gps-constellations',
            'gps-frequency-bands', 'gps-cn0', 'gps-fix-rate', 'gps-ttff', 'gps-sequence',
            'gps-elapsed-realtime', 'gps-transport-delay'].forEach(function(id) { setTelemetry(id, '--'); });
    }

    function showPosition(latitude, longitude, speed, recordedAt, sourceName, telemetry) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
        busPosition = L.latLng(latitude, longitude);
        const map = adminGetMap();
        const icon = L.divIcon({ className: '', html: '<div class="admin-bus-marker">' + window.vehicleIconMarkup() + '</div>', iconSize: [44,44], iconAnchor: [22,22] });
        if (!busMarker) busMarker = L.marker(busPosition, { icon: icon, zIndexOffset: 3000 }).addTo(map);
        else busMarker.setLatLng(busPosition).setIcon(icon);

        document.getElementById('gps-speed').textContent = (Number(speed) || 0).toFixed(0) + ' km/h';
        const timestamp = recordedAt ? new Date(recordedAt) : new Date();
        document.getElementById('gps-update').textContent = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleTimeString() : '--';
        document.getElementById('gps-source-active').textContent = sourceName;
        if (telemetry) showPixelTelemetry(telemetry);
        else clearPixelTelemetry();
        return true;
    }

    function loadScorpionPosition() {
        if (requestInFlight) return;
        requestInFlight = true;
        const callbackName = 'adminScorpionGPS_' + Date.now();
        const script = document.createElement('script');
        const finish = function() {
            requestInFlight = false;
            delete window[callbackName];
            script.remove();
        };
        window[callbackName] = function(data) {
            try {
                const marker = data && data.markers && data.markers[0];
                if (marker) showPosition(Number(marker.lat), Number(marker.lng), marker.viteza, marker.source_recorded_at || marker.timestamp || marker.dataOra, 'ScorpionTrack');
            } finally { finish(); }
        };
        script.src = 'https://track.scorpiontrack.ro/TrackingTool/src/getPosition.ashx?callback=' + encodeURIComponent(callbackName) + '&t=' + encodeURIComponent(window.appConfig.scorpionTrackingToken) + '&format=json&_=' + Date.now();
        script.onerror = finish;
        document.body.appendChild(script);
        window.setTimeout(function() { if (requestInFlight && window[callbackName]) finish(); }, 10000);
    }

    async function loadPixelPosition(allowFallback) {
        if (requestInFlight) return;
        requestInFlight = true;
        let fallbackStarted = false;
        try {
            let query = window.app.supabase.getClient()
                .from('vehicle_positions')
                .select('latitude,longitude,accuracy_m,vertical_accuracy_m,speed_kmh,speed_accuracy_mps,bearing_deg,bearing_accuracy_deg,derived_course_deg,heading_source,altitude_m,battery_percent,external_power,battery_temperature_c,thermal_status,provider,satellites_visible,satellites_used,constellations,frequency_bands,cn0_median_dbhz,fix_rate_hz,ttff_ms,quality_state,motion_state,sequence_number,device_id,source,source_recorded_at,received_at')
                .eq('vehicle_id', window.appConfig.vehicleId);
            if (window.appConfig.projectId) query = query.eq('project_id', window.appConfig.projectId);
            const result = await query.maybeSingle();
            if (result.error) throw result.error;
            const row = result.data;
            const timestamp = row && (row.source_recorded_at || row.received_at);
            const timeMs = timestamp ? new Date(timestamp).getTime() : NaN;
            const fresh = Number.isFinite(timeMs) && Date.now() - timeMs <= (window.appConfig.pixelGpsFreshAfterMs || 30000);
            if (row && (!allowFallback || fresh)) {
                showPosition(Number(row.latitude), Number(row.longitude), row.speed_kmh, timestamp, 'Google Pixel', row);
            } else if (allowFallback) {
                requestInFlight = false;
                fallbackStarted = true;
                loadScorpionPosition();
            } else {
                document.getElementById('gps-source-active').textContent = 'Pixel — waiting for signal';
            }
        } catch (error) {
            if (allowFallback) {
                requestInFlight = false;
                fallbackStarted = true;
                loadScorpionPosition();
            } else {
                document.getElementById('gps-source-active').textContent = 'Pixel unavailable';
            }
        } finally {
            if (!fallbackStarted) requestInFlight = false;
        }
    }

    function refreshBusLocation() {
        const preference = window.gpsSource ? window.gpsSource.get() : 'automatic';
        if (preference === 'scorpion') loadScorpionPosition();
        else loadPixelPosition(preference === 'automatic');
    }

    function subscribeToPixelPosition() {
        const client = window.app.supabase.getClient();
        if (pixelPositionChannel) client.removeChannel(pixelPositionChannel);
        pixelPositionChannel = client.channel('admin-pixel-position-' + window.appConfig.vehicleId)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'vehicle_positions',
                filter: 'vehicle_id=eq.' + window.appConfig.vehicleId
            }, function(payload) {
                const row = payload && payload.new;
                if (!row || (window.appConfig.projectId && row.project_id !== window.appConfig.projectId)) return;
                const preference = window.gpsSource ? window.gpsSource.get() : 'automatic';
                if (preference === 'scorpion') return;
                showPosition(Number(row.latitude), Number(row.longitude), row.speed_kmh,
                    row.source_recorded_at || row.received_at, 'Google Pixel', row);
            }).subscribe();
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
        const deviceDetails = document.getElementById('gps-device-details');
        document.addEventListener('pointerdown', function(event) {
            if (deviceDetails && deviceDetails.open && !deviceDetails.contains(event.target)) {
                deviceDetails.open = false;
            }
        });
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && deviceDetails && deviceDetails.open) {
                deviceDetails.open = false;
                const summary = deviceDetails.querySelector('summary');
                if (summary) summary.focus();
            }
        });
        if (window.gpsSource) window.gpsSource.bind(document.getElementById('admin-gps-source'));
        document.addEventListener('gpssourcechange', function() {
            requestInFlight = false;
            refreshBusLocation();
        });
        document.addEventListener('projectchange', function() {
            requestInFlight = false;
            busPosition = null;
            if (busMarker) {
                adminGetMap().removeLayer(busMarker);
                busMarker = null;
            }
            clearPixelTelemetry();
            subscribeToPixelPosition();
            refreshBusLocation();
        });
        refreshBusLocation();
        subscribeToPixelPosition();
        window.setInterval(refreshBusLocation, window.appConfig.gpsUpdateInterval || 5000);
    });
})();
