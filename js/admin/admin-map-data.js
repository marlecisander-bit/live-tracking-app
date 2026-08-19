window.adminMapData = {
    layerGroup: null,
    selectedLayer: null,
    currentVersionId: null,
    currentStatus: null,
    hasChanges: false
};

function adminGetMap() {
    return window.app && window.app.getMap ? window.app.getMap() : window.map;
}

function adminMarkChanged() {
    window.adminMapData.hasChanges = true;
    if (window.app && window.app.state) window.app.state.unpublishedChanges = 1;
    const count = document.getElementById('unpublished-count');
    if (count) count.textContent = '1';
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
    const label = isPoi ? '•' : String(properties.stopNumber || 'S');
    const className = isPoi ? 'admin-poi-marker' : 'admin-stop-marker';
    return L.divIcon({
        className: '',
        html: '<div class="' + className + '">' + label + '</div>',
        iconSize: isPoi ? [28, 28] : [38, 38],
        iconAnchor: isPoi ? [14, 14] : [19, 19]
    });
}

function adminSelectLayer(layer) {
    window.adminMapData.selectedLayer = layer;
    const feature = layer.feature || {};
    const properties = feature.properties || {};
    const geometryType = feature.geometry ? feature.geometry.type : '';

    if (geometryType === 'Point' || layer instanceof L.Marker) {
        document.getElementById('point-type').value = properties.pointType || 'stop';
        document.getElementById('point-name').value = properties.name || '';
        document.getElementById('stop-number').value = properties.stopNumber || '';
        document.getElementById('poi-category').value = properties.category || 'attraction';
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

function adminAttachLayer(layer) {
    layer.on('click', function() { adminSelectLayer(layer); });
    layer.on('pm:edit', adminMarkChanged);
    layer.on('pm:dragend', adminMarkChanged);
    if (layer instanceof L.Marker) {
        layer.setIcon(adminPointIcon(adminFeatureProperties(layer)));
    }
    window.adminMapData.layerGroup.addLayer(layer);
}

function adminRenderMapData(data) {
    const map = adminGetMap();
    if (!map) return;
    if (!window.adminMapData.layerGroup) window.adminMapData.layerGroup = L.featureGroup().addTo(map);
    window.adminMapData.layerGroup.clearLayers();

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
            adminAttachLayer(layer);
        }
    });

    adminRefreshLists();
    if (window.adminMapData.layerGroup.getLayers().length) {
        try { map.fitBounds(window.adminMapData.layerGroup.getBounds(), { padding: [40, 40] }); } catch (error) {}
    }
}

async function adminLoadLatestMap() {
    const client = window.app.supabase.getClient();
    window.app.helpers.setLoading(true, 'Loading your saved map...');
    let result = await client.from('map_versions')
        .select('id,status,map_data,published_at,created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (result.error || !result.data) {
        result = await client.from('map_versions')
            .select('id,status,map_data,published_at,created_at')
            .eq('status', 'published')
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
    }

    window.app.helpers.setLoading(false);
    if (result.error) {
        console.error(result.error);
        window.app.helpers.showToast('Could not load saved map data');
        return;
    }

    if (!result.data) {
        adminRenderMapData({ type: 'FeatureCollection', features: [] });
        window.app.helpers.showToast('No saved map found');
        return;
    }

    window.adminMapData.currentVersionId = result.data.id;
    window.adminMapData.currentStatus = result.data.status;
    adminRenderMapData(result.data.map_data);
    const published = document.getElementById('last-published');
    if (published && result.data.published_at) {
        published.textContent = new Date(result.data.published_at).toLocaleString();
    }
    window.app.helpers.showToast(result.data.status === 'draft' ? 'Draft restored' : 'Published map loaded');
}

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
    adminLoadLatestMap();
});
