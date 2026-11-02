const PDFExport = {
    PAGE: { w: 595.28, h: 841.89, mx: 54, top: 56, bottom: 60 },

    W_REG: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
    W_BOLD: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
    SPECIAL_W: { 0x2022: 350, 0x2013: 556, 0x2014: 1000, 0x2018: 222, 0x2019: 222, 0x201C: 333, 0x201D: 333, 0x2026: 1000, 0x20AC: 556, 0x2122: 1000, 0xA0: 278, 0xA9: 737, 0xAE: 737, 0xB0: 400, 0xB1: 584, 0xD7: 584, 0xF7: 584, 0xB7: 278 },
    CP1252: { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F },
    RTL_RE: /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/,
    SANS: '"Noto Naskh Arabic","Noto Nastaliq Urdu","Noto Sans Arabic","Noto Sans","Segoe UI",Tahoma,Arial,sans-serif',
    MONO: 'ui-monospace,Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono",monospace',

    COLORS: {
        text: [0.1, 0.1, 0.12], muted: [0.42, 0.44, 0.48], user: [0.15, 0.39, 0.92], ai: [0.05, 0.55, 0.45],
        link: [0.15, 0.39, 0.92], codeBg: [0.955, 0.958, 0.965], codeBorder: [0.85, 0.86, 0.88], rule: [0.88, 0.89, 0.9],
        headBg: [0.93, 0.94, 0.95], quote: [0.35, 0.37, 0.42]
    },

    byteOf(ch) {
        const cp = ch.codePointAt(0);
        if (cp >= 0x20 && cp < 0x7F) return cp;
        if (cp >= 0xA0 && cp <= 0xFF) return cp;
        if (this.CP1252[cp]) return this.CP1252[cp];
        return -1;
    },

    hasUnsupported(text) {
        for (const ch of text) if (ch !== '\n' && this.byteOf(ch) < 0) return true;
        return false;
    },

    cleanText(text) {
        return String(text).replace(/[\u200B-\u200D\uFEFF\u00AD\uFE0E\uFE0F]/g, '').replace(/\r/g, '').replace(/\t/g, '    ');
    },

    charWidth(ch, bold) {
        const cp = ch.codePointAt(0);
        if (cp >= 32 && cp <= 126) return (bold ? this.W_BOLD : this.W_REG)[cp - 32];
        if (this.SPECIAL_W[cp]) return this.SPECIAL_W[cp];
        const base = ch.normalize('NFD')[0];
        const bc = base ? base.codePointAt(0) : 0;
        if (bc >= 32 && bc <= 126 && base !== ch) return (bold ? this.W_BOLD : this.W_REG)[bc - 32];
        return 556;
    },

    textWidth(text, font, size) {
        if (font === 'F5') return text.length * size * 0.6;
        const bold = font === 'F2' || font === 'F4';
        let w = 0;
        for (const ch of text) w += this.charWidth(ch, bold);
        return w * size / 1000;
    },

    pdfString(text) {
        let out = '(';
        for (const ch of text) {
            let b = this.byteOf(ch);
            if (b < 0) b = 63;
            if (b === 40 || b === 41 || b === 92) out += '\\' + String.fromCharCode(b);
            else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
            else out += String.fromCharCode(b);
        }
        return out + ')';
    },

    decodeEntities(s) {
        return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    },

    asciiTitle(title) {
        const t = String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '').trim();
        return (t || 'Chat export').slice(0, 70);
    },

    prepareMessageText(text) {
        let t = String(text || '');
        t = t.replace(/<thought>[\s\S]*?<\/thought>/gi, '').replace(/<thought>[\s\S]*$/i, '');
        t = t.replace(/<file_action[^>]*>/gi, '');
        const trimmed = t.trim();
        const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
        const candidate = fence ? fence[1].trim() : trimmed;
        if (candidate.startsWith('{') && candidate.includes('"quiz"')) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && Array.isArray(parsed.quiz)) {
                    t = parsed.quiz.map((q, i) => {
                        const opts = (q.options || []).map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join('\n');
                        return `${i + 1}. ${q.q}\n${opts}\n   Answer: ${q.answer}`;
                    }).join('\n\n');
                }
            } catch (e) {}
        }
        return this.cleanText(t.trim());
    },

    fallbackTokens(text) {
        return text.split(/\n{2,}/).filter(Boolean).map((p) => ({ type: 'paragraph', tokens: [{ type: 'text', text: p }] }));
    },

    lex(text) {
        try {
            if (typeof marked !== 'undefined' && marked.lexer) return marked.lexer(text, { gfm: true, breaks: true });
        } catch (e) {}
        return this.fallbackTokens(text);
    },

    inlineRuns(tokens, st = {}) {
        const out = [];
        (tokens || []).forEach((t) => {
            switch (t.type) {
                case 'text':
                    if (t.tokens && t.tokens.length) out.push(...this.inlineRuns(t.tokens, st));
                    else out.push({ ...st, text: this.decodeEntities(t.text || '') });
                    break;
                case 'escape': out.push({ ...st, text: t.text || '' }); break;
                case 'strong': out.push(...this.inlineRuns(t.tokens, { ...st, bold: true })); break;
                case 'em': out.push(...this.inlineRuns(t.tokens, { ...st, italic: true })); break;
                case 'del': out.push(...this.inlineRuns(t.tokens, st)); break;
                case 'codespan': out.push({ ...st, text: this.decodeEntities(t.text || ''), code: true }); break;
                case 'br': out.push({ ...st, text: '\n' }); break;
                case 'link':
                    out.push(...this.inlineRuns(t.tokens, { ...st, link: true }));
                    if (t.href && /^https?:/i.test(t.href) && t.href !== t.text) out.push({ ...st, text: ` (${t.href})`, color: this.COLORS.muted });
                    break;
                case 'image': out.push({ ...st, text: `[image: ${t.text || ''}]`, italic: true }); break;
                case 'html': {
                    const stripped = String(t.raw || t.text || '').replace(/<[^>]*>/g, '');
                    if (stripped.trim()) out.push({ ...st, text: this.decodeEntities(stripped) });
                    break;
                }
                default:
                    if (t.tokens) out.push(...this.inlineRuns(t.tokens, st));
                    else if (t.text) out.push({ ...st, text: this.decodeEntities(t.text) });
            }
        });
        return out;
    },

    async generate(conv, { onProgress, includeNotes = false } = {}) {
        const doc = new PDFBuilder(this);
        await doc.build(conv, { onProgress, includeNotes });
        return doc.finish();
    },

    async run(conv) {
        if (!conv || !conv.messages || conv.messages.length === 0) {
            ChatRenderer.showToast('Nothing to export');
            return false;
        }
        ChatRenderer.showToast('Generating PDF...');
        try {
            const { blob, pages } = await this.generate(conv);
            const filename = `chat-export-${Utils.dateStamp()}.pdf`;
            ChatRenderer.showToast('PDF generated');
            await UI.deliverFile(new Blob([blob], { type: 'application/pdf' }), filename, { title: 'PDF ready', details: `${pages} page${pages === 1 ? '' : 's'}` });
            return true;
        } catch (err) {
            console.error('PDF export failed:', err);
            ChatRenderer.showToast('PDF export failed: ' + (err && err.message ? err.message : 'unknown error'));
            return false;
        }
    },

    printConversation(conv) {
        if (!conv || !conv.messages || conv.messages.length === 0) { ChatRenderer.showToast('Nothing to print'); return; }
        const render = (t) => {
            try { return Utils.sanitizeHtml(marked.parse(this.prepareMessageText(t))); }
            catch (e) { return `<p>${Utils.escapeHtml(t)}</p>`; }
        };
        const body = conv.messages.map((m) => `<section class="msg ${m.sender === 'user' ? 'user' : 'ai'}"><h2>${m.sender === 'user' ? 'You' : 'ChatGPT'}<small>${Utils.escapeHtml(Utils.formatTime(m.timestamp))}</small></h2>${render(m.text)}</section>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Utils.escapeHtml(conv.title)}</title><style>
@page{size:A4;margin:18mm 16mm}
body{font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#111;line-height:1.55;font-size:11pt;margin:0}
h1{font-size:20pt;margin:0 0 4pt}.meta{color:#666;font-size:9pt;margin-bottom:14pt;border-bottom:1px solid #ddd;padding-bottom:8pt}
.msg{border-left:3px solid #0e8c73;padding-left:10pt;margin:0 0 14pt;break-inside:auto}.msg.user{border-color:#2563eb}
.msg h2{font-size:10pt;margin:0 0 4pt;color:#0e8c73}.msg.user h2{color:#2563eb}.msg h2 small{color:#888;font-weight:400;margin-left:8pt}
pre{background:#f4f4f5;border:1px solid #ddd;border-radius:4pt;padding:8pt;white-space:pre-wrap;word-break:break-word;font-size:9pt;break-inside:avoid-page}
code{font-family:ui-monospace,Menlo,Consolas,monospace}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3pt 6pt}img{max-width:100%}
</style></head><body><h1>${Utils.escapeHtml(conv.title)}</h1><div class="meta">Exported ${Utils.escapeHtml(new Date().toLocaleString())} · ${conv.messages.length} messages</div>${body}</body></html>`;
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
        frame.onload = () => {
            try { frame.contentWindow.focus(); frame.contentWindow.print(); }
            catch (e) { ChatRenderer.showToast('Print is not available here'); }
            setTimeout(() => frame.remove(), 60000);
        };
        frame.srcdoc = html;
        document.body.appendChild(frame);
    }
};

