window.app.actions.getAllStops = function() {
    const map = window.app && window.app.getMap ? window.app.getMap() : window.map;
    if (!map || !map.eachLayer) {
        return [];
    }

    const stops = [];
    map.eachLayer(function(layer) {
        if (layer && layer.feature && layer.feature.properties && layer.feature.properties.objectType === 'point') {
            stops.push(layer);
        }
    });
    return stops;
};

window.app.actions.loadVanPosition = function() {
    if (typeof window.showToast === 'function') {
        window.showToast('Van position refreshed');
    }
    return true;
};

window.app.actions.closeEditor = function() {
    const editor = document.getElementById('point-editor');
    if (editor) {
        editor.style.display = 'none';
    }
    return true;
};

window.app.actions.prepareMapData = function() {
    return {
        type: 'FeatureCollection',
        features: []
    };
};

window.app.actions.adminLogout = async function() {
    try {
        const client = window.app.supabase && window.app.supabase.getClient
            ? window.app.supabase.getClient()
            : null;

        if (client && client.auth) {
            await client.auth.signOut();
        }
    } catch (error) {
        console.warn('Logout could not be completed remotely.', error);
    }

    if (window.app && window.app.state) {
        window.app.state.currentUser = null;
    }

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.display = 'flex';
    }
};

window.app.actions.closeMobileContextPanel = function() {
    document.body.classList.remove('mobile-context-open');
};

window.app.actions.openExportMapModal = function() {
    const modal = document.getElementById('export-map-modal');
    if (modal) {
        modal.classList.add('open');
    }
};

if (window.app.registerActionGroup) {
    window.app.registerActionGroup('defaultActions', window.app.actions);
