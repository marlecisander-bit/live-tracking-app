/* Connect public-page buttons to their named actions. */
document.querySelectorAll('[data-action]').forEach(function(element) {
    element.addEventListener('click', function(event) {
        const actionName = element.getAttribute('data-action');
        const action = window[actionName];

        if (typeof action === 'function') {
            event.preventDefault();
            action.call(window, event, element);
        }
    });
});
