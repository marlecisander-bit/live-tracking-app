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

    async function loadAnalytics() {
        document.body.classList.add('analytics-mode');
        analyticsText('analytics-message', 'Loading analytics data...');
        const client = window.app.supabase.getClient();
        const range = document.getElementById('analytics-range').value;
        const fromDate = new Date();
        if (range === 'today') fromDate.setHours(0, 0, 0, 0);
        if (range === '7d') fromDate.setDate(fromDate.getDate() - 7);
        if (range === '30d') fromDate.setDate(fromDate.getDate() - 30);

        function rangeQuery(table) {
            let query = client.from(table).select('*').order('created_at', { ascending: false }).limit(1000);
            if (range !== 'all') query = query.gte('created_at', fromDate.toISOString());
            return query;
        }

        const results = await Promise.all([rangeQuery('vehicle_positions'), rangeQuery('stop_events'), rangeQuery('segment_runs')]);
        const positions = results[0].data || [], events = results[1].data || [], segments = results[2].data || [];
        analyticsText('analytics-gps-records', String(positions.length));
        analyticsText('analytics-arrivals', String(events.filter(function(e) { return e.event_type === 'arrival'; }).length));
        analyticsText('analytics-departures', String(events.filter(function(e) { return e.event_type === 'departure'; }).length));

        const speeds = positions.map(function(p) { return Number(p.speed || p.speed_kmh); }).filter(Number.isFinite);
        const moving = speeds.filter(function(speed) { return speed > 2; });
        analyticsText('analytics-current-speed', speeds.length ? speeds[0].toFixed(0) : '--');
        analyticsText('analytics-avg-speed', moving.length ? (moving.reduce(function(a,b) { return a+b; },0) / moving.length).toFixed(1) + ' km/h' : '--');
        analyticsText('analytics-max-speed', speeds.length ? Math.max.apply(null, speeds).toFixed(1) + ' km/h' : '--');
        analyticsText('analytics-gps-health', positions.length ? 'Good' : 'No data');
        analyticsText('analytics-message', results.some(function(r) { return r.error; }) ? 'Some analytics tables are unavailable; available data is shown.' : 'Analytics updated.');

        const eventBody = document.getElementById('analytics-events-body');
        eventBody.innerHTML = '';
        events.slice(0, 50).forEach(function(event) {
            const row = document.createElement('tr');
            [event.stop_name || event.stop_id || '--', event.event_type || '--', new Date(event.created_at).toLocaleString()].forEach(function(value) {
                const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
            });
            eventBody.appendChild(row);
        });
        document.getElementById('analytics-events-empty').style.display = events.length ? 'none' : 'block';

        const segmentBody = document.getElementById('analytics-segment-body');
        segmentBody.innerHTML = '';
        segments.slice(0, 50).forEach(function(segment) {
            const row = document.createElement('tr');
            [segment.segment_name || segment.segment_id || '--', segment.run_count || 1, segment.average_time || '--', segment.average_speed || '--', segment.stopped_time || '--'].forEach(function(value) {
                const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
            });
            segmentBody.appendChild(row);
        });
        analyticsText('analytics-segment-count', segments.length + ' segments');
        document.getElementById('analytics-segment-empty').style.display = segments.length ? 'none' : 'block';
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
