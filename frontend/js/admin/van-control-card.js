/* Presentation only: reuse canonical classification; no requests or subscriptions. */
(function () {
    const card = document.getElementById('gps-card');
    const toggle = document.getElementById('van-details-toggle');
    const details = document.getElementById('van-card-details');
    function expand(open) {
        details.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close van details' : 'Show van details');
        toggle.innerHTML = '<span class="van-details-label">' + (open ? 'Close' : 'Details') + '</span><span aria-hidden="true">' + (open ? '&#8963;' : '&#8964;') + '</span>';
        card.classList.toggle('is-expanded', open);
    }
    toggle.addEventListener('click', function () { expand(details.hidden); });
    card.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !details.hidden) { expand(false); toggle.focus(); }
    });
    window.adminVanCard = { render: function (position, failed) {
        const state = window.trackingState.classify(position);
        const provider = position && ({ 'pixel-android': 'Google Pixel', scorpiontrack: 'ScorpionTrack' })[position.source];
        if (provider) document.getElementById('gps-source-active').textContent = provider;
        const labels = { MOVING: 'LIVE', STATIONARY: 'STOPPED', GPS_DELAYED: 'DELAYED', GPS_OFFLINE: 'NO RECENT SIGNAL', UNKNOWN: 'GPS LIVE' };
        card.dataset.state = failed ? 'GPS_DELAYED' : state;
        document.getElementById('gps-state-label').textContent = failed ? 'UNAVAILABLE' : state === 'PARKED_AT_STOP'
            ? 'PARKED' + (position.current_stop_number != null ? ' · STOP ' + position.current_stop_number : '') : labels[state];
        const time = Date.parse(position && position.source_recorded_at);
        const age = Math.max(0, Math.floor((Date.now() - time) / 1000));
        document.getElementById('gps-update').textContent = Number.isFinite(time) ? (age < 60 ? age + 's ago' : Math.floor(age / 60) + 'm ago') : '--';
        if (!position || failed) document.getElementById('gps-speed').textContent = '--';
    } };
})();
