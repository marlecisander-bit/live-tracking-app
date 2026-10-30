window.app = window.app || {};

window.app.routeEngine = {
    getStopsFromSequence: function(sequence) {
        if (!Array.isArray(sequence)) {
            return [];
        }

        return sequence.filter(function(item) {
            return item !== null && item !== undefined && item !== '';
        });
    },
    getLegMatrix: function(sequence) {
        const stops = this.getStopsFromSequence(sequence);
        const legs = [];

        for (let index = 0; index < stops.length - 1; index += 1) {
            legs.push([stops[index], stops[index + 1]]);
        }

        return legs;
    },
    setViaPoints: function(legIndex, points) {
        window.app.state = window.app.state || {};
        window.app.state.autoRouteViaPoints = window.app.state.autoRouteViaPoints || {};
        window.app.state.autoRouteViaPoints[legIndex] = points || [];
        return window.app.state.autoRouteViaPoints;
    }
};

window.app.routeModule = window.app.routeEngine;
