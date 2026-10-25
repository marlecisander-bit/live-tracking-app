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
            body: { category: category, lat: lat, lng: lng, radius: radius, project_id: window.appConfig.projectId }
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

    const actions = {
        setAdminSection: function(section, event, element) {
            const workspace = document.getElementById('workspace');
            const target = ['map','stops','routes','pois','export'].includes(section) ? section : 'map';
            const clickedNavigationIcon = Boolean(element && element.classList.contains('app-nav-button'));
            const isAlreadyOpen = workspace && workspace.classList.contains('context-open')
                    && workspace.dataset.contextSection === target;
            const shouldClose = clickedNavigationIcon && isAlreadyOpen;

            if (shouldClose) {
                workspace.classList.remove('context-open');
                workspace.dataset.contextSection = '';
                document.body.classList.remove('mobile-context-open');
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

            document.body.classList.toggle('mobile-context-open', true);
            if (workspace) {
                workspace.classList.toggle('context-open', true);
                workspace.dataset.contextSection = target;
            }
            document.querySelectorAll('.context-section').forEach(function(panel) {
                panel.classList.toggle('active', panel.getAttribute('data-context-section') === target);
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
            window.setTimeout(function() { if (adminGetMap()) adminGetMap().invalidateSize(); }, 0);
            return target;
        },
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

    window.app.registerActionGroup('adminPoi', actions);
})();
