const Storage = {
    VERSION: 5,
    KEYS: {
        CONVERSATIONS: 'chatgpt_clone_conversations',
        ACTIVE_ID: 'chatgpt_clone_active_id',
        SETTINGS: 'chatgpt_clone_settings',
        ENCRYPT: 'chatgpt_clone_encrypt',
        VERSION_KEY: 'chatgpt_clone_version'
    },

    DEFAULT_SYSTEM_PROMPT: 'You are ChatGPT, a helpful AI assistant. Format responses using clean Markdown with code blocks where appropriate.',

    DEFAULT_SETTINGS: {
        provider: 'simulated',
        apiKey: '',
        model: 'gpt-4o',
        providerKeys: { openai: '', gemini: '', openrouter: '', deepseek: '' },
        providerModels: {
            openai: 'gpt-4o', gemini: 'gemini-2.0-flash',
            openrouter: 'openai/gpt-4o-mini', deepseek: 'deepseek-chat'
        },
        userName: 'User Account',
        speechRate: 1.0,
        theme: 'system',
        accentColor: '#10a37f',
        systemPrompt: 'You are ChatGPT, a helpful AI assistant. Format responses using clean Markdown with code blocks where appropriate.',
        activePersona: null,
        showThinking: false,
        webSearchActive: false,
        realWebSearch: false,
        pinnedChats: [],
        promptLibrary: [],
        bookmarks: [],
        memories: [],
        personas: [],
        templates: [],
        folders: [],
        shares: [],
        shareServer: '',
        language: 'en',
        encryption: false,
        streamSpeed: 1.0,
        autoTranslate: false,
        notifications: false,
        analytics: { totalMessages: 0, totalTokens: 0, byModel: {}, byDay: {} }
    },

    _store: null,
    _ready: null,
    _usingFallback: false,

    _isEncrypted() {
        try {
            return localStorage.getItem(this.KEYS.ENCRYPT) === '1';
        } catch (e) {
            return false;
        }
    },

    _init() {
        if (this._ready) return this._ready;

        this._ready = (async () => {
            if (typeof localforage === 'undefined') {
                console.error('[Storage] localforage not found, falling back to localStorage');
                this._usingFallback = true;
                this._store = {
                    getItem: async (k) => localStorage.getItem(k),
                    setItem: async (k, v) => localStorage.setItem(k, v),
                    removeItem: async (k) => localStorage.removeItem(k)
                };
                return;
            }

            this._store = localforage.createInstance({
                name: 'chatgpt_clone',
                storeName: 'kv',
                description: 'ChatGPT clone conversations, settings and metadata'
            });

            try {
                await this._migrateFromLocalStorage();
            } catch (e) {
                console.warn('[Storage] Migration failed (continuing with IndexedDB):', e);
            }
        })();

        return this._ready;
    },

    async _migrateFromLocalStorage() {
        if (this._usingFallback) return;

        const keys = [this.KEYS.CONVERSATIONS, this.KEYS.SETTINGS, this.KEYS.ACTIVE_ID];
        let migrated = 0;

        for (const key of keys) {
            let raw = null;
            try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
            if (raw === null) continue;

            const existing = await this._store.getItem(key);

            if (existing !== null && existing !== undefined) {
                localStorage.removeItem(key);
                continue;
            }

            await this._store.setItem(key, raw);
            localStorage.removeItem(key);
            migrated++;
        }

        if (migrated > 0) console.info(`[Storage] Migrated ${migrated} key(s) from localStorage to IndexedDB.`);
        try { localStorage.setItem(this.KEYS.VERSION_KEY, String(this.VERSION)); } catch (e) {}
    },

    async _safeGet(key, fallback) {
        try {
            await this._init();

            const raw = await this._store.getItem(key);
            if (raw === null || raw === undefined) return fallback;

            const data = this._isEncrypted() ? Utils.decrypt(raw) : raw;
            if (data === null || data === undefined) return fallback;

            return JSON.parse(data);
        } catch (e) {
            console.warn(`Read failed: ${key}`, e);
            return fallback;
        }
    },

    async _safeSet(key, value) {
        try {
            await this._init();

            const json = JSON.stringify(value);
            const data = this._isEncrypted() ? Utils.encrypt(json) : json;

            await this._store.setItem(key, data);
            return true;
        } catch (e) {
            console.warn(`Write failed: ${key}`, e);
            if (window.ChatRenderer) ChatRenderer.showToast(e && e.name === 'QuotaExceededError' ? 'Storage full' : 'Could not save data');
            return false;
        }
    },

    async getSettings() {
        const saved = await this._safeGet(this.KEYS.SETTINGS, {}) || {};
        const merged = { ...this.DEFAULT_SETTINGS, ...saved };

        merged.providerKeys = { ...this.DEFAULT_SETTINGS.providerKeys, ...(saved.providerKeys || {}) };
        merged.providerModels = { ...this.DEFAULT_SETTINGS.providerModels, ...(saved.providerModels || {}) };

        ['pinnedChats', 'promptLibrary', 'bookmarks', 'memories', 'personas', 'templates', 'folders', 'shares']
            .forEach(k => { merged[k] = Array.isArray(saved[k]) ? saved[k] : []; });

        merged.analytics = { ...this.DEFAULT_SETTINGS.analytics, ...(saved.analytics || {}) };

        return merged;
    },

    async saveSettings(settings) {
        return this._safeSet(this.KEYS.SETTINGS, settings);
    },

    async getConversations() {
        let convs = await this._safeGet(this.KEYS.CONVERSATIONS, null);

        if (!Array.isArray(convs) || convs.length === 0) {
            convs = [this.createInitialConversation()];
            await this.saveConversations(convs);
        }

        return convs;
    },

    async saveConversations(conversations) {
        return this._safeSet(this.KEYS.CONVERSATIONS, conversations);
    },

    async getActiveId() {
        await this._init();
        try {
            return await this._store.getItem(this.KEYS.ACTIVE_ID);
        } catch (e) {
            console.warn('Read failed: active id', e);
            return null;
        }
    },

    async setActiveId(id) {
        await this._init();
        try {
            await this._store.setItem(this.KEYS.ACTIVE_ID, id);
        } catch (e) {
            console.warn('Write failed: active id', e);
        }
    },

    async setEncryption(enabled) {
        const settings = await this.getSettings();
        const convs = await this.getConversations();

        try {
            localStorage.setItem(this.KEYS.ENCRYPT, enabled ? '1' : '0');
        } catch (e) {
            console.warn('Could not persist encryption flag', e);
        }

        await this.saveSettings(settings);
        await this.saveConversations(convs);
    },

    createInitialConversation() {
        return {
            id: Utils.uid('conv'),
            title: 'Welcome to ChatGPT',
            model: 'gpt-4o',
            folderId: null,
            createdAt: new Date().toISOString(),
            messages: [{
                id: Utils.uid('msg'),
                sender: 'assistant',
                text: "Hello! I'm **ChatGPT**. Ask me to write code, explain concepts, compose text, or brainstorm ideas.\n\n> **Pro tip:** Type `/` for slash commands, `?` for shortcuts, or `Ctrl+Shift+F` to search all messages.",
                timestamp: new Date().toISOString()
            }]
        };
    },

    async clearAll() {
        try {
            await this._init();
            for (const k of Object.values(this.KEYS)) {
                await this._store.removeItem(k);
            }
        } catch (e) {
            console.warn('[Storage] Failed to clear IndexedDB', e);
        }

        try {
            if (typeof localforage !== 'undefined') {
                await localforage.createInstance({ name: 'chatgpt_clone_ide', storeName: 'kv' }).clear();
            }
        } catch (e) {
            console.warn('[Storage] Failed to clear IDE workspace', e);
        }

        Object.values(this.KEYS).forEach((k) => {
            try { localStorage.removeItem(k); } catch (e) {}
        });
    }
};