class PDFBuilder {
    constructor(P) {
        this.P = P;
        this.pw = P.PAGE.w;
        this.ph = P.PAGE.h;
        this.mx = P.PAGE.mx;
        this.topY = P.PAGE.top;
        this.maxY = P.PAGE.h - P.PAGE.bottom;
        this.contentW = P.PAGE.w - 2 * P.PAGE.mx;
        this.pages = [];
        this.images = [];
        this.bars = [];
        this.region = null;
        this.pendingBullet = null;
        this._canvas = null;
        this.newPageRaw();
    }

    newPageRaw() {
        this.page = { ops: [], imgs: new Map() };
        this.pages.push(this.page);
        this.y = this.topY;
    }

    flushBars(endY) {
        this.bars.forEach((b) => {
            const h = endY - b.y;
            if (h > 0) b.page.ops.push(`${this.rgb(b.color)} rg ${b.x.toFixed(2)} ${(this.ph - endY).toFixed(2)} ${b.w} ${h.toFixed(2)} re f`);
        });
    }

    flushRegion(endY) {
        const r = this.region;
        if (!r) return;
        const h = endY - r.y;
        if (h > 0) {
            const c = this.P.COLORS;
            r.page.ops.splice(r.opsIndex, 0,
                `${this.rgb(c.codeBg)} rg ${r.x.toFixed(2)} ${(this.ph - endY).toFixed(2)} ${r.w.toFixed(2)} ${h.toFixed(2)} re f`,
                `${this.rgb(c.codeBorder)} RG 0.5 w ${r.x.toFixed(2)} ${(this.ph - endY).toFixed(2)} ${r.w.toFixed(2)} ${h.toFixed(2)} re S`);
        }
    }

