window.app.actions.findVan = function() {
    if (window.app.gpsActions && typeof window.app.gpsActions.findVan === 'function') {
        return window.app.gpsActions.findVan.apply(window, arguments);
    }

    if (typeof legacyFeatureActions.findVan === 'function') {
        return legacyFeatureActions.findVan.call(window);
    }

    if (typeof window.loadVanPosition === 'function') {
        window.loadVanPosition();
    }

    return true;
};

window.app.actions.previewPublicMap = function() {
    if (typeof legacyFeatureActions.previewPublicMap === 'function') {
        return legacyFeatureActions.previewPublicMap.call(window);
    }

    if (window.open) {
        window.open('live-map.html?project=' + encodeURIComponent(window.appConfig.projectSlug || window.appConfig.defaultProjectSlug), '_blank');
    }

    return true;
};

window.app.actions.exportGeoJSON = function() {
    if (window.app.poiActions && typeof window.app.poiActions.exportGeoJSON === 'function') {
        return window.app.poiActions.exportGeoJSON.apply(window, arguments);
    }

    if (typeof legacyFeatureActions.exportGeoJSON === 'function') {
        return legacyFeatureActions.exportGeoJSON.call(window);
    }

    return true;
};

window.app.actions.importGeoJSON = function(event) {
    if (window.app.poiActions && typeof window.app.poiActions.importGeoJSON === 'function') {
        return window.app.poiActions.importGeoJSON.call(window, event);
    }

    if (typeof legacyFeatureActions.importGeoJSON === 'function') {
        return legacyFeatureActions.importGeoJSON.call(window, event);
    }

    return true;
};

window.app.actions.openPOIManager = function() {
    if (window.app.poiActions && typeof window.app.poiActions.openPOIManager === 'function') {
        return window.app.poiActions.openPOIManager.apply(window, arguments);
    }

    if (typeof legacyFeatureActions.openPOIManager === 'function') {
        return legacyFeatureActions.openPOIManager.call(window);
    }

    return true;
};
