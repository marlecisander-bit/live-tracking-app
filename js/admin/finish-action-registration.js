} else {
    Object.keys(window.app.actions).forEach(function(name) {
        window[name] = window.app.actions[name];
    });
}

window.adminLogin = window.adminLogin || window.app.actions.adminLogin;
window.saveDraft = window.saveDraft || window.app.actions.saveDraft;
window.publishMap = window.publishMap || window.app.actions.publishMap;
window.getAllStops = window.getAllStops || window.app.actions.getAllStops;
window.loadVanPosition = window.loadVanPosition || window.app.actions.loadVanPosition;
window.closeEditor = window.closeEditor || window.app.actions.closeEditor;
window.prepareMapData = window.prepareMapData || window.app.actions.prepareMapData;
