window.app = window.app || {};

window.app.facade = {
    services: window.app.services || {},
    features: window.app.features || {},
    ready: false,
    registerService: function(name, service) {
        if (!name) {
            return null;
        }

        this.services[name] = service;
        if (window.app && window.app.services) {
            window.app.services[name] = service;
        }

        return service;
    },
    getService: function(name) {
        return this.services[name] || (window.app && window.app.services ? window.app.services[name] : null) || null;
    },
    registerFeature: function(name, handler) {
        if (!name || typeof handler !== 'function') {
            return null;
        }

        this.features[name] = handler;
        if (window.app) {
            window.app[name] = handler;
        }

        return handler;
    },
    resolveFeature: function(name) {
        if (this.features[name]) {
            return this.features[name];
        }

        if (window.app && typeof window.app[name] === 'function') {
            return window.app[name];
        }

        return null;
    },
    setReady: function(value) {
        this.ready = Boolean(value);
        return this.ready;
    },
    ensureReady: function() {
        const map = window.app && window.app.getMap ? window.app.getMap() : (window.map || null);
        return Boolean(map && this.ready);
    }
};

window.app.services = window.app.facade.services;
window.app.features = window.app.facade.features;
window.app.registerService = window.app.facade.registerService;
window.app.getService = window.app.facade.getService;
window.app.registerFeature = window.app.facade.registerFeature;
window.app.resolveFeature = window.app.facade.resolveFeature;
window.app.setAppReady = window.app.facade.setReady;
window.app.ensureAppReady = window.app.facade.ensureReady;
