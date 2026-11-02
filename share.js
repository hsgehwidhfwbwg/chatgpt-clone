const ShareManager = {
    MAX_INLINE_CHARS: 1500000,

    get app() { return window.appInstance; },

    baseUrl() { return location.href.split('#')[0]; },

    normalizeServer(url) {
        const v = String(url || '').trim().replace(/\/+$/, '');
        if (!v) return '';
        try {
            const u = new URL(v);
            if (!/^https?:$/.test(u.protocol)) return '';
            return u.origin + u.pathname.replace(/\/+$/, '');
        } catch (e) { return ''; }
    },

    buildPayload(conv) {
        return {
            v: 1,
            title: String(conv.title || 'Chat').slice(0, 120),
            model: conv.model || '',
            sharedAt: new Date().toISOString(),
            messages: conv.messages.map((m) => ({
                sender: m.sender === 'user' ? 'user' : 'assistant',
                text: String(m.text || ''),
                timestamp: m.timestamp || ''
            }))
        };
    },

    async _request(url, options = {}) {
        let res;
        try {
            res = await fetch(url, options);
        } catch (e) {
            const err = new Error('Could not reach the share server');
            err.code = 'network';
            throw err;
        }
        return res;
    },

    async createOnServer(server, payload, ttlSeconds) {
        const res = await this._request(`${server}/api/shares`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, ttlSeconds })
        });
        if (!res.ok) {
            let msg = `Server error ${res.status}`;
            try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
            throw new Error(msg);
        }
        return res.json();
    },

    async updateOnServer(share, payload) {
        const res = await this._request(`${share.server}/api/shares/${encodeURIComponent(share.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${share.token}` },
            body: JSON.stringify(payload)
        });
        if (res.status === 404 || res.status === 410 || res.status === 401 || res.status === 403) return false;
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return true;
    },

    async revokeOnServer(share) {
        const res = await this._request(`${share.server}/api/shares/${encodeURIComponent(share.id)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${share.token}` }
        });
        if (res.ok || res.status === 404 || res.status === 410) return true;
        throw new Error(`Server error ${res.status}`);
    },

    async encodeInline(payload) {
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        const packed = await Utils.deflateRaw(bytes).catch(() => null);
        return packed ? 'z.' + Utils.bytesToB64Url(packed) : 'r.' + Utils.bytesToB64Url(bytes);
    },

    async decodeInline(str) {
        const kind = str.slice(0, 2);
        const bytes = Utils.b64UrlToBytes(str.slice(2));
        const raw = kind === 'z.' ? await Utils.inflateRaw(bytes) : bytes;
        return JSON.parse(new TextDecoder().decode(raw));
    },

    parseHash() {
        const h = location.hash.replace(/^#/, '');
        if (!h) return null;
        const params = new URLSearchParams(h);
        if (params.has('share')) return { type: 'server', id: params.get('share'), server: params.get('server') || '' };
        if (params.has('shared')) return { type: 'inline', data: params.get('shared') };
        return null;
    },

    validatePayload(p) {
        if (!p || !Array.isArray(p.messages) || p.messages.length === 0) throw new Error('This shared conversation is empty or damaged');
        if (p.messages.length > 5000) throw new Error('This shared conversation is too large');
        return {
            title: String(p.title || 'Shared chat').slice(0, 120),
            model: String(p.model || ''),
            sharedAt: p.sharedAt || '',
            messages: p.messages.map((m) => ({
                sender: m && m.sender === 'user' ? 'user' : 'assistant',
                text: String((m && m.text) || '').slice(0, 300000),
                timestamp: (m && m.timestamp) || ''
            }))
        };
    },

    async open(conv) {
        if (!conv || !conv.messages || conv.messages.length === 0) { ChatRenderer.showToast('Nothing to share'); return; }
        const app = this.app;
        const overlay = document.createElement('div');
        overlay.className = 'ui-overlay';
        overlay.id = 'shareOverlay';
        const box = document.createElement('div');
        box.className = 'ui-dialog ui-wide';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-label', 'Share chat');
        overlay.appendChild(box);
        UI._root().appendChild(overlay);

        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

        const findShare = () => (app.settings.shares || []).find((s) => s.convId === conv.id);
        const saveShares = async () => { await Storage.saveSettings(app.settings); app._syncSettingsCache(); app.renderSharesList && app.renderSharesList(); };

        const render = (state = {}) => {
            const share = findShare();
            const server = this.normalizeServer(app.settings.shareServer);
            const n = conv.messages.length;
            let html = '<h3 class="ui-title"><i class="fa-solid fa-share-nodes" style="margin-inline-end:8px"></i>Share chat</h3>';

            if (state.busy) {
                html += `<p class="ui-message"><i class="fa-solid fa-spinner fa-spin"></i> ${Utils.escapeHtml(state.busy)}</p>`;
            } else if (!share) {
                html += `<div class="share-note"><i class="fa-solid fa-lock-open"></i><div><strong>Anyone with the link can read this conversation.</strong><br>${n} message${n === 1 ? '' : 's'} from “${Utils.escapeHtml(conv.title)}” will be shared. Your API keys, memories, settings and other chats are never included. Messages you attached files to include that file text.</div></div>`;
                if (server) {
                    html += `<div class="share-note share-ok"><i class="fa-solid fa-server"></i><div>Link is stored on your share server:<br><code>${Utils.escapeHtml(server)}</code>. You can stop sharing at any time.</div></div>
                    <label class="share-label">Link expires
                        <select id="shareTtl" class="ui-input">
                            <option value="0">Never</option><option value="86400">After 1 day</option><option value="604800" selected>After 7 days</option><option value="2592000">After 30 days</option>
                        </select></label>`;
                } else {
                    html += `<div class="share-note share-warn"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>No share server configured.</strong> A self-contained link will be created: the conversation is packed inside the link itself (after the # so it is never sent to any server). It cannot be revoked or expire, and the link can be long. For short, revocable links, set a Share server in Settings → Sharing.</div></div>`;
                }
                if (state.error) html += `<div class="ui-error">${Utils.escapeHtml(state.error)}</div>`;
                html += `<div class="ui-buttons"><button class="ui-btn" data-act="close">Cancel</button><button class="ui-btn ui-primary" data-act="create"><i class="fa-solid fa-link"></i>Create link</button></div>`;
            } else {
                const expired = share.expiresAt && new Date(share.expiresAt) < new Date();
                html += `<p class="ui-message">${share.mode === 'server' ? 'This chat is shared. Anyone with this link can view it (read-only).' : 'Self-contained link created. Anyone who has it can view the chat (read-only).'}</p>
                <div class="share-link-row"><input id="shareLinkInput" class="ui-input" readonly value="${Utils.escapeHtml(share.url)}" aria-label="Share link"><button class="ui-btn ui-primary" data-act="copy"><i class="fa-regular fa-copy"></i>Copy link</button></div>
                <div class="ui-hint">${share.mode === 'server' ? `Created ${Utils.escapeHtml(Utils.formatTime(share.createdAt))}${share.expiresAt ? ` · ${expired ? 'Expired' : 'Expires'} ${Utils.escapeHtml(Utils.formatTime(share.expiresAt))}` : ' · Never expires'}` : 'Cannot be revoked: stopping removes it from your list only.'}</div>`;
                if (share.url.length > 20000) html += `<div class="share-note share-warn"><i class="fa-solid fa-triangle-exclamation"></i><div>This link is very long (${Utils.formatBytes(share.url.length)}). Some apps may cut it off. A share server gives short links.</div></div>`;
                if (state.error) html += `<div class="ui-error">${Utils.escapeHtml(state.error)}</div>`;
                html += `<div class="ui-buttons share-actions">`;
                if (navigator.share) html += `<button class="ui-btn" data-act="native"><i class="fa-solid fa-share-nodes"></i>Share…</button>`;
                if (share.mode === 'server') html += `<button class="ui-btn" data-act="update"><i class="fa-solid fa-rotate"></i>Update shared copy</button>`;
                html += `<button class="ui-btn ui-danger" data-act="revoke"><i class="fa-solid fa-ban"></i>${share.mode === 'server' ? 'Stop sharing' : 'Remove link'}</button><button class="ui-btn" data-act="close">Done</button></div>`;
            }
            box.innerHTML = html;
        };

        const actions = {
            close,
            create: async () => {
                const ttl = parseInt((box.querySelector('#shareTtl') || {}).value || '0', 10);
                const server = this.normalizeServer(app.settings.shareServer);
                const payload = this.buildPayload(conv);
                render({ busy: 'Creating link…' });
                try {
                    let entry;
                    if (server) {
                        const r = await this.createOnServer(server, payload, ttl);
                        entry = {
                            id: r.id, token: r.revokeToken, server, mode: 'server', convId: conv.id, title: conv.title,
                            url: `${this.baseUrl()}#share=${encodeURIComponent(r.id)}&server=${encodeURIComponent(server)}`,
                            createdAt: new Date().toISOString(), expiresAt: r.expiresAt || null, count: payload.messages.length
                        };
                    } else {
                        const data = await this.encodeInline(payload);
                        if (data.length > this.MAX_INLINE_CHARS) throw new Error('This chat is too large for a self-contained link. Configure a share server in Settings → Sharing.');
                        entry = {
                            id: Utils.uid('inline'), mode: 'inline', convId: conv.id, title: conv.title,
                            url: `${this.baseUrl()}#shared=${data}`, createdAt: new Date().toISOString(), expiresAt: null, count: payload.messages.length
                        };
                    }
                    app.settings.shares = (app.settings.shares || []).filter((s) => s.convId !== conv.id);
                    app.settings.shares.unshift(entry);
                    await saveShares();
                    render();
                } catch (e) {
                    render({ error: e.message || 'Could not create link' });
                }
            },
            copy: async () => {
                const share = findShare();
                if (!share) return;
                const ok = await Utils.copyText(share.url);
                ChatRenderer.showToast(ok ? 'Link copied to clipboard' : 'Copy failed. Select the link and copy it manually');
                if (!ok) { const i = box.querySelector('#shareLinkInput'); i && (i.focus(), i.select()); }
            },
            native: async () => {
                const share = findShare();
                if (!share) return;
                try { await navigator.share({ title: share.title, text: `Shared chat: ${share.title}`, url: share.url }); }
                catch (e) { if (e && e.name !== 'AbortError') { await actions.copy(); } }
            },
            update: async () => {
                const share = findShare();
                if (!share) return;
                render({ busy: 'Updating shared copy…' });
                try {
                    const ok = await this.updateOnServer(share, this.buildPayload(conv));
                    if (!ok) { render({ error: 'The shared copy no longer exists on the server. Stop sharing and create a new link.' }); return; }
                    share.count = conv.messages.length;
                    await saveShares();
                    render();
                    ChatRenderer.showToast('Shared copy updated');
                } catch (e) { render({ error: e.message }); }
            },
            revoke: async () => {
                const share = findShare();
                if (!share) return;
                const ok = await UI.confirm(share.mode === 'server' ? 'People with the link will no longer be able to open this chat.' : 'The link will be removed from your list. Anyone who already has it can still open it.', { title: share.mode === 'server' ? 'Stop sharing?' : 'Remove link?', confirmText: share.mode === 'server' ? 'Stop sharing' : 'Remove', danger: true });
                if (!ok) return;
                render({ busy: 'Working…' });
                try {
                    if (share.mode === 'server') await this.revokeOnServer(share);
                    app.settings.shares = app.settings.shares.filter((s) => s.id !== share.id);
                    await saveShares();
                    ChatRenderer.showToast(share.mode === 'server' ? 'Sharing stopped' : 'Link removed');
                    render();
                } catch (e) { render({ error: `${e.message}. The link is still active.` }); }
            }
        };

        box.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (btn && actions[btn.dataset.act]) actions[btn.dataset.act]();
        });
        render();
    },

    async testServer(url) {
        const server = this.normalizeServer(url);
        if (!server) throw new Error('Enter a valid http(s) URL');
        const res = await this._request(`${server}/health`);
        if (!res.ok) throw new Error(`Server answered ${res.status}`);
        const j = await res.json().catch(() => ({}));
        if (!j || j.service !== 'chat-share') throw new Error('This URL is not a chat share server');
        return server;
    },

    renderList(container) {
        if (!container) return;
        const shares = (this.app.settings.shares || []);
        if (!shares.length) {
            container.innerHTML = '<div class="sp-empty">You have not shared any chats.</div>';
            return;
        }
        container.innerHTML = shares.map((s, i) => `
            <div class="sp-row sp-row-stack">
                <div class="sp-row-main">
                    <div class="sp-row-title">${Utils.escapeHtml(s.title || 'Chat')}</div>
                    <div class="sp-row-desc">${s.mode === 'server' ? 'Server link' : 'Self-contained link'} · ${s.count || 0} messages · ${Utils.escapeHtml(Utils.formatTime(s.createdAt))}${s.expiresAt ? ' · expires ' + Utils.escapeHtml(Utils.formatTime(s.expiresAt)) : ''}</div>
                </div>
                <div class="sp-row-actions">
                    <button class="sp-btn" data-share-copy="${i}"><i class="fa-regular fa-copy"></i>Copy</button>
                    <button class="sp-btn sp-btn-danger" data-share-revoke="${i}"><i class="fa-solid fa-ban"></i>${s.mode === 'server' ? 'Revoke' : 'Remove'}</button>
                </div>
            </div>`).join('');
        container.querySelectorAll('[data-share-copy]').forEach((b) => {
            b.onclick = async () => {
                const s = shares[+b.dataset.shareCopy];
                const ok = await Utils.copyText(s.url);
                ChatRenderer.showToast(ok ? 'Link copied to clipboard' : 'Copy failed');
            };
        });
        container.querySelectorAll('[data-share-revoke]').forEach((b) => {
            b.onclick = async () => {
                const s = shares[+b.dataset.shareRevoke];
                const ok = await UI.confirm(s.mode === 'server' ? 'People with the link will no longer be able to open this chat.' : 'The link will be removed from this list. Anyone who already has it can still open it.', { title: s.mode === 'server' ? 'Revoke link?' : 'Remove link?', confirmText: s.mode === 'server' ? 'Revoke' : 'Remove', danger: true });
                if (!ok) return;
                try {
                    if (s.mode === 'server') await this.revokeOnServer(s);
                    this.app.settings.shares = this.app.settings.shares.filter((x) => x.id !== s.id);
                    await Storage.saveSettings(this.app.settings);
                    this.app._syncSettingsCache();
                    this.renderList(container);
                    ChatRenderer.showToast(s.mode === 'server' ? 'Link revoked' : 'Link removed');
                } catch (e) { ChatRenderer.showToast(`${e.message}. Link is still active`); }
            };
        });
    },

    async checkHash() {
        const parsed = this.parseHash();
        const view = document.getElementById('sharedView');
        if (!view) return;
        if (!parsed) { view.classList.add('hidden'); document.body.classList.remove('shared-open'); return; }
        document.body.classList.add('shared-open');
        view.classList.remove('hidden');
        this.renderViewer(view, { loading: true });
        try {
            let payload;
            if (parsed.type === 'server') {
                const server = this.normalizeServer(parsed.server);
                if (!server || !parsed.id) throw Object.assign(new Error('This link is invalid.'), { code: 'invalid' });
                const res = await this._request(`${server}/api/shares/${encodeURIComponent(parsed.id)}`, { headers: { 'Accept': 'application/json' } });
                if (res.status === 404) throw Object.assign(new Error('This shared chat was not found. The link may be wrong or it was removed by its owner.'), { code: 'gone' });
                if (res.status === 410) throw Object.assign(new Error('This shared link has expired or was revoked by its owner.'), { code: 'gone' });
                if (!res.ok) throw new Error(`The share server returned an error (${res.status}).`);
                payload = await res.json();
            } else {
                try { payload = await this.decodeInline(parsed.data); }
                catch (e) { throw Object.assign(new Error('This link is invalid or was cut off when it was copied.'), { code: 'invalid' }); }
            }
            this.renderViewer(view, { payload: this.validatePayload(payload) });
        } catch (e) {
            this.renderViewer(view, { error: e.message || 'Could not open this shared chat.' });
        }
    },

    closeViewer() {
        history.replaceState(null, '', this.baseUrl());
        document.getElementById('sharedView')?.classList.add('hidden');
        document.body.classList.remove('shared-open');
    },

    renderViewer(view, { loading, error, payload }) {
        const head = (title, sub) => `<header class="sv-head"><div class="sv-title-wrap"><div class="sv-badge"><i class="fa-solid fa-eye"></i> Shared chat · read-only</div><h1 class="sv-title">${Utils.escapeHtml(title)}</h1>${sub ? `<div class="sv-sub">${Utils.escapeHtml(sub)}</div>` : ''}</div><div class="sv-actions">${payload ? '<button class="sp-btn" id="svImport"><i class="fa-solid fa-file-import"></i>Import to my chats</button>' : ''}<button class="sp-btn sp-btn-primary" id="svClose">Open app</button></div></header>`;
        if (loading) {
            view.innerHTML = head('Loading shared chat…') + '<div class="sv-body"><div class="sv-state"><i class="fa-solid fa-spinner fa-spin"></i></div></div>';
        } else if (error) {
            view.innerHTML = head('Shared chat unavailable') + `<div class="sv-body"><div class="sv-state sv-error"><i class="fa-solid fa-link-slash"></i><p>${Utils.escapeHtml(error)}</p></div></div>`;
        } else {
            const rows = payload.messages.map((m) => {
                const isUser = m.sender === 'user';
                const html = Utils.sanitizeHtml(ChatRenderer.formatMarkdown(m.text));
                return `<article class="sv-msg ${isUser ? 'sv-user' : 'sv-ai'}"><div class="sv-who">${isUser ? 'User' : 'ChatGPT'}${m.timestamp ? `<span>${Utils.escapeHtml(ChatRenderer.formatTime(m.timestamp))}</span>` : ''}</div><div class="markdown-body">${html}</div></article>`;
            }).join('');
            view.innerHTML = head(payload.title, `${payload.messages.length} messages${payload.model ? ' · ' + payload.model : ''}`) + `<div class="sv-body custom-scrollbar"><div class="sv-messages">${rows}</div></div>`;
            view.querySelector('#svImport').onclick = async () => {
                const app = this.app;
                if (!app) return;
                const conv = {
                    id: Utils.uid('conv'), title: `Shared: ${payload.title}`.slice(0, 60), model: payload.model || app.settings.model,
                    folderId: null, createdAt: new Date().toISOString(),
                    messages: payload.messages.map((m) => ({ id: Utils.uid('msg'), sender: m.sender, text: m.text, timestamp: m.timestamp || new Date().toISOString() }))
                };
                app.conversations.unshift(conv);
                app.activeConversationId = conv.id;
                await Storage.saveConversations(app.conversations);
                await Storage.setActiveId(conv.id);
                app.renderSidebarHistory();
                app.renderActiveConversation();
                this.closeViewer();
                ChatRenderer.showToast('Imported to your chats');
            };
        }
        const closeBtn = view.querySelector('#svClose');
        if (closeBtn) closeBtn.onclick = () => this.closeViewer();
    },

    init() {
        window.addEventListener('hashchange', () => this.checkHash());
        this.checkHash();
    }
};

window.ShareManager = ShareManager;
