/* Transport boundary: REST recovery and marker rendering stay with consumers. */
(function(root) {
    function subscribe(client, name, options, onChange, onUnavailable) {
        return client.channel(name).on('postgres_changes', {
            event: '*', schema: 'public', table: options.table,
            filter: 'vehicle_id=eq.' + options.vehicleId
        }, function(payload) {
            const row = payload && payload.new;
            if (!row || row.vehicle_id !== options.vehicleId) return;
            if (options.projectId && row.project_id !== options.projectId) return;
            onChange(payload);
        }).subscribe(function(status) {
            if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && onUnavailable) onUnavailable();
        });
    }
    root.trackingRealtime = { subscribe };
})(typeof window !== 'undefined' ? window : globalThis);
