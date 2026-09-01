(function() {
    var STORAGE_KEY = 'sightseeing-shkodra-gps-source';
    var ALLOWED = ['automatic', 'pixel', 'scorpion'];

    function normalize(value) {
        return ALLOWED.indexOf(value) >= 0 ? value : (window.appConfig.defaultGpsSource || 'automatic');
    }

    function get() {
        var urlValue = null;
        try { urlValue = new URLSearchParams(window.location.search).get('gps'); }
        catch (error) {}
        if (ALLOWED.indexOf(urlValue) >= 0) return urlValue;

        if (ALLOWED.indexOf(window.appConfig.projectGpsSource) >= 0) {
            return window.appConfig.projectGpsSource;
        }

        /* Public source selection is shared project configuration, never a
           preference left in localStorage by this particular phone. */
        if (/\/live-map\.html$/i.test(window.location.pathname)) {
            return normalize(window.appConfig.defaultGpsSource);
        }

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
