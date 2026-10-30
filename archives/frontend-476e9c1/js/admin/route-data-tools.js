window.app = window.app || {};

window.app.route = {
    normalizeStopSequence: function(sequence) {
        if (!Array.isArray(sequence)) {
            return [];
        }

        return sequence.filter(function(item) {
            return item !== null && item !== undefined && item !== '';
        });
    },
    buildSequenceSummary: function(sequence) {
        const normalized = this.normalizeStopSequence(sequence);
        return normalized.length ? normalized.join(' → ') : 'No stops selected';
    },
    getLegs: function(sequence) {
        const normalized = this.normalizeStopSequence(sequence);
        const legs = [];

        for (let i = 0; i < normalized.length - 1; i += 1) {
            legs.push([normalized[i], normalized[i + 1]]);
        }

        return legs;
    },
    updateViaPoints: function(legIndex, viaPoints) {
        window.app.state.autoRouteViaPoints = window.app.state.autoRouteViaPoints || {};
        window.app.state.autoRouteViaPoints[legIndex] = viaPoints || [];
        return window.app.state.autoRouteViaPoints;
    }
};
