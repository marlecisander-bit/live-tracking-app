window.adminMapData = {
    layerGroup: null,
    selectedLayer: null,
    currentVersionId: null,
    currentStatus: null,
    changeRevision: 0,
    hasChanges: false
};

function adminGetMap() {
    return window.app && window.app.getMap ? window.app.getMap() : window.map;
}

function adminMarkChanged() {
    window.adminMapData.changeRevision += 1;
    window.adminMapData.hasChanges = true;
    if (window.app && window.app.state) window.app.state.unpublishedChanges = 1;
    const count = document.getElementById('unpublished-count');
    if (count) {
        count.textContent = '1';
        count.hidden = false;
    }
}

function adminFeatureProperties(layer) {
    layer.feature = layer.feature || { type: 'Feature', properties: {} };
    layer.feature.properties = layer.feature.properties || {};
    return layer.feature.properties;
}

function adminRouteStyle(properties) {
    const styles = { dashed: '12 8', dotted: '2 8' };
    return {
        color: properties.color || '#d90000',
        weight: Number(properties.weight) || 6,
        dashArray: styles[properties.lineStyle] || null,
        opacity: properties.active === false ? 0.45 : 0.92,
        lineCap: 'round',
        lineJoin: 'round'
    };
}

function adminPointIcon(properties) {
    const isPoi = properties.pointType === 'poi';
    const sticker = isPoi ? window.mapContentSafety.pngSticker(properties.sticker) : '';
    const label = isPoi ? '•' : String(properties.stopNumber || 'S');
    const className = isPoi ? 'admin-poi-marker' : 'admin-stop-marker';
    return L.divIcon({
        className: '',
        html: sticker
            ? '<div class="admin-poi-sticker"><img src="' + sticker + '" alt=""></div>'
            : '<div class="' + className + '">' + window.mapContentSafety.escape(label) + '</div>',
        iconSize: isPoi && sticker ? [58, 58] : (isPoi ? [28, 28] : [38, 38]),
        iconAnchor: isPoi && sticker ? [29, 29] : (isPoi ? [14, 14] : [19, 19])
    });
}

function adminSelectLayer(layer) {
    if (!layer) return;

    const previousLayer = window.adminMapData.selectedLayer;
    if (previousLayer && previousLayer !== layer) {
        if (previousLayer instanceof L.Marker && previousLayer.dragging && previousLayer.dragging.enabled()) {
            previousLayer.dragging.disable();
        }
        if (
            previousLayer.pm &&
            previousLayer.pm.layerDragEnabled &&
            previousLayer.pm.layerDragEnabled()
        ) {
            previousLayer.pm.disableLayerDrag();
        }
        adminSetLayerSelected(previousLayer, false);
    }

    window.adminMapData.selectedLayer = layer;
    adminSetLayerSelected(layer, true);

    const workspace = document.getElementById('workspace');
    if (workspace) workspace.classList.add('editor-open');

    const feature = layer.feature || {};
    const properties = feature.properties || {};
    const geometryType = feature.geometry ? feature.geometry.type : '';

    if (geometryType === 'Point' || layer instanceof L.Marker) {
        document.getElementById('point-type').value = properties.pointType || 'stop';
        document.getElementById('point-name').value = properties.name || '';
        document.getElementById('stop-number').value = properties.stopNumber || '';
        document.getElementById('poi-category').value = properties.category || 'attraction';
        const stickerInput = document.getElementById('poi-sticker-file');
        const stickerPreview = document.getElementById('poi-sticker-preview');
        const sticker = typeof properties.sticker === 'string' ? properties.sticker : '';
        stickerInput.value = '';
        stickerInput.dataset.sticker = sticker;
        stickerPreview.innerHTML = '';
        if (sticker) {
            const stickerImage = document.createElement('img');
            stickerImage.src = sticker;
            stickerImage.alt = 'Selected POI sticker';
            stickerPreview.appendChild(stickerImage);
        } else {
            const stickerEmpty = document.createElement('span');
            stickerEmpty.textContent = 'No sticker';
            stickerPreview.appendChild(stickerEmpty);
        }
        document.getElementById('visit-time').value = properties.visitTime || '';
        document.getElementById('point-description').value = properties.description || '';
        document.getElementById('point-active').checked = properties.active !== false;
        window.app.actions.updatePointForm();
        document.getElementById('point-editor').style.display = 'block';
        document.getElementById('route-editor').style.display = 'none';
    } else {
        document.getElementById('route-name').value = properties.name || 'Sightseeing Shkodra Route';
        document.getElementById('route-color').value = properties.color || '#d90000';
        document.getElementById('route-weight').value = Number(properties.weight) || 6;
        document.getElementById('route-style').value = properties.lineStyle || 'solid';
        document.getElementById('route-direction').value = properties.directionMode || 'oneway';
        document.getElementById('route-active').checked = properties.active !== false;
        document.getElementById('point-editor').style.display = 'none';
        document.getElementById('route-editor').style.display = 'block';
        adminRenderStopSequence(properties.stopSequence || []);
    }
}

