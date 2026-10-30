window.app.actions.setAdminSection = function(section) {
    if (typeof legacyFeatureActions.setAdminSection === 'function') {
        return legacyFeatureActions.setAdminSection.call(window, section);
    }

    const target = section || 'map';
    document.querySelectorAll('.context-section').forEach(function(panel) {
        const active = panel.getAttribute('data-context-section') === target;
        panel.style.display = active ? 'block' : 'none';
    });

    document.querySelectorAll('.app-nav-button').forEach(function(button) {
        const active = button.getAttribute('data-section') === target;
        button.classList.toggle('active', active);
    });

    return target;
};

window.app.actions.startAddStop = function() {
    if (typeof legacyFeatureActions.startAddStop === 'function') {
        return legacyFeatureActions.startAddStop.call(window);
    }

    const map = window.app.getMap ? window.app.getMap() : window.map;
    if (map && map.pm) {
        window.app.setCurrentPointType('stop');
        map.pm.enableDraw('Marker', { snappable: true });
    }

    return true;
};

window.app.actions.startAddPOI = function() {
    if (window.app.poiActions && typeof window.app.poiActions.startAddPOI === 'function') {
        return window.app.poiActions.startAddPOI.apply(window, arguments);
    }

    if (typeof legacyFeatureActions.startAddPOI === 'function') {
        return legacyFeatureActions.startAddPOI.call(window);
    }

    const map = window.app.getMap ? window.app.getMap() : window.map;
    if (map && map.pm) {
        window.app.setCurrentPointType('poi');
        map.pm.enableDraw('Marker', { snappable: true });
    }

    return true;
};

window.app.actions.startDrawRoute = function() {
    if (window.app.routeActions && typeof window.app.routeActions.startDrawRoute === 'function') {
        return window.app.routeActions.startDrawRoute.apply(window, arguments);
    }

    if (typeof legacyFeatureActions.startDrawRoute === 'function') {
        return legacyFeatureActions.startDrawRoute.call(window);
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
};

window.app.actions.startAutoRoute = function() {
    if (window.app.routeActions && typeof window.app.routeActions.startAutoRoute === 'function') {
        return window.app.routeActions.startAutoRoute.apply(window, arguments);
    }

    if (typeof legacyFeatureActions.startAutoRoute === 'function') {
        return legacyFeatureActions.startAutoRoute.call(window);
    }

    if (typeof window.getAllStops === 'function') {
        const stops = window.getAllStops();
        if (stops.length < 2) {
            alert('Create at least 2 Stops before using Auto Route.');
            return false;
        }
    }

    return true;
};

window.app.actions.updatePointForm = function() {
    if (window.app.routeActions && typeof window.app.routeActions.updatePointForm === 'function') {
        return window.app.routeActions.updatePointForm.apply(window, arguments);
    }

    if (typeof legacyFeatureActions.updatePointForm === 'function') {
        return legacyFeatureActions.updatePointForm.call(window);
    }

    const type = document.getElementById('point-type')?.value || 'stop';
    const stopGroup = document.getElementById('stop-number-group');
    const pointTitle = document.getElementById('point-editor-title');
    const poiCategory = document.getElementById('poi-category-group');
    const poiSource = document.getElementById('poi-source-group');

    if (stopGroup) stopGroup.style.display = type === 'stop' ? 'block' : 'none';
    if (pointTitle) pointTitle.innerText = type === 'stop' ? 'Edit Stop' : 'Edit POI';
    if (poiCategory) poiCategory.style.display = type === 'poi' ? 'block' : 'none';
    if (poiSource) poiSource.style.display = type === 'poi' ? 'block' : 'none';

    return type;
};
