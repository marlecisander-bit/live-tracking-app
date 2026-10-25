(function(root) {
    'use strict';
    function describe(snapshot, now, failed) {
        const labels = { pixel: 'Google Pixel', scorpion: 'ScorpionTrack', automatic: 'Automatic' };
        const selected = labels[snapshot && snapshot.selection] || 'Not selected';
        if (failed) return { selected: 'Could not check', active: 'Connection unavailable', signal: 'Could not check', message: 'Could not check tracking. Your saved GPS choice has not been changed.', state: 'warning' };
        const row = snapshot && snapshot.position;
        const name = row && ({ 'pixel-android': 'Google Pixel', scorpiontrack: 'ScorpionTrack' })[row.source];
        const time = row && Date.parse(row.source_recorded_at);
        const age = Number.isFinite(time) ? Math.round((now - time) / 1000) : null;
        if (!name || age === null || age < -60) return { selected, active: 'Waiting for signal', signal: 'No recent reading',
            message: selected === 'Not selected' ? 'Choose a GPS provider to start tracking.' : 'Waiting for a reading from your selected provider.', state: 'waiting' };
        const limit = snapshot.selection === 'automatic' && row.source === 'pixel-android' ? 30 : 180;
        const signal = age <= 0 ? 'Just now' : age < 60 ? age + ' seconds ago' : Math.floor(age / 60) + ' minutes ago';
        if (age > limit) return { selected, active: age > 600 ? 'No recent GPS' : 'Waiting for signal', signal: name + ': ' + signal,
            message: snapshot.selection === 'automatic' ? 'No recent selected signal. Waiting for Pixel or ScorpionTrack.' : 'The selected tracker is out of date. Another provider will not be used unless you change your choice.', state: 'warning' };
        return { selected, active: name, signal,
            message: snapshot.selection === 'automatic' ? (row.source === 'scorpiontrack'
                ? 'Automatic selected ScorpionTrack because a recent Pixel reading was unavailable.'
                : 'Automatic is using Pixel. ScorpionTrack is the fallback if Pixel stops updating.')
                : 'Using your chosen provider. Automatic switching is off.', state: 'ready' };
    }
    const api = { describe };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.gpsProviderStatus = api;
})(typeof window !== 'undefined' ? window : globalThis);
