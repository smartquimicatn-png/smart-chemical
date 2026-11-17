import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import webpush from 'web-push';

const DB = path.join(process.env.DATA_DIR || '.', 'data.json');
const PUB = path.join(import.meta.dirname, 'public');
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : {};
db.users ??= [];
db.sessions ??= {};
db.vapid ??= webpush.generateVAPIDKeys();
const vapid = process.env.VAPID_PUBLIC
  ? { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE }
  : db.vapid;
webpush.setVapidDetails('mailto:admin@smart-chemical.invalid', vapid.publicKey, vapid.privateKey);
const save = () => fs.writeFileSync(DB, JSON.stringify(db));

const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const check = (pw, h) => {
  const [salt, k] = h.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash(pw, salt).split(':')[1], 'hex'), Buffer.from(k, 'hex'));
};

if (!db.users.some(u => u.admin)) {
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('hex');
  db.users.push({ pseudo: 'admin', pw: hash(pw), admin: true, phone: '', details: '', subs: [] });
  save();
  console.log(`Compte admin créé : pseudo=admin mot de passe=${pw}`);
}

const PSEUDO = /^[\p{L}\p{N} ._-]{1,30}$/u;
const pub = u => ({ pseudo: u.pseudo, phone: u.phone, details: u.details, admin: !!u.admin });
const err = (code, msg) => Object.assign(new Error(msg), { code });

const live = new Map(); // pseudo -> Set de réponses SSE (application Android ouverte)
const calls = new Map(); // "de>à" -> minuteurs des rappels en cours
const fails = new Map(); // ip -> [count, resetAt]; shortcut: in memory, reset on restart
const routes = {
  'POST /api/login': async (b) => {
    const u = db.users.find(x => x.pseudo === b.pseudo);
    if (!u || typeof b.password !== 'string' || !check(b.password, u.pw)) throw err(401, 'Pseudo ou mot de passe incorrect');
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions[token] = u.pseudo;
    save();
    return { token, me: pub(u), vapid: vapid.publicKey };
  },
  'GET /api/users': (b, me) => db.users.filter(u => u !== me).map(pub),
  'POST /api/subscribe': (b, me) => {
    if (!b.endpoint) throw err(400, 'Abonnement invalide');
    me.subs = me.subs.filter(s => s.endpoint !== b.endpoint).concat(b);
    save();
    return { ok: true };
  },
  'POST /api/call': async (b, me) => {
    const t = db.users.find(u => u.pseudo === b.pseudo);
    if (!t) throw err(404, 'Utilisateur introuvable');
    const body = JSON.stringify({ title: `📞 ${me.pseudo} t'appelle !`, body: `${me.pseudo} te demande de venir.` });
    const ring = async () => {
      let n = 0;
      for (const s of [...t.subs]) {
        try { await webpush.sendNotification(s, body, { TTL: 60, urgency: 'high' }); n++; }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) t.subs = t.subs.filter(x => x !== s); }
      }
      return n;
    };
    let sent = await ring();
    for (const r of live.get(t.pseudo) || []) { r.write(`data: ${JSON.stringify({ from: me.pseudo })}\n\n`); sent++; }
    // sonne 6 fois en tout (toutes les 5 s) pour qu'on ne rate pas l'appel
    const key = `${me.pseudo}>${t.pseudo}`;
    (calls.get(key) || []).forEach(clearTimeout);
    if (sent) calls.set(key, Array.from({ length: 5 }, (_, i) => setTimeout(() => ring().catch(() => {}), (i + 1) * 5000)));
    save();
    if (!sent) throw err(409, `${t.pseudo} n'a pas activé les notifications sur son téléphone`);
    return { sent };
  },
  // l'appelant arrête l'appel : plus de rappels, et la sonnerie s'arrête chez l'appelé
  'POST /api/cancel': async (b, me) => {
    const t = db.users.find(u => u.pseudo === b.pseudo);
    if (!t) throw err(404, 'Utilisateur introuvable');
    (calls.get(`${me.pseudo}>${t.pseudo}`) || []).forEach(clearTimeout);
    calls.delete(`${me.pseudo}>${t.pseudo}`);
    for (const r of live.get(t.pseudo) || []) r.write(`data: ${JSON.stringify({ cancel: true })}\n\n`);
    for (const s of [...t.subs]) await webpush.sendNotification(s, JSON.stringify({ cancel: true, from: me.pseudo }), { TTL: 60, urgency: 'high' }).catch(() => {});
    return { ok: true };
  },
  'POST /api/users': (b, me) => {
    admin(me);
    if (!PSEUDO.test(b.pseudo || '')) throw err(400, 'Pseudo invalide');
    if (db.users.some(u => u.pseudo === b.pseudo)) throw err(409, 'Pseudo déjà pris');
    if (!b.password || b.password.length < 4) throw err(400, 'Mot de passe : 4 caractères minimum');
    db.users.push({ pseudo: b.pseudo, pw: hash(b.password), phone: b.phone || '', details: b.details || '', subs: [] });
    save();
    return { ok: true };
  },
  'PUT /api/users': (b, me) => {
    admin(me);
    const u = db.users.find(x => x.pseudo === b.pseudo);
    if (!u) throw err(404, 'Utilisateur introuvable');
    u.phone = b.phone ?? u.phone;
    u.details = b.details ?? u.details;
    if (b.password) u.pw = hash(b.password);
    save();
    return { ok: true };
  },
  'DELETE /api/users': (b, me) => {
    admin(me);
    const u = db.users.find(x => x.pseudo === b.pseudo);
    if (!u || u.admin) throw err(400, 'Suppression impossible');
    db.users = db.users.filter(x => x !== u);
    for (const [t, p] of Object.entries(db.sessions)) if (p === u.pseudo) delete db.sessions[t];
    save();
    return { ok: true };
  },
};
const admin = me => { if (!me.admin) throw err(403, 'Réservé à l\'administrateur'); };

