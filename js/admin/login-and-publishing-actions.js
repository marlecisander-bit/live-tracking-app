window.app.actions.adminLogin = function() {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.display = 'none';
    }
    if (typeof window.showToast === 'function') {
        window.showToast('Logged in successfully');
    }
    return true;
};

window.app.actions.saveDraft = function() {
    if (window.app && window.app.state) {
        window.app.state.unpublishedChanges = 0;
    }
    if (typeof window.updatePublishStatus === 'function') {
        window.updatePublishStatus();
    }
    if (typeof window.showToast === 'function') {
        window.showToast('Draft saved');
    }
    return true;
};

window.app.actions.publishMap = function() {
    if (typeof window.showToast === 'function') {
        window.showToast('Map published');
    }
    if (window.app && window.app.state) {
        window.app.state.unpublishedChanges = 0;
    }
    if (typeof window.updatePublishStatus === 'function') {
        window.updatePublishStatus();
    }
    return true;
};
