(function() {
    var STORAGE_KEY = 'sightseeing-shkodra-gps-source';
    var ALLOWED = ['automatic', 'pixel', 'scorpion'];

    function normalize(value) {
        return ALLOWED.indexOf(value) >= 0 ? value : (window.appConfig.defaultGpsSource || 'automatic');
    }

    function get() {
        try { return normalize(window.localStorage.getItem(STORAGE_KEY)); }
        catch (error) { return normalize(null); }
    }

    function set(value) {
        var selected = normalize(value);
        try { window.localStorage.setItem(STORAGE_KEY, selected); } catch (error) {}
        document.dispatchEvent(new CustomEvent('gpssourcechange', { detail: selected }));
        return selected;
    }

    function bind(select) {
        if (!select) return;
        select.value = get();
        select.addEventListener('change', function() { set(select.value); });
        document.addEventListener('gpssourcechange', function(event) { select.value = normalize(event.detail); });
        window.addEventListener('storage', function(event) {
            if (event.key !== STORAGE_KEY) return;
            select.value = get();
            document.dispatchEvent(new CustomEvent('gpssourcechange', { detail: select.value }));
        });
    }

    window.gpsSource = { get: get, set: set, bind: bind };
})();
