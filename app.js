// Firebase Setup
const firebaseConfig = {
  apiKey: "AIzaSyA-83nz1ljxfSJvkPdhxk13mSdYK5un9kU",
  authDomain: "jarvis-web-8cc0f.firebaseapp.com",
  databaseURL: "https://jarvis-web-8cc0f-default-rtdb.firebaseio.com",
  projectId: "jarvis-web-8cc0f",
  storageBucket: "jarvis-web-8cc0f.firebasestorage.app",
  messagingSenderId: "552908559976",
  appId: "1:552908559976:web:c9b3093cc7557ef4ec8ddd",
  measurementId: "G-KL94BXW410"
};
class ChatGPTApp {
    constructor() {
        this.conversations = [];
        this.activeConversationId = null;
        this.settings = {};
        this.webSearchActive = false;
        this.isGenerating = false;
        this.attachments = [];
        this._rafScroll = null;
        this._autoSaveTimer = null;
        this._recognition = null;
        this._pendingAttachmentFile = null;
        this.view = 'chat';
        this._settingsPushed = false;
        this._settingsSection = 'general';
        this._savedTimer = null;
        this.SECTION_TITLES = {
            persona: 'AI Persona', memory: 'Memory', general: 'General', language: 'Language', appearance: 'Appearance',
            shortcuts: 'Keyboard shortcuts', provider: 'AI provider & model', sharing: 'Sharing', data: 'Data & privacy'
        };
        this.BUILTIN_PERSONAS = [
            { id: 'dev', icon: '🧑‍💻', name: 'Senior Developer', prompt: 'You are a senior software engineer. Provide production-quality code with comments, error handling, and best practices. Explain your reasoning.' },
            { id: 'writer', icon: '✍️', name: 'Creative Writer', prompt: 'You are a creative writing expert. Use vivid imagery, compelling narratives, and elegant prose. Engage the reader emotionally.' },
            { id: 'teacher', icon: '🎓', name: 'Teacher', prompt: 'You are a patient, expert teacher. Break down complex topics into simple steps with analogies and examples. Check understanding.' },
            { id: 'business', icon: '💼', name: 'Business Consultant', prompt: 'You are a strategic business consultant. Provide actionable, data-driven advice. Focus on ROI, efficiency, and risk.' },
            { id: 'legal', icon: '⚖️', name: 'Legal Advisor', prompt: 'You are a legal advisor. Provide clear explanations of legal concepts. Always recommend consulting a licensed attorney.' },
            { id: 'health', icon: '👨‍⚕️', name: 'Health Coach', prompt: 'You are a health coach. Provide general wellness guidance. Always recommend consulting medical professionals.' }
        ];

        this.PROVIDER_META = {
            simulated: { label: 'Simulated', hint: 'No API needed.', keyHelp: '' },
            openai: { label: 'OpenAI', hint: 'Get key from platform.openai.com', keyHelp: 'sk-...' },
            gemini: { label: 'Google Gemini', hint: 'Free key from aistudio.google.com', keyHelp: 'AIza...' },
            openrouter: { label: 'OpenRouter', hint: 'openrouter.ai/keys', keyHelp: 'sk-or-v1-...' },
            deepseek: { label: 'DeepSeek', hint: 'platform.deepseek.com', keyHelp: 'sk-...' }
        };

        this._on = this._on.bind(this);
        this._ = this._.bind(this);
        this.initDOM();
        this.bindEvents();
        this.applyLanguage();
        this.applyAccentColor();
    }

    _on(el, ev, handler) {
        if (el && el.addEventListener) el.addEventListener(ev, handler);
    }

    _(id) { return document.getElementById(id); }

    initDOM() {
        const ids = [
            'sidebar','sidebarOverlay','openSidebarBtn','closeSidebarBtn','newChatBtn','mainWrapper',
            'chatHistoryContainer','searchChatInput','modelSelectorBtn','modelDropdown','currentModelLabel',
            'mainNewChatBtn','headerMoreBtn','headerMoreMenu','headerSystemPromptBtn',
            'clearCurrentChatBtn','searchAllBtn','comparisonBtn',
            'emptyState','activeMessagesList','messagesContainer',
            'chatInput','sendBtn','stopBtn','webSearchBtn','webSearchBadge','charCount','saveIndicator','costEstimate',
            'attachmentBtn','fileInput','attachmentName','attachmentsPreview','voiceInputBtn','promptLibraryBtn',
            'openSettingsBtn','openIdeBtn',
            'settingsPage','settingsShell','settingsBackBtn','settingsTitle','settingsSaved','settingsNav','settingsContent','settingsSearchInput','settingsNoResults',
            'providerSelect','providerHint','apiKeyGroup','apiKeyInput','apiKeyHelp','toggleApiKeyVisibilityBtn',
            'modelGroup','modelInput','modelHint','modelsList','loadModelsBtn',
            'userNameInput','speechRateInput','speechRateLabel','streamSpeedInput','streamSpeedLabel',
            'accentColorInput','accentResetBtn','realWebSearchToggle','showThinkingToggle','encryptionToggle','notificationsToggle',
            'personasGrid','resetPersonaBtn','personaIconInput','personaNameInput','personaPromptInput','addPersonaBtn',
            'memoryList','newMemoryInput','addMemoryBtn',
            'shareServerInput','testShareServerBtn','shareServerStatus','sharesList','openAnalyticsBtn',
            'clearAllDataBtn','exportAllChatsBtn','shareChatBtn','importChatBtn','importFileInput',
            'exportDropdownBtn','exportDropdown',
            'themeToggleBtn','themeDropdown','themeIcon','apiStatusIndicator','userDisplayName',
            'promptLibraryModal','closePromptLibBtn','newPromptTitle','newPromptText','addPromptBtn','promptList',
            'bookmarkPanel','closeBookmarkBtn','bookmarkList',
            'searchAllModal','closeSearchAllBtn','searchAllInput','searchAllResults',
            'comparisonModal','closeComparisonBtn','compareModelA','compareModelB','comparePrompt','compareRunBtn','compareResults',
            'folderModal','closeFolderBtn','folderNameInput','createFolderBtn','foldersList',
            'analyticsModal','closeAnalyticsBtn','analyticsBody',
            'noteModal','closeNoteBtn','noteInput','saveNoteBtn','deleteNoteBtn'
        ];
        ids.forEach(id => { this[id] = this._(id); });
    }

