(function() {
    function selectedLayer() { return window.adminMapData.selectedLayer; }
    function selectedProperties() { return selectedLayer() ? adminFeatureProperties(selectedLayer()) : null; }

    function startPoint(type) {
        const map = adminGetMap();
        if (!map || !map.pm) return false;
        window.app.setCurrentPointType(type);
        map.pm.enableDraw('Marker', { snappable: true });
        window.app.helpers.showToast('Click the map to place the ' + (type === 'poi' ? 'POI' : 'stop'));
        return true;
    }

    const actions = {
        startAddStop: function() { return startPoint('stop'); },
        startAddPOI: function() { return startPoint('poi'); },
        startDrawRoute: function() {
            const map = adminGetMap();
            if (!map || !map.pm) return false;
            window.app.setCurrentPointType('route');
            map.pm.enableDraw('Line', { snappable: true, snapDistance: 12, pathOptions: { color: '#d90000', weight: 6 } });
            window.app.helpers.showToast('Click the map to draw the route; click Finish when done');
            return true;
        },
        startAutoRoute: function() {
            const editor = document.getElementById('auto-route-builder');
            if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (!selectedLayer()) window.app.helpers.showToast('Select or draw a route first');
        },
        updatePointForm: function() {
            const isPoi = document.getElementById('point-type').value === 'poi';
            document.getElementById('stop-number-group').style.display = isPoi ? 'none' : 'block';
            document.getElementById('poi-category-group').style.display = isPoi ? 'block' : 'none';
            document.getElementById('poi-source-group').style.display = isPoi ? 'block' : 'none';
            document.getElementById('point-editor-title').textContent = isPoi ? 'Edit POI' : 'Edit Stop';
        },
        savePointObject: function() {
            const layer = selectedLayer();
            if (!layer || !(layer instanceof L.Marker)) return window.app.helpers.showToast('Select a stop or POI first');
            const p = selectedProperties();
            p.objectId = p.objectId || ('point-' + Date.now());
            p.objectType = 'point';
            p.pointType = document.getElementById('point-type').value;
            p.name = document.getElementById('point-name').value.trim();
            p.stopNumber = Number(document.getElementById('stop-number').value) || null;
            p.category = document.getElementById('poi-category').value;
            p.visitTime = Number(document.getElementById('visit-time').value) || 0;
            p.description = document.getElementById('point-description').value.trim();
            p.active = document.getElementById('point-active').checked;
            layer.setIcon(adminPointIcon(p));
            adminMarkChanged();
            adminRefreshLists();
            window.app.helpers.showToast('Object saved');
        },
        saveRouteObject: function() {
            const layer = selectedLayer();
            if (!layer || layer instanceof L.Marker) return window.app.helpers.showToast('Select a route first');
            const p = selectedProperties();
            p.objectId = p.objectId || ('route-' + Date.now());
            p.objectType = 'route';
            p.name = document.getElementById('route-name').value.trim() || 'Sightseeing Shkodra Route';
            p.color = document.getElementById('route-color').value;
            p.weight = Number(document.getElementById('route-weight').value) || 6;
            p.lineStyle = document.getElementById('route-style').value;
            p.directionMode = document.getElementById('route-direction').value;
            p.active = document.getElementById('route-active').checked;
            layer.setStyle(adminRouteStyle(p));
            adminMarkChanged();
            adminRefreshLists();
            window.app.helpers.showToast('Route saved');
        },
        deleteSelectedObject: function() {
            const layer = selectedLayer();
            if (!layer || !window.adminMapData.layerGroup) return;
            if (!window.confirm('Delete this object from the draft?')) return;
            window.adminMapData.layerGroup.removeLayer(layer);
            window.adminMapData.selectedLayer = null;
            actions.closeEditor();
            adminMarkChanged();
            adminRefreshLists();
        },
        closeEditor: function() {
            document.getElementById('point-editor').style.display = 'none';
            document.getElementById('route-editor').style.display = 'none';
            window.adminMapData.selectedLayer = null;
        },
        addStopToSequence: function() {
            const p = selectedProperties();
            if (!p || selectedLayer() instanceof L.Marker) return window.app.helpers.showToast('Select a route first');
            const id = document.getElementById('sequence-stop-select').value;
            if (!id) return;
            p.stopSequence = Array.isArray(p.stopSequence) ? p.stopSequence : [];
            p.stopSequence.push(id);
            adminRenderStopSequence(p.stopSequence);
            adminMarkChanged();
        },
        autoBuildSequence: function() {
            const p = selectedProperties();
            if (!p || selectedLayer() instanceof L.Marker) return window.app.helpers.showToast('Select a route first');
            p.stopSequence = adminGetAllStops().sort(function(a, b) {
                return Number(adminFeatureProperties(a).stopNumber) - Number(adminFeatureProperties(b).stopNumber);
            }).map(function(layer) { return adminFeatureProperties(layer).objectId; });
            adminRenderStopSequence(p.stopSequence);
            adminMarkChanged();
        },
        clearAutoRouteViaPoints: function() {
            const p = selectedProperties();
            if (p) p.autoRouteViaPoints = {};
            document.getElementById('auto-route-waypoint-list').innerHTML = '';
            adminMarkChanged();
        },
        undoAutoRouteViaPoint: function() {
            window.app.helpers.showToast('Select the route and edit its vertices directly on the map');
        },
        enableAutoRouteViaMode: function() {
            window.app.helpers.showToast('Via-point mode is not required; drag route vertices with the edit tool');
        },
        generateAutoRouteFromStopOrder: async function() {
            const layer = selectedLayer();
            const p = selectedProperties();
            if (!layer || layer instanceof L.Marker || !p) return window.app.helpers.showToast('Select a route first');
            const sequence = Array.isArray(p.stopSequence) ? p.stopSequence.slice() : [];
            if (sequence.length < 2) return window.app.helpers.showToast('Add at least two stops to the Stop Order');
            const stops = adminGetAllStops();
            const points = sequence.map(function(id) {
                return stops.find(function(stop) { return adminFeatureProperties(stop).objectId === id; });
            }).filter(Boolean).map(function(stop) { return stop.getLatLng(); });
            if (points.length < 2) return window.app.helpers.showToast('The stops in this sequence could not be found');
            if (document.getElementById('auto-route-close-loop').checked && !points[0].equals(points[points.length - 1])) points.push(points[0]);
            const status = document.getElementById('auto-route-status');
            status.textContent = 'Calculating the road route...';
            const coordinates = points.map(function(point) { return point.lng + ',' + point.lat; }).join(';');
            try {
                const response = await fetch('https://router.project-osrm.org/route/v1/driving/' + coordinates + '?overview=full&geometries=geojson');
                const result = await response.json();
                if (!response.ok || !result.routes || !result.routes.length) throw new Error('No road route found');
                layer.setLatLngs(result.routes[0].geometry.coordinates.map(function(point) { return [point[1], point[0]]; }));
                p.routeDistanceKm = result.routes[0].distance / 1000;
                status.textContent = 'Road route generated successfully.';
                adminMarkChanged();
                adminGetMap().fitBounds(layer.getBounds(), { padding: [40, 40] });
            } catch (error) {
                console.error(error);
                status.textContent = 'Road routing is temporarily unavailable. You can still edit the line manually.';
            }
        },
        openPOIManager: function() { document.getElementById('poi-manager-modal').style.display = 'flex'; },
        closePOIManager: function() { document.getElementById('poi-manager-modal').style.display = 'none'; },
        openExportMapModal: function() { document.getElementById('export-map-modal').classList.add('open'); },
        closeExportMapModal: function() { document.getElementById('export-map-modal').classList.remove('open'); },
        previewPublicMap: function() { window.open('live-map.html', '_blank'); },
        getAllStops: adminGetAllStops,
        prepareMapData: adminBuildFeatureCollection
    };

    window.app.registerActionGroup('adminEditing', actions);
})();
