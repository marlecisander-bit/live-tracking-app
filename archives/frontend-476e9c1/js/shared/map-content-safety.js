(function() {
    window.mapContentSafety = {
        escape: function(value) {
            return String(value == null ? '' : value).replace(/[&<>"']/g, function(character) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
            });
        },
        pngSticker: function(value) {
            return typeof value === 'string' && value.length <= 200 * 1024 &&
                /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
        }
    };
})();
