'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8787', 10);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'shares.json');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_BODY = parseInt(process.env.MAX_BODY || String(3 * 1024 * 1024), 10);
const MAX_MESSAGES = 5000;
const MAX_TEXT = 300000;
const MAX_TTL = 365 * 24 * 3600;
const CREATE_LIMIT = parseInt(process.env.CREATE_LIMIT || '40', 10);

let db = {};
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { db = {}; }

let writing = false;
let dirty = false;
function persist() {
    dirty = true;
    if (writing) return;
    writing = true;
    dirty = false;
    const tmp = DATA_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), (err) => {
        if (!err) fs.rename(tmp, DATA_FILE, () => { writing = false; if (dirty) persist(); });
        else { writing = false; console.error('persist failed', err.message); }
    });
}

const hits = new Map();
function rateLimited(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < 3600000);
    if (list.length >= CREATE_LIMIT) { hits.set(ip, list); return true; }
    list.push(now);
    hits.set(ip, list);
    return false;
}

function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

function send(res, status, body, extra = {}) {
    const headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        ...extra
    };
    if (body === null) { res.writeHead(status, headers); res.end(); return; }
    headers['Content-Type'] = 'application/json; charset=utf-8';
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch (e) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
        });
        req.on('error', reject);
    });
}

function validate(body) {
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) throw Object.assign(new Error('messages required'), { status: 400 });
    if (body.messages.length > MAX_MESSAGES) throw Object.assign(new Error('too many messages'), { status: 413 });
    return {
        title: String(body.title || 'Shared chat').slice(0, 120),
        model: String(body.model || '').slice(0, 80),
        sharedAt: new Date().toISOString(),
        messages: body.messages.map((m) => ({
            sender: m && m.sender === 'user' ? 'user' : 'assistant',
            text: String((m && m.text) || '').slice(0, MAX_TEXT),
            timestamp: String((m && m.timestamp) || '').slice(0, 40)
        }))
    };
}

function isExpired(rec) { return rec.expiresAt && Date.parse(rec.expiresAt) < Date.now(); }

function bearer(req) {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

function tokenOk(rec, token) {
    if (!token) return false;
    const a = Buffer.from(hashToken(token));
    const b = Buffer.from(rec.tokenHash);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const server = http.createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') return send(res, 204, null);
        const url = new URL(req.url, 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);

        if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'chat-share' });

        if (parts[0] !== 'api' || parts[1] !== 'shares') return send(res, 404, { error: 'Not found' });

        if (parts.length === 2 && req.method === 'POST') {
            const ip = req.socket.remoteAddress || 'unknown';
            if (rateLimited(ip)) return send(res, 429, { error: 'Too many links created. Try again later.' });
            const body = await readBody(req);
            const payload = validate(body);
            const ttl = Math.min(Math.max(parseInt(body.ttlSeconds || '0', 10) || 0, 0), MAX_TTL);
            let id;
            do { id = crypto.randomBytes(9).toString('base64url'); } while (db[id]);
            const token = crypto.randomBytes(24).toString('base64url');
            const expiresAt = ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null;
            db[id] = { payload, tokenHash: hashToken(token), createdAt: new Date().toISOString(), expiresAt };
            persist();
            return send(res, 201, { id, revokeToken: token, expiresAt });
        }

        if (parts.length === 3) {
            const id = parts[2];
            const rec = Object.prototype.hasOwnProperty.call(db, id) ? db[id] : null;

            if (req.method === 'GET') {
                if (!rec) return send(res, 404, { error: 'Not found' });
                if (isExpired(rec)) { delete db[id]; persist(); return send(res, 410, { error: 'Expired' }); }
                return send(res, 200, { ...rec.payload, expiresAt: rec.expiresAt });
            }

            if (req.method === 'PUT' || req.method === 'DELETE') {
                if (!rec) return send(res, 404, { error: 'Not found' });
                if (!tokenOk(rec, bearer(req))) return send(res, 403, { error: 'Invalid token' });
                if (req.method === 'DELETE') { delete db[id]; persist(); return send(res, 204, null); }
                const payload = validate(await readBody(req));
                rec.payload = payload;
                persist();
                return send(res, 200, { ok: true });
            }
        }

        return send(res, 405, { error: 'Method not allowed' });
    } catch (err) {
        return send(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
    }
});

setInterval(() => {
    let changed = false;
    Object.keys(db).forEach((id) => { if (isExpired(db[id])) { delete db[id]; changed = true; } });
    if (changed) persist();
}, 3600000).unref();

server.listen(PORT, () => console.log(`Share server listening on :${PORT}`));
