window.app = window.app || {};

window.app.events = {
    bindAction: function(selector, handler) {
        const element = document.querySelector(selector);
        if (!element) {
            return false;
        }

        element.addEventListener('click', handler);
        return true;
    },
    bindAllActions: function(actions) {
        Object.keys(actions || {}).forEach(function(key) {
            const selector = key;
            const handler = actions[key];
            if (typeof handler === 'function') {
                window.app.events.bindAction(selector, handler);
            }
        });
    },
    bindByDataAction: function(root) {
        const container = root || document;
        const actions = container.querySelectorAll('[data-action]');

        actions.forEach(function(element) {
            const actionName = element.getAttribute('data-action');
            const fn = window[actionName];

            if (typeof fn === 'function') {
                element.addEventListener('click', function(event) {
                    event.preventDefault();
                    fn.call(window, event);
                });
            }
        });
    }
};

window.app.bindAction = window.app.events.bindAction;
window.app.bindAllActions = window.app.events.bindAllActions;
window.app.bindByDataAction = window.app.events.bindByDataAction;
