(function() {
    // The replacement backend has one authenticated Scorpion binding.
    // URL parameters and old browser preferences cannot change its source.
    function get() { return 'scorpion'; }
    function bind(select) { if (select) { select.value = get(); select.disabled = true; } }
    window.gpsSource = { get: get, set: get, bind: bind };
})();

// Server owns the selected feed. Realtime is optional; the database remains authoritative.
window.selectedTracking = (function() {
    var clients = new WeakMap(), active = new Set();
    var metrics = { reads: 0, realtimeMessages: 0, cacheHits: 0, errors: 0, reconnects: 0, staleResponses: 0 };
    function clear() {
        active.forEach(function(entry) { entry.closed = true; if (entry.channel) entry.client.removeChannel(entry.channel); });
        active.clear(); clients = new WeakMap();
    }
    function changed(entry) {
        if (entry.closed || typeof document === 'undefined') return;
        document.dispatchEvent(new CustomEvent('selectedtrackingchange', { detail: { vehicleId: entry.vehicleId } }));
    }
    if (typeof document !== 'undefined') {
        ['projectchange', 'gpssourcechange', 'adminsessionended', 'visibilitychange'].forEach(function(name) { document.addEventListener(name, clear); });
    }
    if (window.addEventListener) {
        window.addEventListener('pagehide', clear);
        window.addEventListener('online', clear);
        window.addEventListener('pageshow', clear);
    }
    return { clear: clear, metrics: metrics, read: function(client, vehicleId) {
        var realtime = window.appConfig.selectedTrackingRealtimeEnabled === true;
        var entries = clients.get(client);
        if (!entries) { entries = new Map(); clients.set(client, entries); }
        var entry = entries.get(vehicleId);
        if (!entry) {
            entry = { client: client, vehicleId: vehicleId, started: -Infinity, revision: 0, connected: false, pending: false, closed: false, retryAfter: 0, failures: 0, everConnected: false };
            entries.set(vehicleId, entry); active.add(entry);
            if (realtime && client.channel) {
                entry.channel = client.channel('selected-tracking-' + vehicleId).on('postgres_changes', {
                    event: '*', schema: 'public', table: 'tracking_live_snapshots', filter: 'vehicle_id=eq.' + vehicleId
                }, function(payload) {
                    if (entry.closed) return;
                    var row = payload && payload.new;
                    if (!row || row.vehicle_id !== vehicleId || !row.snapshot || Number(row.revision) <= entry.revision) return;
                    // Messages update UI immediately but never postpone the periodic authorization/sanity read.
                    entry.revision = Number(row.revision); entry.value = row.snapshot;
                    entry.promise = Promise.resolve(entry.value); metrics.realtimeMessages++;
                    changed(entry);
                }).subscribe(function(status) {
                    if (entry.closed) return;
                    if (status === 'SUBSCRIBED' && !entry.connected) {
                        if (entry.everConnected) metrics.reconnects++;
                        entry.everConnected = true; entry.retryAfter = 0;
                    }
                    entry.connected = status === 'SUBSCRIBED';
                    entry.started = -Infinity;
                    changed(entry);
                });
            }
        }
        var fallback = Number(window.appConfig.trackingFallbackIntervalMs || 15000);
        if (!Number.isFinite(fallback)) fallback = 15000;
        fallback = Math.max(10000, Math.min(30000, fallback));
        var ttl = realtime ? (entry.connected ? 60000 : fallback) : 4900;
        if (!entry.pending && Date.now() < entry.retryAfter) {
            if (entry.value) return Promise.resolve(entry.value);
            return Promise.reject(new Error('Tracking reconnect pending'));
        }
        if (entry.pending || (entry.promise && Date.now() - entry.started < ttl)) { metrics.cacheHits++; return entry.promise; }
        entry.pending = true; entry.started = Date.now(); metrics.reads++;
        var requestRevision = entry.revision;
        var promise = Promise.resolve().then(function() {
            return realtime ? client.from('tracking_live_snapshots').select('snapshot,revision').eq('vehicle_id',vehicleId).maybeSingle()
                : client.rpc('selected_tracking_snapshot', { target_vehicle: vehicleId });
        }).then(function(result) {
            if (result.error) throw result.error;
            entry.failures = 0; entry.retryAfter = 0;
            if (realtime) {
                // A later Realtime revision can beat an in-flight HTTP response.
                if (!result.data && entry.revision === requestRevision) { entry.value = { position: null, stop: null, eta: null }; entry.revision = 0; }
                else if (!result.data) { metrics.staleResponses++; }
                else if (Number(result.data.revision) >= entry.revision) { entry.value = result.data.snapshot; entry.revision = Number(result.data.revision); }
                return entry.value;
            }
            return result.data || { position: null, stop: null, eta: null };
        }).catch(function(error) {
            metrics.errors++; entry.started = -Infinity; entry.promise = null;
            if (realtime) { entry.failures++; entry.retryAfter = Date.now() + Math.min(60000, fallback * Math.pow(2, Math.min(entry.failures - 1, 2))); }
            throw error;
        }).finally(function() { entry.pending = false; });
        entry.promise = promise;
        return promise;
    }};
})();
