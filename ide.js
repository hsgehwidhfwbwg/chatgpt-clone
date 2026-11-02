const IDE = {
    CM_BASE: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/',
    MAX_FILE: 5 * 1024 * 1024,
    MAX_IMPORT_TOTAL: 50 * 1024 * 1024,
    BINARY_EXT: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif'],
    MIME: {
        html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
        md: 'text/markdown', svg: 'image/svg+xml', xml: 'application/xml', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg',
        jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif'
    },
    MODES: {
        html: 'htmlmixed', htm: 'htmlmixed', vue: 'htmlmixed', css: 'css', scss: 'text/x-scss', less: 'text/x-less',
        js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'text/typescript', tsx: 'text/typescript-jsx',
        json: 'application/json', md: 'markdown', markdown: 'markdown', py: 'python', java: 'text/x-java', c: 'text/x-csrc',
        h: 'text/x-csrc', cpp: 'text/x-c++src', hpp: 'text/x-c++src', cs: 'text/x-csharp', php: 'application/x-httpd-php',
        sql: 'text/x-sql', sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml'
    },
    SYMBOLS: ['Tab', '{', '}', '(', ')', '[', ']', '<', '>', '/', ';', ':', '"', "'", '=', '!', '&', '|', '$', '_', '-', '+', '#'],

    store: null,
    root: null,
    cm: null,
    libPromise: null,
    built: false,
    opened: false,
    files: {},
    folders: new Set(),
    docs: {},
    tabs: [],
    active: null,
    expanded: new Set(),
    selectedDir: '',
    rev: 0,
    prefs: { wrap: false, hint: true, fontSize: 14, live: true },
    sideOpen: true,
    sidePanel: 'explorer',
    pvOpen: true,
    mview: 'explorer',
    pvEntry: null,
    consoleLines: [],
    persistTimer: null,
    liveTimer: null,
    conflictOpen: false,
    histPushed: false,

    isMobile() { return window.matchMedia('(max-width: 767px)').matches; },
    isDark() { return !document.documentElement.classList.contains('light'); },

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load ${src.split('/').pop()}`));
            document.head.appendChild(s);
        });
    },

    loadCss(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        document.head.appendChild(l);
    },

    loadLib() {
        if (window.CodeMirror && window.CodeMirror.__ideReady) return Promise.resolve();
        if (this.libPromise) return this.libPromise;
        const b = this.CM_BASE;
        this.libPromise = (async () => {
            ['codemirror.min.css', 'addon/hint/show-hint.min.css', 'addon/dialog/dialog.min.css', 'theme/material-darker.min.css', 'theme/eclipse.min.css'].forEach((f) => this.loadCss(b + f));
            await this.loadScript(b + 'codemirror.min.js');
            const rest = [
                'mode/xml/xml.min.js', 'mode/javascript/javascript.min.js', 'mode/css/css.min.js', 'mode/htmlmixed/htmlmixed.min.js',
                'mode/jsx/jsx.min.js', 'mode/markdown/markdown.min.js', 'mode/python/python.min.js', 'mode/clike/clike.min.js',
                'mode/sql/sql.min.js', 'mode/shell/shell.min.js', 'mode/yaml/yaml.min.js', 'mode/php/php.min.js',
                'addon/edit/closebrackets.min.js', 'addon/edit/closetag.min.js', 'addon/edit/matchbrackets.min.js',
                'addon/selection/active-line.min.js', 'addon/comment/comment.min.js', 'addon/dialog/dialog.min.js',
                'addon/search/searchcursor.min.js', 'addon/search/search.min.js', 'addon/hint/show-hint.min.js',
                'addon/hint/javascript-hint.min.js', 'addon/hint/xml-hint.min.js', 'addon/hint/html-hint.min.js',
                'addon/hint/css-hint.min.js', 'addon/hint/anyword-hint.min.js'
            ];
            await Promise.all(rest.map((f) => this.loadScript(b + f)));
            window.CodeMirror.__ideReady = true;
        })().catch((e) => { this.libPromise = null; throw e; });
        return this.libPromise;
    },

    getStore() {
        if (!this.store && typeof localforage !== 'undefined') {
            this.store = localforage.createInstance({ name: 'chatgpt_clone_ide', storeName: 'kv' });
        }
        return this.store;
    },

    normalizePath(input) {
        let p = String(input || '').replace(/\\/g, '/').trim();
        p = p.replace(/^\.?\/+/, '').replace(/\/+$/, '');
        if (!p || p.length > 240) return null;
        const parts = p.split('/');
        for (const seg of parts) {
            if (!seg || seg === '.' || seg === '..') return null;
            if (/[<>:"|?*\u0000-\u001f]/.test(seg)) return null;
            if (seg.length > 120) return null;
        }
        return parts.join('/');
    },

    isBinaryPath(path) { return this.BINARY_EXT.includes(Utils.extname(path)); },

    allDirs() {
        const set = new Set();
        const addChain = (p) => { let d = p; while (d) { set.add(d); d = Utils.dirname(d); } };
        this.folders.forEach(addChain);
        Object.keys(this.files).forEach((p) => addChain(Utils.dirname(p)));
        return set;
    },

    folderExists(path) { return this.allDirs().has(path); },
    fileExists(path) { return Object.prototype.hasOwnProperty.call(this.files, path); },

    pathConflict(path) {
        if (this.fileExists(path)) return 'A file with this name already exists';
        if (this.folderExists(path)) return 'A folder with this name already exists';
        let d = Utils.dirname(path);
        while (d) {
            if (this.fileExists(d)) return `"${d}" is a file, not a folder`;
            d = Utils.dirname(d);
        }
        return '';
    },

    uniquePath(path) {
        if (!this.pathConflict(path)) return path;
        const dir = Utils.dirname(path);
        const base = Utils.basename(path);
        const i = base.lastIndexOf('.');
        const stem = i > 0 ? base.slice(0, i) : base;
        const ext = i > 0 ? base.slice(i) : '';
        for (let n = 1; n < 1000; n++) {
            const cand = (dir ? dir + '/' : '') + `${stem} (${n})${ext}`;
            if (!this.pathConflict(cand)) return cand;
        }
        return (dir ? dir + '/' : '') + `${stem}-${Date.now()}${ext}`;
    },

    modeFor(path) { return this.MODES[Utils.extname(path)] || null; },

    makeDoc(path, saved, draft) {
        const doc = CodeMirror.Doc(saved, this.modeFor(path));
        const gen = doc.changeGeneration(true);
        const entry = { doc, gen };
        if (draft !== undefined && draft !== null && draft !== saved) {
            doc.setValue(draft);
            doc.clearHistory();
        }
        this.docs[path] = entry;
        return entry;
    },

    getDocEntry(path) {
        if (this.docs[path]) return this.docs[path];
        const f = this.files[path];
        if (!f || f.binary) return null;
        return this.makeDoc(path, f.content);
    },

    isDirty(path) {
        const e = this.docs[path];
        return !!e && !e.doc.isClean(e.gen);
    },

    hasDirty() { return Object.keys(this.docs).some((p) => this.files[p] && this.isDirty(p)); },

    textOf(path) {
        const e = this.docs[path];
        if (e) return e.doc.getValue();
        const f = this.files[path];
        return f && !f.binary ? f.content : '';
    },

    snapshotFiles() {
        const out = {};
        Object.keys(this.files).forEach((p) => {
            const f = this.files[p];
            out[p] = f.binary ? { content: f.content, binary: true } : { content: this.textOf(p) };
        });
        return out;
    },

    async loadWorkspace() {
        const store = this.getStore();
        let data = null;
        try { data = store ? await store.getItem('workspace') : null; } catch (e) { console.warn('IDE load failed', e); }
        Object.keys(this.docs).forEach((p) => delete this.docs[p]);
        if (data && data.files) {
            this.files = data.files;
            this.folders = new Set(data.folders || []);
            this.tabs = (data.tabs || []).filter((p) => this.files[p]);
            this.active = this.files[data.active] ? data.active : (this.tabs[0] || null);
            this.expanded = new Set(data.expanded || []);
            this.prefs = { ...this.prefs, ...(data.prefs || {}) };
            this.rev = data.rev || 0;
            if (this.cmReady()) {
                Object.keys(data.drafts || {}).forEach((p) => {
                    if (this.files[p] && !this.files[p].binary) this.makeDoc(p, this.files[p].content, data.drafts[p]);
                });
            } else this._pendingDrafts = data.drafts || {};
        } else {
            this.files = {}; this.folders = new Set(); this.tabs = []; this.active = null; this.expanded = new Set(); this.rev = 0;
        }
    },

    cmReady() { return !!(window.CodeMirror && window.CodeMirror.__ideReady); },

    schedulePersist(ms = 1200) {
        clearTimeout(this.persistTimer);
        this.persistTimer = setTimeout(() => this.persist(), ms);
    },

    async persist() {
        clearTimeout(this.persistTimer);
        const store = this.getStore();
        if (!store) { this.toastOnce('Workspace cannot be saved: storage is unavailable'); return false; }
        try {
            const current = await store.getItem('workspace');
            if (current && (current.rev || 0) !== this.rev) {
                if (this.conflictOpen) return false;
                this.conflictOpen = true;
                const overwrite = await UI.confirm('The workspace was changed in another tab or window. Overwrite it with the version open here?', { title: 'Workspace changed elsewhere', confirmText: 'Overwrite', cancelText: 'Load newer version', danger: true });
                this.conflictOpen = false;
                if (!overwrite) {
                    await this.loadWorkspace();
                    this.renderAll();
                    this.showActive();
                    return false;
                }
                this.rev = current.rev || 0;
            }
            const drafts = {};
            Object.keys(this.docs).forEach((p) => { if (this.files[p] && this.isDirty(p)) drafts[p] = this.docs[p].doc.getValue(); });
            const next = this.rev + 1;
            await store.setItem('workspace', {
                version: 1, rev: next, files: this.files, folders: Array.from(this.folders), tabs: this.tabs, active: this.active,
                expanded: Array.from(this.expanded), drafts, prefs: this.prefs, updatedAt: Date.now()
            });
            this.rev = next;
            return true;
        } catch (e) {
            console.warn('IDE persist failed', e);
            this.toastOnce(e && e.name === 'QuotaExceededError' ? 'Workspace not saved: storage is full' : 'Workspace could not be saved');
            return false;
        }
    },

    toastOnce(msg) {
        const now = Date.now();
        if (this._lastToast && this._lastToast.msg === msg && now - this._lastToast.t < 5000) return;
        this._lastToast = { msg, t: now };
        ChatRenderer.showToast(msg);
    },

    async ensureReady() {
        if (this.opened && this.built && this.cm) return;
        const host = document.getElementById('idePage');
        if (!host) throw new Error('Workspace container missing');
        host.classList.remove('hidden');
        document.body.classList.add('ide-open');
        if (!this.built) {
            host.innerHTML = '<div class="ide-boot"><i class="fa-solid fa-spinner fa-spin"></i><span>Loading editor…</span></div>';
        }
        try {
            await this.loadLib();
        } catch (e) {
            host.innerHTML = `<div class="ide-boot ide-boot-error"><i class="fa-solid fa-triangle-exclamation"></i><p>The code editor could not be loaded. Check your internet connection.</p><p class="ide-boot-detail">${Utils.escapeHtml(e.message)}</p><div><button class="sp-btn sp-btn-primary" id="ideRetry">Retry</button> <button class="sp-btn" id="ideBootClose">Back to chat</button></div></div>`;
            host.querySelector('#ideRetry').onclick = () => { this.ensureReady().then(() => this.finishOpen()).catch(() => {}); };
            host.querySelector('#ideBootClose').onclick = () => { host.classList.add('hidden'); document.body.classList.remove('ide-open'); this.opened = false; };
            throw e;
        }
        if (!this.built) {
            await this.loadWorkspace();
            this.buildUI(host);
            this.built = true;
            if (this._pendingDrafts) {
                Object.keys(this._pendingDrafts).forEach((p) => {
                    if (this.files[p] && !this.files[p].binary) this.makeDoc(p, this.files[p].content, this._pendingDrafts[p]);
                });
                this._pendingDrafts = null;
            }
        }
    },

    async open() {
        try { await this.ensureReady(); } catch (e) { return; }
        this.finishOpen();
    },

    finishOpen() {
        const host = document.getElementById('idePage');
        host.classList.remove('hidden');
        document.body.classList.add('ide-open');
        this.opened = true;
        if (!this.histPushed) { history.pushState({ view: 'ide' }, ''); this.histPushed = true; }
        this.applyTheme();
        this.applyLayout();
        this.renderAll();
        this.showActive();
        this.fitViewport();
    },

    async openSnippet({ code, lang, filename }) {
        try { await this.ensureReady(); } catch (e) { return; }
        let ext = Utils.extFromLang(lang);
        if ((!lang || lang === 'plaintext' || ext === 'txt') && /^\s*(<!doctype html|<html[\s>])/i.test(code)) ext = 'html';
        else if ((!lang || lang === 'plaintext') && window.hljs) {
            try {
                const guess = hljs.highlightAuto(code.slice(0, 4000), ['javascript', 'python', 'css', 'xml', 'json', 'java', 'cpp', 'sql', 'bash', 'typescript']).language;
                if (guess) ext = Utils.extFromLang(guess === 'xml' ? 'html' : guess);
            } catch (e) {}
        }
        let name = filename ? this.normalizePath(filename) : null;
        if (!name) name = ext === 'html' && !this.fileExists('index.html') ? 'index.html' : `snippet.${ext}`;
        name = this.uniquePath(name);
        this.files[name] = { content: code };
        let d = Utils.dirname(name);
        while (d) { this.expanded.add(d); d = Utils.dirname(d); }
        this.makeDoc(name, code);
        this.finishOpen();
        this.openFile(name);
        this.mview = 'editor';
        this.applyLayout();
        this.schedulePersist(200);
        ChatRenderer.showToast(`Opened ${Utils.basename(name)} in the workspace`);
    }
};

Object.assign(IDE, {
    q(sel) { return this.root.querySelector(sel); },
    qa(sel) { return Array.from(this.root.querySelectorAll(sel)); },

    buildUI(host) {
        host.innerHTML = `
<div class="ide" role="application" aria-label="Code workspace">
  <header class="ide-top">
    <button class="ide-ib" data-a="back" title="Back to chat" aria-label="Back to chat"><i class="fa-solid fa-arrow-left"></i></button>
    <div class="ide-title"><i class="fa-solid fa-code"></i><span>Workspace</span></div>
    <div class="ide-tools">
      <button class="ide-tb" data-a="newFile" title="New file"><i class="fa-solid fa-file-circle-plus"></i><span>New File</span></button>
      <button class="ide-tb" data-a="newFolder" title="New folder"><i class="fa-solid fa-folder-plus"></i><span>New Folder</span></button>
      <button class="ide-tb" data-a="save" title="Save (Ctrl+S)"><i class="fa-solid fa-floppy-disk"></i><span>Save</span></button>
      <button class="ide-tb ide-run" data-a="run" title="Run / Preview (Ctrl+Enter)"><i class="fa-solid fa-play"></i><span>Run</span></button>
      <button class="ide-tb" data-a="import" title="Import files, folders or ZIP"><i class="fa-solid fa-file-import"></i><span>Import</span></button>
      <button class="ide-tb" data-a="export" title="Export file or project"><i class="fa-solid fa-file-export"></i><span>Export</span></button>
      <button class="ide-tb" data-a="more" title="More" aria-label="More actions"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      <button class="ide-tb ide-close-ws" data-a="closeWs" title="Close workspace"><i class="fa-solid fa-xmark"></i><span>Close Workspace</span></button>
    </div>
  </header>
  <div class="ide-body">
    <nav class="ide-activity" aria-label="Workspace views">
      <button data-v="explorer" title="Explorer"><i class="fa-regular fa-folder-open"></i><span>Files</span></button>
      <button data-v="editor" class="mobile-only" title="Editor"><i class="fa-solid fa-code"></i><span>Editor</span></button>
      <button data-v="search" title="Search"><i class="fa-solid fa-magnifying-glass"></i><span>Search</span></button>
      <button data-v="preview" title="Preview"><i class="fa-regular fa-eye"></i><span>Preview</span></button>
    </nav>
    <aside class="ide-side">
      <div class="ide-panel" data-panel="explorer">
        <div class="ide-ph"><span>EXPLORER</span>
          <div class="ide-ph-actions">
            <button data-a="newFile" title="New file" aria-label="New file"><i class="fa-solid fa-file-circle-plus"></i></button>
            <button data-a="newFolder" title="New folder" aria-label="New folder"><i class="fa-solid fa-folder-plus"></i></button>
            <button data-a="import" title="Import" aria-label="Import"><i class="fa-solid fa-file-import"></i></button>
            <button data-a="collapse" title="Collapse folders" aria-label="Collapse folders"><i class="fa-solid fa-angles-up"></i></button>
          </div>
        </div>
        <div class="ide-tree custom-scrollbar" role="tree"></div>
      </div>
      <div class="ide-panel" data-panel="search" hidden>
        <div class="ide-ph"><span>SEARCH</span></div>
        <div class="ide-search-box">
          <div class="ide-search-row"><input class="ide-in" data-s="q" placeholder="Search in files" aria-label="Search in files"><button class="ide-opt" data-s="case" title="Match case" aria-pressed="false">Aa</button><button class="ide-opt" data-s="regex" title="Regular expression" aria-pressed="false">.*</button></div>
          <div class="ide-search-row"><input class="ide-in" data-s="r" placeholder="Replace with" aria-label="Replace with"><button class="ide-opt ide-opt-wide" data-s="replaceAll" title="Replace all">Replace all</button></div>
        </div>
        <div class="ide-results custom-scrollbar"></div>
      </div>
    </aside>
    <section class="ide-main">
      <div class="ide-tabs custom-scrollbar" role="tablist"></div>
      <div class="ide-editor-wrap">
        <div class="ide-cm"></div>
        <div class="ide-empty">
          <i class="fa-solid fa-laptop-code"></i>
          <h3>No file open</h3>
          <p>Create a file, import your project, or start from a ready HTML/CSS/JS template.</p>
          <div class="ide-empty-actions">
            <button class="sp-btn sp-btn-primary" data-a="newFile"><i class="fa-solid fa-file-circle-plus"></i>New File</button>
            <button class="sp-btn" data-a="import"><i class="fa-solid fa-file-import"></i>Import</button>
            <button class="sp-btn" data-a="starter"><i class="fa-solid fa-wand-magic-sparkles"></i>Starter project</button>
          </div>
        </div>
        <div class="ide-binary"></div>
      </div>
      <div class="ide-symbols" aria-label="Symbol shortcuts"></div>
      <div class="ide-status"><span data-st="lang"></span><span data-st="pos"></span><span data-st="dirty"></span><span class="grow"></span><span>UTF-8</span></div>
    </section>
    <section class="ide-preview">
      <div class="ide-pv-bar">
        <i class="fa-regular fa-eye"></i><span class="ide-pv-title">Preview</span><span class="ide-pv-entry"></span><span class="grow"></span>
        <button data-a="refresh" title="Refresh preview" aria-label="Refresh preview"><i class="fa-solid fa-rotate"></i></button>
        <button data-a="toggleLive" class="ide-live" title="Live update" aria-pressed="true"><i class="fa-solid fa-bolt"></i><span>Live</span></button>
        <button data-a="openTab" title="Open in new tab" aria-label="Open in new tab"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        <button data-a="hidePreview" class="desktop-only" title="Hide preview" aria-label="Hide preview"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="ide-pv-stage">
        <iframe class="ide-frame" title="Live preview" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>
        <div class="ide-pv-msg"></div>
      </div>
      <div class="ide-console collapsed">
        <div class="ide-console-head" data-a="toggleConsole"><i class="fa-solid fa-terminal"></i><span>Console</span><span class="ide-badge" hidden></span><span class="grow"></span><button data-a="clearConsole" title="Clear console" aria-label="Clear console"><i class="fa-regular fa-trash-can"></i></button></div>
        <div class="ide-console-body custom-scrollbar"></div>
      </div>
    </section>
  </div>
  <input type="file" class="hidden" data-in="files" multiple>
  <input type="file" class="hidden" data-in="zip" accept=".zip,application/zip,application/x-zip-compressed">
  <input type="file" class="hidden" data-in="dir" webkitdirectory>
</div>`;
        this.root = host.querySelector('.ide');

        this.cm = CodeMirror(this.q('.ide-cm'), {
            value: '', lineNumbers: true, indentUnit: 2, tabSize: 2, indentWithTabs: false, smartIndent: true, electricChars: true,
            lineWrapping: !!this.prefs.wrap, autoCloseBrackets: true, autoCloseTags: true, matchBrackets: true, styleActiveLine: true,
            viewportMargin: 30, theme: this.isDark() ? 'material-darker' : 'eclipse', inputStyle: 'contenteditable',
            extraKeys: {
                'Ctrl-S': () => this.saveFile(), 'Cmd-S': () => this.saveFile(),
                'Ctrl-Enter': () => this.run(), 'Cmd-Enter': () => this.run(),
                'Ctrl-Space': (cm) => cm.showHint({ hint: CodeMirror.hint.auto, completeSingle: false }),
                'Tab': (cm) => { if (cm.somethingSelected()) cm.indentSelection('add'); else cm.execCommand('insertSoftTab'); },
                'Shift-Tab': (cm) => cm.indentSelection('subtract'),
                'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment', 'Ctrl-H': 'replace'
            }
        });
        this.cm.on('change', () => this.onEditorChange());
        this.cm.on('cursorActivity', () => this.updateStatus());
        this.cm.on('focus', () => this.root.classList.add('cm-focus'));
        this.cm.on('blur', () => this.root.classList.remove('cm-focus'));
        this.cm.on('inputRead', (cm, change) => {
            if (!this.prefs.hint || cm.state.completionActive || change.origin !== '+input') return;
            const last = (change.text[0] || '').slice(-1);
            if (/[\w.<:-]/.test(last)) cm.showHint({ hint: CodeMirror.hint.auto, completeSingle: false });
        });

        const sym = this.q('.ide-symbols');
        sym.innerHTML = this.SYMBOLS.map((s) => `<button type="button" data-sym="${Utils.escapeHtml(s)}">${s === 'Tab' ? '⇥' : Utils.escapeHtml(s)}</button>`).join('');
        sym.addEventListener('pointerdown', (e) => {
            const b = e.target.closest('[data-sym]');
            if (!b) return;
            e.preventDefault();
            const v = b.dataset.sym;
            if (v === 'Tab') this.cm.execCommand(this.cm.somethingSelected() ? 'indentMore' : 'insertSoftTab');
            else this.cm.replaceSelection(v, 'end');
            this.cm.focus();
        });

        this.root.addEventListener('click', (e) => this.onClick(e));
        this.root.addEventListener('keydown', (e) => this.onKeydown(e));
        this.q('.ide-tree').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { const row = e.target.closest('.ide-row'); if (row) { e.preventDefault(); row.click(); } }
        });

        this.q('[data-s="q"]').addEventListener('input', Utils.debounce(() => this.runSearch(), 250));
        this.q('[data-s="q"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.runSearch(); });

        this.q('[data-in="files"]').addEventListener('change', (e) => this.importFileList(Array.from(e.target.files), false, e.target));
        this.q('[data-in="zip"]').addEventListener('change', (e) => this.importFileList(Array.from(e.target.files), false, e.target));
        this.q('[data-in="dir"]').addEventListener('change', (e) => this.importFileList(Array.from(e.target.files), true, e.target));

        window.addEventListener('message', (e) => this.onPreviewMessage(e));
        window.addEventListener('resize', () => { this.applyLayout(); this.fitViewport(); });
        if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.fitViewport());
        new MutationObserver(() => this.applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        window.addEventListener('beforeunload', (e) => { if (this.hasDirty()) { e.preventDefault(); e.returnValue = ''; } });

        this.root.style.setProperty('--ide-fs', `${this.prefs.fontSize}px`);
        this.updateLiveButton();
    },

    applyTheme() {
        if (!this.cm) return;
        this.cm.setOption('theme', this.isDark() ? 'material-darker' : 'eclipse');
    },

    fitViewport() {
        if (!this.root) return;
        const vv = window.visualViewport;
        if (vv && this.isMobile()) {
            this.root.style.height = `${vv.height}px`;
            this.root.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
            this.root.classList.toggle('kb-open', window.innerHeight - vv.height > 140);
        } else {
            this.root.style.height = '';
            this.root.style.transform = '';
            this.root.classList.remove('kb-open');
        }
        if (this.cm) this.cm.refresh();
    },

    applyLayout() {
        if (!this.root) return;
        const mobile = this.isMobile();
        this.root.classList.toggle('is-mobile', mobile);
        this.root.dataset.mview = this.mview;
        this.root.classList.toggle('side-closed', !this.sideOpen);
        this.root.classList.toggle('pv-closed', !this.pvOpen);
        this.qa('.ide-panel').forEach((p) => { p.hidden = p.dataset.panel !== this.sidePanel; });
        this.qa('.ide-activity [data-v]').forEach((b) => {
            const v = b.dataset.v;
            const on = mobile ? (v === this.mview) : ((v === 'preview') ? this.pvOpen : (this.sideOpen && this.sidePanel === v));
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        setTimeout(() => this.cm && this.cm.refresh(), 40);
    },

    setView(v) {
        if (this.isMobile()) {
            this.mview = v;
            if (v === 'explorer' || v === 'search') this.sidePanel = v;
            if (v === 'preview') this.runPreview();
        } else if (v === 'explorer' || v === 'search') {
            if (this.sideOpen && this.sidePanel === v) this.sideOpen = false;
            else { this.sideOpen = true; this.sidePanel = v; }
        } else if (v === 'preview') {
            this.pvOpen = !this.pvOpen;
            if (this.pvOpen) this.runPreview();
        }
        this.applyLayout();
        if (v === 'search') setTimeout(() => this.q('[data-s="q"]').focus(), 60);
        if (v === 'editor' && this.active && !this.isMobile()) this.cm.focus();
    },

    onClick(e) {
        const menuItem = e.target.closest('.ide-menu [data-mi]');
        if (menuItem) return;
        if (!e.target.closest('.ide-menu')) this.closeMenu();

        const v = e.target.closest('[data-v]');
        if (v) { this.setView(v.dataset.v); return; }

        const row = e.target.closest('.ide-row');
        if (row && !e.target.closest('[data-op]')) { this.onRowClick(row); return; }
        const op = e.target.closest('[data-op]');
        if (op) {
            const r = op.closest('.ide-row');
            e.stopPropagation();
            if (op.dataset.op === 'rename') this.renamePath(r.dataset.path, r.dataset.kind === 'dir');
            else this.deletePath(r.dataset.path, r.dataset.kind === 'dir');
            return;
        }

        const tab = e.target.closest('.ide-tab');
        if (tab) {
            if (e.target.closest('[data-tabclose]')) this.closeTab(tab.dataset.path);
            else this.openFile(tab.dataset.path);
            return;
        }

        const sres = e.target.closest('[data-sr]');
        if (sres) { this.jumpTo(sres.dataset.path, +sres.dataset.line, +sres.dataset.ch, +sres.dataset.len); return; }

        const sopt = e.target.closest('[data-s]');
        if (sopt && sopt.tagName === 'BUTTON') {
            const k = sopt.dataset.s;
            if (k === 'case' || k === 'regex') {
                const on = sopt.getAttribute('aria-pressed') !== 'true';
                sopt.setAttribute('aria-pressed', on ? 'true' : 'false');
                sopt.classList.toggle('on', on);
                this.runSearch();
            } else if (k === 'replaceAll') this.replaceAll();
            return;
        }

        const a = e.target.closest('[data-a]');
        if (a) this.onAction(a.dataset.a, a, e);

        const autofixBtn = e.target.closest('.ide-autofix-btn');
        if (autofixBtn) {
            this.handleAutoFix(autofixBtn.dataset.errId, autofixBtn);
        }
    },

    async handleAutoFix(errId, btn) {
        if (!this.active) return;
        const errorLine = this.consoleLines.find(l => l.id === errId);
        if (!errorLine) return;

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fixing...';
        btn.disabled = true;

        const code = this.textOf(this.active);
        const lang = Utils.langFromExt(Utils.extname(this.active));

        try {
            const app = window.appInstance;
            const prov = app ? app.settings.provider : 'simulated';
            const key = app ? (app.settings.providerKeys?.[prov] || '') : '';
            const mod = app ? app.settings.model : '';

            if (window.AIEngine && window.AIEngine.autoFixCode) {
                const fixedCode = await window.AIEngine.autoFixCode(code, errorLine.text, lang, prov, key, mod);
                if (fixedCode && this.cm) {
                    this.cm.setValue(fixedCode);
                    if (window.ChatRenderer) ChatRenderer.showToast('Code Auto-Fixed!');
                }
            } else {
                if (window.ChatRenderer) ChatRenderer.showToast('Auto-Fix not available (AIEngine missing)');
            }
        } catch (e) {
            if (window.ChatRenderer) ChatRenderer.showToast('Auto-Fix failed');
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Fix';
            btn.disabled = false;
        }
    },

    onKeydown(e) {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveFile(); }
        else if (mod && e.key === 'Enter') { e.preventDefault(); this.run(); }
        else if (e.key === 'Escape') this.closeMenu();
    },

    onAction(a, el, e) {
        switch (a) {
            case 'back': this.requestClose(); break;
            case 'closeWs': this.closeWorkspace(); break;
            case 'newFile': this.newFile(); break;
            case 'newFolder': this.newFolder(); break;
            case 'save': this.saveFile(); break;
            case 'run': this.run(); break;
            case 'import': this.showMenu(el, [
                { icon: 'fa-regular fa-file', label: 'Files…', fn: () => this.q('[data-in="files"]').click() },
                { icon: 'fa-regular fa-folder-open', label: 'Folder… (desktop browsers)', fn: () => this.q('[data-in="dir"]').click() },
                { icon: 'fa-solid fa-file-zipper', label: 'ZIP project…', fn: () => this.q('[data-in="zip"]').click() }
            ]); break;
            case 'export': this.showMenu(el, [
                { icon: 'fa-regular fa-file-code', label: 'Current file', fn: () => this.exportCurrent() },
                { icon: 'fa-solid fa-file-zipper', label: 'Whole project (.zip)', fn: () => this.exportZip() }
            ]); break;
            case 'more': this.showMenu(el, [
                { icon: 'fa-solid fa-floppy-disk', label: 'Save all', fn: () => this.saveAll() },
                { icon: 'fa-solid fa-magnifying-glass', label: 'Find in file', fn: () => this.findInFile('find') },
                { icon: 'fa-solid fa-arrow-right-arrow-left', label: 'Find and replace', fn: () => this.findInFile('replace') },
                { sep: true },
                { icon: 'fa-solid fa-text-width', label: 'Word wrap', checked: this.prefs.wrap, fn: () => this.setPref('wrap', !this.prefs.wrap) },
                { icon: 'fa-solid fa-wand-magic-sparkles', label: 'Auto-complete', checked: this.prefs.hint, fn: () => this.setPref('hint', !this.prefs.hint) },
                { icon: 'fa-solid fa-bolt', label: 'Live preview', checked: this.prefs.live, fn: () => this.setPref('live', !this.prefs.live) },
                { icon: 'fa-solid fa-magnifying-glass-plus', label: 'Larger text', fn: () => this.setPref('fontSize', Math.min(24, this.prefs.fontSize + 1)) },
                { icon: 'fa-solid fa-magnifying-glass-minus', label: 'Smaller text', fn: () => this.setPref('fontSize', Math.max(10, this.prefs.fontSize - 1)) },
                { sep: true },
                { icon: 'fa-solid fa-wand-magic-sparkles', label: 'Create starter project', fn: () => this.createStarter() },
                { icon: 'fa-regular fa-trash-can', label: 'Delete all workspace files', danger: true, fn: () => this.clearWorkspace() }
            ]); break;
            case 'starter': this.createStarter(); break;
            case 'collapse': this.expanded.clear(); this.renderTree(); this.schedulePersist(); break;
            case 'refresh': this.pvEntry = null; this.runPreview(); break;
            case 'toggleLive': this.setPref('live', !this.prefs.live); break;
            case 'openTab': this.openPreviewTab(); break;
            case 'hidePreview': this.pvOpen = false; this.applyLayout(); break;
            case 'toggleConsole': if (!e.target.closest('[data-a="clearConsole"]')) this.q('.ide-console').classList.toggle('collapsed'); break;
            case 'clearConsole': this.consoleLines = []; this.renderConsole(); break;
        }
    },

    setPref(key, value) {
        this.prefs[key] = value;
        if (key === 'wrap') this.cm.setOption('lineWrapping', value);
        if (key === 'fontSize') { this.root.style.setProperty('--ide-fs', `${value}px`); this.cm.refresh(); }
        if (key === 'live') this.updateLiveButton();
        this.schedulePersist(300);
    },

    updateLiveButton() {
        const b = this.q('.ide-live');
        if (!b) return;
        b.classList.toggle('on', !!this.prefs.live);
        b.setAttribute('aria-pressed', this.prefs.live ? 'true' : 'false');
    },

    findInFile(cmd) {
        if (!this.active || this.files[this.active].binary) { ChatRenderer.showToast('Open a text file first'); return; }
        if (this.isMobile() && this.mview !== 'editor') this.setView('editor');
        setTimeout(() => this.cm.execCommand(cmd), 60);
    },

    showMenu(anchor, items) {
        this.closeMenu();
        const m = document.createElement('div');
        m.className = 'ide-menu';
        m.setAttribute('role', 'menu');
        items.forEach((it, i) => {
            if (it.sep) { const s = document.createElement('div'); s.className = 'ide-menu-sep'; m.appendChild(s); return; }
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.mi = String(i);
            b.setAttribute('role', 'menuitem');
            b.className = it.danger ? 'danger' : '';
            b.innerHTML = `<i class="${it.icon}"></i><span>${Utils.escapeHtml(it.label)}</span>${it.checked !== undefined ? `<i class="fa-solid fa-check ide-check" style="opacity:${it.checked ? 1 : 0}"></i>` : ''}`;
            b.addEventListener('click', (ev) => { ev.stopPropagation(); this.closeMenu(); it.fn(); });
            m.appendChild(b);
        });
        this.root.appendChild(m);
        const r = anchor.getBoundingClientRect();
        const w = m.offsetWidth, h = m.offsetHeight;
        const rr = this.root.getBoundingClientRect();
        let left = Math.min(Math.max(6, r.right - w - rr.left), rr.width - w - 6);
        let top = r.bottom - rr.top + 4;
        if (top + h > rr.height - 6) top = Math.max(6, r.top - rr.top - h - 4);
        m.style.left = `${left}px`;
        m.style.top = `${top}px`;
        setTimeout(() => {
            this._menuAway = (ev) => { if (!ev.target.closest('.ide-menu')) this.closeMenu(); };
            document.addEventListener('pointerdown', this._menuAway, true);
        }, 0);
    },

    closeMenu() {
        this.root && this.root.querySelectorAll('.ide-menu').forEach((m) => m.remove());
        if (this._menuAway) { document.removeEventListener('pointerdown', this._menuAway, true); this._menuAway = null; }
    },

    iconFor(path) {
        const ext = Utils.extname(path);
        const map = {
            html: 'fa-brands fa-html5 c-html', htm: 'fa-brands fa-html5 c-html', css: 'fa-brands fa-css3-alt c-css', scss: 'fa-brands fa-sass c-css',
            js: 'fa-brands fa-js c-js', mjs: 'fa-brands fa-js c-js', jsx: 'fa-brands fa-react c-react', tsx: 'fa-brands fa-react c-react',
            ts: 'fa-solid fa-code c-ts', json: 'fa-solid fa-code c-json', md: 'fa-brands fa-markdown c-md', py: 'fa-brands fa-python c-py',
            java: 'fa-brands fa-java c-java', php: 'fa-brands fa-php c-php', svg: 'fa-regular fa-image c-img'
        };
        if (this.BINARY_EXT.includes(ext)) return 'fa-regular fa-image c-img';
        return map[ext] || 'fa-regular fa-file-lines c-file';
    },

    renderAll() {
        if (!this.root) return;
        this.renderTree();
        this.renderTabs();
        this.updateStatus();
    },

    renderTree() {
        const tree = this.q('.ide-tree');
        const dirs = this.allDirs();
        const paths = Object.keys(this.files);
        if (!paths.length && !dirs.size) {
            tree.innerHTML = '<div class="ide-tree-empty"><i class="fa-regular fa-folder-open"></i><p>The workspace is empty.</p><button class="sp-btn sp-btn-primary" data-a="newFile">New File</button> <button class="sp-btn" data-a="import">Import</button> <button class="sp-btn" data-a="starter">Starter project</button></div>';
            return;
        }
        const cmp = (a, b) => Utils.basename(a).toLowerCase().localeCompare(Utils.basename(b).toLowerCase());
        const dirKids = new Map(), fileKids = new Map();
        dirs.forEach((d) => { const p = Utils.dirname(d); (dirKids.get(p) || dirKids.set(p, []).get(p)).push(d); });
        paths.forEach((f) => { const p = Utils.dirname(f); (fileKids.get(p) || fileKids.set(p, []).get(p)).push(f); });
        const esc = Utils.escapeHtml;
        const walk = (dir, depth) => {
            let html = '';
            (dirKids.get(dir) || []).sort(cmp).forEach((d) => {
                const open = this.expanded.has(d);
                html += `<div class="ide-row${this.selectedDir === d ? ' sel' : ''}" role="treeitem" aria-expanded="${open}" tabindex="0" data-kind="dir" data-path="${esc(d)}" style="padding-inline-start:${8 + depth * 14}px"><i class="chev fa-solid fa-chevron-${open ? 'down' : 'right'}"></i><i class="fa-solid fa-folder${open ? '-open' : ''} c-dir"></i><span class="nm">${esc(Utils.basename(d))}</span><span class="ops"><button data-op="rename" title="Rename" aria-label="Rename ${esc(Utils.basename(d))}"><i class="fa-solid fa-pen"></i></button><button data-op="delete" title="Delete" aria-label="Delete ${esc(Utils.basename(d))}"><i class="fa-regular fa-trash-can"></i></button></span></div>`;
                if (open) html += walk(d, depth + 1);
            });
            (fileKids.get(dir) || []).sort(cmp).forEach((f) => {
                html += `<div class="ide-row${this.active === f ? ' active' : ''}" role="treeitem" tabindex="0" data-kind="file" data-path="${esc(f)}" style="padding-inline-start:${8 + depth * 14 + 14}px"><i class="${this.iconFor(f)}"></i><span class="nm">${esc(Utils.basename(f))}</span>${this.isDirty(f) ? '<span class="dirty-dot" title="Unsaved changes"></span>' : ''}<span class="ops"><button data-op="rename" title="Rename" aria-label="Rename ${esc(Utils.basename(f))}"><i class="fa-solid fa-pen"></i></button><button data-op="delete" title="Delete" aria-label="Delete ${esc(Utils.basename(f))}"><i class="fa-regular fa-trash-can"></i></button></span></div>`;
            });
            return html;
        };
        tree.innerHTML = walk('', 0);
    },

    onRowClick(row) {
        const path = row.dataset.path;
        if (row.dataset.kind === 'dir') {
            if (this.expanded.has(path)) this.expanded.delete(path); else this.expanded.add(path);
            this.selectedDir = path;
            this.renderTree();
            this.schedulePersist();
        } else {
            this.selectedDir = Utils.dirname(path);
            this.openFile(path);
        }
    },

    renderTabs() {
        const el = this.q('.ide-tabs');
        const names = {};
        this.tabs.forEach((p) => { const b = Utils.basename(p); names[b] = (names[b] || 0) + 1; });
        el.innerHTML = this.tabs.map((p) => {
            const b = Utils.basename(p);
            const hint = names[b] > 1 ? `<small>${Utils.escapeHtml(Utils.dirname(p) || '/')}</small>` : '';
            return `<div class="ide-tab${p === this.active ? ' active' : ''}" role="tab" aria-selected="${p === this.active}" data-path="${Utils.escapeHtml(p)}" title="${Utils.escapeHtml(p)}"><i class="${this.iconFor(p)}"></i><span class="nm">${Utils.escapeHtml(b)}</span>${hint}${this.isDirty(p) ? '<span class="dirty-dot" title="Unsaved changes"></span>' : ''}<button data-tabclose aria-label="Close ${Utils.escapeHtml(b)}"><i class="fa-solid fa-xmark"></i></button></div>`;
        }).join('');
        const act = el.querySelector('.ide-tab.active');
        if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },

    updateStatus() {
        if (!this.root) return;
        const lang = this.q('[data-st="lang"]'), pos = this.q('[data-st="pos"]'), dirty = this.q('[data-st="dirty"]');
        if (!this.active || !this.files[this.active]) { lang.textContent = ''; pos.textContent = ''; dirty.textContent = ''; return; }
        const f = this.files[this.active];
        lang.textContent = f.binary ? 'Image' : (Utils.langFromExt(Utils.extname(this.active)) || 'plaintext');
        if (!f.binary) {
            const c = this.cm.getCursor();
            pos.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
            dirty.textContent = this.isDirty(this.active) ? '● Unsaved' : 'Saved';
            dirty.classList.toggle('warn', this.isDirty(this.active));
        } else { pos.textContent = Utils.formatBytes((f.content || '').length * 0.75); dirty.textContent = ''; }
    },

    showActive() {
        if (!this.cm) return;
        const cmEl = this.cm.getWrapperElement();
        const empty = this.q('.ide-empty'), bin = this.q('.ide-binary');
        bin.innerHTML = '';
        bin.style.display = 'none';
        if (!this.active || !this.files[this.active]) {
            cmEl.style.display = 'none';
            empty.style.display = '';
            this.updateStatus();
            return;
        }
        empty.style.display = 'none';
        const f = this.files[this.active];
        if (f.binary) {
            cmEl.style.display = 'none';
            bin.style.display = '';
            bin.innerHTML = `<div class="ide-binary-in"><img alt="${Utils.escapeHtml(Utils.basename(this.active))}" src="${f.content}"><p>${Utils.escapeHtml(Utils.basename(this.active))} is an image and cannot be edited as text. It can be used from your HTML or CSS files.</p></div>`;
            this.updateStatus();
            return;
        }
        const entry = this.getDocEntry(this.active);
        this.cm.swapDoc(entry.doc);
        cmEl.style.display = '';
        const n = ['py', 'java', 'c', 'cpp', 'cs', 'h', 'hpp'].includes(Utils.extname(this.active)) ? 4 : 2;
        this.cm.setOption('indentUnit', n);
        this.cm.setOption('tabSize', n);
        this.cm.refresh();
        if (!this.isMobile()) this.cm.focus();
        this.updateStatus();
    },

    openFile(path) {
        if (!this.files[path]) return;
        if (!this.tabs.includes(path)) this.tabs.push(path);
        this.active = path;
        this.selectedDir = Utils.dirname(path);
        let d = Utils.dirname(path);
        while (d) { this.expanded.add(d); d = Utils.dirname(d); }
        if (this.isMobile()) this.mview = 'editor';
        this.renderAll();
        this.showActive();
        this.applyLayout();
        this.schedulePersist(500);
        if (this.prefs.live && this.previewVisible()) this.runPreview();
    },

    async closeTab(path, force = false) {
        if (!force && this.files[path] && this.isDirty(path)) {
            const c = await UI.choose({ title: 'Unsaved changes', message: `Save changes to ${Utils.basename(path)} before closing?`, buttons: [{ label: 'Cancel', value: 'cancel' }, { label: "Don't save", value: 'discard', danger: true }, { label: 'Save', value: 'save', primary: true }] });
            if (!c || c === 'cancel') return;
            if (c === 'save') this.saveFile(path);
            else { delete this.docs[path]; }
        }
        const i = this.tabs.indexOf(path);
        if (i === -1) return;
        this.tabs.splice(i, 1);
        if (this.active === path) this.active = this.tabs[Math.min(i, this.tabs.length - 1)] || null;
        this.renderAll();
        this.showActive();
        this.schedulePersist(500);
    },

    onEditorChange() {
        const path = this.active;
        if (!path) return;
        const dirty = this.isDirty(path);
        if (this._lastDirty !== dirty || this._lastDirtyPath !== path) {
            this._lastDirty = dirty; this._lastDirtyPath = path;
            this.renderTabs();
            this.renderTree();
            this.updateStatus();
        }
        this.schedulePersist(1500);
        if (this.prefs.live && this.previewVisible()) {
            clearTimeout(this.liveTimer);
            this.liveTimer = setTimeout(() => this.runPreview(), 700);
        }
    },

    saveFile(path = this.active) {
        if (!path || !this.files[path] || this.files[path].binary) return false;
        const e = this.docs[path];
        if (!e) return false;
        const value = e.doc.getValue();
        this.files[path].content = value;
        e.gen = e.doc.changeGeneration(true);
        if (Utils.extname(path) === 'json') {
            try { JSON.parse(value); } catch (err) { ChatRenderer.showToast(`Saved, but this is not valid JSON: ${err.message.slice(0, 80)}`); this.afterSave(); return true; }
        }
        this.afterSave();
        ChatRenderer.showToast(`Saved ${Utils.basename(path)}`);
        return true;
    },

    afterSave() {
        this._lastDirty = null;
        this.renderTabs();
        this.renderTree();
        this.updateStatus();
        this.persist();
    },

    saveAll() {
        let n = 0;
        Object.keys(this.docs).forEach((p) => { if (this.files[p] && this.isDirty(p)) { const e = this.docs[p]; this.files[p].content = e.doc.getValue(); e.gen = e.doc.changeGeneration(true); n++; } });
        this.afterSave();
        ChatRenderer.showToast(n ? `Saved ${n} file${n === 1 ? '' : 's'}` : 'Nothing to save');
    },

    async newFile() {
        const prefix = this.selectedDir ? this.selectedDir + '/' : '';
        const name = await UI.prompt('New file', {
            value: prefix, placeholder: 'index.html or src/app.js', confirmText: 'Create',
            hint: 'Use / to create files inside folders.',
            validate: (v) => { const p = this.normalizePath(v); if (!p) return 'Enter a valid file name'; return this.pathConflict(p); }
        });
        if (name === null) return;
        const p = this.normalizePath(name);
        this.files[p] = { content: '' };
        this.makeDoc(p, '');
        this.openFile(p);
        this.persist();
    },

    async newFolder() {
        const prefix = this.selectedDir ? this.selectedDir + '/' : '';
        const name = await UI.prompt('New folder', {
            value: prefix, placeholder: 'src/components', confirmText: 'Create',
            validate: (v) => { const p = this.normalizePath(v); if (!p) return 'Enter a valid folder name'; return this.pathConflict(p); }
        });
        if (name === null) return;
        const p = this.normalizePath(name);
        this.folders.add(p);
        let d = p;
        while (d) { this.expanded.add(d); d = Utils.dirname(d); }
        this.selectedDir = p;
        this.renderTree();
        this.persist();
    },

    async renamePath(path, isDir) {
        const next = await UI.prompt(isDir ? 'Rename folder' : 'Rename file', {
            value: path, confirmText: 'Rename', hint: 'Change the path to move it into another folder.',
            validate: (v) => {
                const p = this.normalizePath(v);
                if (!p) return 'Enter a valid name';
                if (p === path) return '';
                if (isDir && (p === path || p.startsWith(path + '/'))) return 'A folder cannot be moved into itself';
                return this.pathConflict(p);
            }
        });
        if (next === null) return;
        const np = this.normalizePath(next);
        if (!np || np === path) return;
        if (isDir) {
            Object.keys(this.files).filter((p) => p.startsWith(path + '/')).forEach((p) => this.moveFile(p, np + p.slice(path.length)));
            const moved = new Set();
            this.folders.forEach((f) => { moved.add(f === path || f.startsWith(path + '/') ? np + f.slice(path.length) : f); });
            moved.add(np);
            this.folders = moved;
            const ex = new Set();
            this.expanded.forEach((f) => ex.add(f === path || f.startsWith(path + '/') ? np + f.slice(path.length) : f));
            ex.add(np);
            this.expanded = ex;
            if (this.selectedDir === path || this.selectedDir.startsWith(path + '/')) this.selectedDir = np + this.selectedDir.slice(path.length);
        } else this.moveFile(path, np);
        this.renderAll();
        this.showActive();
        this.persist();
    },

    moveFile(oldPath, newPath) {
        this.files[newPath] = this.files[oldPath];
        delete this.files[oldPath];
        const e = this.docs[oldPath];
        if (e) {
            const val = e.doc.getValue();
            const wasDirty = !e.doc.isClean(e.gen);
            delete this.docs[oldPath];
            if (!this.files[newPath].binary) this.makeDoc(newPath, this.files[newPath].content, wasDirty ? val : undefined);
        }
        this.tabs = this.tabs.map((t) => (t === oldPath ? newPath : t));
        if (this.active === oldPath) this.active = newPath;
        let d = Utils.dirname(newPath);
        while (d) { this.expanded.add(d); d = Utils.dirname(d); }
    },

    async deletePath(path, isDir) {
        const affected = isDir ? Object.keys(this.files).filter((p) => p.startsWith(path + '/')) : [path];
        const dirtyCount = affected.filter((p) => this.isDirty(p)).length;
        const msg = isDir
            ? `Delete folder "${path}" and its ${affected.length} file${affected.length === 1 ? '' : 's'}?${dirtyCount ? ` ${dirtyCount} of them have unsaved changes.` : ''} This cannot be undone.`
            : `Delete "${path}"?${dirtyCount ? ' It has unsaved changes.' : ''} This cannot be undone.`;
        const ok = await UI.confirm(msg, { title: 'Delete', confirmText: 'Delete', danger: true });
        if (!ok) return;
        affected.forEach((p) => {
            delete this.files[p];
            delete this.docs[p];
            const i = this.tabs.indexOf(p);
            if (i !== -1) this.tabs.splice(i, 1);
        });
        if (isDir) {
            this.folders = new Set(Array.from(this.folders).filter((f) => f !== path && !f.startsWith(path + '/')));
            if (this.selectedDir === path || this.selectedDir.startsWith(path + '/')) this.selectedDir = '';
        }
        if (!this.files[this.active]) this.active = this.tabs[this.tabs.length - 1] || null;
        this.renderAll();
        this.showActive();
        this.persist();
        ChatRenderer.showToast('Deleted');
    },

    async createStarter() {
        let prefix = '';
        if (['index.html', 'style.css', 'script.js'].some((p) => this.pathConflict(p))) {
            let n = 1;
            while (this.pathConflict(`starter-${n}/index.html`) || this.folderExists(`starter-${n}`)) n++;
            prefix = `starter-${n}/`;
        }
        const files = {
            'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My Project</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="card">\n    <h1>Hello, world</h1>\n    <p id="out">Click the button.</p>\n    <button id="btn">Click me</button>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n',
            'style.css': 'body {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  font-family: system-ui, sans-serif;\n  background: #0f172a;\n  color: #e2e8f0;\n}\n\n.card {\n  padding: 2rem;\n  border-radius: 16px;\n  background: #1e293b;\n  text-align: center;\n}\n\nbutton {\n  padding: 0.6rem 1.2rem;\n  border: 0;\n  border-radius: 8px;\n  background: #10a37f;\n  color: #fff;\n  font-size: 1rem;\n  cursor: pointer;\n}\n',
            'script.js': "let count = 0;\nconst out = document.getElementById('out');\n\ndocument.getElementById('btn').addEventListener('click', () => {\n  count++;\n  out.textContent = `Clicked ${count} time${count === 1 ? '' : 's'}`;\n  console.log('count =', count);\n});\n"
        };
        Object.keys(files).forEach((n) => {
            const p = prefix + n;
            this.files[p] = { content: files[n] };
        });
        if (prefix) { this.expanded.add(prefix.slice(0, -1)); }
        this.openFile(prefix + 'index.html');
        this.persist();
        this.run();
    },

    async clearWorkspace() {
        const n = Object.keys(this.files).length;
        const ok = await UI.confirm(`Delete all ${n} file${n === 1 ? '' : 's'} in the workspace, including unsaved changes? This cannot be undone.`, { title: 'Delete workspace files', confirmText: 'Delete everything', danger: true });
        if (!ok) return;
        this.files = {}; this.folders = new Set(); this.docs = {}; this.tabs = []; this.active = null; this.expanded = new Set(); this.selectedDir = '';
        this.renderAll();
        this.showActive();
        this.runPreview();
        await this.persist();
    },

    async saveBeforeLeaving() {
        if (!this.hasDirty()) return true;
        const c = await UI.choose({
            title: 'Unsaved changes', message: 'Some files have unsaved changes. Drafts are kept on this device, but they are not saved to the files yet.',
            buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Leave, keep drafts', value: 'keep' }, { label: 'Save all & leave', value: 'save', primary: true }]
        });
        if (!c || c === 'cancel') return false;
        if (c === 'save') this.saveAll();
        return true;
    },

    async requestClose({ fromPop = false } = {}) {
        if (!this.opened) return true;
        const ok = await this.saveBeforeLeaving();
        if (!ok) {
            if (fromPop) { history.pushState({ view: 'ide' }, ''); this.histPushed = true; }
            return false;
        }
        await this.persist();
        this.opened = false;
        const host = document.getElementById('idePage');
        host.classList.add('hidden');
        document.body.classList.remove('ide-open');
        const frame = this.q('.ide-frame');
        if (frame) frame.srcdoc = '';
        if (!fromPop && this.histPushed) { this.histPushed = false; history.back(); } else this.histPushed = false;
        return true;
    },

    async closeWorkspace() {
        if (this.hasDirty()) {
            const ok = await this.saveBeforeLeaving();
            if (!ok) return;
        }
        this.tabs = [];
        this.active = null;
        this.renderAll();
        this.showActive();
        await this.requestClose();
    },

    isOpen() { return this.opened; }
});

Object.assign(IDE, {
    IGNORE_RE: /(^|\/)(__MACOSX|\.git|node_modules)(\/|$)|(^|\/)(\.DS_Store|Thumbs\.db)$/,

    bytesToDataUrl(bytes, mime) {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return `data:${mime || 'application/octet-stream'};base64,${btoa(bin)}`;
    },

    dataUrlToBytes(url) {
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    },

    async importFileList(list, fromDir, input) {
        if (input) input.value = '';
        if (!list.length) return;
        const entries = [], skipped = [], dirs = [];
        let total = 0;
        ChatRenderer.showToast('Importing…');
        for (const f of list) {
            const rel = f.webkitRelativePath || f.name;
            try {
                if (/\.zip$/i.test(f.name) && !f.webkitRelativePath) {
                    const z = await Zip.read(await f.arrayBuffer());
                    z.forEach((en) => {
                        if (en.dir) dirs.push(en.path);
                        else if (en.error) skipped.push({ path: en.path, reason: en.error });
                        else entries.push({ path: en.path, bytes: en.data });
                    });
                    continue;
                }
                if (f.size > this.MAX_FILE) { skipped.push({ path: rel, reason: 'larger than 5 MB' }); continue; }
                total += f.size;
                if (total > this.MAX_IMPORT_TOTAL) { skipped.push({ path: rel, reason: 'import size limit reached' }); continue; }
                entries.push({ path: rel, bytes: new Uint8Array(await f.arrayBuffer()) });
            } catch (e) {
                skipped.push({ path: rel, reason: e.message || 'could not be read' });
            }
        }
        await this.importEntries(entries, skipped, dirs);
    },

    async importEntries(entries, skipped, dirs = []) {
        const prepared = [];
        let ignored = 0;
        for (const en of entries) {
            if (this.IGNORE_RE.test(en.path)) { ignored++; continue; }
            const p = this.normalizePath(en.path);
            if (!p) { skipped.push({ path: en.path, reason: 'invalid file name' }); continue; }
            if (en.bytes.length > this.MAX_FILE) { skipped.push({ path: p, reason: 'larger than 5 MB' }); continue; }
            const ext = Utils.extname(p);
            if (this.BINARY_EXT.includes(ext)) {
                prepared.push({ path: p, file: { content: this.bytesToDataUrl(en.bytes, this.MIME[ext]), binary: true } });
                continue;
            }
            let text;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(en.bytes); }
            catch (e) { skipped.push({ path: p, reason: 'not a UTF-8 text file' }); continue; }
            if (text.indexOf('\u0000') !== -1) { skipped.push({ path: p, reason: 'binary content' }); continue; }
            prepared.push({ path: p, file: { content: text } });
        }

        const usable = [];
        prepared.forEach((x) => {
            const c = this.pathConflict(x.path);
            if (c && !this.fileExists(x.path)) skipped.push({ path: x.path, reason: c.toLowerCase() });
            else usable.push(x);
        });

        const conflicts = usable.filter((x) => this.fileExists(x.path));
        let mode = 'replace';
        if (conflicts.length) {
            const names = conflicts.slice(0, 6).map((c) => c.path).join(', ') + (conflicts.length > 6 ? `, and ${conflicts.length - 6} more` : '');
            mode = await UI.choose({
                title: `${conflicts.length} file${conflicts.length === 1 ? '' : 's'} already exist`, message: names,
                buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Skip existing', value: 'skip' }, { label: 'Keep both', value: 'both' }, { label: 'Replace', value: 'replace', danger: true }]
            });
            if (!mode || mode === 'cancel') { ChatRenderer.showToast('Import cancelled'); return; }
        }

        let added = 0, replaced = 0, kept = 0, skippedExisting = 0;
        let firstHtml = null, first = null;
        usable.forEach((x) => {
            let path = x.path;
            if (this.fileExists(path)) {
                if (mode === 'skip') { skippedExisting++; return; }
                if (mode === 'both') { path = this.uniquePath(path); kept++; }
                else { replaced++; delete this.docs[path]; }
            }
            this.files[path] = x.file;
            if (!x.file.binary) { if (this.active === path) this._reshow = true; }
            added++;
            first = first || path;
            if (!firstHtml && /\.html?$/i.test(path)) firstHtml = path;
            let d = Utils.dirname(path);
            while (d) { this.expanded.add(d); d = Utils.dirname(d); }
        });
        dirs.forEach((d) => { const p = this.normalizePath(d); if (p && !this.fileExists(p)) { this.folders.add(p); this.expanded.add(p); } });

        const target = firstHtml || first;
        if (target && !this.active) this.openFile(target);
        else if (target && this.tabs.length === 0) this.openFile(target);
        this.renderAll();
        if (this._reshow) { this._reshow = false; this.showActive(); }
        this.persist();

        const parts = [`${added} file${added === 1 ? '' : 's'} imported`];
        if (replaced) parts.push(`${replaced} replaced`);
        if (kept) parts.push(`${kept} renamed`);
        if (skippedExisting) parts.push(`${skippedExisting} skipped`);
        ChatRenderer.showToast(added ? parts.join(', ') : 'Nothing was imported');

        if (skipped.length || ignored) {
            const rows = skipped.slice(0, 12).map((s) => `<li><code>${Utils.escapeHtml(s.path)}</code> <span class="ui-hint">${Utils.escapeHtml(s.reason)}</span></li>`).join('');
            UI.dialog({
                title: 'Some files were not imported',
                html: `<ul class="ide-skip-list">${rows}</ul>${skipped.length > 12 ? `<p class="ui-hint">…and ${skipped.length - 12} more</p>` : ''}${ignored ? `<p class="ui-hint">${ignored} system or dependency file${ignored === 1 ? '' : 's'} (.git, node_modules, __MACOSX) were ignored.</p>` : ''}`,
                buttons: [{ label: 'OK', value: true, primary: true }]
            });
        }
    },

    async exportCurrent() {
        const path = this.active;
        if (!path || !this.files[path]) { ChatRenderer.showToast('Open a file to export'); return; }
        const f = this.files[path];
        const ext = Utils.extname(path);
        const blob = f.binary
            ? new Blob([this.dataUrlToBytes(f.content)], { type: this.MIME[ext] || 'application/octet-stream' })
            : new Blob([this.textOf(path)], { type: (this.MIME[ext] || 'text/plain') + ';charset=utf-8' });
        await UI.deliverFile(blob, Utils.basename(path), { title: 'File ready', details: this.isDirty(path) ? 'includes unsaved edits' : '' });
    },

    async exportZip() {
        const paths = Object.keys(this.files);
        if (!paths.length) { ChatRenderer.showToast('The workspace is empty'); return; }
        ChatRenderer.showToast(`Building ZIP of ${paths.length} file${paths.length === 1 ? '' : 's'}…`);
        try {
            const enc = new TextEncoder();
            const entries = paths.sort().map((p) => {
                const f = this.files[p];
                return { path: p, data: f.binary ? this.dataUrlToBytes(f.content) : enc.encode(this.textOf(p)) };
            });
            const used = new Set();
            paths.forEach((p) => { let d = Utils.dirname(p); while (d) { used.add(d); d = Utils.dirname(d); } });
            Array.from(this.folders).filter((f) => !used.has(f)).forEach((f) => entries.push({ path: f, dir: true }));
            const blob = await Zip.create(entries);
            const dirty = paths.filter((p) => this.isDirty(p)).length;
            await UI.deliverFile(blob, `workspace-${Utils.dateStamp()}.zip`, { title: 'Project ZIP ready', details: `${paths.length} file${paths.length === 1 ? '' : 's'}${dirty ? ', includes unsaved edits' : ''}` });
        } catch (e) {
            console.error(e);
            ChatRenderer.showToast('ZIP export failed: ' + e.message);
        }
    },

    searchRegex() {
        const q = this.q('[data-s="q"]').value;
        if (!q) return null;
        const cs = this.q('[data-s="case"]').getAttribute('aria-pressed') === 'true';
        const rx = this.q('[data-s="regex"]').getAttribute('aria-pressed') === 'true';
        try { return new RegExp(rx ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); }
        catch (e) { return { error: e.message }; }
    },

    runSearch() {
        const box = this.q('.ide-results');
        const re = this.searchRegex();
        if (!re) { box.innerHTML = ''; return; }
        if (re.error) { box.innerHTML = `<div class="ide-sr-note error">Invalid expression: ${Utils.escapeHtml(re.error)}</div>`; return; }
        let total = 0, fileCount = 0, html = '';
        const esc = Utils.escapeHtml;
        outer: for (const path of Object.keys(this.files).sort()) {
            if (this.files[path].binary) continue;
            const lines = this.textOf(path).split('\n');
            let rows = '';
            for (let i = 0; i < lines.length; i++) {
                re.lastIndex = 0;
                let m, guard = 0;
                while ((m = re.exec(lines[i])) && guard++ < 10) {
                    const ln = lines[i];
                    const from = Math.max(0, m.index - 28);
                    const before = esc(ln.slice(from, m.index));
                    const hit = esc(m[0]);
                    const after = esc(ln.slice(m.index + m[0].length, m.index + m[0].length + 80));
                    rows += `<div class="ide-sr-line" data-sr data-path="${esc(path)}" data-line="${i}" data-ch="${m.index}" data-len="${m[0].length}" tabindex="0"><span class="ln">${i + 1}</span><span class="tx">${from > 0 ? '…' : ''}${before}<mark>${hit}</mark>${after}</span></div>`;
                    total++;
                    if (m[0].length === 0) re.lastIndex++;
                    if (total >= 500) break;
                }
                if (total >= 500) break;
            }
            if (rows) { fileCount++; html += `<div class="ide-sr-file"><i class="${this.iconFor(path)}"></i>${esc(path)}</div>${rows}`; }
            if (total >= 500) { html += '<div class="ide-sr-note">Showing the first 500 matches.</div>'; break outer; }
        }
        box.innerHTML = total ? `<div class="ide-sr-note">${total} result${total === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'}</div>${html}` : '<div class="ide-sr-note">No results.</div>';
    },

    jumpTo(path, line, ch, len) {
        this.openFile(path);
        if (this.files[path] && !this.files[path].binary) {
            this.cm.setSelection({ line, ch }, { line, ch: ch + len });
            this.cm.scrollIntoView({ line, ch }, 120);
            if (!this.isMobile()) this.cm.focus();
        }
    },

    async replaceAll() {
        const re = this.searchRegex();
        if (!re || re.error) { ChatRenderer.showToast(re && re.error ? 'Invalid expression' : 'Enter text to search for'); return; }
        const rep = this.q('[data-s="r"]').value;
        const useRegex = this.q('[data-s="regex"]').getAttribute('aria-pressed') === 'true';
        const hits = [];
        let total = 0;
        Object.keys(this.files).forEach((p) => {
            if (this.files[p].binary) return;
            const text = this.textOf(p);
            re.lastIndex = 0;
            const n = (text.match(re) || []).length;
            if (n) { hits.push(p); total += n; }
        });
        if (!total) { ChatRenderer.showToast('No matches to replace'); return; }
        const ok = await UI.confirm(`Replace ${total} match${total === 1 ? '' : 'es'} in ${hits.length} file${hits.length === 1 ? '' : 's'}? Changes stay unsaved until you save, and can be undone in each editor.`, { title: 'Replace all', confirmText: 'Replace', danger: true });
        if (!ok) return;
        hits.forEach((p) => {
            const entry = this.getDocEntry(p);
            const doc = entry.doc;
            re.lastIndex = 0;
            const next = useRegex ? doc.getValue().replace(re, rep) : doc.getValue().replace(re, () => rep);
            const last = doc.lastLine();
            doc.replaceRange(next, { line: 0, ch: 0 }, { line: last, ch: doc.getLine(last).length });
        });
        this._lastDirty = null;
        this.renderAll();
        this.runSearch();
        ChatRenderer.showToast(`Replaced ${total} match${total === 1 ? '' : 'es'}`);
    },

    previewVisible() { return this.isMobile() ? this.mview === 'preview' : this.pvOpen; },

    run() {
        this.pvEntry = null;
        if (this.isMobile()) this.mview = 'preview'; else this.pvOpen = true;
        this.applyLayout();
        this.runPreview();
    },

    showPreviewMessage(html) {
        const msg = this.q('.ide-pv-msg');
        msg.innerHTML = html;
        msg.style.display = html ? 'flex' : 'none';
        this.q('.ide-frame').style.visibility = html ? 'hidden' : 'visible';
    },

    runPreview() {
        if (!this.root) return;
        const frame = this.q('.ide-frame');
        const files = this.snapshotFiles();
        const active = this.active;
        const activeExt = active ? Utils.extname(active) : '';
        this.consoleLines = [];
        this.renderConsole();
        this.q('.ide-console').classList.add('collapsed');
        const label = this.q('.ide-pv-entry');

        if (!Object.keys(files).length) {
            frame.srcdoc = '';
            label.textContent = '';
            this._lastPreviewHtml = '';
            this.showPreviewMessage('<i class="fa-regular fa-eye-slash"></i><p>Nothing to preview yet. Create an HTML file or use <strong>Starter project</strong>.</p>');
            return;
        }

        const standalone = ['md', 'markdown', 'svg', 'jsx', 'tsx'].includes(activeExt);
        let html = null;
        let shown = '';
        this.currentEntry = null;

        if (!standalone) {
            const entry = this.pvEntry && files[this.pvEntry] ? this.pvEntry : PreviewBuilder.pickEntry(files, active);
            if (entry) {
                const built = PreviewBuilder.fromProject(files, entry);
                if (built.html) {
                    html = built.html;
                    shown = entry;
                    this.currentEntry = entry;
                    (built.warnings || []).forEach((w) => this.consoleAdd('warn', w));
                }
            }
        }
        if (!html && active && files[active] && !files[active].binary) {
            const lang = activeExt === 'htm' ? 'html' : activeExt;
            html = PreviewBuilder.fromSingle(files[active].content, lang);
            shown = active;
        }

        label.textContent = shown;
        if (!html) {
            frame.srcdoc = '';
            this._lastPreviewHtml = '';
            const what = active ? `.${activeExt || 'this'} files` : 'this file';
            this.showPreviewMessage(`<i class="fa-solid fa-circle-info"></i><p><strong>Preview is not available for ${Utils.escapeHtml(what)}.</strong></p><p>Live preview runs HTML, CSS, JavaScript, JSX, Markdown and SVG in the browser. Languages that need a compiler or server runtime (Python, Java, C/C++, TypeScript, PHP…) cannot run here, but you can still edit, search and export them.</p>`);
            return;
        }
        this.showPreviewMessage('');
        this._lastPreviewHtml = html;
        frame.srcdoc = html;
    },

    openPreviewTab() {
        if (!this._lastPreviewHtml) { ChatRenderer.showToast('Nothing to open. Run the preview first'); return; }
        if (!PreviewBuilder.openInTab(this._lastPreviewHtml)) ChatRenderer.showToast('Popup blocked. Allow popups for this site');
    },

    onPreviewMessage(e) {
        const frame = this.root && this.q('.ide-frame');
        if (!frame || e.source !== frame.contentWindow || !e.data || !e.data.__preview) return;
        const d = e.data.data || {};
        if (e.data.type === 'console') this.consoleAdd(d.level, d.text);
        else if (e.data.type === 'nav') {
            const dir = Utils.dirname(this.currentEntry || '');
            const target = PreviewBuilder._resolve(dir, d.href);
            if (target && this.files[target] && /\.html?$/i.test(target)) { this.pvEntry = target; this.runPreview(); }
            else this.consoleAdd('warn', `Page not found in project: ${d.href}`);
        }
    },

    consoleAdd(level, text) {
        this.consoleLines.push({ 
            level: level === 'debug' ? 'log' : level, 
            text: String(text).slice(0, 2000),
            id: Utils.uid('err')
        });
        if (this.consoleLines.length > 300) this.consoleLines.shift();
        this.renderConsole();
        if (level === 'error') this.q('.ide-console').classList.remove('collapsed');
    },

    renderConsole() {
        if (!this.root) return;
        const body = this.q('.ide-console-body');
        body.innerHTML = this.consoleLines.map((l) => `
            <div class="ide-cl ${l.level}">
                <i class="fa-solid ${l.level === 'error' ? 'fa-circle-xmark' : l.level === 'warn' ? 'fa-triangle-exclamation' : 'fa-angle-right'}"></i>
                <span>${Utils.escapeHtml(l.text)}</span>
                ${l.level === 'error' ? `<button class="ide-autofix-btn sp-btn sp-btn-sm" style="margin-left: auto; padding: 2px 6px; font-size: 10px;" data-err-id="${l.id}"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Fix</button>` : ''}
            </div>
        `).join('');
        body.scrollTop = body.scrollHeight;
        const errs = this.consoleLines.filter((l) => l.level === 'error').length;
        const badge = this.q('.ide-badge');
        badge.hidden = !this.consoleLines.length;
        badge.textContent = errs ? `${errs} error${errs === 1 ? '' : 's'}` : String(this.consoleLines.length);
        badge.classList.toggle('err', errs > 0);
    }
});

window.IDE = IDE;