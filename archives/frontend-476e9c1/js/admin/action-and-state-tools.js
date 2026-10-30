window.app = window.app || {};
window.app.runtime = window.app.runtime || {};

window.app.runtime.initializeActionRegistry = function() {
    if (!window.app.actions) {
        window.app.actions = {};
    }

    return window.app.actions;
};

window.app.runtime.registerActionGroup = function(groupName, actions) {
    const registry = window.app.runtime.initializeActionRegistry();
    const group = actions || {};

    Object.keys(group).forEach(function(name) {
        const action = group[name];
        if (typeof action === 'function') {
            registry[name] = action;
            window[name] = action;
        }
    });

    if (groupName && window.app[groupName]) {
        window.app[groupName] = Object.assign(window.app[groupName] || {}, group);
    }

    return registry;
};

window.app.runtime.resolveAction = function(name) {
    if (window.app && window.app.actions && typeof window.app.actions[name] === 'function') {
        return window.app.actions[name];
    }

    if (typeof window[name] === 'function') {
        return window[name];
    }

    return null;
};

window.app.runtime.getMap = function() {
    if (window.app && window.app.state && window.app.state.map) {
        return window.app.state.map;
    }

    return window.map || null;
};

window.app.runtime.setMap = function(map) {
    if (window.app && window.app.state) {
        window.app.state.map = map;
        window.app.state.mapReady = Boolean(map);
    }

    window.map = map;
    return map;
};

window.app.runtime.getCurrentPointType = function() {
    if (window.app && window.app.state && window.app.state.currentNewPointType) {
        return window.app.state.currentNewPointType;
    }

    return window.currentNewPointType || 'stop';
};

window.app.runtime.setCurrentPointType = function(type) {
    const pointType = type || 'stop';

    if (window.app && window.app.state) {
        window.app.state.currentNewPointType = pointType;
    }

    window.currentNewPointType = pointType;
    return pointType;
};

window.app.registerActionGroup = window.app.runtime.registerActionGroup;
window.app.resolveAction = window.app.runtime.resolveAction;
window.app.getMap = window.app.runtime.getMap;
window.app.setMap = window.app.runtime.setMap;
window.app.getCurrentPointType = window.app.runtime.getCurrentPointType;
window.app.setCurrentPointType = window.app.runtime.setCurrentPointType;