const TYPES = { html: 'text/html', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png' };

http.createServer(async (req, res) => {
  const send = (code, data, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type + '; charset=utf-8' });
    res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  };
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    try {
      const r = routes[`${req.method} ${url.pathname}`];
      if (!r && url.pathname !== '/api/events') throw err(404, 'Introuvable');
      if (url.pathname === '/api/events') {
        const m = db.users.find(u => u.pseudo === db.sessions[(req.headers.authorization || '').slice(7)]);
        if (!m) throw err(401, 'Session expirée');
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write(': ok\n\n');
        const set = live.get(m.pseudo) || live.set(m.pseudo, new Set()).get(m.pseudo);
        set.add(res);
        const hb = setInterval(() => res.write(': hb\n\n'), 25000);
        req.on('close', () => { clearInterval(hb); set.delete(res); });
        return;
      }
      let raw = '';
      for await (const c of req) { raw += c; if (raw.length > 1e5) throw err(413, 'Trop gros'); }
      const b = raw ? JSON.parse(raw) : {};
      let me;
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      if (url.pathname === '/api/login') {
        const f = fails.get(ip);
        if (f && f[1] > Date.now() && f[0] >= 10) throw err(429, 'Trop d\'essais, réessaie dans quelques minutes');
      } else {
        me = db.users.find(u => u.pseudo === db.sessions[(req.headers.authorization || '').slice(7)]);
        if (!me) throw err(401, 'Session expirée');
      }
      try { send(200, await r(b, me)); }
      catch (e) {
        if (url.pathname === '/api/login' && e.code === 401) {
          const f = fails.get(ip);
          fails.set(ip, f && f[1] > Date.now() ? [f[0] + 1, f[1]] : [1, Date.now() + 15 * 60e3]);
        }
        throw e;
      }
    } catch (e) {
      send(e.code || 400, { error: e.code ? e.message : 'Requête invalide' });
    }
    return;
  }
  const f = path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!f.startsWith(PUB + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(404, 'Introuvable', 'text/plain');
  send(200, fs.readFileSync(f), TYPES[path.extname(f).slice(1)] || 'application/octet-stream');
}).listen(process.env.PORT || 3000, () => console.log('Smart Chemical prêt'));
