window.app = window.app || {};

window.app.routeActions = {
    startDrawRoute: function() {
        if (typeof window.startDrawRoute === 'function' && window.startDrawRoute !== window.app.routeActions.startDrawRoute) {
            return window.startDrawRoute.apply(window, arguments);
        }

        if (typeof window.disableAutoRouteViaMode === 'function') {
            window.disableAutoRouteViaMode();
        }

        if (window.map && window.map.pm) {
            window.map.pm.enableDraw('Line', {
                snappable: true,
                snapDistance: 12,
                pathOptions: {
                    color: '#d90000',
                    weight: 6
                }
            });
        }

        return true;
    },
    startAutoRoute: function() {
        if (typeof window.startAutoRoute === 'function' && window.startAutoRoute !== window.app.routeActions.startAutoRoute) {
            return window.startAutoRoute.apply(window, arguments);
        }

        if (typeof window.getAllStops === 'function') {
            const stops = window.getAllStops();
            if (stops.length < 2) {
                alert('Create at least 2 Stops before using Auto Route.');
                return false;
            }
        }

        if (typeof window.enableAutoRouteViaMode === 'function') {
            window.enableAutoRouteViaMode();
        }

        return true;
    },
    updatePointForm: function() {
        if (typeof window.updatePointForm === 'function' && window.updatePointForm !== window.app.routeActions.updatePointForm) {
            return window.updatePointForm.apply(window, arguments);
        }

        const type = document.getElementById('point-type')?.value || 'stop';
        const stopGroup = document.getElementById('stop-number-group');
        const pointTitle = document.getElementById('point-editor-title');
        const poiCategory = document.getElementById('poi-category-group');
        const poiSource = document.getElementById('poi-source-group');

        if (stopGroup) {
            stopGroup.style.display = type === 'stop' ? 'block' : 'none';
        }

        if (pointTitle) {
            pointTitle.innerText = type === 'stop' ? 'Edit Stop' : 'Edit POI';
        }

        if (poiCategory) {
            poiCategory.style.display = type === 'poi' ? 'block' : 'none';
        }

        if (poiSource) {
            poiSource.style.display = type === 'poi' ? 'block' : 'none';
        }

        return type;
    }
};

if (window.app.registerActionGroup) {
    window.app.registerActionGroup('routeActions', window.app.routeActions);
} else {
    window.app.actions = window.app.actions || {};
    Object.keys(window.app.routeActions).forEach(function(name) {
        window.app.actions[name] = window.app.routeActions[name];
        window[name] = window.app.routeActions[name];
    });
}
