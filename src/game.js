// Into the Jaws — a small NES-style platformer for the Age of Stellara site.
// Drawn at the NES resolution (256x240) and scaled up with crisp pixels.
// Mechanics: run, variable-height jump, fire, 3 hits per life, 3 lives, checkpoints,
// imps that throw fire, flaming skulls that charge, and a large demon guarding the gate.

const T = 16, W = 256, H = 240, ROWS = 15, STEP = 1000 / 60;

const C = {
  sky0: '#0c0303', sky1: '#5a1a0c', sky2: '#f0862c',
  flame: '#070202', flameEdge: '#b8481c',
  spire: '#241433', spireEdge: '#6f66c9',
  earth: '#2b100d', rust: '#8a4422', rust2: '#c97a3a',
  rock: '#0e0807', hi: '#d9cfc4', mid: '#6d625a', k: '#050304',
  red: '#ff3d43', deep: '#8f1d1d', bone: '#eadfce', amber: '#ffb547',
};

// ---------- Level ----------
function buildLevel() {
  const LW = 200;
  const g = Array.from({ length: ROWS }, () => Array(LW).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && x < LW && y >= 0 && y < ROWS) g[y][x] = c; };
  const rect = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const ground = (x0, x1, top = 12) => { rect(x0, x1, top, top, '='); rect(x0, x1, top + 1, ROWS - 1, '#'); };
  const spawns = [];
  const sp = (type, x, row) => spawns.push({ type, tx: x, row });

  rect(0, 0, 0, 11, '#');
  ground(0, 30); sp('imp', 24, 11);
  ground(33, 60); rect(40, 41, 10, 11, '#'); rect(45, 49, 8, 8, '#'); sp('soul', 47, 5);
  rect(54, 56, 11, 11, '^'); sp('imp', 58, 11);
  rect(63, 64, 10, 10, '#');
  ground(67, 75); ground(76, 95, 10); sp('orb', 78, 9); sp('imp', 84, 9); sp('imp', 92, 9);
  rect(98, 98, 10, 10, '#');
  ground(101, 120); rect(104, 108, 10, 10, '#'); rect(112, 116, 8, 8, '#');
  sp('soul', 106, 5); sp('soul', 118, 4); rect(109, 111, 11, 11, '^');
  ground(123, 150); rect(130, 130, 10, 11, '#'); rect(134, 136, 10, 10, '#'); rect(138, 139, 9, 11, '#');
  sp('imp', 127, 11); sp('imp', 146, 11); sp('orb', 143, 11); sp('soul', 135, 6);
  rect(153, 153, 10, 10, '#');
  ground(156, LW - 1); rect(LW - 1, LW - 1, 0, 11, '#'); sp('baron', 182, 11);
  return { g, LW, spawns, gate: { x: 194 * T, y: 9 * T, w: 2 * T, h: 3 * T, open: false }, checkpoints: [2, 67, 124, 157] };
}

// ---------- Sprites ----------
const SPR = {
  player: [
    '...rrrr...', '..rkkkkr..', '.rkkkkkkr.', '.rkkkkkkr.', '.rkkkkkkr.', '..rkkkkr..', '.rrkkkkrr.',
    'rkkkddkkkr', 'rkrkkkkrkr', 'rkrkddkrkr', '.rkkkkkkr.', '.rkkrrkkr.', '.rkr..rkr.', '.rr....rr.',
  ],
  playerRun: [
    '...rrrr...', '..rkkkkr..', '.rkkkkkkr.', '.rkkkkkkr.', '.rkkkkkkr.', '..rkkkkr..', '.rrkkkkrr.',
    'rkkkddkkkr', 'rkrkkkkrkr', 'rkrkddkrkr', '.rkkkkkkr.', '.rkkkrkkr.', 'rkkr.rkkr.', 'rr....rr..',
  ],
  imp: [
    'm..........m', 'hm........mh', '.hkkkkkkkkh.', '.kkkkkkkkkk.', '.kkrkkkkrkk.', '.kkkkkkkkkk.',
    '..kkkwwkkk..', '..kkkkkkkk..', '.hkkkkkkkkh.', 'hkkkkkkkkkkh', 'kk.kkkkkk.kk', 'k..kkkkkk..k',
    '...kkkkkk...', '...kk..kk...', '..kkk..kkk..', '..hh....hh..',
  ],
  soul: [
    '...wwwwww...', '..wwwwwwww..', '.wwwwwwwwww.', '.wkkwwwwkkw.', '.wkrwwwwrkw.', '.wkkwwwwkkw.',
    '.wwwwkkwwww.', '..wwwwwwww..', '..wkwkwkww..', '...wwwwww...',
  ],
};
const PAL = {
  player: { r: C.red, k: C.k, d: C.deep },
  imp: { m: C.mid, h: C.hi, k: C.k, r: C.red, w: C.bone },
  baron: { m: C.deep, h: C.red, k: C.k, r: C.amber, w: C.bone },
  soul: { w: C.bone, k: C.k, r: C.red },
};

