(function(root) {
    'use strict';
    function describe(snapshot, now, failed) {
        const labels = { scorpion: 'ScorpionTrack' };
        const selected = labels[snapshot && snapshot.selection] || 'Not selected';
        if (failed) return { selected: 'Could not check', active: 'Connection unavailable', signal: 'Could not check', message: 'Could not check tracking. The provider configuration has not been changed.', state: 'warning' };
        const row = snapshot && snapshot.position;
        const name = row && ({ scorpiontrack: 'ScorpionTrack' })[row.source];
        const time = row && Date.parse(row.source_recorded_at);
        const age = Number.isFinite(time) ? Math.round((now - time) / 1000) : null;
        if (!name || age === null || age < -60) return { selected, active: 'Waiting for signal', signal: 'No recent reading',
            message: selected === 'Not selected' ? 'Choose a GPS provider to start tracking.' : 'Waiting for a reading from your selected provider.', state: 'waiting' };
        const limit = 180;
        const signal = age <= 0 ? 'Just now' : age < 60 ? age + ' seconds ago' : Math.floor(age / 60) + ' minutes ago';
        if (age > limit) return { selected, active: age > 600 ? 'No recent GPS' : 'Waiting for signal', signal: name + ': ' + signal,
            message: 'The ScorpionTrack observation is out of date. Check its source timestamp.', state: 'warning' };
        return { selected, active: name, signal,
            message: 'Using ScorpionTrack. Provider switching is disabled.', state: 'ready' };
    }
    const api = { describe };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.gpsProviderStatus = api;
})(typeof window !== 'undefined' ? window : globalThis);
