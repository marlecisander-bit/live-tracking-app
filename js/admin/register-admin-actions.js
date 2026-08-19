window.app = window.app || {};

const legacyFeatureActions = {};
[
    'setAdminSection',
    'startAddStop',
    'startAddPOI',
    'startDrawRoute',
    'startAutoRoute',
    'updatePointForm',
    'findVan',
    'previewPublicMap',
    'exportGeoJSON',
    'importGeoJSON',
    'openPOIManager'
].forEach(function(name) {
    legacyFeatureActions[name] = typeof window[name] === 'function' ? window[name] : null;
});

window.app.actions = window.app.actions || {};
