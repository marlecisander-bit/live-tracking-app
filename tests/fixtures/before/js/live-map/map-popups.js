/* Operational presentation only; no destination content or ETA calculations. */
function createPointPopup(layer, p) {
    layer.bindPopup(buildPointPopupHTML(p, null, null, null));
}
function buildPointPopupHTML(p, routeDistance, eta, userDistance, etaOptions) {
    var html = '<div class="operational-popup">';
    if (p.pointType === 'stop') html += '<div class="operational-popup-number">STOP ' + escapeHTML(p.stopNumber) + '</div>';
    html += '<strong>' + escapeHTML(p.name) + '</strong>';
    var position = typeof canonicalLivePosition === 'undefined' ? null : canonicalLivePosition;
    var fresh = window.trackingState.describe(position, {
        unavailable: document.getElementById('next-card')?.dataset.trackingHealth !== 'LIVE'
    }).health === 'LIVE';
    if (p.pointType === 'stop' && fresh) {
        if (etaOptions?.statusLabel) html += '<p>' + escapeHTML(etaOptions.statusLabel) + '</p>';
        else if (eta !== null && eta !== undefined && Number.isFinite(Number(eta)) && Number(eta) >= 0)
            html += '<p>ETA: ' + escapeHTML(formatETA(eta, etaOptions)) + '</p>';
    }
    return html + '</div>';
}
