// Production server: serves the built site from ./dist and keeps permanent per-track play counts
// and the mini game's high score list.
// Counts live in a small JSON file. On Railway, mount a volume and point DATA_DIR at it (e.g. /data)
// so the numbers survive redeploys.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.DIST_DIR || path.join(root, 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(root, 'data');
const FILE = path.join(DATA_DIR, 'plays.json');
const PORT = Number(process.env.PORT) || 4173;
const TRACK_ID = /^ep-0[1-5]$/; // only the known EP tracks can be counted
const MIN_GAP_MS = 20000; // same visitor + same track: at most one count per 20 s

fs.mkdirSync(DATA_DIR, { recursive: true });
let counts = {};
try { counts = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }

// Small atomic JSON saver: writes to a temp file, then renames it over the real one.
function makeSaver(file, get) {
  let saving = false, dirty = false;
  return function save() {
    if (saving) { dirty = true; return; }
    saving = true;
    const tmp = file + '.tmp';
    fs.writeFile(tmp, JSON.stringify(get()), (err) => {
      if (!err) fs.rename(tmp, file, () => finish()); else finish();
    });
    function finish() { saving = false; if (dirty) { dirty = false; save(); } }
  };
}
const save = makeSaver(FILE, () => counts);

// ---- High scores ----
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
let scores = [];
try { scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')); } catch { /* first run */ }
const saveScores = makeSaver(SCORES_FILE, () => scores);
// Most a run can earn: 6 imps x (100 pass + 3x50 dodge) + 4 skulls x (100 pass + 3x100 dodge) + boss (1000 pass + 8x50 dodge).
const MAX_SCORE = 4500;
const runs = new Map(); // run id -> { t: start time, i: initials }; a run can be submitted once
const runGap = new Map(); // ip -> last run start
const BLOCKED = new Set(['ASS', 'CUM', 'DIK', 'FAG', 'FAP', 'FCK', 'FUC', 'FUK', 'HOE', 'KKK', 'NAZ', 'NGR', 'NIG', 'SEX', 'SHT', 'TIT', 'WTF', 'XXX', 'JIZ', 'PUS', 'CUK', 'FAK', 'FUX']);
const LEET = { 0: 'O', 1: 'I', 3: 'E', 4: 'A', 5: 'S', 7: 'T', 8: 'B' };
const blocked = (i) => BLOCKED.has(i.replace(/[0-9]/g, (d) => LEET[d] || d));
const topScores = () => scores.slice(0, 10).map(({ i, s }) => ({ i, s }));
function readJson(req, cb) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch { cb(null); } });
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

const recent = new Map(); // "ip|track" -> last counted time
setInterval(() => { const cutoff = Date.now() - MIN_GAP_MS; for (const [k, t] of recent) if (t < cutoff) recent.delete(k); }, 60000).unref();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/plays' && req.method === 'GET') return json(res, 200, counts);
  const m = url.pathname.match(/^\/api\/plays\/([\w-]+)$/);
  if (m && req.method === 'POST') {
    const id = m[1];
    if (!TRACK_ID.test(id)) return json(res, 404, { error: 'unknown track' });
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const key = ip + '|' + id, now = Date.now();
    if (now - (recent.get(key) || 0) >= MIN_GAP_MS) {
      recent.set(key, now);
      counts[id] = (counts[id] || 0) + 1;
      save();
    }
    return json(res, 200, { id, plays: counts[id] || 0 });
  }
  if (url.pathname === '/api/scores' && req.method === 'GET') return json(res, 200, { scores: topScores() });
  if (url.pathname === '/api/scores/run' && req.method === 'POST') {
    return readJson(req, (b) => {
      const initials = typeof b?.initials === 'string' ? b.initials.toUpperCase() : '';
      if (!/^[A-Z0-9]{3}$/.test(initials)) return json(res, 400, { error: 'initials' });
      if (blocked(initials)) return json(res, 400, { error: 'name' });
      const ip = clientIp(req), now = Date.now();
      if (now - (runGap.get(ip) || 0) < 1500) return json(res, 429, { error: 'slow down' });
      runGap.set(ip, now);
      if (runGap.size > 5000) runGap.delete(runGap.keys().next().value);
      const id = crypto.randomBytes(9).toString('base64url');
      runs.set(id, { t: now, i: initials });
      if (runs.size > 5000) runs.delete(runs.keys().next().value);
      json(res, 200, { run: id });
    });
  }
  if (url.pathname === '/api/scores' && req.method === 'POST') {
    return readJson(req, (b) => {
      const r = runs.get(b?.run);
      runs.delete(b?.run);
      const sc = b?.score, secs = r ? (Date.now() - r.t) / 1000 : 0;
      if (!r || !Number.isInteger(sc) || sc < 0 || sc > MAX_SCORE || secs < 4 || sc > 200 * secs + 100) return json(res, 400, { error: 'rejected' });
      let rank = 0;
      if (sc > 0) {
        const entry = { i: r.i, s: sc, t: Date.now() };
        scores.push(entry);
        scores.sort((a, c) => c.s - a.s || a.t - c.t);
        scores.length = Math.min(scores.length, 200);
        rank = scores.indexOf(entry) + 1;
        saveScores();
      }
      json(res, 200, { ok: true, rank, scores: topScores() });
    });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });

  let rel = decodeURIComponent(url.pathname);
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { if (path.extname(rel)) { res.writeHead(404); return res.end('Not found'); } file = path.join(DIST, 'index.html'); }
  const ext = path.extname(file).toLowerCase();
  const cache = file.includes(path.sep + 'assets' + path.sep) && /-[\w-]{8,}\./.test(path.basename(file)) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log('Age of Stellara on :' + PORT + ', data in ' + DATA_DIR));