    bindEvents() {
        this._on(this.openSidebarBtn, 'click', () => this.toggleSidebar(true));
        this._on(this.closeSidebarBtn, 'click', () => this.toggleSidebar(false));
        this._on(this.sidebarOverlay, 'click', () => this.toggleSidebar(false));
        this._on(this.newChatBtn, 'click', () => this.createNewConversation());
        this._on(this.mainNewChatBtn, 'click', () => this.createNewConversation());

        this._on(this.modelSelectorBtn, 'click', (e) => { e.stopPropagation(); this.modelDropdown?.classList.toggle('hidden'); });
        
        this._on(this.headerMoreBtn, 'click', (e) => {
            e.stopPropagation();
            this.headerMoreMenu?.classList.toggle('hidden');
            this.exportDropdown?.classList.add('hidden');
        });

        this._on(this.headerSystemPromptBtn, 'click', () => {
            this.openSettings('persona');
            this.headerMoreMenu?.classList.add('hidden');
        });

        document.addEventListener('click', () => {
            this.modelDropdown?.classList.add('hidden');
            this.themeDropdown?.classList.add('hidden');
            this.exportDropdown?.classList.add('hidden');
            this.headerMoreMenu?.classList.add('hidden');
        });

        document.querySelectorAll('.model-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                this.updateSelectedModel(opt.dataset.model);
            });
        });

        this._on(this.chatInput, 'input', () => this.handleInputChange());
        this._on(this.chatInput, 'keydown', (e) => this.handleInputKeydown(e));
        this._on(this.sendBtn, 'click', () => this.sendMessage());
        this._on(this.stopBtn, 'click', () => AIEngine.abort());

        this._on(this.webSearchBtn, 'click', async () => {
            this.webSearchActive = !this.webSearchActive;
            this.settings.webSearchActive = this.webSearchActive;
            await Storage.saveSettings(this.settings);
            this._syncSettingsCache();
            this.applyWebSearchUI();
        });

        this._on(this.attachmentBtn, 'click', () => this.fileInput?.click());
        this._on(this.fileInput, 'change', (e) => this.handleFileUpload(e));
        this.setupDragDrop();

        this._on(this.voiceInputBtn, 'click', () => this.startVoiceInput());

        this._on(this.promptLibraryBtn, 'click', () => this.openPromptLibrary());
        this._on(this.closePromptLibBtn, 'click', () => this.promptLibraryModal?.classList.add('hidden'));
        this._on(this.addPromptBtn, 'click', () => this.addPromptToLibrary());

        this._on(this.openSettingsBtn, 'click', () => this.openSettings());
        this._on(this.openIdeBtn, 'click', () => { this.toggleSidebar(false); window.IDE?.open(); });
        this._on(this.exportAllChatsBtn, 'click', () => this.exportAllChats());
        this._on(this.exportDropdownBtn, 'click', (e) => {
            e.stopPropagation();
            this.exportDropdown?.classList.toggle('hidden');
        });
        document.querySelectorAll('.export-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportChat(btn.dataset.format);
                this.exportDropdown?.classList.add('hidden');
                this.headerMoreMenu?.classList.add('hidden');
            });
        });
        this._on(this.shareChatBtn, 'click', () => { this.shareCurrentChat(); this.headerMoreMenu?.classList.add('hidden'); });
        this._on(this.importChatBtn, 'click', () => this.importFileInput?.click());
        this._on(this.importFileInput, 'change', (e) => {
            const f = e.target.files[0];
            if (f) this.importChatFromFile(f);
            e.target.value = '';
        });
        this._on(this.clearCurrentChatBtn, 'click', () => { this.clearCurrentConversation(); this.headerMoreMenu?.classList.add('hidden'); });
        this._on(this.searchChatInput, 'input', () => this.renderSidebarHistory());

        this._on(this.themeToggleBtn, 'click', (e) => {
            e.stopPropagation();
            this.themeDropdown?.classList.toggle('hidden');
        });
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setTheme(btn.dataset.theme);
                this.themeDropdown?.classList.add('hidden');
            });
        });

        this.bindSettingsPage();

        this._on(this.searchAllBtn, 'click', () => { this.openSearchAll(); this.headerMoreMenu?.classList.add('hidden'); });
        this._on(this.closeSearchAllBtn, 'click', () => this.searchAllModal?.classList.add('hidden'));
        this._on(this.searchAllInput, 'input', () => this.performSearchAll());
        this._on(this.comparisonBtn, 'click', () => { this.openComparison(); this.headerMoreMenu?.classList.add('hidden'); });
        this._on(this.closeComparisonBtn, 'click', () => this.comparisonModal?.classList.add('hidden'));
        this._on(this.compareRunBtn, 'click', () => this.runComparison());
        this._on(this.closeBookmarkBtn, 'click', () => this.bookmarkPanel?.classList.add('hidden'));
        this._on(this.closeAnalyticsBtn, 'click', () => this.analyticsModal?.classList.add('hidden'));
        this._on(this.closeFolderBtn, 'click', () => this.folderModal?.classList.add('hidden'));
        this._on(this.createFolderBtn, 'click', () => this.createFolder());
        this._on(this.closeNoteBtn, 'click', () => this.noteModal?.classList.add('hidden'));
        this._on(this.saveNoteBtn, 'click', () => this.saveNote());
        this._on(this.deleteNoteBtn, 'click', () => this.deleteNote());
        this._on(this.promptLibraryModal, 'click', (e) => { if (e.target === this.promptLibraryModal) this.promptLibraryModal.classList.add('hidden'); });

        ['promptLibraryModal','searchAllModal','comparisonModal','folderModal','analyticsModal','noteModal'].forEach(id => {
            const m = this._(id);
            if (m) m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
        });

        document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));

        window.addEventListener('popstate', () => {
            if (window.IDE && IDE.isOpen()) { IDE.requestClose({ fromPop: true }); return; }
            if (this.view === 'settings') this.closeSettings(true);
        });

        try {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (this.settings.theme === 'system') this.applyTheme('system');
            });
        } catch {}
    }

    bindSettingsPage() {
        this._on(this.settingsBackBtn, 'click', () => this.settingsBack());

        document.querySelectorAll('.sp-nav-item').forEach(btn => {
            btn.addEventListener('click', () => this.setSettingsSection(btn.dataset.section));
        });
        this._on(this.settingsSearchInput, 'input', () => this.filterSettingsNav(this.settingsSearchInput.value));
        this._on(this.settingsSearchInput, 'keydown', (e) => {
            if (e.key !== 'Enter') return;
            const first = Array.from(document.querySelectorAll('.sp-nav-item')).find(b => !b.hidden);
            if (first) this.setSettingsSection(first.dataset.section);
        });

        this._on(this.userNameInput, 'change', async () => {
            this.settings.userName = this.userNameInput.value.trim() || 'User';
            await this.persistSettings();
            this.updateUIStatus();
            this.renderActiveConversation(true);
        });
        this._on(this.speechRateInput, 'input', () => {
            const val = parseFloat(this.speechRateInput.value) || 1;
            this.settings.speechRate = val;
            if (this.speechRateLabel) this.speechRateLabel.textContent = val.toFixed(1) + 'x';
            this.persistSettingsDebounced();
        });
        this._on(this.streamSpeedInput, 'input', () => {
            const val = parseFloat(this.streamSpeedInput.value);
            this.settings.streamSpeed = val;
            if (this.streamSpeedLabel) this.streamSpeedLabel.textContent = val.toFixed(1) + 'x';
            this.persistSettingsDebounced();
        });
        this._on(this.realWebSearchToggle, 'change', async () => {
            this.settings.realWebSearch = this.realWebSearchToggle.checked;
            await this.persistSettings();
            this.applyWebSearchUI();
        });
        this._on(this.showThinkingToggle, 'change', async () => {
            this.settings.showThinking = this.showThinkingToggle.checked;
            await this.persistSettings();
        });
        this._on(this.notificationsToggle, 'change', async () => {
            if (this.notificationsToggle.checked && 'Notification' in window) {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                    this.notificationsToggle.checked = false;
                    ChatRenderer.showToast('Notification permission denied');
                    return;
                }
            }
            this.settings.notifications = this.notificationsToggle.checked;
            await this.persistSettings();
        });
        this._on(this.encryptionToggle, 'change', async () => {
            await Storage.setEncryption(this.encryptionToggle.checked);
            this.settings.encryption = this.encryptionToggle.checked;
            await this.persistSettings();
            ChatRenderer.showToast(this.encryptionToggle.checked ? 'Encryption enabled' : 'Encryption disabled');
        });

        document.querySelectorAll('.sp-theme-opt').forEach(btn => {
            btn.addEventListener('click', () => this.setTheme(btn.dataset.theme));
        });
        this._on(this.accentColorInput, 'input', () => this.setAccentColor(this.accentColorInput.value));
        this._on(this.accentResetBtn, 'click', () => {
            if (this.accentColorInput) this.accentColorInput.value = '#10a37f';
            this.setAccentColor('#10a37f');
        });

        document.querySelectorAll('.lang-option').forEach(btn => {
            btn.addEventListener('click', () => this.setLanguage(btn.dataset.lang));
        });

        this._on(this.settingsSystemPromptInput, 'change', async () => {
            this.settings.systemPrompt = this.settingsSystemPromptInput.value;
            this.syncActivePersona();
            await this.persistSettings();
            this.renderPersonaCards();
            this.updateNavValues();
        });
        this._on(this.resetPersonaBtn, 'click', () => this.selectPersona('default'));
        this._on(this.addPersonaBtn, 'click', () => this.addCustomPersona());

        this._on(this.providerSelect, 'change', () => { this.onProviderChange(); this.commitProvider(); });
        this._on(this.apiKeyInput, 'change', () => this.commitProvider());
        this._on(this.modelInput, 'change', () => this.commitProvider());
        this._on(this.toggleApiKeyVisibilityBtn, 'click', () => {
            if (!this.apiKeyInput) return;
            const isPwd = this.apiKeyInput.type === 'password';
            this.apiKeyInput.type = isPwd ? 'text' : 'password';
            this.toggleApiKeyVisibilityBtn.innerHTML = isPwd
                ? '<i class="fa-regular fa-eye-slash text-xs"></i>'
                : '<i class="fa-regular fa-eye text-xs"></i>';
        });
        this._on(this.loadModelsBtn, 'click', () => this.loadModelsForProvider());

        this._on(this.addMemoryBtn, 'click', () => this.addMemory());
        this._on(this.newMemoryInput, 'keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.addMemory(); }
        });

        this._on(this.shareServerInput, 'change', async () => {
            const raw = this.shareServerInput.value.trim();
            const norm = raw ? ShareManager.normalizeServer(raw) : '';
            if (raw && !norm) { this.setShareStatus('Enter a valid http(s) URL', 'error'); return; }
            this.settings.shareServer = norm;
            this.shareServerInput.value = norm;
            await this.persistSettings();
            this.setShareStatus(norm ? 'Saved. Use “Test” to check the connection.' : 'No server: self-contained links will be used.', '');
        });
        this._on(this.testShareServerBtn, 'click', async () => {
            this.setShareStatus('Testing…', '');
            try {
                const server = await ShareManager.testServer(this.shareServerInput.value);
                this.setShareStatus(`Connected to ${server}`, 'ok');
            } catch (e) { this.setShareStatus(e.message, 'error'); }
        });

        this._on(this.openAnalyticsBtn, 'click', () => this.showAnalytics());
        this._on(this.clearAllDataBtn, 'click', () => this.clearAllData());
    }

    setShareStatus(msg, kind) {
        if (!this.shareServerStatus) return;
        this.shareServerStatus.textContent = msg;
        this.shareServerStatus.className = 'sp-status' + (kind ? ' ' + kind : '');
    }

    _syncSettingsCache() {
        if (window.ChatRenderer) ChatRenderer._settingsCache = this.settings;
    }

    handleGlobalKeydown(e) {
        if (document.body.classList.contains('ide-open')) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.createNewConversation(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); this.toggleSidebar(this.sidebar?.classList.contains('-translate-x-full')); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); this.showView('chat'); this.openSearchAll(); }
        if (e.key === 'Escape') {
            if (document.getElementById('uiRoot')?.children.length) return;
            let closedSomething = false;
            ['modelDropdown','themeDropdown','exportDropdown','headerMoreMenu','promptLibraryModal','bookmarkPanel','searchAllModal','comparisonModal','folderModal','analyticsModal','noteModal'].forEach(id => {
                const el = this._(id);
                if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); closedSomething = true; }
            });
            ChatRenderer.closeMenu();
            if (!closedSomething && this.view === 'settings') this.settingsBack();
        }
        if (e.key === '?' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
            this.openSettings('shortcuts');
        }
    }

    handleInputKeydown(e) {
        if (this.slashActive && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab')) {
            e.preventDefault();
            this.navigateSlashCommand(e.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (this.slashActive && e.key === 'Enter') { e.preventDefault(); this.executeSlashCommand(); return; }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (this.slashActive) { this.executeSlashCommand(); return; }
            this.sendMessage();
        }
        if (e.key === 'Escape' && this.slashActive) this.hideSlashMenu();
    }

    async loadState() {
        this.settings = await Storage.getSettings();
        this.conversations = await Storage.getConversations();
        this.activeConversationId = await Storage.getActiveId();

        this.applyTheme(this.settings.theme || 'system');
        this.applyAccentColor(this.settings.accentColor);
        this.applyLanguage();

        if (!this.activeConversationId || !this.conversations.find(c => c.id === this.activeConversationId)) {
            this.activeConversationId = this.conversations[0]?.id;
            if (!this.activeConversationId) this.activeConversationId = await this.createNewConversation();
            await Storage.setActiveId(this.activeConversationId);
        }

        this.webSearchActive = !!this.settings.webSearchActive;
        this.applyWebSearchUI();
        this.updateModelLabel(this.settings.model || 'gpt-4o');
        this.updateUIStatus();
        this.renderSidebarHistory();
        this.renderActiveConversation();
        this.renderBookmarks();
        this.renderMemories();
        this.handleInputChange();

        this._syncSettingsCache();
    }

    applyTheme(theme) {
        const html = document.documentElement;
        const safeTheme = theme || 'system';
        let isDark;
        if (safeTheme === 'light') isDark = false;
        else if (safeTheme === 'dark') isDark = true;
        else isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.classList.toggle('dark', isDark);
        html.classList.toggle('light', !isDark);
        if (this.themeIcon) {
            const icons = {
                light: 'fa-sun text-yellow-400',
                dark: 'fa-moon text-indigo-400',
                system: 'fa-circle-half-stroke text-teal-400'
            };
            this.themeIcon.className = `fa-solid ${icons[safeTheme] || icons.system} text-sm`;
        }
        document.querySelectorAll('.sp-theme-opt').forEach(b => {
            const on = b.dataset.theme === safeTheme;
            b.classList.toggle('active', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        this.updateNavValues();
    }

    async setTheme(theme) {
        this.settings.theme = theme;
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        this.applyTheme(theme);
        ChatRenderer.showToast(`Theme: ${theme}`);
    }

    applyAccentColor(color) {
        if (!color) return;
        document.documentElement.style.setProperty('--accent-color', color);
        const accentEls = document.querySelectorAll('[data-accent]');
        accentEls.forEach(el => el.style.backgroundColor = color);
    }

    async setAccentColor(color) {
        this.settings.accentColor = color;
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        this.applyAccentColor(color);
    }

    applyWebSearchUI() {
        this.webSearchBtn?.classList.toggle('text-teal-400', this.webSearchActive);
        this.webSearchBadge?.classList.toggle('hidden', !this.webSearchActive);
        this.webSearchBadge?.classList.toggle('flex', this.webSearchActive);
        if (this.webSearchBadge) {
            this.webSearchBadge.innerHTML = this.settings.realWebSearch
                ? '<i class="fa-solid fa-globe text-[9px]"></i><span>Real Web Search</span>'
                : '<i class="fa-solid fa-check text-[9px]"></i><span>Web Search (Simulated)</span>';
        }
    }

    updateUIStatus() {
        const provider = this.settings.provider || 'simulated';
        const key = (this.settings.providerKeys?.[provider] || '').trim();
        if (this.userDisplayName) this.userDisplayName.textContent = this.settings.userName || 'User';
        if (!this.apiStatusIndicator) return;
        if (provider === 'simulated' || !key) {
            this.apiStatusIndicator.textContent = 'Demo Mode';
            this.apiStatusIndicator.className = 'text-[10px] text-teal-400 font-medium';
        } else {
            this.apiStatusIndicator.textContent = `${this.PROVIDER_META[provider]?.label || provider} · Connected`;
            this.apiStatusIndicator.className = 'text-[10px] text-emerald-400 font-medium';
        }
    }

    toggleSidebar(open) {
        if (!this.sidebar) return;
        if (open) { this.sidebar.classList.remove('-translate-x-full'); this.sidebarOverlay?.classList.remove('hidden'); }
        else { this.sidebar.classList.add('-translate-x-full'); this.sidebarOverlay?.classList.add('hidden'); }
    }

    handleInputChange() {
        const val = this.chatInput?.value || '';
        if (this.charCount) this.charCount.textContent = `${val.length} chars`;
        if (this.sendBtn) this.sendBtn.disabled = val.trim().length === 0 && this.attachments.length === 0;
        if (this.chatInput) {
            this.chatInput.style.height = 'auto';
            this.chatInput.style.height = `${Math.min(this.chatInput.scrollHeight, 180)}px`;
        }
        this.updateCostEstimate(val);
        this.updateSlashMenu(val);
    }

    updateCostEstimate(text) {
        if (!this.costEstimate) return;
        const tokens = Math.round(text.length / 4);
        const pricing = {
            'gpt-4o': 5.0, 'gpt-3.5-turbo': 0.5,
            'gemini-2.0-flash': 0.075, 'gemini-1.5-pro': 1.25,
            'deepseek-chat': 0.14, 'deepseek-reasoner': 0.55,
            'openai/gpt-4o-mini': 0.15
        };
        const rate = pricing[this.settings.model] || 0;
        if (!rate || tokens < 1) { this.costEstimate.textContent = ''; return; }
        this.costEstimate.textContent = `~$${((tokens / 1e6) * rate).toFixed(6)}`;
    }

    setupDragDrop() {
        const container = this.messagesContainer;
        if (!container) return;
        ['dragover', 'dragenter'].forEach(ev => {
            document.addEventListener(ev, (e) => { e.preventDefault(); });
        });
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            this.handleMultipleFiles(files);
        });
    }

    handleFileUpload(e) {
        const files = Array.from(e.target.files);
        this.handleMultipleFiles(files);
        e.target.value = '';
    }

    async handleMultipleFiles(files) {
        for (const file of files) {
            try {
                if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                    const result = await RAGEngine.indexPDF(file);
                    if (result) {
                        this.attachments.push({
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            content: result.text.slice(0, 5000)
                        });
                    }
                } else {
                    const content = await this.readFileContent(file);
                    this.attachments.push({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        content
                    });
                }
            } catch (err) {
                ChatRenderer.showToast(`Failed: ${file.name}`);
            }
        }
        this.renderAttachments();
        if (this.sendBtn) this.sendBtn.disabled = this.attachments.length === 0 && !this.chatInput?.value.trim();
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (file.type.startsWith('image/')) {
                    resolve(`[Image: ${file.name}]\n${e.target.result.slice(0, 100)}...`);
                } else {
                    resolve(e.target.result);
                }
            };
            reader.onerror = reject;
            if (file.type.startsWith('image/')) reader.readAsDataURL(file);
            else reader.readAsText(file);
        });
    }

    renderAttachments() {
        if (!this.attachmentsPreview) return;
        if (this.attachments.length === 0) {
            this.attachmentsPreview.classList.add('hidden');
            this.attachmentsPreview.innerHTML = '';
            return;
        }
        this.attachmentsPreview.innerHTML = this.attachments.map((a, i) => `
            <div class="flex items-center space-x-2 px-2 py-1 rounded-lg bg-gpt-main/60 border border-gpt-border text-[11px]">
                <i class="fa-solid ${a.type.startsWith('image/') ? 'fa-image text-purple-400' : 'fa-file text-amber-400'}"></i>
                <span class="truncate max-w-[120px]">${Utils.escapeHtml(a.name)}</span>
                <span class="text-slate-500">${Utils.formatBytes(a.size)}</span>
                <button class="remove-attachment text-slate-500 hover:text-rose-400" data-index="${i}">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `).join('');
        this.attachmentsPreview.classList.remove('hidden');
        this.attachmentsPreview.querySelectorAll('.remove-attachment').forEach(btn => {
            btn.addEventListener('click', () => {
                this.attachments.splice(parseInt(btn.dataset.index, 10), 1);
                this.renderAttachments();
            });
        });
    }

    async createNewConversation() {
        const newConv = {
            id: Utils.uid('conv'),
            title: 'New Chat',
            model: this.settings.model || 'gpt-4o',
            folderId: null,
            createdAt: new Date().toISOString(),
            messages: []
        };
        this.conversations.unshift(newConv);
        this.activeConversationId = newConv.id;
        await Storage.saveConversations(this.conversations);
        await Storage.setActiveId(this.activeConversationId);
        this.renderSidebarHistory();
        this.renderActiveConversation();
        this.toggleSidebar(false);
        this.chatInput?.focus();
        return newConv.id;
    }

    renderSidebarHistory() {
        if (!this.chatHistoryContainer) return;
        const query = (this.searchChatInput?.value || '').toLowerCase().trim();
        this.chatHistoryContainer.innerHTML = '';

        const filtered = this.conversations.filter(c => {
            if (!query) return true;
            if (c.title.toLowerCase().includes(query)) return true;
            return c.messages.some(m => (m.text || '').toLowerCase().includes(query));
        });

        const pinned = this.settings.pinnedChats || [];
        filtered.sort((a, b) => {
            const ap = pinned.includes(a.id) ? 1 : 0;
            const bp = pinned.includes(b.id) ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        if (filtered.length === 0) {
            this.chatHistoryContainer.innerHTML = `<div class="text-center text-xs text-slate-500 py-4">No chats</div>`;
            return;
        }

        filtered.forEach(conv => {
            const isActive = conv.id === this.activeConversationId;
            const isPinned = pinned.includes(conv.id);
            const item = document.createElement('div');
            item.className = `group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-xs transition-colors ${
                isActive ? 'bg-gpt-hover text-slate-100 font-semibold' : 'text-slate-400 hover:bg-gpt-hover/50 hover:text-slate-200'
            }`;

            item.innerHTML = `
                <div class="flex items-center space-x-2.5 min-w-0 flex-1 pointer-events-none">
                    ${isPinned ? '<i class="fa-solid fa-thumbtack text-[10px] text-amber-400 shrink-0"></i>' : '<i class="fa-regular fa-message text-xs shrink-0"></i>'}
                    <span class="truncate flex-1">${Utils.escapeHtml(conv.title)}</span>
                </div>
            `;
            
            let pressTimer;
            let isLongPress = false;

            const startPress = (e) => {
                if (e.type === 'mousedown' && e.button !== 0) return;
                isLongPress = false;
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.showChatContextMenu(e, conv.id, isPinned);
                }, 500); 
            };
            
            const cancelPress = () => clearTimeout(pressTimer);

            item.addEventListener('mousedown', startPress);
            item.addEventListener('touchstart', startPress, { passive: true });
            item.addEventListener('mouseup', cancelPress);
            item.addEventListener('mouseleave', cancelPress);
            item.addEventListener('touchend', cancelPress);
            item.addEventListener('touchmove', cancelPress);
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                cancelPress();
                this.showChatContextMenu(e, conv.id, isPinned);
            });

            item.onclick = async (e) => {
                if (isLongPress || document.getElementById('chatContextMenu')) {
                    e.preventDefault();
                    return;
                }
                this.activeConversationId = conv.id;
                await Storage.setActiveId(conv.id);
                this.renderSidebarHistory();
                this.renderActiveConversation();
                this.toggleSidebar(false);
            };
            this.chatHistoryContainer.appendChild(item);
        });
    }

    showChatContextMenu(e, convId, isPinned) {
        e.preventDefault();
        e.stopPropagation();
        
        const existing = document.getElementById('chatContextMenu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'chatContextMenu';
        menu.className = 'absolute z-50 bg-gpt-card border border-gpt-border rounded-lg shadow-2xl p-1 text-xs text-slate-200 min-w-[120px] animate-fade-in';
        
        menu.innerHTML = `
            <button id="ctxPin" class="w-full text-left px-3 py-2 rounded hover:bg-gpt-hover flex items-center"><i class="fa-solid fa-thumbtack w-4 text-amber-400 mr-2"></i> ${isPinned ? 'Unpin' : 'Pin'}</button>
            <button id="ctxRename" class="w-full text-left px-3 py-2 rounded hover:bg-gpt-hover flex items-center"><i class="fa-solid fa-pen w-4 text-teal-400 mr-2"></i> Rename</button>
            <div class="border-t border-gpt-border/50 my-1"></div>
            <button id="ctxDelete" class="w-full text-left px-3 py-2 rounded hover:bg-rose-500/10 text-rose-400 flex items-center"><i class="fa-solid fa-trash-can w-4 mr-2"></i> Delete</button>
        `;

        document.body.appendChild(menu);

        let x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        let y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        
        if (x + menu.offsetWidth > window.innerWidth) x = window.innerWidth - menu.offsetWidth - 10;
        if (y + menu.offsetHeight > window.innerHeight) y = window.innerHeight - menu.offsetHeight - 10;
        
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        menu.querySelector('#ctxPin').onclick = (ev) => { ev.stopPropagation(); this.togglePin(convId); menu.remove(); };
        menu.querySelector('#ctxRename').onclick = (ev) => { ev.stopPropagation(); this.renameConversation(convId); menu.remove(); };
        menu.querySelector('#ctxDelete').onclick = (ev) => { ev.stopPropagation(); this.deleteConversation(convId); menu.remove(); };

        setTimeout(() => {
            const closeHandler = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 10);
    }

    async renameConversation(id) {
        const conv = this.conversations.find(c => c.id === id);
        if (!conv) return;
        const n = prompt('Rename:', conv.title);
        if (n?.trim()) {
            conv.title = n.trim().slice(0, 60);
            await Storage.saveConversations(this.conversations);
            this.renderSidebarHistory();
        }
    }

    async togglePin(id) {
        const p = this.settings.pinnedChats || [];
        const i = p.indexOf(id);
        if (i === -1) p.push(id); else p.splice(i, 1);
        this.settings.pinnedChats = p;
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        this.renderSidebarHistory();
        ChatRenderer.showToast(i === -1 ? 'Pinned' : 'Unpinned');
    }

    renderActiveConversation(keepView = false) {
        if (this.view === 'settings' && !keepView) this.showView('chat');
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv || activeConv.messages.length === 0) {
            this.emptyState?.classList.remove('hidden');
            this.activeMessagesList?.classList.add('hidden');
            if (this.activeMessagesList) this.activeMessagesList.innerHTML = '';
            return;
        }
        this.emptyState?.classList.add('hidden');
        this.activeMessagesList?.classList.remove('hidden');
        if (this.activeMessagesList) this.activeMessagesList.innerHTML = '';
        activeConv.messages.forEach(msg => {
            const el = ChatRenderer.createMessageElement(msg, this.settings.userName);
            this.activeMessagesList?.appendChild(el);
        });
        this.scrollToBottom();
    }

    showSaveIndicator() {
        if (!this.saveIndicator) return;
        this.saveIndicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-teal-400 mr-1"></i>Saving...';
        clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => {
            this.saveIndicator.innerHTML = '<i class="fa-solid fa-check text-emerald-400 mr-1"></i>Saved';
        }, 500);
    }

    async sendMessage() {
        const text = this.chatInput?.value.trim() || '';
        if ((!text && this.attachments.length === 0) || this.isGenerating) return;

        // JINA AI DEEP WEB SCRAPING FEATURE
        let jinaContext = '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = text.match(urlRegex) || [];
        if (urls.length > 0) {
            ChatRenderer.showToast('Scraping links via Jina AI...');
            for (const url of urls) {
                try {
                    const res = await fetch(`https://r.jina.ai/${url}`);
                    if (res.ok) {
                        const scraped = await res.text();
                        jinaContext += `\n\n--- Scraped Context from ${url} ---\n${scraped.slice(0, 10000)}`;
                    }
                } catch (e) { console.warn('Jina AI scrape failed', e); }
            }
        }

        let fullPrompt = text + jinaContext;
        
        // MULTIMODAL FEATURE
        const images = this.attachments.filter(a => a.type.startsWith('image/')).map(a => a.content);
        const docs = this.attachments.filter(a => !a.type.startsWith('image/'));

        if (docs.length > 0) {
            const att = docs.map(a => `[${a.name}]:\n${a.content}`).join('\n\n');
            fullPrompt += `\n\n[Attachments]:\n${att}`;
        }

        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv) return;

        if (activeConv.messages.length === 0) {
            activeConv.title = text.slice(0, 30) || 'New Chat';
            this.renderSidebarHistory();
        }

        activeConv.messages.push({
            id: Utils.uid('msg'), sender: 'user',
            text: fullPrompt,
            images: images.length > 0 ? images : undefined, // Images sent to AI Engine
            timestamp: new Date().toISOString()
        });

        if (this.chatInput) { this.chatInput.value = ''; this.chatInput.style.height = 'auto'; }
        this.attachments = [];
        this.renderAttachments();
        this.handleInputChange();
        this.renderActiveConversation();
        this.showSaveIndicator();
        this.updateAnalytics(fullPrompt.length);

        await this._runAssistant(activeConv);
    }

    async _runAssistant(activeConv) {
        const msgId = Utils.uid('msg');
        const msg = { id: msgId, sender: 'assistant', text: '', timestamp: new Date().toISOString() };
        activeConv.messages.push(msg);

        const el = ChatRenderer.createMessageElement(msg, this.settings.userName);
        this.activeMessagesList?.appendChild(el);
        const bodyEl = document.getElementById(`msg_body_${msgId}`);
        bodyEl?.classList.add('typing-cursor');

        this.isGenerating = true;
        if (this.sendBtn) this.sendBtn.disabled = true;
        this.toggleStopButton(true);
        this.scrollToBottom();

        let accumulated = '';
        let paintTimer = null;
        let lastPaint = 0;
        const paint = () => {
            paintTimer = null;
            lastPaint = performance.now();
            if (bodyEl) bodyEl.innerHTML = ChatRenderer.formatMarkdown(accumulated);
            this.scrollToBottom();
        };
        const schedulePaint = () => {
            if (paintTimer) return;
            paintTimer = setTimeout(paint, Math.max(0, 100 - (performance.now() - lastPaint)));
        };

        try {
            const sysPrompt = AIEngine.buildSystemPrompt(this.settings);
            await AIEngine.generateResponse(
                activeConv.messages.slice(0, -1),
                this.settings.model || 'gpt-4o',
                sysPrompt,
                this.webSearchActive,
                (_c, acc) => {
                    accumulated = acc;
                    msg.text = acc;
                    schedulePaint();
                }
            );
            clearTimeout(paintTimer);
            paint();
        } catch (err) {
            clearTimeout(paintTimer);
            if (err.name === 'AbortError') {
                msg.text = accumulated + '\n\n*_(stopped)_*';
            } else {
                msg.text = accumulated + `\n\n*⚠️ ${Utils.escapeHtml(err.message)}*`;
            }
            if (bodyEl) bodyEl.innerHTML = ChatRenderer.formatMarkdown(msg.text);
        } finally {
            bodyEl?.classList.remove('typing-cursor');
            this.isGenerating = false;
            if (this.sendBtn) this.sendBtn.disabled = (this.chatInput?.value.trim().length || 0) === 0;
            this.toggleStopButton(false);
            await Storage.saveConversations(this.conversations);
            this.showSaveIndicator();
            this.updateAnalytics(accumulated.length);
            if (this.settings.notifications && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('ChatGPT', { body: 'Response ready', icon: '/icon.png' });
            }
        }
    }

    toggleStopButton(show) {
        if (!this.stopBtn || !this.sendBtn) return;
        this.stopBtn.classList.toggle('hidden', !show);
        this.stopBtn.classList.toggle('flex', show);
        this.sendBtn.classList.toggle('hidden', show);
        this.sendBtn.classList.toggle('flex', !show);
    }

    scrollToBottom() {
        this._rafScroll = this._rafScroll || Utils.rafThrottle(() => {
            if (this.messagesContainer) this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
        this._rafScroll();
    }

    async updateAnalytics(chars) {
        const a = this.settings.analytics || { totalMessages: 0, totalTokens: 0, byModel: {}, byDay: {} };
        const tokens = Math.round(chars / 4);
        a.totalMessages++;
        a.totalTokens += tokens;
        const model = this.settings.model || 'gpt-4o';
        a.byModel[model] = (a.byModel[model] || 0) + tokens;
        const day = new Date().toISOString().slice(0, 10);
        a.byDay[day] = (a.byDay[day] || 0) + tokens;
        this.settings.analytics = a;
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
    }

    async deleteMessageById(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv) return;
        activeConv.messages = activeConv.messages.filter(m => m.id !== id);
        await Storage.saveConversations(this.conversations);
        this.renderActiveConversation();
    }

    async startEditMessage(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv) return;
        const msg = activeConv.messages.find(m => m.id === id);
        if (!msg || msg.sender !== 'user') return;
        const newText = prompt('Edit:', msg.text);
        if (newText === null || !newText.trim() || newText === msg.text) return;
        msg.text = newText.trim();
        const idx = activeConv.messages.findIndex(m => m.id === id);
        activeConv.messages = activeConv.messages.slice(0, idx + 1);
        await Storage.saveConversations(this.conversations);
        this.renderActiveConversation();
        this._runAssistant(activeConv);
    }

    async regenerateFromMessage(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv || this.isGenerating) return;
        const idx = activeConv.messages.findIndex(m => m.id === id);
        if (idx === -1) return;
        activeConv.messages = activeConv.messages.slice(0, idx);
        await Storage.saveConversations(this.conversations);
        this.renderActiveConversation();
        this._runAssistant(activeConv);
    }

    async branchFromMessage(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv) return;
        const idx = activeConv.messages.findIndex(m => m.id === id);
        if (idx === -1) return;
        const branched = activeConv.messages.slice(0, idx + 1).map(m => ({
            ...m, id: Utils.uid('msg'), timestamp: new Date().toISOString()
        }));
        const newConv = {
            id: Utils.uid('conv'),
            title: `${activeConv.title} (branch)`.slice(0, 60),
            model: activeConv.model,
            folderId: null,
            createdAt: new Date().toISOString(),
            messages: branched
        };
        this.conversations.unshift(newConv);
        this.activeConversationId = newConv.id;
        await Storage.saveConversations(this.conversations);
        await Storage.setActiveId(this.activeConversationId);
        this.renderSidebarHistory();
        this.renderActiveConversation();
        ChatRenderer.showToast('Branched');
    }

    async retryWithModel(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv || this.isGenerating) return;
        const idx = activeConv.messages.findIndex(m => m.id === id);
        if (idx === -1) return;
        const choice = prompt('Model:\n1. gpt-4o\n2. gpt-3.5-turbo\n3. gemini-2.0-flash\n4. deepseek-chat\n5. custom (type name)');
        const map = { '1': 'gpt-4o', '2': 'gpt-3.5-turbo', '3': 'gemini-2.0-flash', '4': 'deepseek-chat' };
        const newModel = map[choice] || choice;
        if (!newModel?.trim()) return;
        activeConv.messages = activeConv.messages.slice(0, idx);
        this.settings.model = newModel.trim();
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        this.updateModelLabel(newModel.trim());
        await Storage.saveConversations(this.conversations);
        this.renderActiveConversation();
        this._runAssistant(activeConv);
    }

    editMessageNote(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!activeConv) return;
        const msg = activeConv.messages.find(m => m.id === id);
        if (!msg) return;
        this._editingNoteMsgId = id;
        if (this.noteInput) this.noteInput.value = msg.note || '';
        this.noteModal?.classList.remove('hidden');
    }

    async saveNote() {
        if (!this._editingNoteMsgId) return;
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        const msg = activeConv?.messages.find(m => m.id === this._editingNoteMsgId);
        if (!msg) return;
        msg.note = this.noteInput?.value.trim() || '';
        await Storage.saveConversations(this.conversations);
        this.renderActiveConversation();
        this.noteModal?.classList.add('hidden');
        ChatRenderer.showToast('Note saved');
    }

    async deleteNote() {
        if (!this._editingNoteMsgId) return;
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        const msg = activeConv?.messages.find(m => m.id === this._editingNoteMsgId);
        if (!msg) return;
        delete msg.note;
        await Storage.saveConversations(this.conversations);
        this.renderActiveConversation();
        this.noteModal?.classList.add('hidden');
    }

    async saveMessageAsTemplate(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        const msg = activeConv?.messages.find(m => m.id === id);
        if (!msg) return;
        const title = prompt('Template name:', (msg.text || '').slice(0, 30));
        if (!title?.trim()) return;
        this.settings.templates = this.settings.templates || [];
        this.settings.templates.unshift({ title: title.trim(), text: msg.text });
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        ChatRenderer.showToast('Template saved');
    }

    async toggleBookmark(id) {
        const activeConv = this.conversations.find(c => c.id === this.activeConversationId);
        const msg = activeConv?.messages.find(m => m.id === id);
        if (!msg) return;
        const bm = this.settings.bookmarks || [];
        const i = bm.findIndex(b => b.msgId === id);
        if (i === -1) {
            bm.push({
                msgId: id, convId: activeConv.id, convTitle: activeConv.title,
                preview: (msg.text || '').slice(0, 80), sender: msg.sender,
                createdAt: new Date().toISOString()
            });
            ChatRenderer.showToast('Bookmarked');
        } else {
            bm.splice(i, 1);
            ChatRenderer.showToast('Removed');
        }
        this.settings.bookmarks = bm;
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        this.renderActiveConversation();
        this.renderBookmarks();
    }

    renderBookmarks() {
        if (!this.bookmarkList) return;
        const bm = this.settings.bookmarks || [];
        if (bm.length === 0) {
            this.bookmarkList.innerHTML = `<div class="text-center text-xs text-slate-500 py-6">No bookmarks</div>`;
            return;
        }
        this.bookmarkList.innerHTML = bm.map((b, i) => `
            <div class="group p-2.5 rounded-lg bg-gpt-main/40 hover:bg-gpt-main/70 cursor-pointer transition-colors bm-item" data-i="${i}">
                <div class="flex items-start justify-between">
                    <div class="text-[11px] font-semibold text-slate-300 truncate flex-1">${Utils.escapeHtml(b.convTitle)}</div>
                    <button class="bm-remove p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100" data-i="${i}">
                        <i class="fa-solid fa-xmark text-[10px]"></i>
                    </button>
                </div>
                <div class="text-[10px] text-slate-500 mt-1 line-clamp-2">${Utils.escapeHtml(b.preview)}</div>
            </div>
        `).join('');

        this.bookmarkList.querySelectorAll('.bm-item').forEach(el => {
            el.onclick = async () => {
                const b = bm[parseInt(el.dataset.i, 10)];
                this.activeConversationId = b.convId;
                await Storage.setActiveId(b.convId);
                this.renderSidebarHistory();
                this.renderActiveConversation();
                this.bookmarkPanel?.classList.add('hidden');
                setTimeout(() => {
                    const t = document.querySelector(`[data-message-id="${b.msgId}"]`);
                    t?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    t?.classList.add('ring-2', 'ring-amber-400');
                    setTimeout(() => t?.classList.remove('ring-2', 'ring-amber-400'), 2000);
                }, 200);
            };
        });
        this.bookmarkList.querySelectorAll('.bm-remove').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                bm.splice(parseInt(btn.dataset.i, 10), 1);
                this.settings.bookmarks = bm;
                await Storage.saveSettings(this.settings);
                this._syncSettingsCache();
                this.renderBookmarks();
            };
        });
    }

    renderMemories() {
        if (!this.memoryList) return;
        const mem = this.settings.memories || [];
        if (mem.length === 0) {
            this.memoryList.innerHTML = '<div class="text-center text-xs text-slate-500 py-3">No memories yet. Add facts about yourself.</div>';
            return;
        }
        this.memoryList.innerHTML = mem.map((m, i) => `
            <div class="flex items-center justify-between p-2 rounded-lg bg-gpt-main/40 text-xs">
                <span class="text-slate-300 flex-1 truncate">${Utils.escapeHtml(m.text)}</span>
                <button class="mem-del p-1 text-slate-500 hover:text-rose-400" data-i="${i}">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `).join('');
        this.memoryList.querySelectorAll('.mem-del').forEach(btn => {
            btn.onclick = async () => {
                mem.splice(parseInt(btn.dataset.i, 10), 1);
                this.settings.memories = mem;
                await Storage.saveSettings(this.settings);
                this._syncSettingsCache();
                this.renderMemories();
            };
        });
    }

    async addMemory() {
        const txt = this.newMemoryInput?.value.trim();
        if (!txt) return;
        this.settings.memories = this.settings.memories || [];
        this.settings.memories.push({ text: txt, createdAt: new Date().toISOString() });
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        if (this.newMemoryInput) this.newMemoryInput.value = '';
        this.renderMemories();
        ChatRenderer.showToast('Memory added');
    }

    openSearchAll() {
        this.searchAllModal?.classList.remove('hidden');
        this.performSearchAll();
        setTimeout(() => this.searchAllInput?.focus(), 100);
    }

    performSearchAll() {
        const q = (this.searchAllInput?.value || '').toLowerCase().trim();
        if (!this.searchAllResults) return;
        if (!q) { this.searchAllResults.innerHTML = '<div class="text-xs text-slate-500 text-center py-6">Type to search...</div>'; return; }

        const results = [];
        this.conversations.forEach(conv => {
            conv.messages.forEach(msg => {
                if ((msg.text || '').toLowerCase().includes(q)) {
                    const idx = msg.text.toLowerCase().indexOf(q);
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(msg.text.length, idx + q.length + 40);
                    results.push({
                        convId: conv.id, convTitle: conv.title,
                        msgId: msg.id, sender: msg.sender,
                        snippet: (start > 0 ? '...' : '') + msg.text.slice(start, end) + (end < msg.text.length ? '...' : ''),
                        timestamp: msg.timestamp
                    });
                }
            });
        });

        if (results.length === 0) {
            this.searchAllResults.innerHTML = '<div class="text-xs text-slate-500 text-center py-6">No results</div>';
            return;
        }

        this.searchAllResults.innerHTML = results.slice(0, 50).map((r, i) => `
            <div class="search-result p-3 rounded-lg bg-gpt-main/40 hover:bg-gpt-main/70 cursor-pointer border border-gpt-border/40" data-i="${i}">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-[11px] font-semibold text-teal-400 truncate">${Utils.escapeHtml(r.convTitle)}</span>
                    <span class="text-[10px] text-slate-500">${r.sender}</span>
                </div>
                <div class="text-[11px] text-slate-300 line-clamp-2">${Utils.escapeHtml(r.snippet)}</div>
            </div>
        `).join('');

        this.searchAllResults.querySelectorAll('.search-result').forEach(el => {
            el.onclick = async () => {
                const r = results[parseInt(el.dataset.i, 10)];
                this.activeConversationId = r.convId;
                await Storage.setActiveId(r.convId);
                this.renderSidebarHistory();
                this.renderActiveConversation();
                this.searchAllModal?.classList.add('hidden');
                setTimeout(() => {
                    const t = document.querySelector(`[data-message-id="${r.msgId}"]`);
                    t?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    t?.classList.add('ring-2', 'ring-yellow-400');
                    setTimeout(() => t?.classList.remove('ring-2', 'ring-yellow-400'), 2000);
                }, 200);
            };
        });
    }

    personaList() {
        const def = { id: 'default', icon: '🤖', name: 'Default assistant', prompt: Storage.DEFAULT_SYSTEM_PROMPT };
        const custom = (this.settings.personas || []).map((p, i) => ({ ...p, id: p.id || `custom:${i}`, custom: true, index: i }));
        return [def, ...this.BUILTIN_PERSONAS, ...custom];
    }

    activePersona() {
        const list = this.personaList();
        const byId = this.settings.activePersona && list.find(p => p.id === this.settings.activePersona);
        if (byId && byId.prompt === this.settings.systemPrompt) return byId;
        return list.find(p => p.prompt === this.settings.systemPrompt) || null;
    }

    syncActivePersona() {
        const match = this.personaList().find(p => p.prompt === this.settings.systemPrompt);
        this.settings.activePersona = match ? match.id : null;
    }

    renderPersonaCards() {
        if (!this.personasGrid) return;
        const active = this.activePersona();
        this.personasGrid.innerHTML = this.personaList().map(p => `
            <div class="persona-card${active && active.id === p.id ? ' active' : ''}" data-id="${Utils.escapeHtml(p.id)}" role="button" tabindex="0" aria-pressed="${active && active.id === p.id ? 'true' : 'false'}">
                <div class="persona-icon">${Utils.escapeHtml(p.icon || '🤖')}</div>
                <div class="persona-name">${Utils.escapeHtml(p.name)}</div>
                <div class="persona-desc">${Utils.escapeHtml(p.prompt.slice(0, 70))}${p.prompt.length > 70 ? '…' : ''}</div>
                ${active && active.id === p.id ? '<i class="fa-solid fa-circle-check persona-check"></i>' : ''}
                ${p.custom ? `<button class="persona-del" data-del="${p.index}" aria-label="Delete persona ${Utils.escapeHtml(p.name)}"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>`).join('');
        this.personasGrid.querySelectorAll('.persona-card').forEach(el => {
            const pick = () => this.selectPersona(el.dataset.id);
            el.addEventListener('click', (e) => { if (!e.target.closest('.persona-del')) pick(); });
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        });
        this.personasGrid.querySelectorAll('.persona-del').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteCustomPersona(parseInt(btn.dataset.del, 10)); });
        });
    }

    async selectPersona(id) {
        const p = this.personaList().find(x => x.id === id);
        if (!p) return;
        this.settings.systemPrompt = p.prompt;
        this.settings.activePersona = p.id;
        if (this.settingsSystemPromptInput) this.settingsSystemPromptInput.value = p.prompt;
        await this.persistSettings();
        this.renderPersonaCards();
        this.updateNavValues();
        ChatRenderer.showToast(`Persona: ${p.name}`);
    }

    async addCustomPersona() {
        const name = this.personaNameInput?.value.trim();
        const prompt = this.personaPromptInput?.value.trim();
        const icon = this.personaIconInput?.value.trim() || '🤖';
        if (!name || !prompt) { ChatRenderer.showToast('Name and instructions are required'); return; }
        this.settings.personas = this.settings.personas || [];
        this.settings.personas.push({ id: Utils.uid('persona'), icon: Array.from(icon).slice(0, 2).join(''), name: name.slice(0, 40), prompt });
        await this.persistSettings();
        this.personaNameInput.value = '';
        this.personaPromptInput.value = '';
        this.personaIconInput.value = '';
        this.renderPersonaCards();
        ChatRenderer.showToast('Persona added');
    }

    async deleteCustomPersona(index) {
        const p = (this.settings.personas || [])[index];
        if (!p) return;
        const ok = await UI.confirm(`Delete the persona “${p.name}”?`, { title: 'Delete persona', confirmText: 'Delete', danger: true });
        if (!ok) return;
        this.settings.personas.splice(index, 1);
        if (this.settings.activePersona === p.id) this.settings.activePersona = null;
        await this.persistSettings();
        this.renderPersonaCards();
        this.updateNavValues();
    }

    openComparison() {
        this.comparisonModal?.classList.remove('hidden');
        if (this.comparePrompt) this.comparePrompt.value = this.chatInput?.value || '';
    }

    async runComparison() {
        const prompt = this.comparePrompt?.value.trim();
        if (!prompt) { ChatRenderer.showToast('Enter a prompt'); return; }
        const modelA = this.compareModelA?.value || 'gpt-4o';
        const modelB = this.compareModelB?.value || 'gemini-2.0-flash';

        if (this.compareResults) {
            this.compareResults.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 rounded-lg bg-gpt-main/40">
                        <div class="text-xs font-bold text-teal-400 mb-2">${modelA}</div>
                        <div id="cmpA" class="text-xs text-slate-300">Loading...</div>
                    </div>
                    <div class="p-3 rounded-lg bg-gpt-main/40">
                        <div class="text-xs font-bold text-purple-400 mb-2">${modelB}</div>
                        <div id="cmpB" class="text-xs text-slate-300">Loading...</div>
                    </div>
                </div>
            `;
        }

        const sysPrompt = AIEngine.buildSystemPrompt(this.settings);
        const messages = [{ sender: 'user', text: prompt }];

        const runOne = async (model, elId) => {
            let acc = '';
            let timer = null;
            const draw = () => {
                timer = null;
                const el = document.getElementById(elId);
                if (el) el.innerHTML = ChatRenderer.formatMarkdown(acc);
            };
            try {
                await AIEngine.generateResponse(messages, model, sysPrompt, false, (_c, a) => {
                    acc = a;
                    if (!timer) timer = setTimeout(draw, 100);
                });
                clearTimeout(timer);
                draw();
            } catch (err) {
                clearTimeout(timer);
                const el = document.getElementById(elId);
                if (el) el.innerHTML = `<span class="text-rose-400">Error: ${Utils.escapeHtml(err.message)}</span>`;
            }
        };

        await Promise.all([runOne(modelA, 'cmpA'), runOne(modelB, 'cmpB')]);
    }

    openPromptLibrary() {
        this.promptLibraryModal?.classList.remove('hidden');
        this.renderPromptLibrary();
    }

    renderPromptLibrary() {
        if (!this.promptList) return;
        const lib = this.settings.promptLibrary || [];
        if (lib.length === 0) {
            this.promptList.innerHTML = '<div class="text-center text-xs text-slate-500 py-6">No saved prompts</div>';
            return;
        }
        this.promptList.innerHTML = lib.map((p, i) => `
            <div class="group flex items-start justify-between p-2.5 rounded-lg bg-gpt-main/40 hover:bg-gpt-main/70">
                <div class="flex-1 min-w-0 cursor-pointer prompt-ins" data-i="${i}">
                    <div class="text-xs font-semibold text-slate-200 truncate">${Utils.escapeHtml(p.title)}</div>
                    <div class="text-[11px] text-slate-400 line-clamp-1">${Utils.escapeHtml(p.text)}</div>
                </div>
                <button class="prompt-del p-1 ml-2 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100" data-i="${i}">
                    <i class="fa-regular fa-trash-can text-[10px]"></i>
                </button>
            </div>
        `).join('');
        this.promptList.querySelectorAll('.prompt-ins').forEach(el => {
            el.onclick = () => {
                const p = lib[parseInt(el.dataset.i, 10)];
                if (this.chatInput) this.chatInput.value = p.text;
                this.handleInputChange();
                this.promptLibraryModal?.classList.add('hidden');
            };
        });
        this.promptList.querySelectorAll('.prompt-del').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                lib.splice(parseInt(btn.dataset.i, 10), 1);
                this.settings.promptLibrary = lib;
                await Storage.saveSettings(this.settings);
                this._syncSettingsCache();
                this.renderPromptLibrary();
            };
        });
    }

    async addPromptToLibrary() {
        const title = this.newPromptTitle?.value.trim();
        const text = this.newPromptText?.value.trim();
        if (!title || !text) { ChatRenderer.showToast('Both required'); return; }
        this.settings.promptLibrary = this.settings.promptLibrary || [];
        this.settings.promptLibrary.unshift({ title, text });
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        if (this.newPromptTitle) this.newPromptTitle.value = '';
        if (this.newPromptText) this.newPromptText.value = '';
        this.renderPromptLibrary();
    }

    showAnalytics() {
        const a = this.settings.analytics || { totalMessages: 0, totalTokens: 0, byModel: {}, byDay: {} };
        if (!this.analyticsBody) return;
        const models = Object.entries(a.byModel || {}).sort((x, y) => y[1] - x[1]);
        const days = Object.entries(a.byDay || {}).sort().slice(-7);
        this.analyticsBody.innerHTML = `
            <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 bg-gpt-main/40 rounded-lg">
                        <div class="text-[10px] text-slate-500 uppercase">Total Messages</div>
                        <div class="text-lg font-bold text-teal-400">${a.totalMessages}</div>
                    </div>
                    <div class="p-3 bg-gpt-main/40 rounded-lg">
                        <div class="text-[10px] text-slate-500 uppercase">Total Tokens</div>
                        <div class="text-lg font-bold text-purple-400">${a.totalTokens.toLocaleString()}</div>
                    </div>
                </div>
                <div>
                    <div class="text-xs font-semibold text-slate-300 mb-2">By Model</div>
                    ${models.map(([m, t]) => `
                        <div class="flex justify-between py-1 text-xs">
                            <span class="text-slate-400">${Utils.escapeHtml(m)}</span>
                            <span class="text-slate-200">${t.toLocaleString()} tokens</span>
                        </div>
                    `).join('') || '<div class="text-xs text-slate-500">No data</div>'}
                </div>
                <div>
                    <div class="text-xs font-semibold text-slate-300 mb-2">Last 7 Days</div>
                    ${days.map(([d, t]) => `
                        <div class="flex justify-between py-1 text-xs">
                            <span class="text-slate-400">${d}</span>
                            <span class="text-slate-200">${t.toLocaleString()}</span>
                        </div>
                    `).join('') || '<div class="text-xs text-slate-500">No data</div>'}
                </div>
            </div>
        `;
        this.analyticsModal?.classList.remove('hidden');
    }

    updateSlashMenu(text) {
        const cmds = [
            { cmd: '/new', desc: 'New chat', fn: () => this.createNewConversation() },
            { cmd: '/clear', desc: 'Clear messages', fn: () => this.clearCurrentConversation() },
            { cmd: '/export', desc: 'Export JSON', fn: () => this.exportChat('json') },
            { cmd: '/export-md', desc: 'Export Markdown', fn: () => this.exportChat('md') },
            { cmd: '/pdf', desc: 'Export PDF', fn: () => this.exportChat('pdf') },
            { cmd: '/share', desc: 'Share chat', fn: () => this.shareCurrentChat() },
            { cmd: '/ide', desc: 'Open code workspace', fn: () => window.IDE?.open() },
            { cmd: '/system', desc: 'System prompt', fn: () => this.openSettings('persona') },
            { cmd: '/analytics', desc: 'Analytics', fn: () => this.showAnalytics() },
            { cmd: '/help', desc: 'Shortcuts', fn: () => this.openSettings('shortcuts') },
            { cmd: '/theme', desc: 'Cycle theme', fn: () => {
                const o = ['light', 'dark', 'system'];
                const i = o.indexOf(this.settings.theme || 'system');
                this.setTheme(o[(i + 1) % 3]);
            }},
            { cmd: '/personas', desc: 'AI personas', fn: () => this.openSettings('persona') },
            { cmd: '/compare', desc: 'Compare models', fn: () => this.openComparison() },
            { cmd: '/memory', desc: 'Add memory', fn: () => { this.openSettings('memory'); setTimeout(() => this.newMemoryInput?.focus(), 80); } }
        ];
        this._slashCmds = cmds;

        let menu = document.getElementById('slashCommands');
        if (!text.startsWith('/') || text.includes(' ') || text.length < 1) {
            menu?.remove(); this.slashActive = false; return;
        }
        const q = text.slice(1).toLowerCase();
        const matches = cmds.filter(c => c.cmd.slice(1).startsWith(q));
        if (matches.length === 0) { menu?.remove(); this.slashActive = false; return; }

        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'slashCommands';
            this.chatInput?.parentElement?.style.setProperty('position', 'relative');
            this.chatInput?.parentElement?.appendChild(menu);
        }
        menu.innerHTML = matches.map((c, i) => `
            <div class="slash-cmd-item ${i === 0 ? 'active' : ''}" data-cmd="${c.cmd}">
                <span class="font-mono text-xs text-teal-400">${c.cmd}</span>
                <span class="text-[10px] text-slate-500">${c.desc}</span>
            </div>
        `).join('');
        this.slashActive = true;
        this.slashIndex = 0;
        menu.querySelectorAll('.slash-cmd-item').forEach(el => {
            el.onclick = () => { this.chatInput.value = el.dataset.cmd; this.executeSlashCommand(); };
        });
    }

    navigateSlashCommand(dir) {
        const items = document.querySelectorAll('#slashCommands .slash-cmd-item');
        if (!items.length) return;
        items[this.slashIndex]?.classList.remove('active');
        this.slashIndex = (this.slashIndex + dir + items.length) % items.length;
        items[this.slashIndex]?.classList.add('active');
    }

    executeSlashCommand() {
        const items = document.querySelectorAll('#slashCommands .slash-cmd-item');
        const active = items[this.slashIndex];
        if (!active) return;
        const cmd = active.dataset.cmd;
        const found = this._slashCmds?.find(c => c.cmd === cmd);
        if (this.chatInput) this.chatInput.value = '';
        this.handleInputChange();
        this.hideSlashMenu();
        found?.fn?.();
    }

    hideSlashMenu() {
        document.getElementById('slashCommands')?.remove();
        this.slashActive = false;
    }

    async setLanguage(lang) {
        this.settings.language = lang;
        await this.persistSettings();
        this.applyLanguage();
        ChatRenderer.showToast(`Language: ${{ en: 'English', ur: 'اردو', ar: 'العربية' }[lang] || lang}`);
    }

    applyLanguage() {
        const lang = this.settings.language || 'en';
        const ph = { en: 'Message ChatGPT...', ur: 'ChatGPT کو پیغام...', ar: 'اكتب رسالة...' };
        if (this.chatInput) this.chatInput.placeholder = ph[lang] || ph.en;
        document.documentElement.lang = lang;
        document.documentElement.dir = (lang === 'ur' || lang === 'ar') ? 'rtl' : 'ltr';
        document.querySelectorAll('.lang-option').forEach(b => {
            const on = b.dataset.lang === lang;
            b.classList.toggle('active', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        this.updateNavValues();
    }

    startVoiceInput() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { ChatRenderer.showToast('Voice not supported'); return; }
        if (this._recognition) {
            this._recognition.stop();
            this._recognition = null;
            this.voiceInputBtn?.classList.remove('text-rose-400', 'voice-active');
            return;
        }
        try {
            const rec = new SR();
            const langMap = { en: 'en-US', ur: 'ur-PK', ar: 'ar-SA' };
            rec.lang = langMap[this.settings.language] || 'en-US';
            rec.interimResults = true;
            rec.onstart = () => {
                this.voiceInputBtn?.classList.add('text-rose-400', 'voice-active');
                ChatRenderer.showToast('🎤 Listening...');
            };
            rec.onresult = (e) => {
                let t = '';
                for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
                if (this.chatInput) this.chatInput.value = t;
                this.handleInputChange();
            };
            rec.onerror = (e) => ChatRenderer.showToast(`Voice: ${e.error}`);
            rec.onend = () => {
                this.voiceInputBtn?.classList.remove('text-rose-400', 'voice-active');
                this._recognition = null;
            };
            rec.start();
            this._recognition = rec;
        } catch (err) { ChatRenderer.showToast('Voice failed'); }
    }

    importChatFromFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                let imported;
                if (data.app === 'chatgpt-clone' && Array.isArray(data.messages)) {
                    imported = {
                        id: Utils.uid('conv'),
                        title: `Imported: ${data.title || 'Chat'}`,
                        model: data.model || this.settings.model,
                        folderId: null,
                        createdAt: new Date().toISOString(),
                        messages: data.messages.map(m => ({
                            id: Utils.uid('msg'),
                            sender: m.sender === 'user' ? 'user' : 'assistant',
                            text: m.text,
                            timestamp: m.timestamp || new Date().toISOString()
                        }))
                    };
                } else if (data.id && Array.isArray(data.messages)) {
                    imported = { ...data, id: Utils.uid('conv'), title: `Imported: ${data.title || 'Chat'}` };
                } else if (Array.isArray(data)) {
                    data.forEach(c => this.conversations.unshift({ ...c, id: Utils.uid('conv') }));
                    await Storage.saveConversations(this.conversations);
                    this.renderSidebarHistory();
                    ChatRenderer.showToast(`Imported ${data.length} chats`);
                    return;
                } else throw new Error('Unknown format');
                this.conversations.unshift(imported);
                this.activeConversationId = imported.id;
                await Storage.saveConversations(this.conversations);
                await Storage.setActiveId(this.activeConversationId);
                this.renderSidebarHistory();
                this.renderActiveConversation();
                ChatRenderer.showToast('Imported');
            } catch (err) { ChatRenderer.showToast('Invalid: ' + err.message); }
        };
        reader.readAsText(file);
    }

    async exportChat(format = 'json') {
        const conv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!conv) return;
        const ts = Date.now();
        if (format === 'pdf') {
            await PDFExport.run(conv);
            return;
        }
        if (format === 'print') {
            PDFExport.printConversation(conv);
            return;
        }
        if (format === 'json') {
            Utils.downloadJSON(conv, `chat-${ts}.json`);
        } else if (format === 'md') {
            const md = `# ${conv.title}\n\n*Exported: ${new Date().toLocaleString()}*\n\n---\n\n` +
                conv.messages.map(m => `## ${m.sender === 'user' ? '👤 User' : '🤖 ChatGPT'}\n\n${m.text}\n\n---\n`).join('\n');
            Utils.downloadText(md, `chat-${ts}.md`, 'text/markdown');
        } else if (format === 'txt') {
            const txt = conv.messages.map(m => `${m.sender.toUpperCase()}: ${Utils.stripMarkdown(m.text)}`).join('\n\n');
            Utils.downloadText(txt, `chat-${ts}.txt`);
        }
        ChatRenderer.showToast('Export started');
    }

    exportAllChats() {
        if (!this.conversations.length) { ChatRenderer.showToast('No chats to export'); return; }
        Utils.downloadJSON(this.conversations, `chats-all-${Utils.dateStamp()}.json`);
        ChatRenderer.showToast(`Exporting ${this.conversations.length} chat${this.conversations.length === 1 ? '' : 's'}`);
    }

    _mdToHtml(text) {
        try {
            marked.use({ gfm: true, breaks: true });
            return marked.parse(text);
        } catch { return Utils.escapeHtml(text); }
    }

    shareCurrentChat() {
        const conv = this.conversations.find(c => c.id === this.activeConversationId);
        if (!conv || conv.messages.length === 0) { ChatRenderer.showToast('Nothing to share'); return; }
        ShareManager.open(conv);
    }

    async createFolder() {
        const name = this.folderNameInput?.value.trim();
        if (!name) return;
        this.settings.folders = this.settings.folders || [];
        this.settings.folders.push({ id: Utils.uid('folder'), name, chatIds: [] });
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        if (this.folderNameInput) this.folderNameInput.value = '';
        this.renderFolders();
        ChatRenderer.showToast('Folder created');
    }

    renderFolders() {
        if (!this.foldersList) return;
        const folders = this.settings.folders || [];
        if (folders.length === 0) {
            this.foldersList.innerHTML = '<div class="text-xs text-slate-500 text-center py-3">No folders yet</div>';
            return;
        }
        this.foldersList.innerHTML = folders.map((f, i) => `
            <div class="flex items-center justify-between p-2 rounded-lg bg-gpt-main/40 text-xs">
                <span class="text-slate-300">📁 ${Utils.escapeHtml(f.name)}</span>
                <button class="folder-del p-1 text-slate-500 hover:text-rose-400" data-i="${i}">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `).join('');
        this.foldersList.querySelectorAll('.folder-del').forEach(btn => {
            btn.onclick = async () => {
                folders.splice(parseInt(btn.dataset.i, 10), 1);
                this.settings.folders = folders;
                await Storage.saveSettings(this.settings);
                this._syncSettingsCache();
                this.renderFolders();
            };
        });
    }

    onProviderChange() {
        const p = this.providerSelect.value;
        const meta = this.PROVIDER_META[p] || this.PROVIDER_META.simulated;
        if (this.providerHint) this.providerHint.textContent = meta.hint;
        if (p === 'simulated') {
            this.apiKeyGroup?.classList.add('hidden');
            this.modelGroup?.classList.add('hidden');
        } else {
            this.apiKeyGroup?.classList.remove('hidden');
            this.modelGroup?.classList.remove('hidden');
            if (this.apiKeyHelp) this.apiKeyHelp.textContent = meta.keyHelp;
            if (this.apiKeyInput) this.apiKeyInput.value = this.settings.providerKeys?.[p] || '';
            if (this.modelInput) this.modelInput.value = this.settings.providerModels?.[p] || AIEngine.PROVIDERS[p]?.defaultModel || '';
        }
        this.modelsList?.classList.add('hidden');
        if (this.modelsList) this.modelsList.innerHTML = '';
    }

    async loadModelsForProvider() {
        const p = this.providerSelect.value;
        if (p === 'simulated') return;
        const k = this.apiKeyInput?.value.trim();
        if (!k) { ChatRenderer.showToast('Enter API key'); return; }
        const orig = this.loadModelsBtn.innerHTML;
        this.loadModelsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[10px] mr-1"></i>';
        this.loadModelsBtn.disabled = true;
        try {
            const models = await AIEngine.listModels(p, k);
            this.renderModelsList(models);
        } catch (err) {
            ChatRenderer.showToast(`Failed: ${err.message.slice(0, 60)}`);
        } finally {
            this.loadModelsBtn.innerHTML = orig;
            this.loadModelsBtn.disabled = false;
        }
    }

    renderModelsList(models) {
        if (!models || models.length === 0) { this.modelsList?.classList.add('hidden'); return; }
        if (this.modelsList) {
            this.modelsList.innerHTML = models.slice(0, 200).map(m => `
                <button type="button" class="model-pick w-full text-left px-3 py-1.5 rounded-lg text-[11px] text-slate-300 hover:bg-gpt-hover" data-m="${Utils.escapeHtml(m)}">${Utils.escapeHtml(m)}</button>
            `).join('');
            this.modelsList.querySelectorAll('.model-pick').forEach(b => {
                b.onclick = () => { if (this.modelInput) this.modelInput.value = b.dataset.m; this.modelsList?.classList.add('hidden'); this.commitProvider(); };
            });
            this.modelsList.classList.remove('hidden');
        }
    }

    showView(view) {
        this.view = view;
        if (this.mainWrapper) this.mainWrapper.dataset.view = view;
        document.body.classList.toggle('settings-open', view === 'settings');
        if (view === 'settings') this.toggleSidebar(false);
    }

    isMobileSettings() { return window.matchMedia('(max-width: 767px)').matches; }

    openSettings(section) {
        this.renderSettingsValues();
        this.showView('settings');
        if (!this._settingsPushed) { history.pushState({ view: 'settings' }, ''); this._settingsPushed = true; }
        if (this.settingsSearchInput) this.settingsSearchInput.value = '';
        this.filterSettingsNav('');
        if (section) this.setSettingsSection(section);
        else if (!this.isMobileSettings()) this.setSettingsSection(this._settingsSection || 'general');
        else {
            this.settingsShell.dataset.mview = 'nav';
            this.settingsTitle.textContent = 'Settings';
        }
    }

    setSettingsSection(key) {
        if (!this.SECTION_TITLES[key]) key = 'general';
        this._settingsSection = key;
        document.querySelectorAll('.sp-section').forEach(s => { s.hidden = s.dataset.section !== key; });
        document.querySelectorAll('.sp-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === key));
        if (this.settingsTitle) this.settingsTitle.textContent = this.SECTION_TITLES[key];
        if (this.settingsShell) this.settingsShell.dataset.mview = 'content';
        if (this.settingsContent) this.settingsContent.scrollTop = 0;
    }

    settingsBack() {
        if (this.isMobileSettings() && this.settingsShell?.dataset.mview === 'content') {
            this.settingsShell.dataset.mview = 'nav';
            this.settingsTitle.textContent = 'Settings';
            return;
        }
        this.closeSettings();
    }

    closeSettings(fromPop = false) {
        if (this.view !== 'settings') return;
        this.showView('chat');
        if (!fromPop && this._settingsPushed) { this._settingsPushed = false; history.back(); }
        else this._settingsPushed = false;
        document.activeElement?.blur?.();
    }

    filterSettingsNav(query) {
        const q = String(query || '').toLowerCase().trim();
        let visible = 0;
        document.querySelectorAll('.sp-nav-item').forEach(b => {
            const hay = `${b.textContent} ${b.dataset.keywords || ''}`.toLowerCase();
            const show = !q || hay.includes(q);
            b.hidden = !show;
            if (show) visible++;
        });
        document.querySelectorAll('.sp-nav-group').forEach(g => {
            g.hidden = !Array.from(g.querySelectorAll('.sp-nav-item')).some(b => !b.hidden);
        });
        if (this.settingsNoResults) this.settingsNoResults.hidden = visible > 0;
    }

    updateNavValues() {
        const set = (id, v) => { const el = this._(id); if (el) el.textContent = v; };
        const p = this.activePersona();
        set('navPersonaVal', p ? p.name : 'Custom');
        set('navLanguageVal', { en: 'English', ur: 'اردو', ar: 'العربية' }[this.settings.language || 'en']);
        set('navAppearanceVal', { light: 'Light', dark: 'Dark', system: 'System' }[this.settings.theme || 'system']);
        const prov = this.settings.provider || 'simulated';
        set('navProviderVal', this.PROVIDER_META[prov]?.label || prov);
        set('navMemoryVal', String((this.settings.memories || []).length));
        const initial = (this.settings.userName || 'U').trim().charAt(0).toUpperCase() || 'U';
        set('settingsAvatar', initial);
        set('settingsProfileName', this.settings.userName || 'User');
    }

    renderSettingsValues() {
        const s = this.settings;
        const p = s.provider || 'simulated';
        if (this.providerSelect) this.providerSelect.value = p;
        if (this.settingsSystemPromptInput) this.settingsSystemPromptInput.value = s.systemPrompt || '';
        if (this.userNameInput) this.userNameInput.value = s.userName || '';
        if (this.speechRateInput) this.speechRateInput.value = s.speechRate || 1.0;
        if (this.speechRateLabel) this.speechRateLabel.textContent = (parseFloat(s.speechRate) || 1).toFixed(1) + 'x';
        if (this.streamSpeedInput) this.streamSpeedInput.value = s.streamSpeed || 1.0;
        if (this.streamSpeedLabel) this.streamSpeedLabel.textContent = (parseFloat(s.streamSpeed) || 1).toFixed(1) + 'x';
        if (this.accentColorInput) this.accentColorInput.value = s.accentColor || '#10a37f';
        if (this.realWebSearchToggle) this.realWebSearchToggle.checked = !!s.realWebSearch;
        if (this.showThinkingToggle) this.showThinkingToggle.checked = !!s.showThinking;
        if (this.encryptionToggle) this.encryptionToggle.checked = !!s.encryption;
        if (this.notificationsToggle) this.notificationsToggle.checked = !!s.notifications;
        if (this.shareServerInput) this.shareServerInput.value = s.shareServer || '';
        this.setShareStatus(s.shareServer ? '' : 'No server: self-contained links will be used.', '');
        this.onProviderChange();
        this.renderPersonaCards();
        this.renderMemories();
        this.renderFolders();
        this.renderSharesList();
        this.applyLanguage();
        this.applyTheme(s.theme || 'system');
        this.updateNavValues();
    }

    renderSharesList() {
        if (this.sharesList) ShareManager.renderList(this.sharesList);
    }

    flashSaved(msg = 'Saved') {
        if (!this.settingsSaved) return;
        this.settingsSaved.textContent = msg;
        this.settingsSaved.classList.add('show');
        clearTimeout(this._savedTimer);
        this._savedTimer = setTimeout(() => this.settingsSaved.classList.remove('show'), 1600);
    }

    async persistSettings() {
        const ok = await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        this.updateNavValues();
        if (ok) this.flashSaved();
        return ok;
    }

    persistSettingsDebounced() {
        clearTimeout(this._persistTimer);
        this._persistTimer = setTimeout(() => this.persistSettings(), 400);
    }

    async commitProvider() {
        const p = this.providerSelect.value;
        this.settings.provider = p;
        if (p !== 'simulated') {
            const k = this.apiKeyInput?.value.trim() || '';
            const m = this.modelInput?.value.trim() || AIEngine.PROVIDERS[p]?.defaultModel || '';
            this.settings.providerKeys = this.settings.providerKeys || {};
            this.settings.providerKeys[p] = k;
            this.settings.providerModels = this.settings.providerModels || {};
            this.settings.providerModels[p] = m;
            this.settings.apiKey = k;
            this.settings.model = m;
        } else {
            this.settings.apiKey = '';
            this.settings.model = 'gpt-4o';
        }
        await this.persistSettings();
        this.updateUIStatus();
        this.updateModelLabel(this.settings.model || 'gpt-4o');
    }

    async clearAllData() {
        const ok = await UI.confirm('Delete ALL chats, settings, memories and workspace files on this device? This cannot be undone.', { title: 'Delete all data', confirmText: 'Delete everything', danger: true });
        if (ok) {
            await Storage.clearAll();
            location.reload();
        }
    }

    async deleteConversation(id) {
        if (!confirm('Delete conversation?')) return;
        this.conversations = this.conversations.filter(c => c.id !== id);
        this.settings.pinnedChats = (this.settings.pinnedChats || []).filter(x => x !== id);
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        if (this.activeConversationId === id) {
            this.activeConversationId = this.conversations[0]?.id;
            if (!this.activeConversationId) this.activeConversationId = await this.createNewConversation();
            await Storage.setActiveId(this.activeConversationId);
        }
        await Storage.saveConversations(this.conversations);
        this.renderSidebarHistory();
        this.renderActiveConversation();
    }

    async clearCurrentConversation() {
        const conv = this.conversations.find(c => c.id === this.activeConversationId);
        if (conv && conv.messages.length > 0) {
            if (!confirm('Clear all messages?')) return;
            conv.messages = [];
            await Storage.saveConversations(this.conversations);
            this.renderActiveConversation();
            ChatRenderer.showToast('Cleared');
        }
    }

    async updateSelectedModel(m) {
        this.settings.model = m;
        await Storage.saveSettings(this.settings);
        this._syncSettingsCache();
        this.updateModelLabel(m);
        this.modelDropdown?.classList.add('hidden');
    }

    updateModelLabel(m) {
        if (this.currentModelLabel) this.currentModelLabel.textContent = m || 'GPT-4o';
    }
}

