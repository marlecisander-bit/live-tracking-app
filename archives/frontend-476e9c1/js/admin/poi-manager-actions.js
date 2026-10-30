window.app = window.app || {};

window.app.poiActions = {
    startAddPOI: function() {
        if (typeof window.startAddPOI === 'function' && window.startAddPOI !== window.app.poiActions.startAddPOI) {
            return window.startAddPOI.apply(window, arguments);
        }

        const map = window.app.getMap ? window.app.getMap() : window.map;
        if (map && map.pm) {
            window.app.setCurrentPointType('poi');
            map.pm.enableDraw('Marker', { snappable: true });
        }

        return true;
    },
    openPOIManager: function() {
        if (typeof window.openPOIManager === 'function' && window.openPOIManager !== window.app.poiActions.openPOIManager) {
            return window.openPOIManager.apply(window, arguments);
        }

        const dialog = document.getElementById('poi-manager-panel') || document.getElementById('poi-manager');
        if (dialog) {
            const isHidden = dialog.style.display === 'none';
            dialog.style.display = isHidden ? 'block' : 'none';
            return isHidden;
        }

        return true;
    },
    exportGeoJSON: function() {
        if (typeof window.exportGeoJSON === 'function' && window.exportGeoJSON !== window.app.poiActions.exportGeoJSON) {
            return window.exportGeoJSON.apply(window, arguments);
        }

        return true;
    },
    importGeoJSON: function(event) {
        if (typeof window.importGeoJSON === 'function' && window.importGeoJSON !== window.app.poiActions.importGeoJSON) {
            return window.importGeoJSON.call(window, event);
        }

        const input = document.getElementById('geojson-file-input');
        if (input) {
            input.click();
            return true;
        }

        return false;
    }
};

if (window.app.registerActionGroup) {
    window.app.registerActionGroup('poiActions', window.app.poiActions);
} else {
    window.app.actions = window.app.actions || {};
    Object.keys(window.app.poiActions).forEach(function(name) {
        window.app.actions[name] = window.app.poiActions[name];
        window[name] = window.app.poiActions[name];
    });
}