function adminSetLayerSelected(layer, selected) {
    if (!layer) return;

    if (layer instanceof L.Marker && layer.getElement()) {
        layer.getElement().classList.toggle('admin-layer-selected', selected);
        if (selected && layer.setZIndexOffset) layer.setZIndexOffset(1000);
        if (!selected && layer.setZIndexOffset) layer.setZIndexOffset(0);
        return;
    }

    if (layer.setStyle) {
        const properties = adminFeatureProperties(layer);
        const style = adminRouteStyle(properties);
        if (selected) {
            style.weight = style.weight + 3;
            style.opacity = 1;
        }
        layer.setStyle(style);
        if (selected && layer.bringToFront) layer.bringToFront();
    }
}

function adminAttachLayer(layer, targetGroup) {
    layer.on('click', function() { adminSelectLayer(layer); });
    layer.on('pm:edit', adminMarkChanged);
    layer.on('pm:dragend', adminMarkChanged);
    if (layer instanceof L.Marker) {
        layer.setIcon(adminPointIcon(adminFeatureProperties(layer)));
    }
    (targetGroup || window.adminMapData.layerGroup).addLayer(layer);
}

function adminRenderMapData(data) {
    const map = adminGetMap();
    if (!map) return;
    const previousGroup = window.adminMapData.layerGroup;
    const stagedGroup = L.featureGroup();

    if (!data || !Array.isArray(data.features)) {
        adminRefreshLists();
        return;
    }

    L.geoJSON(data, {
        pointToLayer: function(feature, latlng) {
            return L.marker(latlng, { icon: adminPointIcon(feature.properties || {}) });
        },
        style: function(feature) { return adminRouteStyle(feature.properties || {}); },
        onEachFeature: function(feature, layer) {
            layer.feature = feature;
            adminAttachLayer(layer, stagedGroup);
        }
    });

    try { stagedGroup.addTo(map); }
    catch (error) { map.removeLayer(stagedGroup); throw error; }
    if (previousGroup) map.removeLayer(previousGroup);
    window.adminMapData.layerGroup = stagedGroup;
    window.adminMapData.selectedLayer = null;
    adminRefreshLists();
    if (window.adminMapData.layerGroup.getLayers().length) {
        try { map.fitBounds(window.adminMapData.layerGroup.getBounds(), { padding: [40, 40] }); } catch (error) {}
    }
}

let adminMapRequest = 0;
async function adminLoadLatestMap() {
    if (!window.app.state.currentUser || !window.app.state.currentProject) return;
    const request = ++adminMapRequest;
    window.app.state.loadedMapProjectId = undefined;
    window.app.state.mapLoadInFlight = true;
    const projectId = window.appConfig.projectId;
    const userId = window.app.state.currentUser.id;
    const client = window.app.supabase.getClient();
    window.app.helpers.setLoading(true, 'Loading your saved map...');
    try {
        let query = client.from('map_versions').select('id,status,map_data,published_at,created_at');
        if (projectId) query = query.eq('project_id', projectId);
        const result = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (request !== adminMapRequest || projectId !== window.appConfig.projectId || userId !== window.app.state.currentUser?.id) return;
        if (result.error) throw result.error;
        adminRenderMapData(result.data?.map_data || { type: 'FeatureCollection', features: [] });
        window.adminMapData.changeRevision += 1;
        window.app.state.loadedMapProjectId = projectId;
        window.adminMapData.currentVersionId = result.data?.id || null;
        window.adminMapData.currentStatus = result.data?.status || null;
        window.adminMapData.hasChanges = false;
        window.app.state.unpublishedChanges = 0;
        const published = document.getElementById('last-published');
        if (published) published.textContent = result.data?.published_at ? new Date(result.data.published_at).toLocaleString() : 'Never';
        window.app.helpers.showToast(result.data ? 'Saved map loaded' : 'No saved map found');
    } catch (error) {
        if (request === adminMapRequest) window.app.helpers.showToast('Could not load saved map: ' + error.message);
    } finally {
        if (request === adminMapRequest) { window.app.state.mapLoadInFlight = false; window.app.helpers.setLoading(false); }
    }
}

