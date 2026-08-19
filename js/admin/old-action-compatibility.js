window.app = window.app || {};

const inlineCompat = {
    ensureGlobal: function(name, fn) {
        if (typeof fn === 'function' && typeof window[name] !== 'function') {
            window[name] = fn;
        }
        return window[name];
    }
};

const compatMap = {
    findVan: function() { return window.app.actions && window.app.actions.findVan ? window.app.actions.findVan() : null; },
    savePointObject: function() { return true; },
    deleteSelectedObject: function() { return true; },
    closeEditor: function() { return window.app.actions && window.app.actions.closeEditor ? window.app.actions.closeEditor() : true; },
    enableAutoRouteViaMode: function() { return true; },
    undoAutoRouteViaPoint: function() { return true; },
    generateAutoRouteFromStopOrder: function() { return true; },
    clearAutoRouteViaPoints: function() { return true; },
    addStopToSequence: function() { return true; },
    autoBuildSequence: function() { return true; },
    saveRouteObject: function() { return true; },
    closePOIManager: function() { return true; },
    searchOpenStreetMapPOIs: function() { return true; },
    setAllPOIImportSelections: function() { return true; },
    importSelectedOpenStreetMapPOIs: function() { return true; },
    clearPOIManagerResults: function() { return true; },
    closeExportMapModal: function() { return true; },
    exportMapNow: function() { return true; },
    loadAnalyticsDashboard: function() { return true; },
    previewPublicMap: function() { return window.app.actions && window.app.actions.previewPublicMap ? window.app.actions.previewPublicMap() : true; },
    saveDraft: function() { return window.app.actions && window.app.actions.saveDraft ? window.app.actions.saveDraft() : true; },
    publishMap: function() { return window.app.actions && window.app.actions.publishMap ? window.app.actions.publishMap() : true; }
};

Object.keys(compatMap).forEach(function(name) {
    inlineCompat.ensureGlobal(name, compatMap[name]);
});

window.app.compat = compatMap;
