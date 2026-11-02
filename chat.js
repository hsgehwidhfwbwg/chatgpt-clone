const ChatRenderer = {
    _markedConfigured: false,
    _settingsCache: {},
    _artifactHtml: '',

    _settings() {
        return (window.appInstance && window.appInstance.settings) || this._settingsCache || {};
    },

    _configureMarked() {
        if (this._markedConfigured) return;
        marked.use({
            gfm: true, breaks: true,
            renderer: {
                code(tokenOrCode, infoStringRaw) {
                    const isObj = typeof tokenOrCode === 'object' && tokenOrCode !== null;
                    const code = isObj ? (tokenOrCode.text || '') : (tokenOrCode || '');
                    const infoString = isObj ? (tokenOrCode.lang || '') : (infoStringRaw || '');

                    const lang = (infoString || '').split(/\s+/)[0] || 'plaintext';
                    const langLabel = Utils.escapeHtml(lang);

                    const highlighted = (() => {
                        try {
                            return (lang && hljs.getLanguage(lang))
                                ? hljs.highlight(code, { language: lang }).value
                                : hljs.highlightAuto(code).value;
                        } catch { return Utils.escapeHtml(code); }
                    })();

                    return `<pre class="code-block relative" data-lang="${langLabel}" tabindex="0" aria-label="Code block, ${langLabel}. Press Enter for actions"><div class="code-head"><span class="code-lang">${langLabel}</span><span class="code-hint" role="button" aria-label="Code actions"><i class="fa-solid fa-ellipsis"></i><span>Tap for actions</span></span></div><code class="hljs language-${langLabel}">${highlighted}</code></pre>`;
                }
            }
        });
        this._markedConfigured = true;
    },

    estimateTokens(text = '') { return Math.max(1, Math.round(String(text).length / 4)); },

    formatTime(iso) {
        try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        catch { return ''; }
    },

    createMessageElement(message, userName) {
        const isUser = message.sender === 'user';
        const wrapper = document.createElement('div');
        wrapper.className = `group w-full py-4 px-3 rounded-2xl transition-colors ${isUser ? 'bg-gpt-card/50' : 'bg-transparent'}`;
        wrapper.dataset.messageId = message.id;

        const initial = Utils.escapeHtml((userName || 'U').charAt(0).toUpperCase());
        const avatar = isUser ?
            `<div class="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shrink-0">${initial}</div>` :
            `<div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0"><i class="fa-solid fa-bolt"></i></div>`;

        const safeName = Utils.escapeHtml(isUser ? (userName || 'You') : 'ChatGPT');
        const safeId = Utils.escapeHtml(message.id);
        const time = this.formatTime(message.timestamp);
        const tokens = this.estimateTokens(message.text);
        const sentiment = Utils.sentiment(message.text || '');
        const hasNote = !!message.note;
        const noteIndicator = hasNote ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block ml-1" title="Has note"></span>' : '';

        const actionBtn = `<button aria-label="Message actions" onclick="ChatRenderer.toggleActionMenu(event, '${safeId}')" class="p-1 text-slate-400 hover:text-white rounded hover:bg-gpt-hover transition-colors opacity-0 group-hover:opacity-100 msg-action-btn"><i class="fa-solid fa-ellipsis text-sm"></i></button>`;

        wrapper.innerHTML = `
            <div class="max-w-3xl mx-auto flex space-x-4">
                ${avatar}
                <div class="flex-1 min-w-0 space-y-1">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2 flex-wrap cursor-pointer hover:opacity-80" onclick="ChatRenderer.toggleActionMenu(event, '${safeId}')">
                            <span class="font-bold text-xs text-slate-300">${safeName}${noteIndicator}</span>
                            <span class="text-[10px] text-slate-500">${time}</span>
                            <span class="text-[10px] text-slate-600">· ~${tokens}t</span>
                            <span class="text-[10px] text-${sentiment.color}-400">${sentiment.emoji}</span>
                        </div>
                        <div class="relative">${actionBtn}</div>
                    </div>
                    <div class="markdown-body text-slate-200 text-sm leading-relaxed" id="msg_body_${safeId}">
                        ${this.formatMarkdown(message.text)}
                    </div>
                    ${hasNote ? `<div class="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200"><i class="fa-solid fa-note-sticky mr-1"></i>${Utils.escapeHtml(message.note)}</div>` : ''}
                </div>
            </div>`;
        return wrapper;
    },

    toggleActionMenu(e, messageId) {
        e.stopPropagation();
        const existingMenu = document.getElementById('messageActionMenu');
        if (existingMenu && existingMenu.dataset.msgId === messageId) { existingMenu.remove(); return; }
        if (existingMenu) existingMenu.remove();

        const settings = this._settings();
        const app = window.appInstance;
        const activeConv = app && app.conversations.find(c => c.id === app.activeConversationId);
        const msg = activeConv && activeConv.messages.find(m => m.id === messageId);
        if (!msg) return;

        const isUser = msg.sender === 'user';
        const isBookmarked = (settings.bookmarks || []).some(b => b.msgId === messageId);

        let menuHTML = `<div id="messageActionMenu" data-msg-id="${messageId}" class="absolute z-50 bg-gpt-card border border-gpt-border shadow-2xl rounded-xl py-1.5 w-48 text-xs text-slate-200 animate-fade-in" style="top: 30px; right: 10px;">`;

        if (isUser) {
            menuHTML += `<button onclick="ChatRenderer.editMessage('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-solid fa-pen text-amber-400 w-4"></i><span>Edit Message</span></button>`;
        } else {
            menuHTML += `<button onclick="ChatRenderer.regenerate('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-solid fa-rotate-right text-teal-400 w-4"></i><span>Regenerate</span></button>`;
            menuHTML += `<button onclick="ChatRenderer.retryWithModel('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-solid fa-shuffle text-blue-400 w-4"></i><span>Retry with Model</span></button>`;
            menuHTML += `<button onclick="ChatRenderer.saveAsTemplate('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-solid fa-floppy-disk text-orange-400 w-4"></i><span>Save as Template</span></button>`;
        }

        menuHTML += `
            <div class="border-t border-gpt-border/50 my-1"></div>
            <button onclick="ChatRenderer.copyMessageText('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-regular fa-copy text-slate-400 w-4"></i><span>Copy</span></button>
            <button onclick="ChatRenderer.speakMessageText('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-solid fa-volume-high text-slate-400 w-4"></i><span>Read Aloud</span></button>
            <button onclick="ChatRenderer.branchFrom('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-solid fa-code-branch text-purple-400 w-4"></i><span>Branch Chat</span></button>
            <button onclick="ChatRenderer.toggleBookmark('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="${isBookmarked ? 'fa-solid fa-bookmark text-amber-400' : 'fa-regular fa-bookmark text-slate-400'} w-4"></i><span>${isBookmarked ? 'Remove Bookmark' : 'Bookmark'}</span></button>
            <button onclick="ChatRenderer.editNote('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-gpt-hover flex items-center space-x-3"><i class="fa-regular fa-note-sticky text-yellow-400 w-4"></i><span>Add Note</span></button>
            <div class="border-t border-gpt-border/50 my-1"></div>
            <button onclick="ChatRenderer.deleteMessage('${messageId}'); ChatRenderer.closeMenu();" class="w-full text-left px-4 py-2.5 hover:bg-rose-500/10 text-rose-400 flex items-center space-x-3"><i class="fa-regular fa-trash-can w-4"></i><span>Delete</span></button>
        </div>`;

        const msgWrapper = e.currentTarget.closest('[data-message-id]');
        if (!msgWrapper) return;
        msgWrapper.style.position = 'relative';
        msgWrapper.insertAdjacentHTML('beforeend', menuHTML);

        setTimeout(() => {
            const closeHandler = (ev) => {
                const menu = document.getElementById('messageActionMenu');
                if (menu && !menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeHandler); }
                if (!menu) document.removeEventListener('click', closeHandler);
            };
            document.addEventListener('click', closeHandler);
        }, 10);
    },

    closeMenu() { document.getElementById('messageActionMenu')?.remove(); },

    formatMarkdown(text) {
        if (!text) return '';

        const trimmed = String(text).trim();
        if (trimmed) {
            let jsonCandidate = trimmed;
            const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
            if (fenceMatch) jsonCandidate = fenceMatch[1].trim();

            if (jsonCandidate.startsWith('{') && jsonCandidate.includes('"quiz"')) {
                try {
                    const parsed = JSON.parse(jsonCandidate);
                    if (parsed && Array.isArray(parsed.quiz) && parsed.quiz.length > 0) {
                        return this._renderDynamicQuiz(parsed.quiz);
                    }
                } catch (e) {}
            }
        }

        let processedText = text;

        processedText = processedText.replace(/<thought>([\s\S]*?)<\/thought>/gi, (match, content) => {
            return `
            <div class="my-3 rounded-lg bg-gpt-main/40 border border-gpt-border/60 overflow-hidden">
                <div class="px-3 py-2 bg-gpt-main/60 text-xs font-semibold text-slate-300 flex items-center space-x-2 cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <i class="fa-solid fa-brain text-purple-400"></i>
                    <span>Thought Process</span>
                    <i class="fa-solid fa-chevron-down ml-auto text-[10px] opacity-50"></i>
                </div>
                <div class="p-3 text-xs text-slate-400 italic whitespace-pre-wrap font-mono leading-relaxed border-t border-gpt-border/30">
${Utils.escapeHtml(content || '')}
                </div>
            </div>

`;
        });

        processedText = processedText.replace(/<file_action\s+status="creating"\s+filename="([^"]+)">/gi, (match, filename) => {
            const safe = Utils.escapeHtml(filename);
            return `<div class="file-chip" data-fa-filename="${safe}"><i class="fa-solid fa-file-code"></i><span class="file-chip-name">${safe}</span><span class="file-chip-open" role="button" tabindex="0" data-chip-open>Open in IDE</span></div>\n\n`;
        });

        this._configureMarked();
        let html = '';
        try {
            html = marked.parse(processedText);
        } catch (e) {
            console.warn('Markdown fail:', e);
            return `<p>${Utils.escapeHtml(processedText)}</p>`;
        }

        html = html.replace(/(<div class="file-chip" data-fa-filename="([^"]*)">[\s\S]*?<\/div>)([\s\S]*?)<pre class="code-block([^"]*)" data-lang=/g,
            (m, chip, fname, between, cls) => `${chip}${between}<pre class="code-block${cls}" data-filename="${fname}" data-lang=`);

        let isLegacyQuiz = false;
        if (text.includes('A)') && text.includes('B)') && text.includes('C)') && text.includes('D)')) {
            const quizRegex = /(?:Question \d+:|Q\d+:)?\s*([\s\S]*?)\s*(?:\n|<br>|\r\n)\s*A\)\s*([\s\S]*?)(?:\n|<br>|\r\n)\s*B\)\s*([\s\S]*?)(?:\n|<br>|\r\n)\s*C\)\s*([\s\S]*?)(?:\n|<br>|\r\n)\s*D\)\s*([\s\S]*?)(?:\n|<br>|\r\n)/i;

            if (quizRegex.test(text)) {
                const match = text.match(quizRegex);
                const question = match[1].replace(/(<([^>]+)>)/gi, '').trim();
                const optA = match[2].replace(/(<([^>]+)>)/gi, '').trim();
                const optB = match[3].replace(/(<([^>]+)>)/gi, '').trim();
                const optC = match[4].replace(/(<([^>]+)>)/gi, '').trim();
                const optD = match[5].replace(/(<([^>]+)>)/gi, '').trim();

                if (optA && optB && optC && optD && question.length > 5) {
                    isLegacyQuiz = true;
                    const preText = text.substring(0, match.index);
                    const postText = text.substring(match.index + match[0].length);

                    const quizHtml = `
            <div class="quiz-card" id="quiz-card-auto">
                <div class="quiz-header">
                    <span>Question</span>
                    <span class="nav"><i class="fa-regular fa-lightbulb"></i></span>
                </div>
                <div class="quiz-question">${question}</div>
                <div class="quiz-options">
                    <div class="quiz-opt" onclick="window.selectQuizOption(this, 'A')"><div class="circle">A</div> ${optA}</div>
                    <div class="quiz-opt" onclick="window.selectQuizOption(this, 'B')"><div class="circle">B</div> ${optB}</div>
                    <div class="quiz-opt" onclick="window.selectQuizOption(this, 'C')"><div class="circle">C</div> ${optC}</div>
                    <div class="quiz-opt" onclick="window.selectQuizOption(this, 'D')"><div class="circle">D</div> ${optD}</div>
                </div>
                <div class="quiz-footer">
                    <button class="quiz-next-btn" onclick="window.submitQuiz(this)">Submit Answer</button>
                </div>
            </div>`;

                    const preHtml = preText ? marked.parse(preText) : '';
                    let postHtml = postText ? marked.parse(postText) : '';
                    postHtml = postHtml.replace(/What's your answer\?/gi, '');

                    html = preHtml + quizHtml + postHtml;
                }
            }
        }

        if (!isLegacyQuiz) {
            html = html.replace(/onclick="window\.selectQuizOption\(this,\s*'([^']+)'\)"/g, 'onclick="window.selectQuizOption(this, \'$1\')"');
            html = html.replace(/onclick="window\.submitQuiz\(\)"/g, 'onclick="window.submitQuiz(this)"');
        }

        return html;
    },

    _determineCorrectLetter(q) {
        const answer = String(q && q.answer || '').trim();
        if (!answer) return 'A';

        if (/^[A-Da-d]$/.test(answer)) return answer.toUpperCase();

        const options = Array.isArray(q.options) ? q.options : [];
        const idx = options.findIndex(opt => String(opt).trim().toLowerCase() === answer.toLowerCase());
        if (idx >= 0) return String.fromCharCode(65 + idx);

        const letterMatch = answer.match(/^([A-D])[\).\-\s:]/i);
        if (letterMatch) return letterMatch[1].toUpperCase();

        return 'A';
    },

    _renderDynamicQuiz(quizArray) {
        const cardsHtml = quizArray.map((q, idx) => {
            const correctLetter = this._determineCorrectLetter(q);
            const questionText = Utils.escapeHtml(String(q && q.q || ''));
            const options = Array.isArray(q && q.options) ? q.options : [];

            const optionsHtml = options.map((opt, oi) => {
                const letter = String.fromCharCode(65 + oi);
                return `<div class="quiz-opt" onclick="window.selectQuizOption(this, '${letter}')"><div class="circle">${letter}</div> ${Utils.escapeHtml(String(opt))}</div>`;
            }).join('');

            return `
        <div class="quiz-card" data-quiz-id="dyn-${idx}" data-answer="${Utils.escapeHtml(correctLetter)}">
            <div class="quiz-header">
                <span>Question ${idx + 1} of ${quizArray.length}</span>
                <span class="nav"><i class="fa-regular fa-lightbulb"></i></span>
            </div>
            <div class="quiz-question">${questionText}</div>
            <div class="quiz-options">${optionsHtml}</div>
            <div class="quiz-footer">
                <button class="quiz-next-btn" onclick="window.submitDynamicQuiz(this, '${Utils.escapeHtml(correctLetter)}')">Submit Answer</button>
            </div>
        </div>`;
        }).join('');

        return `<div class="dynamic-quiz-container space-y-3">${cardsHtml}</div>`;
    },

    editMessage(id) { window.appInstance?.startEditMessage?.(id); },
    regenerate(id) { window.appInstance?.regenerateFromMessage?.(id); },
    retryWithModel(id) { window.appInstance?.retryWithModel?.(id); },
    branchFrom(id) { window.appInstance?.branchFromMessage?.(id); },
    toggleBookmark(id) { window.appInstance?.toggleBookmark?.(id); },
    editNote(id) { window.appInstance?.editMessageNote?.(id); },
    saveAsTemplate(id) { window.appInstance?.saveMessageAsTemplate?.(id); },
    deleteMessage(id) { window.appInstance?.deleteMessageById?.(id); },

    speakMessageText(messageId) {
        const body = document.getElementById(`msg_body_${messageId}`);
        if (!body || !window.speechSynthesis) return;
        const plain = Utils.stripMarkdown(body.innerText || '');
        if (!plain.trim()) return;
        window.speechSynthesis.cancel();
        const settings = this._settings();
        const utt = new SpeechSynthesisUtterance(plain);
        utt.rate = Math.min(Math.max(parseFloat(settings.speechRate) || 1, 0.5), 2);
        window.speechSynthesis.speak(utt);
    },

    async copyMessageText(messageId) {
        const body = document.getElementById(`msg_body_${messageId}`);
        if (!body) return;
        const ok = await Utils.copyText(Utils.stripMarkdown(body.innerText || ''));
        this.showToast(ok ? 'Copied' : 'Copy failed');
    },

    showToast(msg) {
        document.querySelectorAll('.app-toast').forEach((t) => t.remove());
        const toast = document.createElement('div');
        toast.className = 'app-toast fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-xs px-4 py-2 rounded-xl shadow-xl border border-zinc-700';
        toast.setAttribute('role', 'status');
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2200);
    },

    _codeFromPre(pre) {
        const codeEl = pre.querySelector('code');
        return codeEl ? codeEl.textContent || '' : '';
    },

    openCodeMenu(pre, x, y) {
        this.closeCodeMenu();
        const code = this._codeFromPre(pre);
        if (!code.trim()) return;
        const lang = pre.dataset.lang || 'plaintext';
        const filename = pre.dataset.filename || '';

        const menu = document.createElement('div');
        menu.id = 'codeActionMenu';
        menu.className = 'code-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = `
            <button role="menuitem" data-act="preview"><i class="fa-solid fa-play"></i><span>Preview</span></button>
            <button role="menuitem" data-act="copy"><i class="fa-regular fa-copy"></i><span>Copy Code</span></button>
            <button role="menuitem" data-act="ide"><i class="fa-solid fa-code"></i><span>Open in IDE</span></button>`;
        document.body.appendChild(menu);
        menu._pre = pre;
        menu._t = Date.now();

        const r = menu.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = Math.min(Math.max(8, x - r.width / 2), vw - r.width - 8);
        let top = y + 10;
        if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 10);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            this.closeCodeMenu();
            if (act === 'preview') this.codePreview(pre, code, lang);
            else if (act === 'copy') this.codeCopy(code);
            else if (act === 'ide') this.codeOpenIDE(code, lang, filename);
        });
        menu.addEventListener('keydown', (e) => {
            const items = Array.from(menu.querySelectorAll('button'));
            const i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.closeCodeMenu(); pre.focus(); }
        });
        menu.querySelector('button').focus({ preventScroll: true });
    },

    closeCodeMenu() { document.getElementById('codeActionMenu')?.remove(); },

    async codeCopy(code) {
        const ok = await Utils.copyText(code);
        this.showToast(ok ? 'Code copied to clipboard' : 'Copy failed. Long-press the code to select it');
    },

    codeOpenIDE(code, lang, filename) {
        if (!window.IDE) { this.showToast('Editor is not available'); return; }
        window.IDE.openSnippet({ code, lang, filename });
    },

    codePreview(pre, code, lang) {
        const lower = String(lang || '').toLowerCase();
        if (!PreviewBuilder.isPreviewable(lower)) {
            this.showToast(`Preview is not available for ${lang}. Use Open in IDE or Copy Code`);
            return;
        }
        let html = null;
        if (lower === 'html' || lower === 'htm') {
            const project = this._collectProject(pre, code);
            if (project) {
                const built = PreviewBuilder.fromProject(project.files, 'index.html');
                if (built.html) html = built.html;
            }
        }
        if (!html) html = PreviewBuilder.fromSingle(code, lower);
        if (!html) { this.showToast(`Preview is not available for ${lang}`); return; }
        this._openArtifact(html, lower);
    },

    _collectProject(pre, htmlCode) {
        const body = pre.closest('.markdown-body');
        if (!body) return null;
        const css = [], js = [];
        body.querySelectorAll('pre.code-block').forEach((b) => {
            if (b === pre) return;
            const l = (b.dataset.lang || '').toLowerCase();
            if (l === 'css') css.push(b);
            else if (l === 'js' || l === 'javascript') js.push(b);
        });
        if (!css.length && !js.length) return null;

        let html = htmlCode;
        const files = {};
        const isLocal = (ref) => ref && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(ref);
        const refsOf = (re) => Array.from(html.matchAll(re)).map((m) => m[1]).filter(isLocal);
        const cssRefs = refsOf(/<link[^>]+href=["']([^"']+\.css)["']/gi);
        const jsRefs = refsOf(/<script[^>]+src=["']([^"']+\.js)["']/gi);

        const assign = (refs, blocks) => {
            const used = new Set();
            refs.forEach((ref) => {
                const base = Utils.basename(ref);
                const blk = blocks.find((b) => !used.has(b) && b.dataset.filename && Utils.basename(b.dataset.filename) === base)
                    || blocks.find((b) => !used.has(b));
                if (blk) {
                    used.add(blk);
                    files[PreviewBuilder._resolve('', ref)] = { content: this._codeFromPre(blk) };
                }
            });
            return blocks.filter((b) => !used.has(b));
        };

        const restCss = assign(cssRefs, css);
        const restJs = assign(jsRefs, js);
        const hasInlineStyle = /<style[\s>]/i.test(html);
        const hasInlineScript = /<script(?![^>]*\ssrc=)[^>]*>/i.test(html);

        if (!hasInlineStyle && !cssRefs.length) {
            const links = restCss.map((b, i) => {
                const name = `style${i ? i + 1 : ''}.css`;
                files[name] = { content: this._codeFromPre(b) };
                return `<link rel="stylesheet" href="${name}">`;
            }).join('');
            if (links) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, links + '</head>') : links + html;
        }
        if (!hasInlineScript && !jsRefs.length) {
            const tags = restJs.map((b, i) => {
                const name = `script${i ? i + 1 : ''}.js`;
                files[name] = { content: this._codeFromPre(b) };
                return `<script src="${name}"><\/script>`;
            }).join('');
            if (tags) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tags + '</body>') : html + tags;
        }
        if (!Object.keys(files).length) return null;
        if (!/<html[\s>]/i.test(html) && !/<!doctype/i.test(html)) {
            html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><script src="https://cdn.tailwindcss.com"><\/script></head><body>${html}</body></html>`;
        }
        files['index.html'] = { content: html };
        return { files };
    },

    _openArtifact(html, lang) {
        const panel = document.getElementById('artifactPanel');
        const iframe = document.getElementById('artifactIframe');
        if (!panel || !iframe) { this.showToast('Preview panel not found'); return; }
        const badge = document.getElementById('artifactLangBadge');
        if (badge) badge.textContent = (lang || 'html').toUpperCase();
        this._artifactHtml = html;
        this._clearArtifactError();
        iframe.srcdoc = html;
        panel.classList.add('is-open');
    },

    _clearArtifactError() {
        const bar = document.getElementById('artifactErrorBar');
        if (bar) { bar.classList.add('hidden'); bar.textContent = ''; }
    },

    closeArtifact() {
        document.getElementById('artifactPanel')?.classList.remove('is-open');
    },

    reloadArtifact() {
        const iframe = document.getElementById('artifactIframe');
        if (!iframe || !this._artifactHtml) return;
        this._clearArtifactError();
        iframe.srcdoc = '';
        requestAnimationFrame(() => { iframe.srcdoc = this._artifactHtml; });
    },

    openArtifactFullscreen() {
        if (!this._artifactHtml) return;
        if (!PreviewBuilder.openInTab(this._artifactHtml)) this.showToast('Popup blocked. Allow popups for this site');
    }
};

