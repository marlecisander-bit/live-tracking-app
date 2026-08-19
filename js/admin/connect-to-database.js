window.app = window.app || {};

window.app.supabase = {
    getClient: function() {
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('Supabase SDK is not loaded.');
        }

        if (!this.client) {
            this.client = window.supabase.createClient(
                window.SUPABASE_URL,
                window.SUPABASE_KEY
            );
        }

        return this.client;
    },
    init: function() {
        if (window.SUPABASE_URL && window.SUPABASE_KEY) {
            this.client = window.supabase.createClient(
                window.SUPABASE_URL,
                window.SUPABASE_KEY
            );
        }

        return this.client || null;
    }
};

window.app.supabaseClient = window.app.supabase.getClient;
