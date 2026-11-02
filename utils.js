const Utils = {
    escapeHtml(str = '') {
        return String(str).replace(/[&<>"'/]/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#39;', '/': '&#47;'
        }[m]));
    },

    uid(prefix = 'id') {
        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        return `${prefix}_${uuid}`;
    },

    debounce(fn, ms = 150) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
    },

    rafThrottle(fn) {
        let pending = false; let lastArgs;
        return (...args) => {
            lastArgs = args;
            if (pending) return;
            pending = true;
            requestAnimationFrame(() => { pending = false; fn(...lastArgs); });
        };
    },

    stripMarkdown(md = '') {
        return String(md)
            .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ''))
            .replace(/`([^`]+)`/g, '$1')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/[#>*_~`]/g, '')
            .replace(/\n{2,}/g, '\n')
            .trim();
    },

    downloadJSON(obj, filename) {
        Utils.downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
    },

    downloadText(text, filename, mime = 'text/plain') {
        Utils.downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
    },

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    },

    _downloadBlob(blob, filename) { Utils.downloadBlob(blob, filename); },

    async copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, text.length);
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e) {
            return false;
        }
    },

    async sha256(str) {
        if (!crypto.subtle) return btoa(str);
        const buf = new TextEncoder().encode(str);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    encrypt(str, key = 'chatgpt-clone-local-key') {
        try {
            let out = '';
            for (let i = 0; i < str.length; i++) {
                out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return btoa(unescape(encodeURIComponent(out)));
        } catch { return str; }
    },

    decrypt(str, key = 'chatgpt-clone-local-key') {
        try {
            const raw = decodeURIComponent(escape(atob(str)));
            let out = '';
            for (let i = 0; i < raw.length; i++) {
                out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return out;
        } catch { return str; }
    },

    async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try { return await fn(); }
            catch (err) {
                const clientError = err.status >= 400 && err.status < 500 && err.status !== 429;
                if (err.name === 'AbortError' || clientError || i === maxRetries - 1) throw err;
                const delay = baseDelay * Math.pow(2, i);
                console.warn(`Retry ${i + 1}/${maxRetries} in ${delay}ms:`, err.message);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    },

    sentiment(text = '') {
        const positive = ['good','great','excellent','amazing','love','happy','nice','perfect','awesome','best','thanks','thank','helpful','wonderful'];
        const negative = ['bad','terrible','awful','hate','sad','angry','worst','broken','wrong','fail','error','problem','issue','bug'];
        const lower = text.toLowerCase();
        let pos = 0, neg = 0;
        positive.forEach(w => { if (lower.includes(w)) pos++; });
        negative.forEach(w => { if (lower.includes(w)) neg++; });
        if (pos > neg) return { label: 'positive', emoji: '😊', color: 'emerald' };
        if (neg > pos) return { label: 'negative', emoji: '😟', color: 'rose' };
        return { label: 'neutral', emoji: '😐', color: 'slate' };
    },

    formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    },

    formatTime(iso) {
        try { return new Date(iso).toLocaleString(); }
        catch { return ''; }
    },

    dateStamp(d = new Date()) {
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    extname(path = '') {
        const base = String(path).split('/').pop();
        const i = base.lastIndexOf('.');
        return i > 0 ? base.slice(i + 1).toLowerCase() : '';
    },

    basename(path = '') { return String(path).split('/').pop(); },

    dirname(path = '') {
        const i = String(path).lastIndexOf('/');
        return i === -1 ? '' : path.slice(0, i);
    },

    EXT_BY_LANG: {
        javascript: 'js', js: 'js', node: 'js', mjs: 'js', jsx: 'jsx', react: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
        html: 'html', htm: 'html', xml: 'xml', css: 'css', scss: 'scss', less: 'less', json: 'json',
        python: 'py', py: 'py', java: 'java', c: 'c', cpp: 'cpp', 'c++': 'cpp', csharp: 'cs', 'c#': 'cs', cs: 'cs',
        php: 'php', ruby: 'rb', rb: 'rb', go: 'go', golang: 'go', rust: 'rs', rs: 'rs', swift: 'swift', kotlin: 'kt',
        sql: 'sql', bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', yaml: 'yml', yml: 'yml', markdown: 'md', md: 'md',
        text: 'txt', plaintext: 'txt', txt: 'txt', svg: 'svg', vue: 'vue', dart: 'dart', lua: 'lua', r: 'r', powershell: 'ps1'
    },

    LANG_BY_EXT: {
        js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
        html: 'html', htm: 'html', xml: 'xml', css: 'css', scss: 'scss', less: 'less', json: 'json',
        py: 'python', java: 'java', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', rb: 'ruby',
        go: 'go', rs: 'rust', swift: 'swift', kt: 'kotlin', sql: 'sql', sh: 'bash', yml: 'yaml', yaml: 'yaml',
        md: 'markdown', txt: 'plaintext', svg: 'svg', vue: 'vue', dart: 'dart', lua: 'lua', r: 'r', ps1: 'powershell'
    },

    extFromLang(lang = '') { return Utils.EXT_BY_LANG[String(lang).toLowerCase()] || 'txt'; },
    langFromExt(ext = '') { return Utils.LANG_BY_EXT[String(ext).toLowerCase()] || 'plaintext'; },

    bytesToB64Url(bytes) {
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    b64UrlToBytes(str) {
        let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    },

    async _pipe(bytes, stream) {
        const piped = new Blob([bytes]).stream().pipeThrough(stream);
        return new Uint8Array(await new Response(piped).arrayBuffer());
    },

    async deflateRaw(bytes) {
        if (typeof CompressionStream === 'undefined') return null;
        return Utils._pipe(bytes, new CompressionStream('deflate-raw'));
    },

    async inflateRaw(bytes) {
        if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress data');
        return Utils._pipe(bytes, new DecompressionStream('deflate-raw'));
    },

    sanitizeHtml(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = String(html || '');
        const bad = new Set(['SCRIPT', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'MATH', 'USE']);
        const urlAttrs = new Set(['href', 'src', 'xlink:href', 'poster', 'data', 'background']);
        const dropAttrs = new Set(['srcdoc', 'formaction', 'action', 'ping']);
        tpl.content.querySelectorAll('*').forEach((el) => {
            if (bad.has(el.tagName.toUpperCase())) { el.remove(); return; }
            Array.from(el.attributes).forEach((attr) => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on') || dropAttrs.has(name)) { el.removeAttribute(attr.name); return; }
                if (urlAttrs.has(name)) {
                    const v = attr.value.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '').toLowerCase();
                    const isSafeData = /^data:image\/(png|jpe?g|gif|webp);/.test(v);
                    if (/^(javascript|vbscript|data|file|blob):/.test(v) && !isSafeData) el.removeAttribute(attr.name);
                }
            });
            if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
        });
        return tpl.innerHTML;
    }
};

const UI = {
    _root() {
        let r = document.getElementById('uiRoot');
        if (!r) { r = document.createElement('div'); r.id = 'uiRoot'; document.body.appendChild(r); }
        return r;
    },

    dialog(opts) {
        return new Promise((resolve) => {
            const o = Object.assign({
                title: '', message: '', html: '', input: null, dismissible: true, wide: false,
                buttons: [{ label: 'OK', value: true, primary: true }]
            }, opts);
            const prevFocus = document.activeElement;
            const overlay = document.createElement('div');
            overlay.className = 'ui-overlay';
            const box = document.createElement('div');
            box.className = 'ui-dialog' + (o.wide ? ' ui-wide' : '');
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');

            if (o.title) {
                const h = document.createElement('h3');
                h.className = 'ui-title';
                h.textContent = o.title;
                box.appendChild(h);
                box.setAttribute('aria-label', o.title);
            }
            if (o.message) {
                const p = document.createElement('p');
                p.className = 'ui-message';
                p.textContent = o.message;
                box.appendChild(p);
            }
            if (o.html) {
                const d = document.createElement('div');
                d.className = 'ui-html';
                if (typeof o.html === 'string') d.innerHTML = o.html; else d.appendChild(o.html);
                box.appendChild(d);
            }

            let inputEl = null;
            let errEl = null;
            if (o.input) {
                inputEl = document.createElement('input');
                inputEl.type = 'text';
                inputEl.className = 'ui-input';
                inputEl.value = o.input.value || '';
                inputEl.placeholder = o.input.placeholder || '';
                inputEl.autocomplete = 'off';
                inputEl.spellcheck = false;
                inputEl.setAttribute('autocapitalize', 'off');
                box.appendChild(inputEl);
                if (o.input.hint) {
                    const hint = document.createElement('div');
                    hint.className = 'ui-hint';
                    hint.textContent = o.input.hint;
                    box.appendChild(hint);
                }
                errEl = document.createElement('div');
                errEl.className = 'ui-error';
                box.appendChild(errEl);
            }

            const row = document.createElement('div');
            row.className = 'ui-buttons';
            box.appendChild(row);
            overlay.appendChild(box);
            UI._root().appendChild(overlay);

            const finish = (value) => {
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) {}
                resolve({ value, input: inputEl ? inputEl.value : null });
            };

            const trigger = async (b) => {
                if (inputEl && b.primary && o.input.validate) {
                    const err = o.input.validate(inputEl.value);
                    if (err) { errEl.textContent = err; inputEl.focus(); return; }
                }
                if (b.onClick) { await b.onClick(b, overlay); if (b.keepOpen) return; }
                finish(b.value);
            };

            let primaryBtn = null;
            o.buttons.forEach((b) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ui-btn' + (b.primary ? ' ui-primary' : '') + (b.danger ? ' ui-danger' : '');
                if (b.icon) {
                    const i = document.createElement('i');
                    i.className = b.icon;
                    btn.appendChild(i);
                }
                btn.appendChild(document.createTextNode(b.label));
                btn.addEventListener('click', () => trigger(b));
                row.appendChild(btn);
                if (b.primary) primaryBtn = b;
            });

            const onKey = (e) => {
                if (e.key === 'Escape' && o.dismissible) { e.stopPropagation(); e.preventDefault(); finish(null); }
                else if (e.key === 'Enter' && inputEl && document.activeElement === inputEl && primaryBtn) { e.preventDefault(); trigger(primaryBtn); }
            };
            document.addEventListener('keydown', onKey, true);
            overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && o.dismissible) finish(null); });

            setTimeout(() => {
                if (inputEl) { inputEl.focus(); inputEl.select(); }
                else { const p = row.querySelector('.ui-primary') || row.querySelector('button'); p && p.focus(); }
            }, 30);
        });
    },

    async prompt(title, { value = '', placeholder = '', hint = '', validate = null, confirmText = 'OK' } = {}) {
        const r = await UI.dialog({
            title, input: { value, placeholder, hint, validate },
            buttons: [{ label: 'Cancel', value: null }, { label: confirmText, value: 'ok', primary: true }]
        });
        return r.value === 'ok' ? r.input : null;
    },

    async confirm(message, { title = 'Confirm', confirmText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
        const r = await UI.dialog({
            title, message,
            buttons: [{ label: cancelText, value: false }, { label: confirmText, value: true, primary: !danger, danger }]
        });
        return r.value === true;
    },

    async choose({ title, message, buttons }) {
        const r = await UI.dialog({ title, message, buttons });
        return r.value;
    },

    async deliverFile(blob, filename, { title = 'File ready', details = '' } = {}) {
        Utils.downloadBlob(blob, filename);
        const file = (typeof File !== 'undefined') ? new File([blob], filename, { type: blob.type }) : null;
        const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
        const buttons = [];
        buttons.push({
            label: 'Download again', icon: 'fa-solid fa-download', keepOpen: true,
            onClick: () => Utils.downloadBlob(blob, filename)
        });
        if (canShare) {
            buttons.push({
                label: 'Share / Save to device', icon: 'fa-solid fa-share-nodes', keepOpen: true,
                onClick: async () => { try { await navigator.share({ files: [file], title: filename }); } catch (e) {} }
            });
        }
        if (/pdf|text|json|html/.test(blob.type)) {
            buttons.push({
                label: 'Open', icon: 'fa-solid fa-arrow-up-right-from-square', keepOpen: true,
                onClick: () => {
                    const url = URL.createObjectURL(blob);
                    const w = window.open(url, '_blank', 'noopener');
                    if (!w && window.ChatRenderer) ChatRenderer.showToast('Popup blocked');
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                }
            });
        }
        buttons.push({ label: 'Close', value: 'close', primary: true });
        const info = `<div class="ui-file"><i class="fa-solid fa-file-circle-check"></i><div><div class="ui-file-name">${Utils.escapeHtml(filename)}</div><div class="ui-file-meta">${Utils.formatBytes(blob.size)}${details ? ' · ' + Utils.escapeHtml(details) : ''}</div></div></div><p class="ui-hint">Your browser should have started the download. If nothing happened, use the buttons below.</p>`;
        return UI.dialog({ title, html: info, buttons });
    }
};

