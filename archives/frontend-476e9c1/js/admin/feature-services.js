window.app = window.app || {};

window.app.services = {
    map: window.app.mapService || null,
    route: window.app.routeEngine || window.app.route || null,
    poi: window.app.poi || null,
    supabase: window.app.supabase || null,
    gps: window.app.gps || null
};

window.app.getService = function(name) {
    if (!this.services || !this.services[name]) {
        return null;
    }

    return this.services[name];
};

window.app.registerService = function(name, service) {
    if (!this.services) {
        this.services = {};
    }

    this.services[name] = service;
    return service;
};