const RAGEngine = {
    _db: null,
    _extractor: null,
    _ready: false,

    async init() {
        if (this._ready) return;
        try {
            const { create } = await import('https://cdn.jsdelivr.net/npm/@orama/orama@latest/+esm');
            const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4');

            this._db = await create({
                schema: {
                    text: 'string',
                    embedding: 'vector[384]'
                }
            });
            this._extractor = await pipeline('feature-extraction', 'mixedbread-ai/mxbai-embed-xsmall-v1');
            this._ready = true;
        } catch (e) {
            console.warn('RAG init failed:', e);
            ChatRenderer.showToast('RAG setup failed (check console)');
        }
    },

    async extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            fullText += strings.join(' ') + '\n';
        }
        return fullText.trim();
    },

    chunkText(text, chunkSize = 500, overlap = 50) {
        const words = text.split(/\s+/).filter(Boolean);
        const chunks = [];
        let i = 0;
        while (i < words.length) {
            const chunkWords = words.slice(i, i + chunkSize);
            chunks.push(chunkWords.join(' '));
            if (chunkWords.length < chunkSize) break;
            i += chunkSize - overlap;
        }
        return chunks;
    },

    async getEmbedding(text) {
        const output = await this._extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    },

    async indexPDF(file) {
        await this.init();
        if (!this._ready) return null;

        ChatRenderer.showToast(`Indexing ${file.name}...`);
        const text = await this.extractTextFromPDF(file);
        const chunks = this.chunkText(text);

        const { insert } = await import('https://cdn.jsdelivr.net/npm/@orama/orama@latest/+esm');

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = await this.getEmbedding(chunk);
            await insert(this._db, { text: chunk, embedding });
        }

        ChatRenderer.showToast(`Indexed ${chunks.length} chunks from ${file.name}`);
        return { text, chunks: chunks.length };
    },

    async search(query, topK = 3) {
        await this.init();
        if (!this._ready) return [];

        const { search } = await import('https://cdn.jsdelivr.net/npm/@orama/orama@latest/+esm');
        const embedding = await this.getEmbedding(query);
        const results = await search(this._db, {
            mode: 'vector',
            vector: embedding,
            limit: topK,
            includeVectors: false
        });
        return results.hits.map(hit => hit.document.text);
    }
};