    breakPage() {
        this.flushBars(this.maxY);
        this.flushRegion(this.maxY);
        this.newPageRaw();
        this.bars.forEach((b) => { b.page = this.page; b.y = this.topY; });
        if (this.region) {
            this.region.page = this.page;
            this.region.y = this.topY;
            this.region.opsIndex = 0;
            this.y += 7;
        }
    }

    ensure(h) {
        if (this.y + h > this.maxY && this.y > this.topY + 1) this.breakPage();
    }

    gap(n) { if (this.y > this.topY + 1) this.y += n; }

    rgb(c) { return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`; }

    pushBar(x, color, w = 2.4) { this.bars.push({ x, color, w, y: this.y, page: this.page }); }

    popBar() {
        const b = this.bars.pop();
        if (!b) return;
        const h = this.y - b.y;
        if (h > 0) b.page.ops.push(`${this.rgb(b.color)} rg ${b.x.toFixed(2)} ${(this.ph - this.y).toFixed(2)} ${b.w} ${h.toFixed(2)} re f`);
    }

    fontFor(run, base) {
        if (run.code || base.mono) return 'F5';
        const bold = run.bold || base.bold;
        const italic = run.italic || base.italic;
        if (bold && italic) return 'F4';
        if (bold) return 'F2';
        if (italic) return 'F3';
        return 'F1';
    }

    layoutRuns(runs, width, size, base = {}) {
        const P = this.P;
        const color = base.color || P.COLORS.text;
        const lh = base.lh || size * 1.42;
        const clean = runs.filter((r) => r.text !== undefined).map((r) => ({ ...r, text: P.cleanText(r.text).replace(/\t/g, '    ') }));
        if (clean.some((r) => P.hasUnsupported(r.text))) return this.layoutRaster(clean, width, size, base, lh, color);

        const tokens = [];
        clean.forEach((r) => {
            r.text.split('\n').forEach((part, i) => {
                if (i > 0) tokens.push({ nl: true });
                part.split(/([ ]+)/).forEach((piece) => {
                    if (piece === '') return;
                    tokens.push({ text: piece, space: /^ +$/.test(piece), run: r });
                });
            });
        });

        const lines = [];
        let cur = { segs: [], w: 0, size, h: lh };
        const pushLine = () => {
            while (cur.segs.length && cur.segs[cur.segs.length - 1].space) cur.w -= cur.segs.pop().w;
            lines.push(cur);
            cur = { segs: [], w: 0, size, h: lh };
        };
        const segFor = (text, run, space) => {
            const font = this.fontFor(run, base);
            const sz = run.code ? size * 0.92 : size;
            return { t: space ? ' ' : text, f: font, size: sz, color: run.link ? P.COLORS.link : (run.color || color), w: P.textWidth(space ? ' ' : text, font, sz), space, underline: !!run.link };
        };

        tokens.forEach((tk) => {
            if (tk.nl) { pushLine(); return; }
            if (tk.space) {
                if (cur.w === 0) return;
                const s = segFor(tk.text, tk.run, true);
                if (cur.w + s.w <= width) { cur.segs.push(s); cur.w += s.w; }
                return;
            }
            let s = segFor(tk.text, tk.run, false);
            if (cur.w + s.w > width && cur.w > 0) { pushLine(); }
            if (s.w > width) {
                let chunk = '';
                for (const ch of tk.text) {
                    const test = chunk + ch;
                    if (P.textWidth(test, s.f, s.size) > width && chunk) {
                        const piece = segFor(chunk, tk.run, false);
                        cur.segs.push(piece); cur.w += piece.w;
                        pushLine();
                        chunk = ch;
                    } else chunk = test;
                }
                if (chunk) { const piece = segFor(chunk, tk.run, false); cur.segs.push(piece); cur.w += piece.w; }
                return;
            }
            cur.segs.push(s);
            cur.w += s.w;
        });
        if (cur.segs.length || lines.length === 0) pushLine();
        return lines;
    }

    canvas() {
        if (!this._canvas) {
            if (typeof document === 'undefined') return null;
            this._canvas = document.createElement('canvas');
        }
        return this._canvas;
    }

    layoutRaster(runs, width, size, base, lh, color) {
        const P = this.P;
        const text = runs.map((r) => r.text).join('');
        const cv = this.canvas();
        const bold = !!(base.bold || (runs.length && runs.every((r) => r.bold)));
        const italic = !!(base.italic || (runs.length && runs.every((r) => r.italic)));
        const mono = !!base.mono;
        const S = 2.5;
        const fontCss = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${(size * S).toFixed(1)}px ${mono ? P.MONO : P.SANS}`;

        if (!cv) {
            const safe = Array.from(text).map((ch) => (ch === '\n' || P.byteOf(ch) >= 0 ? ch : '?')).join('');
            return this.layoutRuns([{ text: safe, bold, italic }], width, size, { ...base, bold, italic });
        }
        const ctx = cv.getContext('2d');
        ctx.font = fontCss;
        const measure = (s) => ctx.measureText(s).width / S;
        const lines = [];
        text.split('\n').forEach((para) => {
            if (para === '') { lines.push({ raster: true, text: '', w: width, size, h: lh, font: fontCss, color, rtl: false, bg: base.bg }); return; }
            const rtl = P.RTL_RE.test(para);
            const words = para.split(/(\s+)/);
            let line = '';
            const flush = () => { lines.push({ raster: true, text: line.replace(/\s+$/, ''), w: width, size, h: lh, font: fontCss, color, rtl, bg: base.bg }); line = ''; };
            words.forEach((word) => {
                if (word === '') return;
                if (measure(line + word) <= width) { line += word; return; }
                if (/^\s+$/.test(word)) { if (line) flush(); return; }
                if (line.trim()) flush();
                if (measure(word) <= width) { line = word; return; }
                let chunk = '';
                for (const ch of word) {
                    if (measure(chunk + ch) > width && chunk) { line = chunk; flush(); chunk = ch; } else chunk += ch;
                }
                line = chunk;
            });
            if (line.trim() || lines.length === 0) flush();
        });
        return lines;
    }