// ---------- Game ----------
export function mountGame(canvas, { onStart } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // Background pieces, generated once.
  const flames = Array.from({ length: 14 }, (_, i) => ({ x: i * 40 + rnd(0, 20), w: rnd(14, 28), h: rnd(40, 95), lean: rnd(-14, 14) }));
  const spires = Array.from({ length: 10 }, (_, i) => ({ x: i * 60 + rnd(0, 30), w: rnd(16, 30), h: rnd(30, 62) }));
  const frame = makeFrame();

  // Sound (created on first start, which is always a user gesture).
  let ac = null, master = null;
  const tone = (type, f0, f1, dur, vol = 1) => {
    if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn).connect(master); o.start(t); o.stop(t + dur);
  };
  const noise = (dur, vol = 1, freq = 900) => {
    if (!ac) return;
    const t = ac.currentTime, len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq;
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(gn).connect(master); s.start(t);
  };
  const sfx = {
    jump: () => tone('square', 180, 420, 0.12, 0.5),
    shoot: () => { noise(0.14, 0.9, 700); tone('square', 110, 50, 0.1, 0.4); },
    hit: () => tone('square', 320, 140, 0.07, 0.4),
    kill: () => { noise(0.3, 0.9, 400); tone('sawtooth', 180, 30, 0.3, 0.4); },
    hurt: () => tone('sawtooth', 200, 50, 0.3, 0.6),
    pickup: () => { tone('square', 520, 1040, 0.12, 0.4); },
    charge: () => tone('triangle', 600, 200, 0.25, 0.4),
    roar: () => { tone('sawtooth', 90, 40, 0.9, 0.7); noise(0.9, 0.5, 200); },
    gate: () => tone('triangle', 70, 220, 1.2, 0.6),
    die: () => tone('square', 400, 40, 0.9, 0.5),
  };

  // Input
  const held = {}, pressed = {};
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'fire', KeyJ: 'fire', Enter: 'start' };
  const press = (k, v) => { if (v && !held[k]) pressed[k] = true; held[k] = v; };
  const onKey = (e) => {
    const k = KEYS[e.code]; if (!k) return;
    e.preventDefault(); press(k, e.type === 'keydown');
  };
  const onBlur = () => { for (const k in held) held[k] = false; if (state === 'play') paused = true; };
  const onClick = () => { canvas.focus(); pressed.start = true; };
  canvas.addEventListener('keydown', onKey); canvas.addEventListener('keyup', onKey);
  canvas.addEventListener('blur', onBlur); canvas.addEventListener('pointerdown', onClick);

  // World state
  let L, p, enemies, shots, parts, orbs, camX, state = 'title', paused = false, lives, score, timer = 0, cp, tick = 0;

  const tileAt = (tx, ty) => (tx < 0 || tx >= L.LW) ? '#' : (ty < 0 || ty >= ROWS) ? '.' : L.g[ty][tx];
  const solid = (c) => c === '#' || c === '=';
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const hitTile = (b) => {
    const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T), y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tileAt(tx, ty))) return { tx, ty };
    return null;
  };
  const move = (b, dx, dy) => {
    let hitX = false, hitY = false, c;
    b.x += dx; c = hitTile(b);
    if (c) { b.x = dx > 0 ? c.tx * T - b.w : (c.tx + 1) * T; hitX = true; }
    b.y += dy; b.onGround = false; c = hitTile(b);
    if (c) { if (dy > 0) { b.y = c.ty * T - b.h; b.onGround = true; } else b.y = (c.ty + 1) * T; hitY = true; }
    return { hitX, hitY };
  };
  const groundY = (tx) => { for (let ty = 0; ty < ROWS; ty++) if (solid(tileAt(tx, ty))) return ty * T; return 12 * T; };

  function newGame() {
    L = buildLevel(); lives = 3; score = 0; cp = 0;
    enemies = []; orbs = [];
    for (const s of L.spawns) {
      const x = s.tx * T, bottom = (s.row + 1) * T;
      if (s.type === 'imp') enemies.push({ type: 'imp', x, y: bottom - 16, w: 12, h: 16, vx: -0.5, vy: 0, hp: 2, t: rnd(40, 120), flash: 0, face: -1 });
      if (s.type === 'soul') enemies.push({ type: 'soul', x, y: s.row * T, by: s.row * T, w: 12, h: 10, hp: 1, t: rnd(30, 90), ph: rnd(0, 6), mode: 'float', flash: 0 });
      if (s.type === 'baron') enemies.push({ type: 'baron', x, y: bottom - 30, w: 22, h: 30, vx: 0, vy: 0, hp: 14, t: 60, jt: 140, active: false, flash: 0, face: -1 });
      if (s.type === 'orb') orbs.push({ x: x + 4, y: bottom - 12, w: 8, h: 8, taken: false });
    }
    spawnPlayer();
  }
  function spawnPlayer() {
    const tx = L.checkpoints[cp];
    p = { x: tx * T + 3, y: groundY(tx) - 14, w: 10, h: 14, vx: 0, vy: 0, face: 1, onGround: false, hp: 3, inv: 90, cool: 0, coyote: 0, buf: 0, run: 0 };
    shots = []; parts = [];
  }
  const burst = (x, y, n, colors) => { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-1.6, 1.6), vy: rnd(-2.4, 0.4), life: rnd(18, 36), c: colors[i % colors.length] }); };
  const fire = (x, y, vx, vy) => shots.push({ x: x - 3, y: y - 3, w: 6, h: 6, vx, vy, mine: false, life: 200 });

  function hurt() {
    if (p.inv > 0) return;
    p.hp--; p.inv = 90; p.vy = -3; p.vx = -p.face * 1.5; sfx.hurt(); burst(p.x + 5, p.y + 7, 6, [C.red, C.deep]);
    if (p.hp <= 0) die();
  }
  function die() { state = 'dead'; timer = 70; sfx.die(); burst(p.x + 5, p.y + 7, 16, [C.red, C.amber, C.bone]); }

  function update() {
    tick++;
    if (state !== 'play') {
      if (state === 'dead' && --timer <= 0) { lives--; if (lives < 0) { state = 'over'; } else { state = 'play'; spawnPlayer(); } }
      if (pressed.start || pressed.jump) {
        if (state === 'title' || state === 'over' || state === 'win') {
          if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.18; master.connect(ac.destination); }
          ac.resume?.(); onStart?.(); newGame(); state = 'play';
        }
      }
      clearPressed(); return;
    }
    if (paused) { if (pressed.start || pressed.jump || pressed.fire) paused = false; clearPressed(); return; }

    // Player
    const acc = 0.2, max = 1.9;
    if (held.left && !held.right) { p.vx = Math.max(p.vx - acc, -max); p.face = -1; }
    else if (held.right && !held.left) { p.vx = Math.min(p.vx + acc, max); p.face = 1; }
    else p.vx = Math.abs(p.vx) < 0.2 ? 0 : p.vx - Math.sign(p.vx) * 0.2;
    p.coyote = p.onGround ? 6 : p.coyote - 1;
    p.buf = pressed.jump ? 6 : p.buf - 1;
    if (p.buf > 0 && p.coyote > 0) { p.vy = -5.8; p.buf = 0; p.coyote = 0; sfx.jump(); }
    if (!held.jump && p.vy < -2) p.vy = -2;
    p.vy = Math.min(p.vy + 0.32, 6);
    const r = move(p, p.vx, p.vy);
    if (r.hitX) p.vx = 0; if (r.hitY) p.vy = 0;
    if (p.x < T) p.x = T;
    p.run = p.onGround && p.vx !== 0 ? p.run + 1 : 0;
    if (p.inv > 0) p.inv--;
    if (p.cool > 0) p.cool--;
    if (pressed.fire && p.cool <= 0 && shots.filter((s) => s.mine).length < 3) {
      shots.push({ x: p.x + (p.face > 0 ? 9 : -5), y: p.y + 7, w: 6, h: 3, vx: 4.2 * p.face, vy: 0, mine: true, life: 55 });
      p.cool = 12; sfx.shoot();
    }
    if (p.y > H + 24) { die(); clearPressed(); return; }
    // Spikes
    const sx0 = Math.floor((p.x + 2) / T), sx1 = Math.floor((p.x + p.w - 2) / T), sy = Math.floor((p.y + p.h - 3) / T);
    for (let tx = sx0; tx <= sx1; tx++) if (tileAt(tx, sy) === '^') { hurt(); break; }
    // Checkpoints
    while (cp + 1 < L.checkpoints.length && p.x > L.checkpoints[cp + 1] * T) cp++;

    // Enemies
    for (const e of enemies) {
      if (e.flash > 0) e.flash--;
      const dx = p.x - e.x, dy = p.y - e.y;
      if (e.type === 'imp') {
        if (Math.abs(dx) > 260) continue;
        e.vy = Math.min(e.vy + 0.3, 6);
        const m = move(e, e.vx, e.vy);
        if (m.hitX) e.vx *= -1;
        if (e.onGround) {
          const fx = e.vx > 0 ? e.x + e.w + 1 : e.x - 1, below = tileAt(Math.floor(fx / T), Math.floor((e.y + e.h + 1) / T));
          if (!solid(below)) e.vx *= -1;
        }
        e.face = Math.sign(e.vx) || e.face;
        if (Math.abs(dx) < 170 && Math.abs(dy) < 80 && --e.t <= 0) {
          e.t = rnd(100, 160); e.face = Math.sign(dx) || 1;
          fire(e.x + e.w / 2, e.y + 5, e.face * 1.8, Math.max(-1, Math.min(1, dy / 90)));
        }
      } else if (e.type === 'soul') {
        if (Math.abs(dx) > 260) continue;
        e.t--;
        if (e.mode === 'float') {
          e.ph += 0.05; e.x += Math.sin(e.ph * 0.5) * 0.4; e.y = e.by + Math.sin(e.ph) * 8;
          if (e.t <= 0 && Math.hypot(dx, dy) < 120) {
            const d = Math.hypot(dx, dy) || 1; e.mode = 'charge'; e.t = 45; e.vx = (dx / d) * 2.4; e.vy = (dy / d) * 2.4; sfx.charge();
          }
        } else {
          e.x += e.vx; e.y += e.vy;
          if (solid(tileAt(Math.floor((e.x + 6) / T), Math.floor((e.y + 5) / T)))) { e.x -= e.vx; e.y -= e.vy; e.t = 0; }
          if (e.t <= 0) { e.mode = 'float'; e.by = e.y; e.ph = 0; e.t = 90; }
        }
      } else if (e.type === 'baron') {
        if (!e.active) { if (p.x > 165 * T) { e.active = true; sfx.roar(); } else continue; }
        e.face = Math.sign(dx) || e.face;
        e.vx = Math.abs(dx) > 40 ? e.face * 0.45 : 0;
        e.vy = Math.min(e.vy + 0.3, 6);
        move(e, e.vx, e.vy);
        if (e.x < 158 * T) e.x = 158 * T;
        if (e.x > 192 * T - e.w) e.x = 192 * T - e.w;
        if (--e.t <= 0) { e.t = 85; for (const s of [-0.7, 0, 0.7]) fire(e.x + e.w / 2, e.y + 10, e.face * 1.6, s); }
        if (e.onGround && --e.jt <= 0) { e.vy = -4.8; e.jt = rnd(140, 200); }
      }
      if (overlap(p, e)) hurt();
    }

    // Shots
    for (const s of shots) {
      s.x += s.vx; s.y += s.vy; s.life--;
      if (solid(tileAt(Math.floor((s.x + s.w / 2) / T), Math.floor((s.y + s.h / 2) / T)))) { s.life = 0; burst(s.x, s.y, 3, [C.amber, C.k]); }
      if (s.mine) {
        for (const e of enemies) if (e.hp > 0 && s.life > 0 && overlap(s, e)) {
          s.life = 0; e.hp--; e.flash = 6; sfx.hit();
          if (e.type === 'baron') e.active = true;
          if (e.hp <= 0) {
            sfx.kill(); burst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'baron' ? 40 : 12, [C.k, C.red, C.amber, C.mid]);
            score += { imp: 100, soul: 50, baron: 1000 }[e.type];
            if (e.type === 'baron') { L.gate.open = true; sfx.gate(); }
          }
        }
      } else if (s.life > 0 && overlap(s, p)) { s.life = 0; hurt(); }
    }
    shots = shots.filter((s) => s.life > 0 && s.x > camX - 40 && s.x < camX + W + 40);
    enemies = enemies.filter((e) => e.hp > 0);
    for (const o of orbs) if (!o.taken && overlap(o, p)) { o.taken = true; p.hp = Math.min(3, p.hp + 1); score += 25; sfx.pickup(); }
    for (const q of parts) { q.x += q.vx; q.y += q.vy; q.vy += 0.12; q.life--; }
    parts = parts.filter((q) => q.life > 0);
    if (L.gate.open && overlap(p, L.gate)) { state = 'win'; sfx.gate(); }
    camX = Math.max(0, Math.min(p.x - 112, L.LW * T - W));
    clearPressed();
  }
  const clearPressed = () => { for (const k in pressed) pressed[k] = false; };

  // ---------- Drawing ----------
  function drawSprite(rows, x, y, flip, pal, scale = 1, flash = false) {
    const w = rows[0].length;
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < w; c++) {
      const ch = rows[r][c]; if (ch === '.') continue;
      ctx.fillStyle = flash ? '#ffffff' : pal[ch];
      ctx.fillRect(Math.round(x) + (flip ? w - 1 - c : c) * scale, Math.round(y) + r * scale, scale, scale);
    }
  }
  function star(x, y, r, color, inverted = true, hollow = false) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (inverted ? Math.PI / 2 : -Math.PI / 2) + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    if (hollow) { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
  }
  function drawBackground(cx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 150);
    sky.addColorStop(0, C.sky0); sky.addColorStop(0.55, C.sky1); sky.addColorStop(1, C.sky2);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 150);
    // Hanging dark flames
    const fo = (cx * 0.15) % 560;
    for (const f of flames) for (const rep of [0, 560]) {
      const x = f.x - fo + rep; if (x < -60 || x > W + 60) continue;
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let i = 1; i <= 6; i++) { const t = i / 6; ctx.lineTo(x + f.lean * t + (i % 2 ? 4 : -4) * (1 - t), f.h * t); }
      ctx.lineTo(x + f.w, 0); ctx.closePath();
      ctx.fillStyle = C.flame; ctx.fill(); ctx.strokeStyle = C.flameEdge; ctx.lineWidth = 1; ctx.stroke();
    }
    // Purple spires on the horizon
    const so = (cx * 0.3) % 600;
    for (const s of spires) for (const rep of [0, 600]) {
      const x = s.x - so + rep; if (x < -40 || x > W + 40) continue;
      ctx.beginPath(); ctx.moveTo(x, 150); ctx.lineTo(x + s.w * 0.45, 150 - s.h); ctx.lineTo(x + s.w, 150); ctx.closePath();
      ctx.fillStyle = C.spire; ctx.fill(); ctx.strokeStyle = C.spireEdge; ctx.stroke();
    }
    // Rust plain with a road running to the horizon
    ctx.fillStyle = C.earth; ctx.fillRect(0, 150, W, H - 150);
    ctx.strokeStyle = C.rust; ctx.lineWidth = 1;
    const ro = (cx * 0.4) % 28;
    for (let i = -6; i < 16; i++) { ctx.beginPath(); ctx.moveTo(128, 150); ctx.lineTo(i * 28 - ro, H); ctx.stroke(); }
    for (let y = 154, gap = 3; y < H; y += gap, gap += 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    star(128, 150, 5, C.k, true);
  }
  function drawTiles(cx) {
    const tx0 = Math.floor(cx / T);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = tx0; tx <= tx0 + 17; tx++) {
      const c = tileAt(tx, ty); if (c === '.') continue;
      const x = tx * T - Math.round(cx), y = ty * T;
      if (c === '#') {
        ctx.fillStyle = C.rock; ctx.fillRect(x, y, T, T);
        if (!solid(tileAt(tx, ty - 1))) { ctx.fillStyle = C.hi; ctx.fillRect(x, y, T, 1); ctx.fillStyle = C.mid; ctx.fillRect(x, y + 1, T, 1); }
        if (!solid(tileAt(tx - 1, ty))) { ctx.fillStyle = C.mid; ctx.fillRect(x, y, 1, T); }
        ctx.fillStyle = '#1f1512';
        for (let i = 0; i < 4; i++) { const h = (tx * 31 + ty * 17 + i * 13) % 225; ctx.fillRect(x + (h % 15), y + 2 + ((h / 15) | 0) % 13, 2, 1); }
      } else if (c === '=') {
        ctx.fillStyle = C.earth; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = C.rust; ctx.fillRect(x, y, T, 4);
        ctx.fillStyle = C.rust2;
        for (let i = 0; i < T; i++) { if ((i + tx * 3) % 4 === 0) ctx.fillRect(x + i, y + 1, 1, 1); if ((i + tx) % 5 === 0) ctx.fillRect(x + i, y + 6 + (i % 3) * 3, 2, 1); }
        ctx.fillStyle = C.hi; ctx.fillRect(x, y, T, 1);
      } else if (c === '^') {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(x + i * 4, y + T); ctx.lineTo(x + i * 4 + 2, y + 6); ctx.lineTo(x + i * 4 + 4, y + T); ctx.closePath();
          ctx.fillStyle = C.k; ctx.fill(); ctx.fillStyle = C.hi; ctx.fillRect(x + i * 4 + 1, y + 8, 1, 6);
        }
      }
    }
  }
  function drawGate(cx) {
    const g = L.gate, x = g.x - Math.round(cx), y = g.y;
    if (x > W + 40 || x < -40) return;
    if (g.open) {
      const glow = ctx.createLinearGradient(0, y, 0, y + g.h);
      glow.addColorStop(0, C.amber); glow.addColorStop(1, C.deep);
      ctx.fillStyle = glow; ctx.fillRect(x, y, g.w, g.h);
      ctx.fillStyle = `rgba(255,216,138,${0.3 + 0.3 * Math.sin(tick * 0.1)})`; ctx.fillRect(x - 3, y - 3, g.w + 6, g.h + 3);
    } else {
      ctx.fillStyle = C.k; ctx.fillRect(x, y, g.w, g.h);
      ctx.fillStyle = C.deep; for (let i = 3; i < g.w; i += 6) ctx.fillRect(x + i, y + 2, 2, g.h - 2);
    }
    ctx.fillStyle = C.rock; ctx.fillRect(x - 4, y - 6, g.w + 8, 6);
    ctx.fillStyle = C.hi; ctx.fillRect(x - 4, y - 6, g.w + 8, 1);
    star(x + g.w / 2, y - 12, 5, g.open ? C.amber : C.red, true);
  }
  function drawWorld() {
    const cx = camX;
    drawBackground(cx); drawTiles(cx); drawGate(cx);
    for (const o of orbs) if (!o.taken) star(o.x + 4 - cx, o.y + 4 + Math.sin(tick * 0.08) * 2, 5, C.red, true);
    for (const e of enemies) {
      const x = e.x - cx;
      if (x < -40 || x > W + 40) continue;
      if (e.type === 'imp') drawSprite(SPR.imp, x, e.y, e.face > 0, PAL.imp, 1, e.flash > 0);
      if (e.type === 'baron') drawSprite(SPR.imp, x - 1, e.y - 2, e.face > 0, PAL.baron, 2, e.flash > 0);
      if (e.type === 'soul') {
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? C.amber : C.red; ctx.fillRect(x + rnd(0, 12), e.y + rnd(-6, 2), 2, 2); }
        drawSprite(SPR.soul, x, e.y, false, PAL.soul, 1, e.flash > 0);
      }
    }
    if (state !== 'dead' && !(p.inv > 0 && (tick >> 2) % 2)) drawSprite(p.run % 16 < 8 ? SPR.player : SPR.playerRun, p.x - cx, p.y, p.face < 0, PAL.player);
    for (const s of shots) {
      if (s.mine) { ctx.fillStyle = C.amber; ctx.fillRect(s.x - cx, s.y, s.w, s.h); ctx.fillStyle = C.bone; ctx.fillRect(s.x - cx + (s.vx > 0 ? 4 : 0), s.y, 2, s.h); }
      else { ctx.fillStyle = tick % 4 < 2 ? C.red : C.deep; ctx.fillRect(s.x - cx, s.y, s.w, s.h); ctx.fillStyle = C.amber; ctx.fillRect(s.x - cx + 2, s.y + 2, 2, 2); }
    }
    for (const q of parts) { ctx.fillStyle = q.c; ctx.fillRect(q.x - cx, q.y, 2, 2); }
  }
  function text(str, x, y, size, color, align = 'center') {
    ctx.font = `${size}px 'Germania One', serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.k; ctx.fillText(str, x + 1, y + 1); ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function drawHud() {
    for (let i = 0; i < 3; i++) star(14 + i * 12, 14, 5, C.red, true, i >= p.hp);
    text('x' + Math.max(lives, 0), 50, 14, 10, C.bone, 'left');
    text(String(score).padStart(6, '0'), W - 10, 14, 10, C.amber, 'right');
  }
  function draw() {
    if (state === 'title') {
      drawBackground(tick * 0.6); ctx.drawImage(frame, 0, 0);
      text('into the jaws', W / 2, 92, 26, C.red);
      text('age of stellara', W / 2, 116, 10, C.bone);
      if ((tick >> 5) % 2 === 0) text('press start', W / 2, 160, 12, C.amber);
      text('arrows move · z jump · x fire', W / 2, 212, 8, C.mid);
      return;
    }
    drawWorld(); ctx.drawImage(frame, 0, 0); drawHud();
    if (paused) { ctx.fillStyle = 'rgba(5,3,4,.6)'; ctx.fillRect(0, 0, W, H); text('paused', W / 2, 110, 18, C.amber); text('click to resume', W / 2, 132, 9, C.bone); }
    if (state === 'over') { ctx.fillStyle = 'rgba(5,3,4,.75)'; ctx.fillRect(0, 0, W, H); text('swallowed', W / 2, 104, 24, C.red); text('press start', W / 2, 140, 11, C.amber); }
    if (state === 'win') { ctx.fillStyle = 'rgba(5,3,4,.7)'; ctx.fillRect(0, 0, W, H); text('deeper still', W / 2, 100, 24, C.amber); text('score ' + score, W / 2, 128, 11, C.bone); text('press start', W / 2, 154, 10, C.red); }
  }
  function makeFrame() {
    const f = document.createElement('canvas'); f.width = W; f.height = H;
    const g = f.getContext('2d');
    const ring = (s) => { g.beginPath(); for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2, j = 1 + Math.sin(i * 2.3) * 0.025 + Math.sin(i * 5.1) * 0.015; g.lineTo(128 + Math.cos(a) * 154 * j * s, 112 + Math.sin(a) * 138 * j * s); } g.closePath(); };
    g.fillStyle = C.k; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out'; ring(1); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(217,207,196,.6)'; g.lineWidth = 1; ring(1.012); g.stroke();
    g.strokeStyle = 'rgba(109,98,90,.8)'; ring(1.03); g.stroke();
    // Roots reaching in from the corners
    const roots = [[0, 20, 1, 0.4], [W, 30, -1, 0.5], [0, H - 10, 1, -0.5], [W, H - 20, -1, -0.4], [40, 0, 0.3, 1], [W - 50, H, -0.2, -1]];
    for (const [x0, y0, dx, dy] of roots) {
      let x = x0, y = y0;
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 7; i++) { x += dx * rnd(6, 11) + rnd(-3, 3); y += dy * rnd(6, 11) + rnd(-3, 3); g.lineTo(x, y); }
      g.strokeStyle = C.k; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(217,207,196,.5)'; g.lineWidth = 1; g.stroke();
    }
    return f;
  }

  // ---------- Loop ----------
  let raf = 0, last = 0, accum = 0, visible = true;
  const loop = (now) => {
    accum += Math.min(100, now - (last || now)); last = now;
    while (accum >= STEP) { update(); accum -= STEP; }
    draw(); raf = requestAnimationFrame(loop);
  };
  const startLoop = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };
  const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; };
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) startLoop(); else { stopLoop(); if (state === 'play') paused = true; } });
  io.observe(canvas);
  newGame(); state = 'title'; camX = 0; draw(); startLoop();

  return {
    press,
    destroy() {
      stopLoop(); io.disconnect();
      canvas.removeEventListener('keydown', onKey); canvas.removeEventListener('keyup', onKey);
      canvas.removeEventListener('blur', onBlur); canvas.removeEventListener('pointerdown', onClick);
      ac?.close?.();
    },
    // For automated checks only.
    _debug: () => ({ state, paused, lives, score, hp: p.hp, x: p.x, y: p.y, cp, enemies: enemies.length, gateOpen: L.gate.open }),
  };
}
