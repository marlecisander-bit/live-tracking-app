window.app.actions.getAllStops = function() {
    const map = window.app && window.app.getMap ? window.app.getMap() : window.map;
    if (!map || !map.eachLayer) {
        return [];
    }

    const stops = [];
    map.eachLayer(function(layer) {
        if (layer && layer.feature && layer.feature.properties && layer.feature.properties.objectType === 'point') {
            stops.push(layer);
        }
    });
    return stops;
};

window.app.actions.loadVanPosition = function() {
    if (typeof window.showToast === 'function') {
        window.showToast('Van position refreshed');
    }
    return true;
};

window.app.actions.closeEditor = function() {
    const editor = document.getElementById('point-editor');
    if (editor) {
        editor.style.display = 'none';
    }
    return true;
};

window.app.actions.prepareMapData = function() {
    return {
        type: 'FeatureCollection',
        features: []
    };
};

if (window.app.registerActionGroup) {
    window.app.registerActionGroup('defaultActions', window.app.actions);