const Zip = {
    _table: null,

    crc32(bytes) {
        if (!Zip._table) {
            Zip._table = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                Zip._table[n] = c >>> 0;
            }
        }
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) crc = Zip._table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    _dos(date) {
        const d = date || new Date();
        const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const day = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        return { time, day };
    },

    async create(entries, { onProgress } = {}) {
        const enc = new TextEncoder();
        const parts = [];
        const central = [];
        let offset = 0;
        const { time, day } = Zip._dos(new Date());
        let i = 0;
        for (const entry of entries) {
            const isDir = !!entry.dir;
            const name = enc.encode(isDir ? entry.path.replace(/\/?$/, '/') : entry.path);
            const data = isDir ? new Uint8Array(0) : entry.data;
            const crc = Zip.crc32(data);
            const local = new Uint8Array(30 + name.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);
            lv.setUint16(6, 0x0800, true);
            lv.setUint16(8, 0, true);
            lv.setUint16(10, time, true);
            lv.setUint16(12, day, true);
            lv.setUint32(14, crc, true);
            lv.setUint32(18, data.length, true);
            lv.setUint32(22, data.length, true);
            lv.setUint16(26, name.length, true);
            lv.setUint16(28, 0, true);
            local.set(name, 30);
            parts.push(local, data);

            const cd = new Uint8Array(46 + name.length);
            const cv = new DataView(cd.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(8, 0x0800, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, time, true);
            cv.setUint16(14, day, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, data.length, true);
            cv.setUint32(24, data.length, true);
            cv.setUint16(28, name.length, true);
            cv.setUint32(38, isDir ? 0x10 : 0, true);
            cv.setUint32(42, offset, true);
            cd.set(name, 46);
            central.push(cd);
            offset += local.length + data.length;
            i++;
            if (onProgress && i % 20 === 0) { onProgress(i, entries.length); await new Promise(r => setTimeout(r, 0)); }
        }
        const cdSize = central.reduce((s, c) => s + c.length, 0);
        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, cdSize, true);
        ev.setUint32(16, offset, true);
        if (offset + cdSize > 0xFFFFFFF0) throw new Error('Project is too large for a ZIP archive');
        return new Blob([...parts, ...central, end], { type: 'application/zip' });
    },

    async read(buffer, { maxEntries = 5000, maxFile = 10 * 1024 * 1024, maxTotal = 100 * 1024 * 1024 } = {}) {
        const bytes = new Uint8Array(buffer);
        const dv = new DataView(buffer);
        let eocd = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('Not a valid ZIP archive');
        const count = dv.getUint16(eocd + 10, true);
        let p = dv.getUint32(eocd + 16, true);
        if (count > maxEntries) throw new Error(`Archive has too many entries (${count})`);
        const dec = new TextDecoder('utf-8');
        const out = [];
        let total = 0;
        for (let n = 0; n < count; n++) {
            if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP directory is corrupted');
            const flags = dv.getUint16(p + 8, true);
            const method = dv.getUint16(p + 10, true);
            const csize = dv.getUint32(p + 20, true);
            const usize = dv.getUint32(p + 24, true);
            const nameLen = dv.getUint16(p + 28, true);
            const extraLen = dv.getUint16(p + 30, true);
            const commentLen = dv.getUint16(p + 32, true);
            const localOff = dv.getUint32(p + 42, true);
            const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
            p += 46 + nameLen + extraLen + commentLen;

            if (name.endsWith('/')) { out.push({ path: name.replace(/\/+$/, ''), dir: true }); continue; }
            const entry = { path: name, size: usize };
            if (flags & 1) { entry.error = 'encrypted'; out.push(entry); continue; }
            if (usize > maxFile) { entry.error = 'too large'; out.push(entry); continue; }
            total += usize;
            if (total > maxTotal) throw new Error('Archive is too large to import');
            if (dv.getUint32(localOff, true) !== 0x04034b50) { entry.error = 'corrupted'; out.push(entry); continue; }
            const lName = dv.getUint16(localOff + 26, true);
            const lExtra = dv.getUint16(localOff + 28, true);
            const start = localOff + 30 + lName + lExtra;
            const raw = bytes.subarray(start, start + csize);
            try {
                if (method === 0) entry.data = raw.slice();
                else if (method === 8) entry.data = await Utils.inflateRaw(raw);
                else entry.error = 'unsupported compression';
            } catch (e) {
                entry.error = e.message || 'cannot decompress';
            }
            out.push(entry);
        }
        return out;
    }
};

