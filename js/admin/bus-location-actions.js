window.app = window.app || {};

window.app.gpsActions = {
    findVan: function() {
        if (typeof window.findVan === 'function' && window.findVan !== window.app.gpsActions.findVan) {
            return window.findVan.apply(window, arguments);
        }

        if (typeof window.loadVanPosition === 'function') {
            return window.loadVanPosition.apply(window, arguments);
        }

        if (window.app && window.app.gps && typeof window.app.gps.findVan === 'function') {
            return window.app.gps.findVan.apply(window.app.gps, arguments);
        }

        return true;
    }
};

if (window.app.registerActionGroup) {
    window.app.registerActionGroup('gpsActions', window.app.gpsActions);
} else {
    window.app.actions = window.app.actions || {};
    Object.keys(window.app.gpsActions).forEach(function(name) {
        window.app.actions[name] = window.app.gpsActions[name];
        window[name] = window.app.gpsActions[name];
    });
}
