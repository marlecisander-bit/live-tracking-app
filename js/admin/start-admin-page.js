window.app = window.app || {};

window.app.init = function() {
    if (window.app.bootstrap && typeof window.app.bootstrap.init === 'function') {
        window.app.bootstrap.init();
    }

    if (window.app.bootstrap && typeof window.app.bootstrap.syncLegacyState === 'function') {
        window.app.bootstrap.syncLegacyState();
    }

    const mapContainer = document.getElementById('map');

    if (mapContainer && !window.app.state.map) {
        window.app.state.map = window.app.mapService && typeof window.app.mapService.create === 'function'
            ? window.app.mapService.create('map', window.appConfig.mapCenter, 13)
            : null;
        window.app.state.mapReady = Boolean(window.app.state.map);
        window.app.syncLegacyState();
    }

    if (window.app.state.map && window.app.mapSetup) {
        window.app.mapSetup(window.app.state.map);
    }

    if (window.app.supabase && typeof window.app.supabase.init === 'function') {
        window.app.supabase.init();
    }

    if (window.app.gps && typeof window.app.gps.startTracking === 'function') {
        window.app.gps.startTracking();
    }

    if (window.app.bindings && typeof window.app.bindings.bindDataActions === 'function') {
        window.app.bindings.bindDataActions(document);
    }

    if (window.app.services) {
        window.app.services.map = window.app.mapService || window.app.services.map;
        window.app.services.route = window.app.routeEngine || window.app.services.route;
        window.app.services.poi = window.app.poi || window.app.services.poi;
        window.app.services.supabase = window.app.supabase || window.app.services.supabase;
        window.app.services.gps = window.app.gps || window.app.services.gps;
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault();
            if (typeof adminLogin === 'function') {
                adminLogin();
            }
        });
    }

    const publishButton = document.getElementById('publish-button');
    if (publishButton && typeof publishMap === 'function') {
        publishButton.addEventListener('click', publishMap);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (window.app && typeof window.app.init === 'function') {
            window.app.init();
        }
    });
} else if (window.app && typeof window.app.init === 'function') {
    window.app.init();
}
