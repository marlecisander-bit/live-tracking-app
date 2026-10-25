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
        if (telemetry) showPixelTelemetry(telemetry);
        else clearPixelTelemetry();
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
                    row.source === 'pixel-android' ? 'Google Pixel' : 'ScorpionTrack');
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
        document.addEventListener('visibilitychange', function() {
            refreshBusLocation();
        });
        document.addEventListener('gpssourcechange', async function(event) {
            requestInFlight = false;
            const project = window.app.projects && window.app.projects.current();
            const source = event && event.detail;
            if (project && ['owner','admin'].includes(project._role) && ['automatic', 'pixel', 'scorpion'].indexOf(source) >= 0) {
                const user = window.app.state && window.app.state.currentUser;
                const result = await window.app.supabase.getClient().from('live_map_settings')
                    .upsert({
                        project_slug: project.slug,
                        gps_source: source,
                        updated_at: new Date().toISOString(),
                        updated_by: user && user.id ? user.id : null
                    }, { onConflict: 'project_slug' });
                if (!result.error) {
                    project.gps_source = source;
                    if (window.appConfig.projectId === project.id) window.appConfig.projectGpsSource = source;
                } else {
                    if (window.appConfig.projectId === project.id) document.getElementById('admin-gps-source').value = project.gps_source || (window.appConfig.providerSelectionEnabled ? '' : window.appConfig.defaultGpsSource);
                    window.app.helpers.showToast('GPS source was not saved. Check your permissions and connection.');
                    console.warn('Unable to save shared GPS source:', result.error);
                }
            }
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
            clearPixelTelemetry();
            refreshBusLocation();
        });
        refreshBusLocation();
        window.setInterval(refreshBusLocation, window.appConfig.gpsUpdateInterval || 5000);
    });
})();