(function initApp() {
    const boot = async () => {
        if (window.appInstance) return;
        try {
            window.appInstance = new ChatGPTApp();
            await window.appInstance.loadState();
            window.ShareManager?.init();
            console.log('✅ Ready');
        } catch (err) { console.error('❌ Init failed:', err); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

window.selectQuizOption = function(element, optionLetter) {
    const parent = element.closest('.quiz-options');
    if (!parent) return;
    parent.querySelectorAll('.quiz-opt').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
};

window.submitQuiz = function(button) {
    const card = button.closest('.quiz-card');
    if (!card) return;
    const selected = card.querySelector('.quiz-opt.selected');

    if (!selected) {
        if (window.ChatRenderer) ChatRenderer.showToast('Pehle koi option select karein!');
        return;
    }

    const correctLetter = 'B';
    const isCorrect = selected.querySelector('.circle').innerText === correctLetter;

    const allOptions = Array.from(card.querySelectorAll('.quiz-opt'));
    allOptions.forEach(opt => {
        opt.style.pointerEvents = 'none';
    });

    if (isCorrect) {
        if (window.ChatRenderer) ChatRenderer.showToast('✅ Sahi Jawab! Excellent!');
        button.innerText = 'Correct! ✓';
        button.style.backgroundColor = '#10a37f';
        selected.style.borderColor = '#10a37f';
        selected.style.backgroundColor = 'rgba(16, 163, 127, 0.1)';
        selected.querySelector('.circle').style.backgroundColor = '#10a37f';
        selected.querySelector('.circle').style.color = 'white';
    } else {
        selected.style.borderColor = '#e11d48';
        selected.style.backgroundColor = 'rgba(225, 29, 72, 0.1)';
        selected.querySelector('.circle').style.backgroundColor = '#e11d48';
        selected.querySelector('.circle').style.color = 'white';

        const correctOption = allOptions.find(opt => opt.querySelector('.circle').innerText === correctLetter);
        if (correctOption) {
            correctOption.style.borderColor = '#10a37f';
            correctOption.style.backgroundColor = 'rgba(16, 163, 127, 0.1)';
            correctOption.querySelector('.circle').style.backgroundColor = '#10a37f';
            correctOption.querySelector('.circle').style.color = 'white';
        }

        if (window.ChatRenderer) ChatRenderer.showToast(`❌ Ghalt! Sahi jawab ${correctLetter} tha.`);
        button.innerText = `Incorrect ✗ (Ans: ${correctLetter})`;
        button.style.backgroundColor = '#e11d48';
    }
    button.disabled = true;
};