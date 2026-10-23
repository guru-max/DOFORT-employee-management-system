'use strict';
/*
 * DOFORT WORLD - Employee joining system
 * Zero-dependency Node.js server (Node 22.13 or newer). Data is kept in a SQLite database file.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const F = require('./public/fields.js');
const exporter = require('./lib/exporter');
const { jpegInfo } = require('./lib/pdf');

const PORT = +process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- keys ----------
let SECRET = process.env.APP_SECRET;
if (!SECRET) {
  const kf = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(kf)) SECRET = fs.readFileSync(kf, 'utf8').trim();
  else { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(kf, SECRET, { mode: 0o600 }); }
}
const key = (label) => crypto.createHash('sha256').update(SECRET + ':' + label).digest();
const ENC_KEY = key('enc'), MAC_KEY = key('mac'), SESS_KEY = key('sess');
const hmac = (s) => crypto.createHmac('sha256', MAC_KEY).update(String(s)).digest('hex');
function enc(plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function dec(s) {
  if (!s) return '';
  try {
    const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (e) { return ''; }
}

// ---------- database ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'dofort.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
const PLAIN = F.FIELDS.filter((f) => f.key !== 'aadhaar' && f.key !== 'account_no').map((f) => f.key);
db.exec(`
CREATE TABLE IF NOT EXISTS employees(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted', admin_note TEXT NOT NULL DEFAULT '',
  ${PLAIN.map((k) => k + " TEXT NOT NULL DEFAULT ''").join(',\n  ')},
  aadhaar_enc TEXT, aadhaar_hash TEXT UNIQUE, aadhaar_last4 TEXT,
  account_enc TEXT, account_last4 TEXT,
  photo BLOB, photo_updated TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_emp_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_emp_created ON employees(created_at);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT, action TEXT, employee_id INTEGER, detail TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);
const getSetting = (k, d = '') => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const now = () => new Date().toISOString();
function audit(actor, action, employeeId, detail) {
  db.prepare('INSERT INTO audit(at,actor,action,employee_id,detail) VALUES(?,?,?,?,?)').run(now(), actor, action, employeeId || null, detail || '');
}

const COLS = ['id', 'code', 'status', 'admin_note', ...PLAIN, 'aadhaar_enc', 'aadhaar_last4', 'account_enc', 'account_last4', 'created_at', 'updated_at', 'created_by', 'updated_by', '(photo IS NOT NULL) AS has_photo', 'photo_updated'].join(',');

function toEmp(r, opts = {}) {
  const e = { id: r.id, code: r.code, status: r.status, admin_note: r.admin_note, created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by, updated_by: r.updated_by, has_photo: !!r.has_photo, photo_v: r.photo_updated || '' };
  PLAIN.forEach((k) => { e[k] = r[k]; });
  if (opts.full) { e.aadhaar = dec(r.aadhaar_enc); e.account_no = dec(r.account_enc); }
  else { e.aadhaar = 'XXXXXXXX' + (r.aadhaar_last4 || ''); e.account_no = 'XXXXXXXX' + (r.account_last4 || ''); e.aadhaar_masked = true; }
  return e;
}

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function send(res, code, body, headers = {}) {
  res.writeHead(code, Object.assign({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' }, headers));
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { const t = Buffer.concat(chunks).toString('utf8'); resolve(t ? JSON.parse(t) : {}); } catch (e) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
// Behind a hosting proxy the last X-Forwarded-For entry is the one the proxy added (the client cannot fake it).
const ipOf = (req) => ((req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '?');
const hits = new Map();
function limited(bucket, ip, max, windowMs) {
  const k = bucket + ':' + ip, t = Date.now(), arr = (hits.get(k) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) { hits.set(k, arr); return true; }
  arr.push(t); hits.set(k, arr); return false;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (!v.some((x) => t - x < 3600000)) hits.delete(k); }, 600000).unref();

function parseCookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
function signSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 3600000, v: getSetting('sess_ver', '1') })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', SESS_KEY).update(payload).digest('base64url');
}
function isAdmin(req) {
  const c = parseCookies(req).dfw_admin; if (!c) return false;
  const [p, s] = c.split('.'); if (!p || !s) return false;
  const good = crypto.createHmac('sha256', SESS_KEY).update(p).digest('base64url');
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return false;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() && o.v === getSetting('sess_ver', '1'); } catch (e) { return false; }
}
const DEFAULT_PW = 'Admin@123';
function checkPassword(pw) {
  const stored = getSetting('admin_pw');
  if (stored) {
    const [salt, hash] = stored.split(':'); const h = crypto.scryptSync(pw, salt, 32).toString('hex');
    return h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
  }
  const want = process.env.ADMIN_PASSWORD || DEFAULT_PW;
  const a = crypto.createHash('sha256').update(pw).digest(), b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}
const usingDefaultPassword = () => !getSetting('admin_pw') && !process.env.ADMIN_PASSWORD;

function parsePhoto(s) {
  if (typeof s !== 'string') return null;
  const m = /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/.exec(s); if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 500 || buf.length > 2 * 1024 * 1024 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  try { const i = jpegInfo(buf); if (i.w > 4000 || i.h > 4000 || i.w < 50 || i.h < 50) return null; } catch (e) { return null; }
  return buf;
}
const newToken = () => crypto.randomBytes(18).toString('base64url');

// ---------- employee operations ----------
function createEmployee(body, actor, extra = {}) {
  const errors = F.validate(body), photo = parsePhoto(body.photo);
  if (!photo) errors.photo = body.photo ? 'The photo could not be read. Please choose another photo.' : 'Photo is required';
  if (Object.keys(errors).length) return { status: 400, body: { error: 'validation', errors } };
  const d = F.normalize(body);
  if (db.prepare('SELECT 1 FROM employees WHERE aadhaar_hash=?').get(hmac(d.aadhaar))) return { status: 409, body: { error: 'duplicate', message: 'A form with this Aadhaar number is already submitted. Use "Find my form" to open and edit it.' } };
  const t = now(), token = newToken();
  const cols = [...PLAIN, 'aadhaar_enc', 'aadhaar_hash', 'aadhaar_last4', 'account_enc', 'account_last4', 'token', 'photo', 'photo_updated', 'status', 'created_at', 'updated_at', 'created_by', 'updated_by'];
  const vals = [...PLAIN.map((k) => d[k]), enc(d.aadhaar), hmac(d.aadhaar), d.aadhaar.slice(-4), enc(d.account_no), d.account_no.slice(-4), token, photo, t, extra.status || 'Submitted', t, t, actor, actor];
  const r = db.prepare(`INSERT INTO employees(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...vals);
  const id = Number(r.lastInsertRowid), code = 'DFW-' + String(id).padStart(4, '0');
  db.prepare('UPDATE employees SET code=? WHERE id=?').run(code, id);
  audit(actor, 'create', id, d.name);
  return { status: 201, body: { ok: true, id, code, token } };
}

function updateEmployee(id, body, actor, byEmployee) {
  const row = db.prepare('SELECT id,status,aadhaar_hash FROM employees WHERE id=?').get(id);
  if (!row) return { status: 404, body: { error: 'Not found' } };
  const errors = F.validate(body);
  let photo = null;
  if (body.photo) { photo = parsePhoto(body.photo); if (!photo) errors.photo = 'The photo could not be read. Please choose another photo.'; }
  if (Object.keys(errors).length) return { status: 400, body: { error: 'validation', errors } };
  const d = F.normalize(body), h = hmac(d.aadhaar);
  const dup = db.prepare('SELECT id FROM employees WHERE aadhaar_hash=? AND id<>?').get(h, id);
  if (dup) return { status: 409, body: { error: 'duplicate', message: 'Another record already uses this Aadhaar number.' } };
  const sets = [...PLAIN.map((k) => k + '=?'), 'aadhaar_enc=?', 'aadhaar_hash=?', 'aadhaar_last4=?', 'account_enc=?', 'account_last4=?', 'updated_at=?', 'updated_by=?'];
  const vals = [...PLAIN.map((k) => d[k]), enc(d.aadhaar), h, d.aadhaar.slice(-4), enc(d.account_no), d.account_no.slice(-4), now(), actor];
  if (photo) { sets.push('photo=?', 'photo_updated=?'); vals.push(photo, now()); }
  let newStatus = row.status;
  if (byEmployee && ['Approved', 'Rejected', 'Needs Correction', 'Under Review'].includes(row.status)) newStatus = 'Resubmitted';
  if (newStatus !== row.status) { sets.push('status=?'); vals.push(newStatus); }
  db.prepare(`UPDATE employees SET ${sets.join(',')} WHERE id=?`).run(...vals, id);
  audit(actor, 'update', id, (photo ? 'photo changed; ' : '') + (newStatus !== row.status ? `status ${row.status} -> ${newStatus}` : ''));
  return { status: 200, body: { ok: true, status: newStatus } };
}

function byToken(token) { if (!token || token.length < 10) return null; return db.prepare(`SELECT ${COLS} FROM employees WHERE token=?`).get(token); }

function whereFrom(q) {
  const w = [], p = [];
  if (q.status && F.STATUSES.includes(q.status)) { w.push('status=?'); p.push(q.status); }
  if (q.ids) { const ids = String(q.ids).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000); w.push(`id IN (${ids.map(() => '?').join(',') || 'NULL'})`); p.push(...ids); }
  if (q.q && q.q.trim()) {
    const s = q.q.trim();
    if (/^\d{12}$/.test(s)) { w.push('aadhaar_hash=?'); p.push(hmac(s)); }
    else {
      const like = '%' + s.replace(/[%_\\]/g, '') + '%';
      w.push('(name LIKE ? OR code LIKE ? OR contact1 LIKE ? OR contact2 LIKE ? OR designation LIKE ? OR district LIKE ? OR father_name LIKE ? OR company_name LIKE ? OR aadhaar_last4=? OR pf_no LIKE ? OR esic_no LIKE ?)');
      p.push(like, like, like, like, like, like, like, like, s, like, like);
    }
  }
  const ffrom = F.toIsoDate(q.from) || q.from;
  const fto = F.toIsoDate(q.to) || q.to;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ffrom || '')) { w.push("date(created_at,'+330 minutes')>=?"); p.push(ffrom); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(fto || '')) { w.push("date(created_at,'+330 minutes')<=?"); p.push(fto); }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', p };
}
const SORTS = ['created_at', 'updated_at', 'name', 'status', 'doj', 'designation', 'code', 'district'];
function filterText(q) {
  const t = []; if (q.status) t.push('Status: ' + q.status); if (q.q) t.push('Search: ' + q.q); if (q.from) t.push('From ' + F.dmy(q.from)); if (q.to) t.push('To ' + F.dmy(q.to));
  return t.join(', ');
}
function fileName(base, ext) { return `${base}_${new Date(Date.now() + 19800000).toISOString().slice(0, 10)}.${ext}`; }
function download(res, out, name) {
  send(res, 200, out.buf, { 'Content-Type': out.type, 'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store', 'Content-Length': out.buf.length });
}
function photoOf(id) { const r = db.prepare('SELECT photo FROM employees WHERE id=?').get(id); return r && r.photo ? Buffer.from(r.photo) : null; }
function slug(s) { return String(s || 'employee').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'employee'; }

// ---------- request handling ----------
async function handleApi(req, res, url) {
  const p = url.pathname, m = req.method, q = Object.fromEntries(url.searchParams), ip = ipOf(req);
  if (['POST', 'PUT', 'DELETE'].includes(m) && !/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'JSON required' });

  if (p === '/api/health') return json(res, 200, { ok: true });
  if (p === '/api/config' && m === 'GET') return json(res, 200, { open: getSetting('form_open', '1') === '1', notice: getSetting('form_notice', ''), company: getSetting('default_company', '') });

  // ----- public: employee -----
  if (p === '/api/employee' && m === 'POST') {
    if (limited('create', ip, 30, 3600000)) return json(res, 429, { error: 'Too many submissions from this network. Please try again later.' });
    if (getSetting('form_open', '1') !== '1') return json(res, 403, { error: 'This form is currently closed. Please contact the company.' });
    const body = await readBody(req);
    if (body.consent !== true) return json(res, 400, { error: 'validation', errors: { consent: 'Please confirm the declaration' } });
    const r = createEmployee(body, 'employee');
    return json(res, r.status, r.body);
  }
  if (p === '/api/employee/me') {
    const row = byToken(req.headers['x-edit-token'] || q.token);
    if (!row) return json(res, 404, { error: 'Form not found' });
    if (m === 'GET') return json(res, 200, { employee: toEmp(row, { full: true }) });
    if (m === 'PUT') {
      if (limited('edit', ip, 60, 3600000)) return json(res, 429, { error: 'Too many requests. Try again later.' });
      const r = updateEmployee(row.id, await readBody(req), 'employee:' + row.code, true);
      return json(res, r.status, r.body);
    }
  }
  if (p === '/api/employee/find' && m === 'POST') {
    if (limited('find', ip, 10, 900000)) return json(res, 429, { error: 'Too many attempts. Please wait 15 minutes.' });
    const b = await readBody(req), c = F.digits(b.contact), dob = F.toIsoDate(b.dob) || String(b.dob || '');
    const row = /^\d{10}$/.test(c) && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? db.prepare('SELECT token,code FROM employees WHERE (contact1=? OR contact2=?) AND dob=? ORDER BY id DESC').get(c, c, dob) : null;
    if (!row) return json(res, 404, { error: 'No form found with these details. Check the mobile number and date of birth.' });
    return json(res, 200, { token: row.token, code: row.code });
  }
  if (p === '/api/employee/me/export' && m === 'GET') {
    const row = byToken(req.headers['x-edit-token'] || q.token);
    if (!row) return json(res, 404, { error: 'Form not found' });
    const fmt = q.format === 'docx' ? 'docx' : 'pdf', e = toEmp(row, { full: true });
    const out = exporter.profile(fmt, e, photoOf(row.id));
    return download(res, out, `${slug(e.name)}_${e.code}.${fmt}`);
  }
  let mm;
  if ((mm = /^\/api\/photo\/(\d+)$/.exec(p)) && m === 'GET') {
    const id = +mm[1]; let ok = isAdmin(req);
    if (!ok) { const row = byToken(q.token); ok = !!row && row.id === id; }
    if (!ok) return json(res, 403, { error: 'Not allowed' });
    const b = photoOf(id); if (!b) return json(res, 404, { error: 'No photo' });
    return send(res, 200, b, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' });
  }

  // ----- admin auth -----
  if (p === '/api/admin/login' && m === 'POST') {
    if (limited('login', ip, 8, 900000)) return json(res, 429, { error: 'Too many attempts. Please wait 15 minutes.' });
    const b = await readBody(req);
    if (typeof b.password !== 'string' || !checkPassword(b.password)) { audit('admin', 'login_failed', null, ip); return json(res, 401, { error: 'Incorrect password' }); }
    audit('admin', 'login', null, ip);
    const secure = (req.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `dfw_admin=${signSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
    return json(res, 200, { ok: true, defaultPassword: usingDefaultPassword() });
  }
  if (p === '/api/admin/logout' && m === 'POST') { res.setHeader('Set-Cookie', 'dfw_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }

  if (!p.startsWith('/api/admin/')) return json(res, 404, { error: 'Not found' });
  if (!isAdmin(req)) return json(res, 401, { error: 'Please sign in' });

  // ----- admin -----
  if (p === '/api/admin/me') return json(res, 200, { ok: true, defaultPassword: usingDefaultPassword() });

  if (p === '/api/admin/stats') {
    const c = (sql, ...a) => db.prepare(sql).get(...a).n;
    const byStatus = {}; db.prepare('SELECT status, COUNT(*) n FROM employees GROUP BY status').all().forEach((r) => { byStatus[r.status] = r.n; });
    const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
    const days = db.prepare("SELECT date(created_at,'+330 minutes') d, COUNT(*) n FROM employees WHERE date(created_at,'+330 minutes')>=date(?,'-13 days') GROUP BY d").all(today);
    return json(res, 200, { total: c('SELECT COUNT(*) n FROM employees'), today: c("SELECT COUNT(*) n FROM employees WHERE date(created_at,'+330 minutes')=?", today), byStatus, days, date: today });
  }

  if (p === '/api/admin/employees' && m === 'GET') {
    const w = whereFrom(q), sort = SORTS.includes(q.sort) ? q.sort : 'created_at', dir = q.dir === 'asc' ? 'ASC' : 'DESC';
    const size = Math.min(200, Math.max(5, +q.size || 25)), page = Math.max(1, +q.page || 1);
    const total = db.prepare(`SELECT COUNT(*) n FROM employees ${w.sql}`).get(...w.p).n;
    const rows = db.prepare(`SELECT ${COLS} FROM employees ${w.sql} ORDER BY ${sort} ${dir}, id DESC LIMIT ? OFFSET ?`).all(...w.p, size, (page - 1) * size);
    return json(res, 200, { total, page, size, rows: rows.map((r) => toEmp(r)) });
  }
  if (p === '/api/admin/employees' && m === 'POST') {
    const r = createEmployee(await readBody(req), 'admin');
    return json(res, r.status, r.body);
  }
  if (p === '/api/admin/export' && m === 'GET') {
    const fmt = ['xlsx', 'pdf', 'docx', 'csv'].includes(q.format) ? q.format : 'xlsx', w = whereFrom(q);
    const rows = db.prepare(`SELECT ${COLS} FROM employees ${w.sql} ORDER BY created_at DESC, id DESC LIMIT 20000`).all(...w.p);
    const emps = rows.map((r) => toEmp(r, { full: q.mask !== '1' }));
    audit('admin', 'export', null, `${fmt} ${emps.length} records${q.mask === '1' ? ' (masked)' : ''}`);
    return download(res, exporter.list(fmt, emps, { filter: filterText(q) }), fileName('DOFORT_Employees', fmt));
  }
  if (p === '/api/admin/audit' && m === 'GET') {
    const lim = Math.min(500, +q.limit || 200);
    const rows = q.employee_id ? db.prepare('SELECT * FROM audit WHERE employee_id=? ORDER BY id DESC LIMIT ?').all(+q.employee_id, lim) : db.prepare('SELECT a.*, e.code FROM audit a LEFT JOIN employees e ON e.id=a.employee_id ORDER BY a.id DESC LIMIT ?').all(lim);
    return json(res, 200, { rows });
  }
  if (p === '/api/admin/settings') {
    if (m === 'GET') return json(res, 200, { form_open: getSetting('form_open', '1') === '1', form_notice: getSetting('form_notice', ''), default_company: getSetting('default_company', '') });
    if (m === 'PUT') {
      const b = await readBody(req);
      setSetting('form_open', b.form_open ? '1' : '0'); setSetting('form_notice', String(b.form_notice || '').slice(0, 300)); setSetting('default_company', String(b.default_company || '').slice(0, 120));
      audit('admin', 'settings', null, `form_open=${b.form_open ? 1 : 0}`);
      return json(res, 200, { ok: true });
    }
  }
  if (p === '/api/admin/password' && m === 'POST') {
    const b = await readBody(req);
    if (!checkPassword(String(b.current || ''))) return json(res, 400, { error: 'Current password is incorrect' });
    if (typeof b.next !== 'string' || b.next.length < 8) return json(res, 400, { error: 'New password must be at least 8 characters' });
    const salt = crypto.randomBytes(16).toString('hex');
    setSetting('admin_pw', salt + ':' + crypto.scryptSync(b.next, salt, 32).toString('hex'));
    setSetting('sess_ver', String(+getSetting('sess_ver', '1') + 1));
    audit('admin', 'password', null, '');
    const secure = (req.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `dfw_admin=${signSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/backup' && m === 'GET') {
    const tmp = path.join(DATA_DIR, 'backup-' + Date.now() + '.db');
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(tmp); fs.unlinkSync(tmp);
    audit('admin', 'backup', null, '');
    return download(res, { buf, type: 'application/octet-stream' }, fileName('dofort-backup', 'db'));
  }
  if (p === '/api/admin/bulk' && m === 'POST') {
    const b = await readBody(req), ids = (b.ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000);
    if (!ids.length) return json(res, 400, { error: 'Nothing selected' });
    const ph = ids.map(() => '?').join(',');
    if (b.action === 'status' && F.STATUSES.includes(b.status)) {
      db.prepare(`UPDATE employees SET status=?, updated_at=?, updated_by='admin' WHERE id IN (${ph})`).run(b.status, now(), ...ids);
      audit('admin', 'bulk_status', null, `${ids.length} -> ${b.status}`);
      return json(res, 200, { ok: true, count: ids.length });
    }
    if (b.action === 'delete') {
      db.prepare(`DELETE FROM employees WHERE id IN (${ph})`).run(...ids);
      audit('admin', 'bulk_delete', null, `${ids.length} records`);
      return json(res, 200, { ok: true, count: ids.length });
    }
    return json(res, 400, { error: 'Unknown action' });
  }
  if ((mm = /^\/api\/admin\/employees\/(\d+)(\/status|\/export)?$/.exec(p))) {
    const id = +mm[1], sub = mm[2];
    const row = db.prepare(`SELECT ${COLS} FROM employees WHERE id=?`).get(id);
    if (!row) return json(res, 404, { error: 'Not found' });
    if (!sub && m === 'GET') {
      audit('admin', 'view', id, 'full details');
      const hist = db.prepare('SELECT at,actor,action,detail FROM audit WHERE employee_id=? AND action<>? ORDER BY id DESC LIMIT 40').all(id, 'view');
      return json(res, 200, { employee: toEmp(row, { full: true }), history: hist });
    }
    if (!sub && m === 'PUT') {
      const b = await readBody(req), r = updateEmployee(id, b, 'admin', false);
      if (r.status === 200 && typeof b.admin_note === 'string') db.prepare('UPDATE employees SET admin_note=? WHERE id=?').run(b.admin_note.slice(0, 500), id);
      if (r.status === 200 && F.STATUSES.includes(b.status) && b.status !== row.status) { db.prepare('UPDATE employees SET status=? WHERE id=?').run(b.status, id); audit('admin', 'status', id, `${row.status} -> ${b.status}`); }
      return json(res, r.status, r.body);
    }
    if (!sub && m === 'DELETE') { db.prepare('DELETE FROM employees WHERE id=?').run(id); audit('admin', 'delete', id, row.name); return json(res, 200, { ok: true }); }
    if (sub === '/status' && m === 'POST') {
      const b = await readBody(req);
      if (!F.STATUSES.includes(b.status)) return json(res, 400, { error: 'Invalid status' });
      db.prepare('UPDATE employees SET status=?, admin_note=?, updated_at=?, updated_by=? WHERE id=?').run(b.status, String(b.note || '').slice(0, 500), now(), 'admin', id);
      audit('admin', 'status', id, `${row.status} -> ${b.status}${b.note ? ': ' + String(b.note).slice(0, 120) : ''}`);
      return json(res, 200, { ok: true });
    }
    if (sub === '/export' && m === 'GET') {
      const fmt = q.format === 'docx' ? 'docx' : 'pdf', e = toEmp(row, { full: q.mask !== '1' });
      audit('admin', 'export', id, `${fmt} profile`);
      return download(res, exporter.profile(fmt, e, photoOf(id)), `${slug(e.name)}_${e.code}.${fmt}`);
    }
  }
  return json(res, 404, { error: 'Not found' });
}

const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html'; else if (p === '/admin') p = '/admin.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  const ext = path.extname(file);
  const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  if (ext === '.html') h['Content-Security-Policy'] = CSP;
  send(res, 200, fs.readFileSync(file), h);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else send(res, 405, 'Method not allowed');
  } catch (e) {
    if (e && e.status) return json(res, e.status, { error: e.message });
    console.error(e); if (!res.headersSent) json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
});
server.listen(PORT, () => {
  console.log(`DOFORT WORLD employee system running on port ${PORT}`);
  console.log(`Data folder: ${DATA_DIR}`);
  if (usingDefaultPassword()) console.log('WARNING: using the default admin password "' + DEFAULT_PW + '". Set ADMIN_PASSWORD or change it in Settings.');
});
