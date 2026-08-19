(function() {
    let poiResults = [];

    function poiQuery(category, lat, lng, radius) {
        const filters = {
            tourist: '[tourism=attraction]', historic: '[historic]', museums: '[tourism=museum]',
            religious: '[amenity=place_of_worship]', viewpoints: '[tourism=viewpoint]',
            nature: '[leisure=park]', food: '[amenity~"restaurant|cafe"]',
            accommodation: '[tourism~"hotel|hostel|guest_house"]', all: '[tourism]'
        };
        const filter = filters[category] || filters.tourist;
        return '[out:json][timeout:25];(node' + filter + '(around:' + radius + ',' + lat + ',' + lng + ');way' + filter + '(around:' + radius + ',' + lat + ',' + lng + '););out center tags;';
    }

    function renderPoiResults() {
        const container = document.getElementById('poi-manager-results');
        container.innerHTML = '';
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
        const value = firstValue(record, ['created_at', 'recorded_at', 'captured_at', 'timestamp', 'updated_at', 'calculated_at']);
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date : null;
    }

    function filterAndSortByRange(records, range, fromDate) {
        return (records || []).filter(function(record) {
            const date = recordDate(record);
            return range === 'all' || !date || date >= fromDate;
        }).sort(function(a, b) {
            const aDate = recordDate(a), bDate = recordDate(b);
            return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
        });
    }

    function distanceBetween(a, b) {
        const lat1 = Number(firstValue(a, ['latitude', 'lat']));
        const lng1 = Number(firstValue(a, ['longitude', 'lng', 'lon']));
        const lat2 = Number(firstValue(b, ['latitude', 'lat']));
        const lng2 = Number(firstValue(b, ['longitude', 'lng', 'lon']));
        if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
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
            client.from('gps_history').select('*').limit(1000),
            client.from('stop_events').select('*').limit(1000),
            client.from('segment_runs').select('*').limit(1000),
            client.from('vehicle_eta_state').select('*').eq('vehicle_id', vehicleId).maybeSingle(),
            client.from('vehicle_stop_state').select('*').eq('vehicle_id', vehicleId).maybeSingle()
        ]);
        const positions = filterAndSortByRange(results[0].data, range, fromDate);
        const events = filterAndSortByRange(results[1].data, range, fromDate);
        const segments = filterAndSortByRange(results[2].data, range, fromDate);
        const etaState = results[3].data || null;
        const stopState = results[4].data || null;
        analyticsText('analytics-gps-records', String(positions.length));
        const arrivals = events.filter(function(event) { return String(firstValue(event, ['event_type', 'type']) || '').toLowerCase() === 'arrival'; });
        const departures = events.filter(function(event) { return String(firstValue(event, ['event_type', 'type']) || '').toLowerCase() === 'departure'; });
        analyticsText('analytics-arrivals', String(arrivals.length));
        analyticsText('analytics-departures', String(departures.length));

        const speeds = positions.map(function(position) { return Number(firstValue(position, ['speed_kmh', 'speed', 'velocity'])); }).filter(Number.isFinite);
        const moving = speeds.filter(function(speed) { return speed > 2; });
        const currentSpeed = Number(firstValue(etaState, ['live_speed_kmh', 'estimated_speed_kmh']));
        analyticsText('analytics-current-speed', Number.isFinite(currentSpeed) ? currentSpeed.toFixed(0) : (speeds.length ? speeds[0].toFixed(0) : '--'));
        analyticsText('analytics-avg-speed', moving.length ? (moving.reduce(function(a,b) { return a+b; },0) / moving.length).toFixed(1) + ' km/h' : '--');
        analyticsText('analytics-max-speed', speeds.length ? Math.max.apply(null, speeds).toFixed(1) + ' km/h' : '--');
        analyticsText('analytics-gps-health', etaState || stopState || positions.length ? 'Connected' : 'No data');
        analyticsText('analytics-gps-health-sub', etaState && etaState.calculated_at ? 'Last update ' + new Date(etaState.calculated_at).toLocaleString() : 'Waiting for a live update');

        let distance = 0;
        for (let index = 1; index < positions.length; index += 1) distance += distanceBetween(positions[index - 1], positions[index]);
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
        setAdminSection: function(section) {
            const isAnalytics = section === 'analytics';
            document.body.classList.toggle('analytics-mode', isAnalytics);
            document.querySelectorAll('.context-section').forEach(function(panel) {
                panel.classList.toggle('active', panel.getAttribute('data-context-section') === section);
            });
            document.querySelectorAll('.app-nav-button').forEach(function(button) {
                button.classList.toggle('active', button.getAttribute('data-section') === section);
            });
            if (isAnalytics) loadAnalytics();
        },
        loadAnalyticsDashboard: loadAnalytics,
        searchOpenStreetMapPOIs: async function() {
            const map = adminGetMap(), center = map.getCenter();
            const category = document.getElementById('poi-manager-category').value;
            const radius = Number(document.getElementById('poi-manager-radius').value) || 5000;
            const status = document.getElementById('poi-manager-status');
            status.textContent = 'Searching OpenStreetMap...';
            try {
                const response = await fetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST', body: poiQuery(category, center.lat, center.lng, radius)
                });
                if (!response.ok) throw new Error('Search service unavailable');
                const data = await response.json();
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
                status.textContent = poiResults.length ? 'Review the results and import the places you want.' : 'No matching places found.';
                renderPoiResults();
            } catch (error) {
                console.error(error);
                status.textContent = 'POI search failed. Please try again.';
            }
        },
        setAllPOIImportSelections: function(value) {
            poiResults.forEach(function(item) { item.selected = Boolean(value); });
            renderPoiResults();
        },
        clearPOIManagerResults: function() {
            poiResults = [];
            renderPoiResults();
            document.getElementById('poi-manager-status').textContent = '';
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