(function setupArtifactControls() {
    const closeBtn = document.getElementById('artifactCloseBtn');
    const reloadBtn = document.getElementById('artifactReloadBtn');
    const fullBtn = document.getElementById('artifactOpenFullBtn');

    if (closeBtn) closeBtn.addEventListener('click', () => ChatRenderer.closeArtifact());
    if (reloadBtn) reloadBtn.addEventListener('click', () => ChatRenderer.reloadArtifact());
    if (fullBtn) fullBtn.addEventListener('click', () => ChatRenderer.openArtifactFullscreen());

    window.addEventListener('message', (e) => {
        const iframe = document.getElementById('artifactIframe');
        if (!iframe || e.source !== iframe.contentWindow || !e.data || !e.data.__preview) return;
        if (e.data.type === 'console' && e.data.data && e.data.data.level === 'error') {
            const bar = document.getElementById('artifactErrorBar');
            if (bar) {
                bar.textContent = String(e.data.data.text).slice(0, 400);
                bar.classList.remove('hidden');
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const panel = document.getElementById('artifactPanel');
            if (document.getElementById('codeActionMenu')) { ChatRenderer.closeCodeMenu(); return; }
            if (panel && panel.classList.contains('is-open') && !document.body.classList.contains('ide-open')) ChatRenderer.closeArtifact();
        }
    });
})();

(function setupCodeActions() {
    const fileChipTarget = (chip) => {
        const body = chip.closest('.markdown-body');
        if (!body) return null;
        const pres = Array.from(body.querySelectorAll('pre.code-block'));
        return pres.find((p) => chip.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) || null;
    };

    document.addEventListener('click', (e) => {
        const open = document.getElementById('codeActionMenu');
        if (open && open.contains(e.target)) return;

        const chipBtn = e.target.closest && e.target.closest('[data-chip-open]');
        if (chipBtn) {
            const pre = fileChipTarget(chipBtn.closest('.file-chip'));
            if (pre) ChatRenderer.codeOpenIDE(ChatRenderer._codeFromPre(pre), pre.dataset.lang || '', pre.dataset.filename || '');
            else ChatRenderer.showToast('No code block found for this file yet');
            return;
        }

        const pre = e.target.closest && e.target.closest('pre.code-block');
        const sameBlock = open && open._pre === pre;
        ChatRenderer.closeCodeMenu();
        if (!pre || sameBlock) return;
        if (e.target.closest('a')) return;
        const sel = window.getSelection && window.getSelection().toString();
        if (sel) return;
        ChatRenderer.openCodeMenu(pre, e.clientX, e.clientY);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const chipBtn = e.target.closest && e.target.closest('[data-chip-open]');
        if (chipBtn) { e.preventDefault(); chipBtn.click(); return; }
        const pre = e.target.classList && e.target.classList.contains('code-block') ? e.target : null;
        if (!pre) return;
        e.preventDefault();
        const r = pre.getBoundingClientRect();
        ChatRenderer.openCodeMenu(pre, r.left + Math.min(r.width / 2, 120), r.top + 36);
    });

    const dismiss = () => {
        const m = document.getElementById('codeActionMenu');
        if (m && Date.now() - (m._t || 0) > 400) ChatRenderer.closeCodeMenu();
    };
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', dismiss, true);
})();

window.submitDynamicQuiz = function (button, correctAnswer) {
    const card = button.closest('.quiz-card');
    if (!card) return;
    const selected = card.querySelector('.quiz-opt.selected');

    if (!selected) {
        if (window.ChatRenderer) ChatRenderer.showToast('Pehle koi option select karein!');
        return;
    }

    const selectedLetter = (selected.querySelector('.circle')?.innerText || '').trim().toUpperCase();
    const correctLetter = String(correctAnswer || '').trim().toUpperCase();
    const isCorrect = selectedLetter === correctLetter;

    const allOptions = Array.from(card.querySelectorAll('.quiz-opt'));
    allOptions.forEach(opt => { opt.style.pointerEvents = 'none'; });

    if (isCorrect) {
        if (window.ChatRenderer) ChatRenderer.showToast('✅ Sahi Jawab! Excellent!');
        button.innerText = 'Correct! ✓';
        button.style.backgroundColor = '#10a37f';
        selected.style.borderColor = '#10a37f';
        selected.style.backgroundColor = 'rgba(16, 163, 127, 0.1)';
        const circle = selected.querySelector('.circle');
        if (circle) { circle.style.backgroundColor = '#10a37f'; circle.style.color = 'white'; }
    } else {
        selected.style.borderColor = '#e11d48';
        selected.style.backgroundColor = 'rgba(225, 29, 72, 0.1)';
        const selCircle = selected.querySelector('.circle');
        if (selCircle) { selCircle.style.backgroundColor = '#e11d48'; selCircle.style.color = 'white'; }

        const correctOption = allOptions.find(opt =>
            (opt.querySelector('.circle')?.innerText || '').trim().toUpperCase() === correctLetter
        );
        if (correctOption) {
            correctOption.style.borderColor = '#10a37f';
            correctOption.style.backgroundColor = 'rgba(16, 163, 127, 0.1)';
            const cCircle = correctOption.querySelector('.circle');
            if (cCircle) { cCircle.style.backgroundColor = '#10a37f'; cCircle.style.color = 'white'; }
        }

        if (window.ChatRenderer) ChatRenderer.showToast(`❌ Ghalt! Sahi jawab ${correctLetter} tha.`);
        button.innerText = `Incorrect ✗ (Ans: ${correctLetter})`;
        button.style.backgroundColor = '#e11d48';
    }
    button.disabled = true;
};

window.ChatRenderer = ChatRenderer;
