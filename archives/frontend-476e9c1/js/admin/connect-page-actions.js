window.app = window.app || {};

window.app.bindings = {
    bindDataActions: function(root) {
        const scope = root || document;
        const elements = scope.querySelectorAll('[data-action]');

        elements.forEach(function(element) {
            const actionName = element.getAttribute('data-action');
            const eventName = element.getAttribute('data-event') || 'click';
            if (!actionName) {
                return;
            }

            const handler = window.app.resolveAction ? window.app.resolveAction(actionName) : window[actionName];
            if (typeof handler !== 'function') {
                return;
            }

            element.addEventListener(eventName, function(event) {
                if (element.hasAttribute('data-self-only') && event.target !== element) {
                    return;
                }

                event.preventDefault();

                const section = element.getAttribute('data-section');
                if (section) {
                    handler.call(window, section, event, element);
                    return;
                }

                if (element.hasAttribute('data-argument')) {
                    const value = element.getAttribute('data-argument');
                    const argument = value === 'true' ? true : value === 'false' ? false : value;
                    handler.call(window, argument, event, element);
                    return;
                }

                handler.call(window, event, element);
            });
        });
    },
    bindBySelector: function(selector, handler) {
        const elements = document.querySelectorAll(selector);

        elements.forEach(function(element) {
            element.addEventListener('click', function(event) {
                event.preventDefault();
                handler.call(window, event, element);
            });
        });
    }
};

window.app.bindDataActions = window.app.bindings.bindDataActions;
window.app.bindBySelector = window.app.bindings.bindBySelector;
