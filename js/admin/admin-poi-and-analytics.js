(function() {
    let poiResults = [];

    function renderPoiResults() {
        const container = document.getElementById('poi-manager-results');
        container.innerHTML = '';
        if (!poiResults.length) {
            const empty = document.createElement('div');
            empty.className = 'poi-manager-empty';
            empty.textContent = 'No POIs to preview.';
            container.appendChild(empty);
        }
        poiResults.forEach(function(item, index) {
            const row = document.createElement('label');
            row.className = 'poi-search-result';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.selected;
            checkbox.addEventListener('change', function() { item.selected = checkbox.checked; updatePoiSelection(); });
            const text = document.createElement('span');
            text.textContent = item.name + (item.type ? ' · ' + item.type : '');
            row.appendChild(checkbox);
            row.appendChild(text);
            container.appendChild(row);
        });
        document.getElementById('poi-manager-result-count').textContent = poiResults.length + ' results';
        updatePoiSelection();
    }

    function setPoiStatus(message, type) {
        const status = document.getElementById('poi-manager-status');
        if (!status) return;
        status.textContent = message || '';
        status.className = message ? 'visible' + (type ? ' ' + type : '') : '';
        status.setAttribute('role', message ? 'status' : '');
        status.setAttribute('aria-live', message ? 'polite' : 'off');
    }

    async function fetchPoiData(category, lat, lng, radius) {
        const supabaseClient = window.app.supabase && window.app.supabase.getClient
            ? window.app.supabase.getClient()
            : null;
        if (!supabaseClient || !supabaseClient.functions) throw new Error('Supabase is not available');

        const result = await supabaseClient.functions.invoke('osm-poi-search', {
            body: { category: category, lat: lat, lng: lng, radius: radius }
        });
        if (!result.error && result.data && !result.data.error) return result.data;

        let message = result.data && result.data.error;
        if (!message && result.error && result.error.context && typeof result.error.context.json === 'function') {
            try {
                const details = await result.error.context.json();
                message = details && details.error;
            } catch (contextError) {
                console.warn('Could not read POI proxy error response:', contextError);
            }
        }
        throw new Error(message || (result.error && result.error.message) || 'Supabase POI function failed');
    }

    function updatePoiSelection() {
        document.getElementById('poi-manager-import-button').disabled = !poiResults.some(function(item) { return item.selected; });
    }

    function analyticsText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function firstValue(record, names) {
        if (!record) return null;
        for (let index = 0; index < names.length; index += 1) {
            const value = record[names[index]];
            if (value !== undefined && value !== null && value !== '') return value;
        }
        return null;
    }

    function recordDate(record) {
        const value = firstValue(record, [
            'source_recorded_at', 'received_at',
            'created_at', 'recorded_at', 'captured_at', 'timestamp',
            'gps_timestamp', 'gps_time', 'gps_recorded_at', 'recorded_time',
            'position_timestamp', 'position_time', 'event_time', 'event_at', 'occurred_at',
            'started_at', 'ended_at', 'updated_at', 'calculated_at'
        ]);
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date : null;
    }

    function belongsToVehicle(record, vehicleId) {
        const recordVehicleId = firstValue(record, ['vehicle_id', 'vehicleId', 'device_id']);
        return !vehicleId || recordVehicleId == null || String(recordVehicleId) === String(vehicleId);
    }

    function filterAndSortByRange(records, range, fromDate, vehicleId) {
        return (records || []).filter(function(record) {
            const date = recordDate(record);
            if (!belongsToVehicle(record, vehicleId)) return false;
            return range === 'all' || (date && date >= fromDate);
        }).sort(function(a, b) {
            const aDate = recordDate(a), bDate = recordDate(b);
            return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
        });
    }

    function coordinates(record) {
        const rawLat = firstValue(record, ['latitude', 'lat']);
        const rawLng = firstValue(record, ['longitude', 'lng', 'lon']);
        if (rawLat == null || rawLng == null) return null;
        const lat = Number(rawLat), lng = Number(rawLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { lat: lat, lng: lng };
    }

    function distanceBetween(a, b) {
        const first = coordinates(a), second = coordinates(b);
        if (!first || !second) return 0;
        const lat1 = first.lat, lng1 = first.lng, lat2 = second.lat, lng2 = second.lng;
        const radians = Math.PI / 180;
        const dLat = (lat2 - lat1) * radians;
        const dLng = (lng2 - lng1) * radians;
        const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    }

    async function loadAnalytics() {
        document.body.classList.add('analytics-mode');
        analyticsText('analytics-message', 'Loading analytics data...');
        const client = window.app.supabase.getClient();
        const range = document.getElementById('analytics-range').value;
        const fromDate = new Date();
        if (range === 'today') fromDate.setHours(0, 0, 0, 0);
        if (range === '7d') fromDate.setDate(fromDate.getDate() - 7);
        if (range === '30d') fromDate.setDate(fromDate.getDate() - 30);

        const vehicleId = window.appConfig && window.appConfig.vehicleId;
        const results = await Promise.all([
            client.from('gps_history').select('*').eq('project_id', window.appConfig.projectId).eq('vehicle_id', vehicleId).order('received_at', { ascending: false }).limit(1000),
            client.from('stop_events').select('*').eq('project_id', window.appConfig.projectId).eq('vehicle_id', vehicleId).order('event_at', { ascending: false }).limit(1000),
            client.from('segment_runs').select('*').eq('project_id', window.appConfig.projectId).limit(1000),
            client.from('vehicle_eta_state').select('*').eq('project_id', window.appConfig.projectId).eq('vehicle_id', vehicleId).maybeSingle(),
            client.from('vehicle_stop_state').select('*').eq('project_id', window.appConfig.projectId).eq('vehicle_id', vehicleId).maybeSingle()
        ]);
        const positions = filterAndSortByRange(results[0].data, range, fromDate, vehicleId)
            .filter(function(position) { return recordDate(position) && coordinates(position); });
        const events = filterAndSortByRange(results[1].data, range, fromDate, vehicleId);
        const segments = filterAndSortByRange(results[2].data, range, fromDate, vehicleId);
        const etaState = results[3].data || null;
        const stopState = results[4].data || null;
        analyticsText('analytics-gps-records', String(positions.length));
        const arrivals = events.filter(function(event) { return String(firstValue(event, ['event_type', 'type', 'event']) || '').toLowerCase().includes('arriv'); });
        const departures = events.filter(function(event) { return String(firstValue(event, ['event_type', 'type', 'event']) || '').toLowerCase().includes('depart'); });
        analyticsText('analytics-arrivals', String(arrivals.length));
        analyticsText('analytics-departures', String(departures.length));

        const speeds = positions.map(function(position) { return Number(firstValue(position, ['speed_kmh', 'speed', 'velocity'])); }).filter(function(speed) {
            return Number.isFinite(speed) && speed >= 0 && speed <= 120;
        });
        const moving = speeds.filter(function(speed) { return speed > 2; });
        const currentSpeed = Number(firstValue(etaState, ['live_speed_kmh', 'estimated_speed_kmh']));
        analyticsText('analytics-current-speed', Number.isFinite(currentSpeed) ? currentSpeed.toFixed(0) : (speeds.length ? speeds[0].toFixed(0) : '--'));
        analyticsText('analytics-avg-speed', moving.length ? (moving.reduce(function(a,b) { return a+b; },0) / moving.length).toFixed(1) + ' km/h' : '--');
        analyticsText('analytics-max-speed', speeds.length ? Math.max.apply(null, speeds).toFixed(1) + ' km/h' : '--');
        analyticsText('analytics-gps-health', etaState || stopState || positions.length ? 'Connected' : 'No data');
        analyticsText('analytics-gps-health-sub', etaState && etaState.calculated_at ? 'Last update ' + new Date(etaState.calculated_at).toLocaleString() : 'Waiting for a live update');

        let distance = 0;
        const chronologicalPositions = positions.slice().reverse();
        for (let index = 1; index < chronologicalPositions.length; index += 1) {
            const previous = chronologicalPositions[index - 1], current = chronologicalPositions[index];
            const elapsedHours = (recordDate(current) - recordDate(previous)) / 3600000;
            const legDistance = distanceBetween(previous, current);
            const impliedSpeed = elapsedHours > 0 ? legDistance / elapsedHours : Infinity;
            // A long telemetry gap or an impossible jump must not become travelled distance.
            if (elapsedHours > 0 && elapsedHours <= 0.25 && impliedSpeed <= 120) distance += legDistance;
        }
        analyticsText('analytics-distance', positions.length > 1 ? distance.toFixed(1) + ' km' : '--');
        const datedPositions = positions.map(recordDate).filter(Boolean);
        const operatingMs = datedPositions.length > 1 ? datedPositions[0] - datedPositions[datedPositions.length - 1] : 0;
        analyticsText('analytics-operating-time', operatingMs > 0 ? (operatingMs / 3600000).toFixed(1) + ' h' : '--');
        const dwellValues = departures.map(function(event) { return Number(firstValue(event, ['dwell_seconds', 'dwell_time_seconds', 'stopped_seconds'])); }).filter(Number.isFinite);
        analyticsText('analytics-dwell', dwellValues.length ? (dwellValues.reduce(function(a, b) { return a + b; }, 0) / dwellValues.length / 60).toFixed(1) + ' min' : '--');

        const stateName = firstValue(stopState, ['current_stop_name', 'candidate_stop_name', 'expected_next_stop_number']);
        const nextName = firstValue(etaState, ['next_stop_name', 'next_stop_number']);
        analyticsText('analytics-live-position', stateName ? 'At or near ' + stateName : (nextName ? 'Travelling to ' + nextName : 'Waiting for vehicle state'));
        const etaMinutes = Number(firstValue(etaState, ['eta_minutes']));
        analyticsText('analytics-live-meta', nextName ? 'Next: ' + nextName + (Number.isFinite(etaMinutes) ? ' · ETA ' + Math.max(0, Math.round(etaMinutes)) + ' min' : '') : '--');

        const errors = results.filter(function(result) { return result.error; });
        if (errors.length) console.warn('Analytics query errors:', errors.map(function(result) { return result.error; }));
        const hasHistory = positions.length || events.length || segments.length;
        analyticsText('analytics-message', errors.length
            ? 'Live data is shown. Some historical analytics are not available to this account.'
            : (hasHistory ? 'Analytics updated.' : 'Live vehicle status is connected. Historical totals will appear after GPS and stop history is recorded.'));

        const eventBody = document.getElementById('analytics-events-body');
        eventBody.innerHTML = '';
        events.slice(0, 50).forEach(function(event) {
            const row = document.createElement('tr');
            const eventDate = recordDate(event);
            [firstValue(event, ['stop_name', 'stop_id', 'stop_number']) || '--', firstValue(event, ['event_type', 'type']) || '--', eventDate ? eventDate.toLocaleString() : '--'].forEach(function(value) {
                const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
            });
            eventBody.appendChild(row);
        });
        document.getElementById('analytics-events-empty').style.display = events.length ? 'none' : 'block';

        const segmentBody = document.getElementById('analytics-segment-body');
        segmentBody.innerHTML = '';
        segments.slice(0, 50).forEach(function(segment) {
            const row = document.createElement('tr');
            [firstValue(segment, ['segment_name', 'segment_id']) || '--', firstValue(segment, ['run_count']) || 1, firstValue(segment, ['average_time', 'duration_seconds']) || '--', firstValue(segment, ['average_speed', 'average_speed_kmh']) || '--', firstValue(segment, ['stopped_time', 'stopped_seconds']) || '--'].forEach(function(value) {
                const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
            });
            segmentBody.appendChild(row);
        });
        if (!segments.length && etaState) {
            const row = document.createElement('tr');
            const segmentName = (etaState.from_stop_name || etaState.from_stop_number || '--') + ' → ' + (etaState.next_stop_name || etaState.next_stop_number || '--');
            [segmentName, 'Live', etaState.eta_minutes != null ? etaState.eta_minutes + ' min ETA' : '--', etaState.live_speed_kmh != null ? etaState.live_speed_kmh + ' km/h' : '--', '--'].forEach(function(value) {
                const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
            });
            segmentBody.appendChild(row);
        }
        analyticsText('analytics-segment-count', segments.length ? segments.length + ' segments' : (etaState ? 'Live segment' : '0 segments'));
        document.getElementById('analytics-segment-empty').style.display = segments.length || etaState ? 'none' : 'block';
    }

    const actions = {
        setAdminSection: function(section, event, element) {
            const workspace = document.getElementById('workspace');
            const target = typeof section === 'string' ? section : 'map';
            const clickedNavigationIcon = Boolean(element && element.classList.contains('app-nav-button'));
            const isAlreadyOpen = target === 'analytics'
                ? document.body.classList.contains('analytics-mode')
                : workspace && workspace.classList.contains('context-open')
                    && workspace.dataset.contextSection === target;
            const shouldClose = clickedNavigationIcon && isAlreadyOpen;

            if (shouldClose) {
                workspace.classList.remove('context-open');
                workspace.dataset.contextSection = '';
                document.body.classList.remove('mobile-context-open', 'analytics-mode');
                document.querySelectorAll('.context-section').forEach(function(panel) {
                    panel.classList.remove('active');
                });
                document.querySelectorAll('.app-nav-button').forEach(function(button) {
                    button.classList.remove('active');
                    button.setAttribute('aria-expanded', 'false');
                });
                window.setTimeout(function() { if (adminGetMap()) adminGetMap().invalidateSize(); }, 0);
                return null;
            }

            const isAnalytics = target === 'analytics';
            document.body.classList.toggle('analytics-mode', isAnalytics);
            document.body.classList.toggle('mobile-context-open', !isAnalytics);
            if (workspace) {
                workspace.classList.toggle('context-open', !isAnalytics);
                workspace.dataset.contextSection = isAnalytics ? '' : target;
            }
            document.querySelectorAll('.context-section').forEach(function(panel) {
                panel.classList.toggle('active', !isAnalytics && panel.getAttribute('data-context-section') === target);
            });
            document.querySelectorAll('.app-nav-button').forEach(function(button) {
                const active = button.getAttribute('data-section') === target;
                button.classList.toggle('active', active);
                button.setAttribute('aria-expanded', String(active));
            });
            const labels = {
                map: ['Map', 'Overview'], stops: ['Stops', 'Manage stops'], routes: ['Route', 'Build route'],
                pois: ['POIs', 'Manage places'], export: ['Export', 'Files and backup']
            };
            const label = labels[target] || [target, ''];
            const heading = document.getElementById('context-panel-heading');
            const subheading = document.getElementById('context-panel-subheading');
            if (heading) heading.textContent = label[0];
            if (subheading) subheading.textContent = label[1];
            if (isAnalytics) loadAnalytics();
            window.setTimeout(function() { if (adminGetMap()) adminGetMap().invalidateSize(); }, 0);
            return target;
        },
        loadAnalyticsDashboard: loadAnalytics,
        searchOpenStreetMapPOIs: async function() {
            const map = adminGetMap(), center = map.getCenter();
            const category = document.getElementById('poi-manager-category').value;
            const radius = Number(document.getElementById('poi-manager-radius').value) || 5000;
            const searchButton = document.getElementById('poi-manager-search-button');
            const location = document.getElementById('poi-manager-location');
            searchButton.disabled = true;
            searchButton.textContent = 'Searching...';
            location.textContent = 'Search center: ' + center.lat.toFixed(5) + ', ' + center.lng.toFixed(5);
            setPoiStatus('Searching OpenStreetMap…', 'warning');
            try {
                const data = await fetchPoiData(category, center.lat, center.lng, radius);
                poiResults = (data.elements || []).map(function(element) {
                    const tags = element.tags || {};
                    return {
                        id: element.type + '-' + element.id,
                        name: tags.name || tags['name:en'] || 'Unnamed place',
                        type: tags.tourism || tags.amenity || tags.historic || tags.leisure || '',
                        lat: element.lat || (element.center && element.center.lat),
                        lng: element.lon || (element.center && element.center.lon),
                        selected: true
                    };
                }).filter(function(item) { return Number.isFinite(item.lat) && Number.isFinite(item.lng); });
                renderPoiResults();
                setPoiStatus(
                    poiResults.length ? poiResults.length + ' POIs found. Review and select the places to import.' : 'No matching places were found in this area.',
                    poiResults.length ? 'ok' : 'warning'
                );
            } catch (error) {
                console.error(error);
                setPoiStatus(
                    error && error.name === 'AbortError'
                        ? 'Both POI search services timed out. Try a smaller radius or search again.'
                        : 'POI search failed' + (error && error.message ? ': ' + error.message : '') + '. Try again shortly.',
                    'error'
                );
            } finally {
                searchButton.disabled = false;
                searchButton.textContent = 'Search POIs';
            }
        },
        setAllPOIImportSelections: function(value) {
            poiResults.forEach(function(item) { item.selected = Boolean(value); });
            renderPoiResults();
        },
        clearPOIManagerResults: function() {
            poiResults = [];
            renderPoiResults();
            setPoiStatus('', '');
        },
        importSelectedOpenStreetMapPOIs: function() {
            poiResults.filter(function(item) { return item.selected; }).forEach(function(item) {
                const layer = L.marker([item.lat, item.lng]);
                layer.feature = { type: 'Feature', properties: {
                    objectId: 'osm-' + item.id, objectType: 'point', pointType: 'poi',
                    name: item.name, category: item.type || 'attraction', active: false, source: 'OpenStreetMap'
                }};
                adminAttachLayer(layer);
            });
            adminMarkChanged();
            adminRefreshLists();
            window.app.helpers.showToast('Selected POIs added as inactive');
            actions.closePOIManager();
        },
        closePOIManager: function() { document.getElementById('poi-manager-modal').style.display = 'none'; }
    };

    window.app.registerActionGroup('adminPoiAnalytics', actions);
})();
