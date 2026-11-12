// Production server: serves the built site from ./dist and keeps permanent per-track play counts.
// Counts live in a small JSON file. On Railway, mount a volume and point DATA_DIR at it (e.g. /data)
// so the numbers survive redeploys.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

let saving = false, dirty = false;
function save() {
  if (saving) { dirty = true; return; }
  saving = true;
  const tmp = FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(counts), (err) => {
    if (!err) fs.rename(tmp, FILE, () => finish()); else finish();
  });
  function finish() { saving = false; if (dirty) { dirty = false; save(); } }
}

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
