window.ui = {
    get: function(id) {
        return document.getElementById(id);
    },
    text: function(id, value) {
        const element = this.get(id);

        if (element) {
            element.textContent = value;
        }
    },
    value: function(id, value) {
        const element = this.get(id);

        if (element) {
            element.value = value;
        }
    },
    show: function(id, display = 'block') {
        const element = this.get(id);

        if (element) {
            element.style.display = display;
        }
    },
    hide: function(id) {
        this.show(id, 'none');
    },
    addClass: function(id, className) {
        const element = this.get(id);

        if (element) {
            element.classList.add(className);
        }
    },
    removeClass: function(id, className) {
        const element = this.get(id);

        if (element) {
            element.classList.remove(className);
        }
    }
};

window.app = window.app || {};
window.app.ui = window.ui;
