window.app = window.app || {};

window.app.poi = {
    normalizeCategory: function(category) {
        const lookup = {
            tourist: 'Tourist attractions',
            historic: 'Historic / heritage',
            museums: 'Museums / galleries',
            religious: 'Churches / mosques / religious',
            viewpoints: 'Viewpoints',
            nature: 'Nature / parks',
            food: 'Restaurants / cafés',
            accommodation: 'Hotels / accommodation',
            all: 'All useful POIs'
        };

        return lookup[category] || 'Other';
    },
    deduplicateByKey: function(items) {
        const map = {};

        items.forEach(function(item) {
            if (!item || !item.key) {
                return;
            }
            map[item.key] = item;
        });

        return Object.values(map);
    }
};
