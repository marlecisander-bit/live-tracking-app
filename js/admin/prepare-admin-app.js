window.app = window.app || {};

window.app.bootstrap = {
    init: function() {
        if (!window.app.state) {
            window.app.state = {};
        }

        if (!window.app.services) {
            window.app.services = {};
        }

        if (!window.app.features) {
            window.app.features = {};
        }

        if (!window.app.actions) {
            window.app.actions = {};
        }

        if (window.app.setAppReady) {
            window.app.setAppReady(true);
        }

        return window.app;
    },
    syncLegacyState: function() {
        if (!window.app || !window.app.state) {
            return;
        }

        const aliases = [
            'map',
            'currentNewPointType',
            'autoRouteViaMode',
            'autoRouteViaPoints',
            'autoRouteRequestInProgress',
            'vanMarker',
            'vanPosition',
            'currentUser',
            'analyticsActive'
        ];

        aliases.forEach(function(key) {
            if (typeof window[key] === 'undefined' && typeof window.app.state[key] !== 'undefined') {
                window[key] = window.app.state[key];
            }
        });
    }
};

window.app.init = window.app.init || function() {};
window.app.bootstrapApp = window.app.bootstrap.init;
window.app.syncLegacyState = window.app.syncLegacyState || window.app.bootstrap.syncLegacyState;
