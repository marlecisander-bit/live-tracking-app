window.app = window.app || {};

window.app.gps = {
    startTracking: function() {
        if (!window.map) {
            return false;
        }

        if (this.timerId) {
            clearInterval(this.timerId);
        }

        this.timerId = setInterval(function() {
            if (typeof window.refreshGPSStatus === 'function') {
                window.refreshGPSStatus();
            }
        }, window.app && window.app.config ? window.app.config.gpsUpdateInterval : 5000);

        return true;
    },
    stopTracking: function() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
};

window.app.startGpsTracking = window.app.gps.startTracking;
window.app.stopGpsTracking = window.app.gps.stopTracking;
