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

    let analyticsRequest = 0;
    let analyticsReport = null;
    const model = window.analyticsModel;

    async function readHistory(client, table, timeColumn, projectId, vehicleId, from, until) {
        const rows = [];
        for (let page = 0; page < 100; page++) {
            let query = client.from(table).select('*').eq('project_id', projectId).eq('vehicle_id', vehicleId)
                .lte(timeColumn, until.toISOString()).order(timeColumn, { ascending: true }).order('id', { ascending: true });
            if (from) query = query.gte(timeColumn, from.toISOString());
            const result = await query.range(page * 1000, page * 1000 + 999);
            if (result.error) return { data: [], error: result.error };
            rows.push(...(result.data || []));
            if (!result.data || result.data.length < 1000) return { data: rows };
        }
        return { data: [], error: new Error('This period is too large. Choose a shorter period.') };
    }
    function addRow(body, values) {
        const row = document.createElement('tr');
        values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); });
        body.appendChild(row);
    }
    async function loadAnalytics() {
        document.body.classList.add('analytics-mode');
        const request = ++analyticsRequest;
        analyticsReport = null;
        document.getElementById('analytics-export-button').disabled = true;
        const refresh = document.getElementById('analytics-refresh-button');
        refresh.disabled = true;
        analyticsText('analytics-message', 'Loading your report…');
        document.getElementById('analytics-view').setAttribute('aria-busy', 'true');
        try {
            const client = window.app.supabase.getClient();
            const config = window.appConfig || {};
            const projectId = config.projectId, vehicleId = config.vehicleId;
            if (!projectId || !vehicleId) throw new Error('Choose a project with a vehicle to view its report.');
            const range = document.getElementById('analytics-range').value;
            const until = new Date(), from = new Date(until);
            from.setHours(0, 0, 0, 0);
            if (range === '7d') from.setDate(from.getDate() - 6);
            if (range === '30d') from.setDate(from.getDate() - 29);
            const periodStart = range === 'all' ? null : from;
            const period = (periodStart ? periodStart.toLocaleDateString() : 'All recorded history') + ' – ' + until.toLocaleString();
            analyticsText('analytics-period', period + ' · ' + Intl.DateTimeFormat().resolvedOptions().timeZone + ' (your local time)');
            analyticsText('analytics-vehicle', 'Vehicle: ' + vehicleId);
            const results = await Promise.all([
                readHistory(client, 'gps_history', 'received_at', projectId, vehicleId, periodStart, until),
                readHistory(client, 'stop_events', 'event_at', projectId, vehicleId, periodStart, until),
                client.from('gps_history').select('*').eq('project_id', projectId).eq('vehicle_id', vehicleId).order('received_at', { ascending: false }).limit(1).maybeSingle(),
                client.from('vehicle_eta_state').select('*').eq('project_id', projectId).eq('vehicle_id', vehicleId).maybeSingle(),
                client.from('vehicle_stop_state').select('*').eq('project_id', projectId).eq('vehicle_id', vehicleId).maybeSingle(),
                client.from('map_versions').select('map_data,published_at').eq('project_id', projectId).eq('status', 'published').order('published_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
            ]);
            if (request !== analyticsRequest || projectId !== window.appConfig.projectId || vehicleId !== window.appConfig.vehicleId) return;
            const gps = results[0].data || [], events = results[1].data || [];
            const latest = results[2].data, eta = results[3].data, stop = results[4].data;
            const summary = model.summarize(gps, events, results[5].data);
            const gpsOK = !results[0].error, eventsOK = !results[1].error;
            const latestTime = latest && model.positionTime(latest);
            const age = latestTime == null ? null : (Date.now() - latestTime) / 1000;
            const fresh = age != null && age >= -60 && age <= 180 && !results[2].error;
            analyticsText('analytics-gps-health', results[2].error ? 'Tracking unavailable' : age == null ? 'No location yet' : fresh ? 'Location up to date' : 'Location out of date');
            analyticsText('analytics-gps-health-sub', latestTime == null ? 'Waiting for a vehicle location' : 'Last location: ' + new Date(latestTime).toLocaleString());
            document.getElementById('analytics-live-dot').classList.toggle('stale', !fresh);
            const stopFresh = stop && model.date(stop.updated_at) != null && Math.abs(Date.now() - model.date(stop.updated_at)) <= 180000;
            const etaFresh = eta && model.date(eta.calculated_at) != null && Math.abs(Date.now() - model.date(eta.calculated_at)) <= 180000;
            analyticsText('analytics-live-position', !fresh ? 'Waiting for a fresh vehicle location' : stopFresh && stop.current_stop_name ? 'At ' + stop.current_stop_name : etaFresh && eta.next_stop_name ? 'Travelling to ' + eta.next_stop_name : 'Vehicle location received');
            const etaMinutes = eta && model.number(eta.eta_minutes);
            analyticsText('analytics-live-meta', fresh && etaFresh && eta.next_stop_name ? 'Next: ' + eta.next_stop_name + (etaMinutes != null ? ' · Estimated arrival in ' + Math.max(0, Math.round(etaMinutes)) + ' min' : '') : 'See the map for the last recorded location.');
            const speed = latest && model.number(latest.speed_kmh);
            analyticsText('analytics-current-speed', fresh && speed != null && speed >= 0 && speed <= 120 ? Math.round(speed) : '—');
            analyticsText('analytics-tours', eventsOK && !results[5].error && summary.tourCount != null ? summary.tourCount : '—');
            analyticsText('analytics-tour-time', eventsOK ? model.duration(summary.tourSeconds) : '—');
            analyticsText('analytics-driving', gpsOK ? model.duration(summary.driving) : '—');
            analyticsText('analytics-stationary', gpsOK ? 'Stationary: ' + model.duration(summary.stationary) : 'Vehicle history unavailable');
            analyticsText('analytics-distance', gpsOK && summary.distance != null ? summary.distance.toFixed(1) + ' km' : '—');
            analyticsText('analytics-dwell', eventsOK ? model.duration(summary.dwell) : '—');
            analyticsText('analytics-gps-records', gpsOK ? summary.records : '—');
            const speeds = gps.map(p => model.number(p.speed_kmh)).filter(s => s != null && s > 2 && s <= 120);
            analyticsText('analytics-avg-speed', gpsOK && speeds.length ? model.mean(speeds).toFixed(1) + ' km/h' : '—');
            analyticsText('analytics-max-speed', gpsOK && speeds.length ? Math.max(...speeds).toFixed(1) + ' km/h' : '—');
            const warnings = [];
            if (!fresh) warnings.push('Vehicle tracking needs attention. Check the tracker if the service is running.');
            if (results.some(r => r.error)) warnings.push('Some information could not be loaded. Unavailable figures are shown as —. Try refreshing or choosing a shorter period.');
            if (summary.gaps) warnings.push('There are gaps in vehicle history. Distance and driving time are estimates from available readings.');
            if (summary.tourCount == null) warnings.push('Tour counting needs a published route with numbered stops starting at stop 1.');
            analyticsText('analytics-attention', warnings.length ? warnings.join(' ') : 'No tracking issues detected. Schedule delays are not assessed because no timetable is configured.');
            document.getElementById('analytics-attention').classList.toggle('has-warning', warnings.length > 0);
            analyticsText('analytics-message', 'Report updated at ' + until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '. Refresh to get the latest information.');
            const eventBody = document.getElementById('analytics-events-body'); eventBody.innerHTML = '';
            const stamp = ms => ms == null ? 'Not recorded' : new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            summary.visits.slice(0, 50).forEach(v => addRow(eventBody, [v.name, stamp(v.arrival), stamp(v.departure), model.duration(v.seconds)]));
            analyticsText('analytics-events-empty', eventsOK ? 'No stop visits recorded in this period.' : 'Stop history could not be loaded.');
            document.getElementById('analytics-events-empty').hidden = summary.visits.length > 0;
            const routeBody = document.getElementById('analytics-segment-body'); routeBody.innerHTML = '';
            summary.routes.forEach(r => addRow(routeBody, [r.name, r.count, model.duration(r.seconds)]));
            analyticsText('analytics-segment-count', summary.routes.length + ' connections');
            analyticsText('analytics-segment-empty', eventsOK ? 'Travel times appear after a recorded departure and arrival at the next stop.' : 'Travel history could not be loaded.');
            document.getElementById('analytics-segment-empty').hidden = summary.routes.length > 0;
            analyticsReport = { vehicle: vehicleId, period, warnings, summary, gpsOK, eventsOK, toursOK: eventsOK && !results[5].error };
            document.getElementById('analytics-export-button').disabled = false;
        } catch (error) {
            if (request === analyticsRequest) {
                analyticsText('analytics-message', error.message || 'The report could not be loaded. Please refresh.');
                document.querySelectorAll('#analytics-view .analytics-kpi-value').forEach(el => { el.textContent = '—'; });
                analyticsText('analytics-live-position', 'Report unavailable');
                analyticsText('analytics-live-meta', 'Please refresh to try again.');
                analyticsText('analytics-current-speed', '—');
                analyticsText('analytics-gps-health-sub', '');
                analyticsText('analytics-attention', 'The report could not be loaded. Previous results have been cleared.');
                analyticsText('analytics-stationary', 'Vehicle history unavailable');
                document.getElementById('analytics-live-dot').classList.add('stale');
                document.getElementById('analytics-attention').classList.add('has-warning');
                document.getElementById('analytics-events-body').innerHTML = '';
                document.getElementById('analytics-segment-body').innerHTML = '';
                analyticsText('analytics-events-empty', 'Stop history could not be loaded.');
                analyticsText('analytics-segment-empty', 'Travel history could not be loaded.');
                document.getElementById('analytics-events-empty').hidden = false;
                document.getElementById('analytics-segment-empty').hidden = false;
            }
        } finally {
            if (request === analyticsRequest) {
                refresh.disabled = false;
                document.getElementById('analytics-view').setAttribute('aria-busy', 'false');
            }
        }
    }
    function exportAnalytics() {
        if (!analyticsReport) return;
        const { vehicle, period, warnings, summary: s, gpsOK, eventsOK, toursOK } = analyticsReport;
        const rows = [['Vehicle', vehicle], ['Period', period], ['Report timezone', Intl.DateTimeFormat().resolvedOptions().timeZone],
            ['Notes', warnings.join(' ')], ['Tours confirmed against current published route', toursOK ? s.tourCount : 'Unavailable'],
            ['Average tour duration', eventsOK ? model.duration(s.tourSeconds) : 'Unavailable'], ['Estimated driving time', gpsOK ? model.duration(s.driving) : 'Unavailable'],
            ['Estimated stationary time', gpsOK ? model.duration(s.stationary) : 'Unavailable'], ['Distance (km)', gpsOK ? s.distance : 'Unavailable'], [],
            ['Stop', 'Arrival (UTC)', 'Departure (UTC)', 'Duration'], ...s.visits.map(v => [v.name, v.arrival == null ? '' : new Date(v.arrival).toISOString(), v.departure == null ? '' : new Date(v.departure).toISOString(), model.duration(v.seconds)])];
        const csv = rows.map(row => row.map(value => {
            let text = value == null ? '' : String(value);
            if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
        }).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'business-overview.csv'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        exportAnalytics: exportAnalytics,
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