    rasterImage(line) {
        const S = 2.5;
        const cv = document.createElement('canvas');
        cv.width = Math.max(2, Math.ceil(line.w * S));
        cv.height = Math.max(2, Math.ceil(line.h * S));
        const ctx = cv.getContext('2d');
        const bg = line.bg || [1, 1, 1];
        ctx.fillStyle = `rgb(${Math.round(bg[0] * 255)},${Math.round(bg[1] * 255)},${Math.round(bg[2] * 255)})`;
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = `rgb(${Math.round(line.color[0] * 255)},${Math.round(line.color[1] * 255)},${Math.round(line.color[2] * 255)})`;
        ctx.font = line.font;
        ctx.textBaseline = 'alphabetic';
        ctx.direction = line.rtl ? 'rtl' : 'ltr';
        ctx.textAlign = line.rtl ? 'right' : 'left';
        ctx.fillText(line.text, line.rtl ? cv.width : 0, cv.height * 0.72);
        const url = cv.toDataURL('image/jpeg', 0.92);
        const bin = atob(url.split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { w: cv.width, h: cv.height, bytes };
    }

    drawLineAt(line, x, top) {
        if (line.raster) {
            if (!line.text) return;
            const img = this.rasterImage(line);
            this.images.push(img);
            const idx = this.images.length;
            this.page.imgs.set(`Im${idx}`, idx - 1);
            this.page.ops.push(`q ${line.w.toFixed(2)} 0 0 ${line.h.toFixed(2)} ${x.toFixed(2)} ${(this.ph - top - line.h).toFixed(2)} cm /Im${idx} Do Q`);
            return;
        }
        const base = top + (line.h - line.size) / 2 + line.size * 0.8;
        const y = (this.ph - base).toFixed(2);
        let cx = x;
        line.segs.forEach((s) => {
            if (!s.space && s.t) {
                this.page.ops.push(`BT /${s.f} ${s.size.toFixed(2)} Tf ${this.rgb(s.color)} rg ${cx.toFixed(2)} ${y} Td ${this.P.pdfString(s.t)} Tj ET`);
                if (s.underline) this.page.ops.push(`${this.rgb(s.color)} RG 0.5 w ${cx.toFixed(2)} ${(this.ph - base - 1.6).toFixed(2)} m ${(cx + s.w).toFixed(2)} ${(this.ph - base - 1.6).toFixed(2)} l S`);
            }
            cx += s.w;
        });
    }

    drawLines(lines, x) {
        lines.forEach((line) => {
            this.ensure(line.h);
            if (this.pendingBullet) {
                const b = this.pendingBullet;
                this.pendingBullet = null;
                const marker = this.layoutRuns([{ text: b.text }], 60, line.size, { color: this.P.COLORS.text, lh: line.h })[0];
                this.drawLineAt(marker, b.x, this.y);
            }
            this.drawLineAt(line, line.raster && line.rtl ? x : x, this.y);
            this.y += line.h;
        });
    }

    renderBlocks(tokens, c) {
        (tokens || []).forEach((tok) => this.renderBlock(tok, c));
    }

    renderBlock(tok, c) {
        const P = this.P;
        switch (tok.type) {
            case 'space': return;
            case 'heading': {
                const size = { 1: 16, 2: 14, 3: 12.5, 4: 11.5, 5: 10.5, 6: 10 }[tok.depth] || 10.5;
                this.gap(tok.depth <= 2 ? 8 : 5);
                const lines = this.layoutRuns(this.P.inlineRuns(tok.tokens), c.w, size, { bold: true, color: c.color });
                this.ensure(lines[0] ? lines[0].h * 2 : 20);
                this.drawLines(lines, c.x);
                this.y += 3;
                return;
            }
            case 'paragraph':
            case 'text': {
                const runs = tok.tokens ? P.inlineRuns(tok.tokens) : [{ text: P.decodeEntities(tok.text || '') }];
                const lines = this.layoutRuns(runs, c.w, 10, { color: c.color, italic: c.italic });
                this.drawLines(lines, c.x);
                this.y += tok.type === 'paragraph' ? 5 : 1.5;
                return;
            }
            case 'list': {
                const start = Number(tok.start) || 1;
                const indent = tok.ordered ? 22 : 16;
                this.gap(1);
                tok.items.forEach((item, i) => {
                    const marker = tok.ordered ? `${start + i}.` : '\u2022';
                    this.pendingBullet = { text: marker, x: c.x + (tok.ordered ? 0 : 4) };
                    const children = item.tokens && item.tokens.length ? item.tokens : [{ type: 'text', text: item.text || '' }];
                    this.renderBlocks(children, { ...c, x: c.x + indent, w: c.w - indent });
                    this.pendingBullet = null;
                });
                this.y += 3;
                return;
            }
            case 'code': return this.renderCode(tok, c);
            case 'blockquote': {
                this.gap(2);
                this.pushBar(c.x, P.COLORS.rule.map((v) => v * 0.75), 2.4);
                this.renderBlocks(tok.tokens, { ...c, x: c.x + 12, w: c.w - 12, color: P.COLORS.quote, italic: true });
                this.popBar();
                this.y += 2;
                return;
            }
            case 'hr': {
                this.gap(4);
                this.ensure(8);
                this.page.ops.push(`${this.rgb(P.COLORS.rule)} RG 0.8 w ${c.x.toFixed(2)} ${(this.ph - this.y).toFixed(2)} m ${(c.x + c.w).toFixed(2)} ${(this.ph - this.y).toFixed(2)} l S`);
                this.y += 8;
                return;
            }
            case 'table': return this.renderTable(tok, c);
            case 'html': {
                const stripped = P.decodeEntities(String(tok.text || tok.raw || '').replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim());
                if (stripped) {
                    this.drawLines(this.layoutRuns([{ text: stripped }], c.w, 10, { color: c.color }), c.x);
                    this.y += 4;
                }
                return;
            }
            default:
                if (tok.tokens) this.renderBlocks(tok.tokens, c);
                else if (tok.text) this.drawLines(this.layoutRuns([{ text: P.decodeEntities(tok.text) }], c.w, 10, { color: c.color }), c.x);
        }
    }

    renderCode(tok, c) {
        const P = this.P;
        const size = 8.5, lh = 11.8, pad = 7;
        const innerW = c.w - 2 * pad;
        const perLine = Math.max(10, Math.floor(innerW / (size * 0.6)));
        const rows = [];
        P.cleanText(tok.text || '').split('\n').forEach((ln) => {
            const chars = Array.from(ln);
            if (chars.length === 0) { rows.push(''); return; }
            for (let i = 0; i < chars.length; i += perLine) rows.push(chars.slice(i, i + perLine).join(''));
        });
        this.gap(4);
        this.ensure(Math.min(rows.length, 3) * lh + 2 * pad + 10);
        this.region = { x: c.x, w: c.w, y: this.y, page: this.page, opsIndex: this.page.ops.length };
        this.y += pad;
        const lang = (tok.lang || '').split(/\s+/)[0];
        if (lang && !P.hasUnsupported(lang)) {
            const ll = this.layoutRuns([{ text: lang }], innerW, 7, { color: P.COLORS.muted, lh: 9 });
            this.drawLines(ll, c.x + pad);
            this.y += 1;
        }
        rows.forEach((row) => {
            const lines = this.layoutRuns([{ text: row }], innerW + 4, size, { mono: true, color: [0.12, 0.13, 0.16], lh, bg: P.COLORS.codeBg });
            lines.forEach((ln) => {
                this.ensure(lh);
                if (ln.raster) { ln.w = innerW; ln.h = lh; }
                this.drawLineAt(ln, c.x + pad, this.y);
                this.y += lh;
            });
        });
        this.y += pad;
        this.flushRegion(this.y);
        this.region = null;
        this.y += 6;
    }

    renderTable(tok, c) {
        const P = this.P;
        const cols = tok.header.length;
        if (!cols) return;
        const colW = c.w / cols;
        const pad = 4, size = 8.5;
        const rows = [tok.header.map((h) => ({ runs: P.inlineRuns(h.tokens), head: true })), ...tok.rows.map((r) => r.map((cell) => ({ runs: P.inlineRuns(cell.tokens), head: false })))];
        const pageInner = this.maxY - this.topY - 6;
        this.gap(4);
        rows.forEach((row) => {
            const cellLines = row.map((cell) => this.layoutRuns(cell.runs, colW - 2 * pad, size, { bold: cell.head, color: P.COLORS.text, lh: 11.5 }));
            let rowH = Math.max(...cellLines.map((ls) => ls.reduce((s, l) => s + l.h, 0))) + 2 * pad;
            if (rowH > pageInner) {
                const maxLines = Math.floor((pageInner - 2 * pad) / 11.5);
                cellLines.forEach((ls, i) => { cellLines[i] = ls.slice(0, maxLines); });
                rowH = pageInner;
            }
            this.ensure(rowH);
            const top = this.y;
            row.forEach((cell, i) => {
                const x = c.x + i * colW;
                if (cell.head) this.page.ops.push(`${this.rgb(P.COLORS.headBg)} rg ${x.toFixed(2)} ${(this.ph - top - rowH).toFixed(2)} ${colW.toFixed(2)} ${rowH.toFixed(2)} re f`);
                this.page.ops.push(`${this.rgb(P.COLORS.codeBorder)} RG 0.5 w ${x.toFixed(2)} ${(this.ph - top - rowH).toFixed(2)} ${colW.toFixed(2)} ${rowH.toFixed(2)} re S`);
                let ty = top + pad;
                cellLines[i].forEach((ln) => { this.drawLineAt(ln, x + pad, ty); ty += ln.h; });
            });
            this.y += rowH;
        });
        this.y += 6;
    }

    async build(conv, { onProgress, includeNotes }) {
        const P = this.P;
        const C = P.COLORS;
        const titleLines = this.layoutRuns([{ text: conv.title || 'Chat export' }], this.contentW, 19, { bold: true, color: C.text });
        this.drawLines(titleLines, this.mx);
        const model = conv.model ? ` · Model: ${conv.model}` : '';
        const meta = `Exported ${new Date().toLocaleString()} · ${conv.messages.length} message${conv.messages.length === 1 ? '' : 's'}${model}`;
        this.drawLines(this.layoutRuns([{ text: meta }], this.contentW, 8.5, { color: C.muted }), this.mx);
        this.y += 4;
        this.page.ops.push(`${this.rgb(C.rule)} RG 0.8 w ${this.mx} ${(this.ph - this.y).toFixed(2)} m ${(this.mx + this.contentW).toFixed(2)} ${(this.ph - this.y).toFixed(2)} l S`);
        this.y += 12;

        for (let i = 0; i < conv.messages.length; i++) {
            const m = conv.messages[i];
            const isUser = m.sender === 'user';
            this.gap(6);
            this.ensure(60);
            const label = isUser ? 'You' : 'ChatGPT';
            const time = Utils.formatTime(m.timestamp);
            const head = this.layoutRuns([{ text: label, bold: true, color: isUser ? C.user : C.ai }, { text: time ? `   ${time}` : '', color: C.muted }], this.contentW, 9, { lh: 14 });
            this.pushBar(this.mx, isUser ? C.user : C.ai);
            this.drawLines(head, this.mx + 10);
            this.y += 2;
            const text = P.prepareMessageText(m.text);
            const tokens = text ? P.lex(text) : [];
            this.renderBlocks(tokens, { x: this.mx + 10, w: this.contentW - 10, color: C.text });
            if (includeNotes && m.note) {
                this.renderBlock({ type: 'paragraph', tokens: [{ type: 'text', text: `Note: ${m.note}` }] }, { x: this.mx + 10, w: this.contentW - 10, color: C.muted, italic: true });
            }
            this.popBar();
            this.y += 8;
            if (onProgress) onProgress(i + 1, conv.messages.length);
            if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
        }
        this.title = conv.title || 'Chat export';
    }

    async finish() {
        const P = this.P;
        const total = this.pages.length;
        const footer = P.asciiTitle(this.title);
        this.pages.forEach((pg, i) => {
            const label = `Page ${i + 1} of ${total}`;
            const wl = P.textWidth(label, 'F1', 8);
            const gray = this.rgb(P.COLORS.muted);
            pg.ops.push(`${this.rgb(P.COLORS.rule)} RG 0.6 w ${this.mx} 44 m ${this.pw - this.mx} 44 l S`);
            pg.ops.push(`BT /F1 8 Tf ${gray} rg ${this.mx} 32 Td ${P.pdfString(footer)} Tj ET`);
            pg.ops.push(`BT /F1 8 Tf ${gray} rg ${(this.pw - this.mx - wl).toFixed(2)} 32 Td ${P.pdfString(label)} Tj ET`);
        });

        const enc = new TextEncoder();
        const chunks = [];
        const offsets = [];
        let length = 0;
        const push = (data) => { const b = typeof data === 'string' ? enc.encode(data) : data; chunks.push(b); length += b.length; };
        const beginObj = (id) => { offsets[id] = length; push(`${id} 0 obj\n`); };
        const canCompress = typeof CompressionStream !== 'undefined';

        const fonts = [
            ['F1', 'Helvetica'], ['F2', 'Helvetica-Bold'], ['F3', 'Helvetica-Oblique'], ['F4', 'Helvetica-BoldOblique'], ['F5', 'Courier']
        ];
        const fontBase = 3;
        const infoId = fontBase + fonts.length;
        const imgBase = infoId + 1;
        const pageBase = imgBase + this.images.length;
        const pageIds = this.pages.map((_, i) => pageBase + i * 2 + 1);

        push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
        beginObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
        beginObj(2); push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>\nendobj\n`);
        fonts.forEach(([, name], i) => {
            beginObj(fontBase + i);
            push(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>\nendobj\n`);
        });

        const now = new Date();
        const pd = (n) => String(n).padStart(2, '0');
        const date = `D:${now.getFullYear()}${pd(now.getMonth() + 1)}${pd(now.getDate())}${pd(now.getHours())}${pd(now.getMinutes())}${pd(now.getSeconds())}`;
        let hexTitle = 'FEFF';
        for (const unit of String(this.title).slice(0, 120)) {
            const cp = unit.codePointAt(0);
            if (cp > 0xFFFF) {
                const v = cp - 0x10000;
                hexTitle += (0xD800 + (v >> 10)).toString(16).padStart(4, '0') + (0xDC00 + (v & 0x3FF)).toString(16).padStart(4, '0');
            } else hexTitle += cp.toString(16).padStart(4, '0');
        }
        beginObj(infoId);
        push(`<< /Title <${hexTitle}> /Producer (ChatGPT Clone PDF Export) /Creator (ChatGPT Clone) /CreationDate (${date}) >>\nendobj\n`);

        this.images.forEach((img, i) => {
            beginObj(imgBase + i);
            push(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
            push(img.bytes);
            push('\nendstream\nendobj\n');
        });

        for (let i = 0; i < this.pages.length; i++) {
            const pg = this.pages[i];
            const contentId = pageBase + i * 2;
            const pageId = pageBase + i * 2 + 1;
            let data = enc.encode(pg.ops.join('\n'));
            let filter = '';
            if (canCompress) {
                try { data = await Utils._pipe(data, new CompressionStream('deflate')); filter = '/Filter /FlateDecode '; } catch (e) { data = enc.encode(pg.ops.join('\n')); filter = ''; }
            }
            beginObj(contentId);
            push(`<< ${filter}/Length ${data.length} >>\nstream\n`);
            push(data);
            push('\nendstream\nendobj\n');

            const xo = Array.from(pg.imgs.entries()).map(([name, idx]) => `/${name} ${imgBase + idx} 0 R`).join(' ');
            beginObj(pageId);
            push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pw} ${this.ph}] /Resources << /Font << ${fonts.map(([k], j) => `/${k} ${fontBase + j} 0 R`).join(' ')} >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${contentId} 0 R >>\nendobj\n`);
        }

        const maxId = pageBase + this.pages.length * 2 - 1;
        const xrefStart = length;
        let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
        for (let id = 1; id <= maxId; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
        push(xref);
        push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

        return { blob: new Blob(chunks, { type: 'application/pdf' }), pages: this.pages.length };
    }
}

window.PDFExport = PDFExport;
