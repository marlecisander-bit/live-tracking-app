/* Operational presentation only; no destination content or ETA calculations. */
function createPointPopup(layer, p) {
    layer.bindPopup(buildPointPopupHTML(p, null, null, null));
}
function buildPointPopupHTML(p, routeDistance, eta, userDistance, etaOptions) {
    var accent = p.pointType === 'stop' ? window.stopDesign.resolve(p).color : '#087638';
    var html = '<div class="operational-popup" style="--stop-color:' + accent + '">';
    if (p.pointType === 'stop') html += '<div class="operational-popup-number">STOP ' + escapeHTML(p.stopNumber) + '</div>';
    html += '<strong>' + escapeHTML(p.name) + '</strong>';
    if (p.pointType === 'stop') {
        var entry=window.publicOperationalStatus?.stopStatuses?.find(s=>s.id===String(p.objectId));
        html += '<p>' + escapeHTML(entry?.label || 'Route information updating') + '</p>';
    }
    return html + '</div>';
}
