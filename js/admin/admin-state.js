window.appState = {
    currentUser: null,
    unpublishedChanges: 0,
    analyticsActive: false,
    analyticsRefreshTimer: null,
    autoRouteViaMode: false,
    autoRouteViaPoints: {},
    autoRouteRequestInProgress: false,
    vanMarker: null,
    vanPosition: null,
    map: null,
    currentNewPointType: 'stop',
    mapReady: false
};

window.app = window.app || {};
window.app.config = window.appConfig;
window.app.state = window.appState;
window.app.syncLegacyState = function() {
    const aliases = {
        currentUser: 'currentUser',
        unpublishedChanges: 'unpublishedChanges',
        analyticsActive: 'analyticsActive',
        analyticsRefreshTimer: 'analyticsRefreshTimer',
        autoRouteViaMode: 'autoRouteViaMode',
        autoRouteViaPoints: 'autoRouteViaPoints',
        autoRouteRequestInProgress: 'autoRouteRequestInProgress',
        vanMarker: 'vanMarker',
        vanPosition: 'vanPosition',
        map: 'map',
        currentNewPointType: 'currentNewPointType',
        mapReady: 'mapReady'
    };

    Object.keys(aliases).forEach(function(key) {
        const value = window.appState[key];
        if (typeof value !== 'undefined') {
            window[aliases[key]] = value;
        }
    });
};
