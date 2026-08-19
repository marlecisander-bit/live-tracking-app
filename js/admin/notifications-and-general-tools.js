window.app = window.app || {};

window.app.helpers = {
    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    safeText: function(value, fallback) {
        return value == null || value === '' ? fallback : String(value);
    },
    safeNumber: function(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    },
    setLoading: function(isLoading, message) {
        const loader = document.getElementById('loading-overlay');

        if (!loader) {
            return;
        }

        loader.style.display = isLoading ? 'flex' : 'none';

        const label = document.getElementById('loading-message');
        if (label) {
            label.textContent = message || 'Loading...';
        }
    },
    showToast: function(message) {
        const toast = document.getElementById('toast');

        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.add('show');

        clearTimeout(window.app.toastTimer);
        window.app.toastTimer = setTimeout(function() {
            toast.classList.remove('show');
        }, 2200);
    },
    updatePublishStatus: function() {
        const publishInfo = document.getElementById('last-published');
        if (!publishInfo) {
            return;
        }

        const latestPublishedId = window.latestPublishedId || 'Never';
        publishInfo.textContent = latestPublishedId;
    },
    triggerGeoJsonImport: function() {
        const input = document.getElementById('import-file');
        if (input) {
            input.click();
        }
    }
};

window.app.util = window.app.helpers;

if (!window.setLoading) {
    window.setLoading = window.app.helpers.setLoading;
}

if (!window.showToast) {
    window.showToast = window.app.helpers.showToast;
}

if (!window.updatePublishStatus) {
    window.updatePublishStatus = window.app.helpers.updatePublishStatus;
}

if (!window.triggerGeoJsonImport) {
    window.triggerGeoJsonImport = window.app.helpers.triggerGeoJsonImport;
}
