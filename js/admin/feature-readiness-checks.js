window.app = window.app || {};

window.app.guard = {
    hasMap: function() {
        const map = window.app && window.app.getMap ? window.app.getMap() : (window.map || null);
        return !!(map && window.L);
    },
    hasSupabase: function() {
        return !!(window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY);
    },
    hasSelection: function() {
        return !!(window.selectedLayer || window.selectedRouteLayer);
    }
};

window.app.ensureMap = function() {
    if (!this.guard.hasMap()) {
        throw new Error('Map is not initialized.');
    }
};