document.addEventListener('adminsessionended', function() {
    adminMapRequest++;
    window.app.state.mapLoadInFlight = false;
    window.app.helpers.setLoading(false);
});

document.addEventListener('projectchange', function() {
    window.app.projectLoadPromise = adminLoadLatestMap();
});
window.addEventListener('beforeunload', function(event) {
    if (window.adminMapData.hasChanges || window.app.state.mapSaveInFlight) { event.preventDefault(); event.returnValue = ''; }
});

function adminGetAllLayers() {
    return window.adminMapData.layerGroup ? window.adminMapData.layerGroup.getLayers() : [];
}

function adminGetAllStops() {
    return adminGetAllLayers().filter(function(layer) {
        return adminFeatureProperties(layer).pointType === 'stop';
    });
}

function adminBuildFeatureCollection() {
    const features = adminGetAllLayers().map(function(layer) {
        const feature = layer.toGeoJSON();
        feature.properties = Object.assign({}, adminFeatureProperties(layer));
        return feature;
    });
    return { type: 'FeatureCollection', features: features };
}

function adminRefreshLists() {
    const lists = { stop: document.getElementById('stop-list'), poi: document.getElementById('poi-list'), route: document.getElementById('route-list') };
    Object.keys(lists).forEach(function(key) { if (lists[key]) lists[key].innerHTML = ''; });

    adminGetAllLayers().forEach(function(layer) {
        const p = adminFeatureProperties(layer);
        const type = layer instanceof L.Marker ? (p.pointType || 'stop') : 'route';
        const container = lists[type];
        if (!container) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-object-list-item';
        button.textContent = type === 'stop' ? (p.stopNumber || '?') + '. ' + (p.name || 'Unnamed stop') : (p.name || (type === 'poi' ? 'Unnamed POI' : 'Unnamed route'));
        button.addEventListener('click', function() {
            adminSelectLayer(layer);
            if (layer.getLatLng) adminGetMap().panTo(layer.getLatLng());
        });
        container.appendChild(button);
    });
}

function adminRenderStopSequence(sequence) {
    const list = document.getElementById('stop-sequence-list');
    const select = document.getElementById('sequence-stop-select');
    if (list) list.innerHTML = '';
    if (select) select.innerHTML = '';
    const stops = adminGetAllStops();
    stops.forEach(function(layer) {
        const p = adminFeatureProperties(layer);
        const option = document.createElement('option');
        option.value = p.objectId;
        option.textContent = (p.stopNumber || '?') + '. ' + (p.name || 'Unnamed stop');
        if (select) select.appendChild(option);
    });
    (sequence || []).forEach(function(id, index) {
        const stop = stops.find(function(layer) { return adminFeatureProperties(layer).objectId === id; });
        const row = document.createElement('div');
        row.className = 'sequence-item';
        row.textContent = (index + 1) + '. ' + (stop ? adminFeatureProperties(stop).name : id);
        if (list) list.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const map = adminGetMap();
    if (!map) return;
    window.adminMapData.layerGroup = L.featureGroup().addTo(map);
    map.on('click', function() {
        const workspace = document.getElementById('workspace');
        if (!workspace || !workspace.classList.contains('context-open')) return;
        const activeNavigationButton = document.querySelector('.app-nav-button.active');
        if (activeNavigationButton) activeNavigationButton.click();
    });
    map.on('pm:create', function(event) {
        const layer = event.layer;
        const pointType = window.app.getCurrentPointType ? window.app.getCurrentPointType() : 'stop';
        layer.feature = { type: 'Feature', properties: {
            objectId: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : 'object-' + Date.now(),
            objectType: layer instanceof L.Marker ? 'point' : 'route',
            pointType: layer instanceof L.Marker ? pointType : undefined,
            active: true
        }};
        adminAttachLayer(layer);
        adminSelectLayer(layer);
        adminMarkChanged();
        adminRefreshLists();
    });
});