const PreviewBuilder = {
    STORAGE_SHIM: "(function(){function mk(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(_){}}})})();",

    BRIDGE: "(function(){var P=window.parent;function send(t,a){try{P.postMessage({__preview:true,type:t,data:a},'*')}catch(e){}}function fmt(v){if(v instanceof Error)return v.stack||v.message;if(typeof v==='object'&&v!==null){try{return JSON.stringify(v)}catch(e){return String(v)}}return String(v)}['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){send('console',{level:k,text:[].map.call(arguments,fmt).join(' ')});try{o.apply(console,arguments)}catch(e){}}});window.addEventListener('error',function(e){send('console',{level:'error',text:(e.message||'Script error')+(e.lineno?' (line '+e.lineno+')':'')})});window.addEventListener('unhandledrejection',function(e){send('console',{level:'error',text:'Unhandled promise rejection: '+fmt(e.reason)})});document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if(!h||h.charAt(0)==='#'||/^(javascript:|mailto:|tel:)/i.test(h))return;if(/^(https?:)?\\/\\//i.test(h)){a.target='_blank';a.rel='noopener';return}e.preventDefault();send('nav',{href:h})},true);send('ready',{})})();",

    bootScripts() {
        return `<script>${this.STORAGE_SHIM}${this.BRIDGE}<\/script>`;
    },

    escScript(s) { return String(s).replace(/<\/script/gi, '<\\/script'); },
    escStyle(s) { return String(s).replace(/<\/style/gi, '<\\/style'); },

    PREVIEWABLE: ['html', 'htm', 'css', 'js', 'javascript', 'mjs', 'jsx', 'tsx', 'react', 'svg', 'md', 'markdown'],

    isPreviewable(lang) { return this.PREVIEWABLE.includes(String(lang || '').toLowerCase()); },

    _injectIntoDocument(code) {
        const boot = this.bootScripts();
        if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, (m) => m + boot);
        if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, (m) => m + '<head>' + boot + '</head>');
        if (/<!doctype[^>]*>/i.test(code)) return code.replace(/<!doctype[^>]*>/i, (m) => m + '<head>' + boot + '</head>');
        return boot + code;
    },

    _prepareJsx(code) {
        let src = String(code);
        const hooks = new Set();
        src = src.replace(/^\s*import\s+([^;\n]*?)\s+from\s+['"]react['"];?[ \t]*$/gm, (m, spec) => {
            const named = spec.match(/\{([^}]*)\}/);
            if (named) named[1].split(',').map(s => s.trim()).filter(Boolean).forEach(s => hooks.add(s.replace(/\s+as\s+/, ': ')));
            return '';
        });
        src = src.replace(/^\s*import\s+[^;\n]*?\s+from\s+['"]react-dom(?:\/client)?['"];?[ \t]*$/gm, '');
        let comp = null;
        src = src.replace(/export\s+default\s+(?:async\s+)?(function|class)\s+([A-Za-z_$][\w$]*)/, (m, kind, name) => { comp = name; return `${kind} ${name}`; });
        src = src.replace(/^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?[ \t]*$/m, (m, name) => { comp = name; return ''; });
        src = src.replace(/export\s+default\s+/g, 'const __DefaultExport = ');
        src = src.replace(/^export\s+(?=const|let|var|function|class)/gm, '');
        const head = hooks.size ? `const { ${Array.from(hooks).join(', ')} } = React;\n` : '';
        const hasRender = /createRoot\s*\(|ReactDOM\.render\s*\(/.test(src);
        let tail = '';
        if (!hasRender) {
            const target = comp || (/\bfunction\s+App\b|\bconst\s+App\b|\bclass\s+App\b/.test(src) ? 'App' : (/__DefaultExport/.test(src) ? '__DefaultExport' : null));
            if (target) tail = `\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${target}));`;
        }
        return head + src + tail;
    },

    fromSingle(code, lang) {
        const lower = String(lang || '').toLowerCase();
        const boot = this.bootScripts();
        const base = 'body{font-family:system-ui,-apple-system,sans-serif;padding:20px;background:#fff;color:#111;line-height:1.5;margin:0;}';

        if (lower === 'html' || lower === 'htm') {
            if (/<html[\s>]/i.test(code) || /<!doctype/i.test(code)) return this._injectIntoDocument(code);
            return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${boot}<script src="https://cdn.tailwindcss.com"><\/script><style>${base}</style></head><body>${code}</body></html>`;
        }

        if (lower === 'css') {
            return `<!DOCTYPE html><html><head><meta charset="UTF-8">${boot}<style>
${base}
.demo-h1{font-size:2rem;margin:0 0 1rem 0;font-weight:700;}
.demo-p{margin:0 0 1rem 0;}
.demo-btn{padding:8px 16px;background:#10a37f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;}
.demo-box{padding:20px;background:#f3f4f6;border-radius:8px;margin-top:10px;}
.demo-card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);}
${this.escStyle(code)}
</style></head><body>
<h1 class="demo-h1">CSS Preview</h1>
<p class="demo-p">This is a sample paragraph to demonstrate your styles.</p>
<button class="demo-btn">Sample Button</button>
<div class="demo-box">Sample Box</div>
<div class="demo-card">Sample Card</div>
</body></html>`;
        }

        if (lower === 'js' || lower === 'javascript' || lower === 'mjs') {
            return `<!DOCTYPE html><html><head><meta charset="UTF-8">${boot}<script src="https://cdn.tailwindcss.com"><\/script>
<style>
${base}
.__console{background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;margin-top:16px;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;max-height:240px;overflow:auto;}
</style>
</head><body>
<div id="app"></div>
<pre class="__console" id="__console_out"></pre>
<script>
(function(){
    var out = document.getElementById('__console_out');
    var orig = console.log;
    console.log = function(){
        try {
            var line = Array.prototype.map.call(arguments, function(a){
                if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a); } catch(e){ return String(a); } }
                return String(a);
            }).join(' ');
            if (out) out.textContent += line + '\\n';
        } catch(e){}
        return orig.apply(console, arguments);
    };
    window.addEventListener('error', function(e){
        if (out) out.textContent += 'Error: ' + (e.message || e.error) + '\\n';
    });
})();
<\/script>
<script>${this.escScript(code)}<\/script>
</body></html>`;
        }

        if (lower === 'jsx' || lower === 'tsx' || lower === 'react') {
            return `<!DOCTYPE html><html><head><meta charset="UTF-8">${boot}<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>${base}</style>
</head><body>
<div id="root"></div>
<script type="text/babel" data-presets="react,env">
${this.escScript(this._prepareJsx(code))}
<\/script>
</body></html>`;
        }

        if (lower === 'svg') {
            return `<!DOCTYPE html><html><head><meta charset="UTF-8">${boot}<style>html,body{margin:0;height:100%;background:#fff;display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%}</style></head><body>${code}</body></html>`;
        }

        if (lower === 'md' || lower === 'markdown') {
            let body = '';
            try { body = Utils.sanitizeHtml(window.marked ? marked.parse(code) : Utils.escapeHtml(code)); }
            catch (e) { body = Utils.escapeHtml(code); }
            return `<!DOCTYPE html><html><head><meta charset="UTF-8">${boot}<style>${base}max-width:760px;margin:0 auto;pre{background:#f3f4f6;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}img{max-width:100%}</style></head><body>${body}</body></html>`;
        }

        return null;
    },

    _resolve(fromDir, ref) {
        const clean = String(ref || '').split('#')[0].split('?')[0].trim();
        if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
        const parts = clean.startsWith('/') ? [] : (fromDir ? fromDir.split('/') : []);
        clean.split('/').forEach((seg) => {
            if (!seg || seg === '.') return;
            if (seg === '..') { parts.pop(); return; }
            let s = seg;
            try { s = decodeURIComponent(seg); } catch (e) {}
            parts.push(s);
        });
        return parts.join('/');
    },

    _dataUrl(file) {
        if (!file) return null;
        if (file.binary) return file.content;
        if (/\.svg$/i.test(file.path || '')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(file.content);
        return null;
    },

    _cssUrls(css, dir, files) {
        return String(css).replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => {
            const p = this._resolve(dir, u);
            const data = p && this._dataUrl(files[p] && { ...files[p], path: p });
            return data ? `url("${data}")` : m;
        });
    },

    pickEntry(files, activePath) {
        if (activePath && /\.html?$/i.test(activePath) && files[activePath]) return activePath;
        const htmls = Object.keys(files).filter((p) => /\.html?$/i.test(p) && !files[p].binary);
        if (!htmls.length) return null;
        return htmls.find((p) => p.toLowerCase() === 'index.html')
            || htmls.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
    },

    fromProject(files, entryPath) {
        const entry = files[entryPath];
        if (!entry || entry.binary) return { error: 'Entry file not found' };
        const warnings = [];
        const doc = new DOMParser().parseFromString(entry.content, 'text/html');
        const dir = Utils.dirname(entryPath);

        doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((l) => {
            const ref = l.getAttribute('href');
            const p = this._resolve(dir, ref);
            if (p === null) return;
            const f = files[p];
            if (!f || f.binary) { warnings.push(`Stylesheet not found in project: ${ref}`); return; }
            const s = doc.createElement('style');
            s.setAttribute('data-src', p);
            s.textContent = this.escStyle(this._cssUrls(f.content, Utils.dirname(p), files));
            l.replaceWith(s);
        });

        doc.querySelectorAll('script[src]').forEach((sc) => {
            const ref = sc.getAttribute('src');
            const p = this._resolve(dir, ref);
            if (p === null) return;
            const f = files[p];
            if (!f || f.binary) { warnings.push(`Script not found in project: ${ref}`); return; }
            const n = doc.createElement('script');
            const type = sc.getAttribute('type');
            if (type) n.setAttribute('type', type);
            if (sc.hasAttribute('defer')) n.setAttribute('defer', '');
            n.setAttribute('data-src', p);
            n.textContent = this.escScript(f.content);
            sc.replaceWith(n);
        });

        doc.querySelectorAll('style').forEach((s) => { s.textContent = this._cssUrls(s.textContent, dir, files); });

        const swap = (sel, attr) => {
            doc.querySelectorAll(sel).forEach((el) => {
                const ref = el.getAttribute(attr);
                const p = this._resolve(dir, ref);
                if (p === null) return;
                const data = this._dataUrl(files[p] && { ...files[p], path: p });
                if (data) el.setAttribute(attr, data);
                else if (!files[p]) warnings.push(`File not found in project: ${ref}`);
            });
        };
        swap('img[src]', 'src');
        swap('source[src]', 'src');
        swap('video[poster]', 'poster');
        swap('link[rel~="icon"][href]', 'href');

        if (!doc.head) doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
        const boot = doc.createElement('script');
        boot.textContent = this.STORAGE_SHIM + this.BRIDGE;
        doc.head.insertBefore(boot, doc.head.firstChild);
        return { html: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML, warnings };
    },

    openInTab(html) {
        const w = window.open('', '_blank');
        if (!w) return false;
        try { w.opener = null; } catch (e) {}
        w.document.open();
        w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title><style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe></body></html>');
        w.document.close();
        w.document.querySelector('iframe').srcdoc = html;
        return true;
    }
};

window.Utils = Utils;
window.UI = UI;
window.Zip = Zip;
window.PreviewBuilder = PreviewBuilder;
