// Super Dario — an original retro platformer.
(() => {
"use strict";
const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;
const W = 960, H = 544, T = 32, ROWS = 17;
const QS = new URLSearchParams(location.search);

// ---------- assets ----------
const IMG = {};
const NAMES = ["dario-idle","dario-run-a","dario-run-b","dario-jump","dario-crouch","dario-hurt","dario-win","dario-throw",
  "block-star","block-used","brick","ground","token","spark","bug-a","bug-b","bug-flat","ghost-a","ghost-b","goal","bg","dirt"];
let loaded = 0;
for (const n of NAMES) { const i = new Image(); i.onload = i.onerror = () => loaded++; i.src = `assets/${n}.png`; IMG[n] = i; }
const ok = (i) => i && i.complete && i.naturalWidth > 0;

// ---------- audio (synth, no files) ----------
let AC = null, muted = QS.has("mute"), musicOn = true, musicT = 0, musicStep = 0;
try { muted = muted || localStorage.getItem("dario-mute") === "1"; } catch {}
let MASTER = null, REC_DEST = null;
function ac() {
  if (!AC && !muted) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); MASTER = AC.createGain(); MASTER.connect(AC.destination); REC_DEST = AC.createMediaStreamDestination(); MASTER.connect(REC_DEST); } catch {} }
  return AC;
}
function tone(f, d, type = "square", vol = 0.08, slide = 0, when = 0) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(MASTER || a.destination); o.start(t); o.stop(t + d + 0.02);
}
const SFX = {
  jump: () => tone(330, 0.16, "square", 0.06, 420),
  token: () => { tone(988, 0.06, "square", 0.05); tone(1319, 0.18, "square", 0.05, 0, 0.06); },
  stomp: (c = 0) => tone(220 + c * 60, 0.12, "triangle", 0.12, -120),
  bump: () => tone(120, 0.08, "square", 0.08, -40),
  brick: () => { tone(90, 0.15, "sawtooth", 0.08, -60); tone(160, 0.1, "square", 0.04, -80, 0.03); },
  power: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.1, "square", 0.05, 0, i * 0.06)),
  throw: () => tone(880, 0.08, "triangle", 0.06, -500),
  hurt: () => tone(400, 0.4, "sawtooth", 0.07, -330),
  die: () => [494, 466, 440, 415, 392, 330].forEach((f, i) => tone(f, 0.18, "square", 0.06, 0, i * 0.13)),
  win: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.06, 0, i * 0.11)),
  oneup: () => [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => tone(f, 0.09, "square", 0.05, 0, i * 0.07)),
};
// original little loop: bass + lead, 16 steps per bar
const LEAD = [72,0,76,79, 0,77,76,74, 72,0,74,76, 74,0,67,0, 72,0,76,79, 0,81,79,77, 76,74,72,74, 72,0,0,0];
const BASS = [48,48,55,55, 53,53,55,55, 48,48,55,55, 50,50,55,55, 48,48,55,55, 53,53,57,57, 55,55,50,50, 48,48,48,48];
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
function musicTick(dt) {
  if (!musicOn || muted || !AC || state !== "play") return;
  musicT -= dt;
  while (musicT <= 0) {
    musicT += 0.14;
    const i = musicStep++ % LEAD.length;
    if (LEAD[i]) tone(mf(LEAD[i]), 0.12, "square", 0.025);
    if (i % 2 === 0) tone(mf(BASS[i]), 0.22, "triangle", 0.05);
  }
}

// ---------- gameplay recorder: canvas video + game audio, saved as a file ----------
let recorder = null, recChunks = [], recStart = 0;
const recBtn = document.getElementById("rec"), recPanel = document.getElementById("recpanel");
function setMuted(v) { muted = v; try { localStorage.setItem("dario-mute", v ? "1" : "0"); } catch {} }
function recLabel() {
  if (!recorder) { recBtn.textContent = "● Record"; recBtn.classList.remove("on"); return; }
  const s = Math.floor((performance.now() - recStart) / 1000);
  recBtn.textContent = `■ Stop ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; recBtn.classList.add("on");
}
function toggleRecord() {
  if (recorder) { recorder.stop(); return; }
  if (!cv.captureStream || !window.MediaRecorder) { alert("This browser can't record the game. Use Chrome, Edge or Safari 17+."); return; }
  if (muted) setMuted(false);          // a recording needs the game's sound on
  ac(); if (AC && AC.state === "suspended") AC.resume();
  const stream = cv.captureStream(60);
  if (REC_DEST) for (const t of REC_DEST.stream.getAudioTracks()) stream.addTrack(t);
  const types = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  recChunks = [];
  recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : {});
  recorder.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
  recorder.onstop = () => {
    const type = recorder.mimeType || "video/webm", ext = type.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(new Blob(recChunks, { type }));
    const name = `super-dario-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
    recorder = null; recLabel();
    // show a save panel (works even where automatic downloads are blocked)
    recPanel.querySelector("video").src = url;
    const a = recPanel.querySelector("a"); a.href = url; a.download = name;
    recPanel.querySelector(".nm").textContent = name;
    recPanel.hidden = false; paused = state === "play";
    a.click();
  };
  recorder.start(500); recStart = performance.now(); recLabel();
}
setInterval(() => recorder && recLabel(), 250);
recBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleRecord(); recBtn.blur(); });
recPanel.querySelector(".close").addEventListener("click", () => { recPanel.hidden = true; recPanel.querySelector("video").pause(); paused = false; });

// ---------- input ----------
const K = { left: 0, right: 0, jump: 0, fire: 0, run: 0, down: 0 };
let jumpPressed = 0, firePressed = 0, anyPressed = 0;
const MAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "jump", KeyW: "jump", Space: "jump", KeyZ: "jump",
  KeyX: "fire", KeyJ: "fire", ShiftLeft: "run", ShiftRight: "run", ArrowDown: "down", KeyS: "down" };
addEventListener("keydown", (e) => {
  const k = MAP[e.code];
  if (e.code === "KeyM") { setMuted(!muted); musicOn = !muted; ac(); }
  if (e.code === "KeyR") toggleRecord();
  if (e.code === "KeyP" || e.code === "Escape") paused = !paused && state === "play";
  if (k) { if (!K[k]) { if (k === "jump") jumpPressed = 0.12; if (k === "fire") firePressed = 1; } K[k] = 1; e.preventDefault(); }
  if (e.code === "Enter" || k === "jump") anyPressed = 1;
  ac();
});
addEventListener("keyup", (e) => { const k = MAP[e.code]; if (k) K[k] = 0; });
for (const b of document.querySelectorAll("#touch button")) {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); if (!K[k]) { if (k === "jump") { jumpPressed = 0.12; anyPressed = 1; } if (k === "fire") firePressed = 1; } K[k] = 1; ac(); };
  const off = (e) => { e.preventDefault(); K[k] = 0; };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
}
cv.addEventListener("pointerdown", () => { anyPressed = 1; ac(); });

// ---------- levels ----------
// Tiles: # ground, B brick, ? star block (token), P star block (spark power), L star block (1-up),
// S solid starburst block (climbable), = used block, o token, b bug, g ghost, F goal, @ start
function Builder(w) {
  const g = Array.from({ length: ROWS }, () => Array(w).fill(" "));
  const api = {
    w, g,
    set(x, y, c) { if (x >= 0 && x < w && y >= 0 && y < ROWS) g[y][x] = c; return api; },
    ground(x0, x1, top = 15) { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) g[y][x] = "#"; return api; },
    row(x, y, s) { [...s].forEach((c, i) => c !== "." && api.set(x + i, y, c)); return api; },
    stairsUp(x, n, top = 15) { for (let i = 0; i < n; i++) for (let h = 0; h <= i; h++) api.set(x + i, top - 1 - h, "S"); return api; },
    stairsDown(x, n, top = 15) { for (let i = 0; i < n; i++) for (let h = 0; h < n - i; h++) api.set(x + i, top - 1 - h, "S"); return api; },
    tower(x, h, top = 15, wdt = 2) { for (let i = 0; i < wdt; i++) for (let k = 0; k < h; k++) api.set(x + i, top - 1 - k, "S"); return api; },
    coins(x, y, n) { for (let i = 0; i < n; i++) api.set(x + i, y, "o"); return api; },
    arc(x, y, n) { for (let i = 0; i < n; i++) api.set(x + i, y - Math.round(Math.sin((i / (n - 1)) * Math.PI) * 2), "o"); return api; },
  };
  return api;
}
const LEVELS = [
  { name: "1-1  HELLO, WORLD", time: 300, build() {
    const b = Builder(210);
    b.ground(0, 68).ground(72, 121).ground(125, 160).ground(164, 209);
    b.set(3, 14, "@");
    b.row(14, 11, "?.B?B").row(16, 7, "P");
    b.arc(22, 12, 5);
    b.set(20, 14, "b").set(28, 14, "b");
    b.tower(32, 2).tower(40, 3).tower(48, 4);
    b.set(44, 14, "b").set(45, 14, "b");
    b.coins(40, 9, 2).coins(48, 8, 2);
    b.row(56, 11, "B?B?B").row(58, 7, "L").set(60, 14, "b");
    b.arc(68, 11, 6);
    b.row(78, 11, "BBB").row(81, 7, "BBBBBBBB").row(84, 6, "oooo").set(84, 7, "?");
    b.set(86, 14, "b").set(88, 14, "b").set(92, 14, "b");
    b.row(96, 11, "B?B").set(100, 11, "P").coins(104, 13, 4);
    b.stairsUp(110, 4).stairsDown(116, 4).set(108, 14, "b");
    b.stairsUp(125, 5).arc(130, 9, 5).set(135, 14, "b").set(137, 14, "b");
    b.row(140, 11, "?B?B?").set(146, 7, "?").set(150, 14, "b").set(153, 14, "b");
    b.stairsUp(164, 4).stairsDown(168, 4).set(173, 14, "b");
    b.stairsUp(182, 8).tower(190, 8, 15, 1);
    b.set(199, 14, "F");
    return b;
  }},
  { name: "1-2  CONTEXT CLIMB", time: 300, build() {
    const b = Builder(230);
    b.ground(0, 30).ground(36, 60).ground(66, 70).ground(76, 110).ground(118, 150).ground(158, 229);
    b.set(3, 14, "@");
    b.row(10, 11, "P").coins(12, 11, 3).set(18, 14, "b").set(22, 14, "b").set(26, 14, "g");
    b.stairsUp(26, 5).row(31, 10, "SSSSS").coins(31, 8, 5);
    b.tower(40, 3).set(44, 9, "g").tower(48, 5).tower(56, 3);
    b.row(42, 9, "B?B").set(52, 14, "b").set(53, 14, "b").set(58, 14, "b");
    b.row(61, 11, "SSSS").row(71, 11, "SSSS").coins(62, 9, 2).coins(72, 9, 2).set(68, 8, "g");
    b.row(80, 11, "?B?B?B?").row(82, 7, "BLB").set(90, 14, "b").set(92, 14, "b").set(94, 14, "b").set(96, 8, "g");
    b.stairsUp(100, 6).set(106, 9, "S").set(106, 8, "S").stairsDown(111, 4, 15).coins(107, 6, 3);
    b.row(112, 10, "SSS").row(115, 8, "SSS");
    b.row(122, 11, "B?BPB").set(128, 14, "b").set(130, 14, "b").set(132, 14, "b").set(134, 7, "g").set(140, 9, "g");
    b.tower(144, 4).tower(150, 6, 15, 1).row(151, 9, "SSSSSSS").coins(152, 7, 5).set(159, 14, "b");
    b.stairsUp(164, 3).stairsDown(168, 3).set(172, 8, "g").set(176, 14, "b").set(178, 14, "b");
    b.row(180, 11, "?.?.?").arc(186, 10, 6);
    b.stairsUp(194, 9).tower(203, 9, 15, 1);
    b.set(214, 14, "F");
    return b;
  }},
  { name: "1-3  SCALING LAWS", time: 280, build() {
    const b = Builder(250);
    b.ground(0, 18).ground(24, 33).ground(39, 44).ground(52, 90).ground(98, 102).ground(110, 140).ground(148, 152).ground(158, 249);
    b.set(3, 14, "@");
    b.row(8, 11, "B?P?B").set(14, 14, "b").set(16, 14, "b");
    b.row(19, 8, "SSSS").coins(19, 6, 4).set(28, 14, "b").row(35, 12, "SS").arc(34, 9, 5).set(37, 6, "g").row(46, 12, "SSSS").coins(46, 10, 4);
    b.stairsUp(56, 4).tower(62, 4).tower(68, 6).set(66, 14, "S").tower(74, 7, 15, 1).set(72, 14, "S").set(65, 8, "g").set(71, 6, "g");
    b.set(60, 14, "b").set(65, 14, "b").set(71, 14, "b").set(80, 14, "b").set(82, 14, "b").set(84, 14, "b");
    b.row(78, 10, "B?B?B?B").row(80, 6, "BLB");
    b.row(92, 12, "SS").row(95, 10, "SS").row(104, 12, "SS").row(107, 11, "SS").set(97, 6, "g").coins(95, 8, 2).coins(107, 9, 2);
    b.row(114, 11, "?BPB?").set(120, 14, "b").set(121, 14, "b").set(124, 14, "b").set(126, 14, "b").set(128, 8, "g").set(134, 6, "g");
    b.stairsUp(132, 7).row(139, 9, "S").row(141, 9, "SS").row(145, 8, "SS").row(149, 10, "SSS").row(153, 9, "SSS").coins(141, 7, 2).coins(145, 6, 2);
    b.set(162, 14, "b").set(164, 14, "b").set(166, 14, "b").set(168, 9, "g").set(172, 7, "g");
    b.tower(176, 3).tower(182, 5).tower(188, 7).row(190, 8, "SSS").arc(193, 7, 5);
    b.row(200, 11, "?B?B?").set(204, 14, "b").set(206, 14, "b").set(210, 9, "g");
    b.stairsUp(216, 10).tower(226, 10, 15, 1);
    b.set(236, 14, "F");
    return b;
  }},
];

// ---------- world state ----------
let state = "title", paused = false, levelIdx = 0, grid, LW, ents, parts, texts, player, camX, timeLeft, goalX;
let score = 0, tokens = 0, lives = 3, combo = 0, comboT = 0, shake = 0, stateT = 0, levelStart = 0, flash = 0;
let best = {}; try { best = JSON.parse(localStorage.getItem("dario-best") || "{}"); } catch {}
const saveBest = () => { try { localStorage.setItem("dario-best", JSON.stringify(best)); } catch {} };

function loadLevel(i) {
  const L = LEVELS[i], b = L.build();
  LW = b.w; grid = b.g.map((r) => r.slice()); ents = []; parts = []; texts = [];
  let sx = 3, sy = 14;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < LW; x++) {
    const c = grid[y][x];
    if (c === "@") { sx = x; sy = y; grid[y][x] = " "; }
    else if (c === "o") { ents.push({ t: "token", x: x * T + 6, y: y * T + 6, w: 20, h: 20, ph: x * 0.4 }); grid[y][x] = " "; }
    else if (c === "b") { ents.push({ t: "bug", x: x * T + 2, y: y * T + 6, w: 28, h: 26, vx: -55, vy: 0, an: 0 }); grid[y][x] = " "; }
    else if (c === "g") { ents.push({ t: "ghost", x: x * T, y: y * T, y0: y * T, w: 30, h: 28, vx: -70, an: x }); grid[y][x] = " "; }
    else if (c === "F") { goalX = x * T; ents.push({ t: "goal", x: x * T, y: (y - 8) * T, w: 32, h: 9 * T }); grid[y][x] = " "; }
  }
  player = { x: sx * T + 5, y: sy * T - 14, w: 22, h: 44, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, power: false, inv: 0,
    an: 0, throwT: 0, dead: false, crouch: false, sq: 1 };
  camX = 0; timeLeft = L.time; levelStart = performance.now(); combo = 0;
}
const solid = (c) => c === "#" || c === "B" || c === "?" || c === "P" || c === "L" || c === "S" || c === "=";
function tileAt(px, py) { const x = Math.floor(px / T), y = Math.floor(py / T); if (x < 0 || x >= LW) return "#"; if (y < 0 || y >= ROWS) return " "; return grid[y][x]; }

function collide(e, onHead) {
  // horizontal
  e.x += e.vx * DT;
  const top = Math.floor(e.y / T), bot = Math.floor((e.y + e.h - 1) / T);
  if (e.vx > 0) { const tx = Math.floor((e.x + e.w) / T); for (let ty = top; ty <= bot; ty++) if (solid(tileAt(tx * T, ty * T))) { e.x = tx * T - e.w - 0.01; e.vx = e.t === "player" ? 0 : -Math.abs(e.vx); e.hitWall = 1; break; } }
  else if (e.vx < 0) { const tx = Math.floor(e.x / T); for (let ty = top; ty <= bot; ty++) if (solid(tileAt(tx * T, ty * T))) { e.x = (tx + 1) * T + 0.01; e.vx = e.t === "player" ? 0 : Math.abs(e.vx); e.hitWall = 1; break; } }
  // vertical
  e.y += e.vy * DT; e.ground = false;
  const l = Math.floor((e.x + 2) / T), r = Math.floor((e.x + e.w - 2) / T);
  if (e.vy > 0) { const ty = Math.floor((e.y + e.h) / T); for (let tx = l; tx <= r; tx++) if (solid(tileAt(tx * T, ty * T))) { e.y = ty * T - e.h; e.vy = 0; e.ground = true; break; } }
  else if (e.vy < 0) {
    const ty = Math.floor(e.y / T); let hit = null, best = 1e9;
    for (let tx = l; tx <= r; tx++) if (solid(tileAt(tx * T, ty * T))) { const d = Math.abs(tx * T + T / 2 - (e.x + e.w / 2)); if (d < best) { best = d; hit = tx; } }
    if (hit !== null) { e.y = (ty + 1) * T; e.vy = 0; onHead && onHead(hit, ty); }
  }
}

function burst(x, y, col, n = 8, sp = 200) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = sp * (0.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.5 + Math.random() * 0.4, col, sz: 3 + Math.random() * 4 }); } }
function popText(x, y, s, col = "#2b211c") { texts.push({ x, y, s: String(s), life: 0.9, col }); }
function addScore(n, x, y) { score += n; if (x !== undefined) popText(x, y, n); }
function gainToken(x, y) { tokens++; addScore(100); SFX.token(); if (tokens >= 50) { tokens -= 50; lives++; SFX.oneup(); popText(x, y - 20, "1UP", "#C96442"); } }

function hitBlock(tx, ty) {
  const c = grid[ty][tx];
  ents.forEach((e) => { if ((e.t === "bug") && !e.dead && Math.abs(e.x + e.w / 2 - (tx * T + T / 2)) < T && Math.abs(e.y + e.h - ty * T) < 6) killEnemy(e, true); });
  if (c === "?" || c === "P" || c === "L") {
    grid[ty][tx] = "=";
    bumps.push({ x: tx, y: ty, t: 0.15 });
    if (c === "?") { ents.push({ t: "poptoken", x: tx * T + 6, y: ty * T - 24, vy: -420, life: 0.45, w: 20, h: 20 }); gainToken(tx * T, ty * T); addScore(0); }
    else if (c === "P") { ents.push({ t: "spark", x: tx * T + 2, y: ty * T, w: 28, h: 28, vx: 0, vy: 0, rise: T, kind: "power" }); SFX.bump(); }
    else { ents.push({ t: "spark", x: tx * T + 2, y: ty * T, w: 28, h: 28, vx: 0, vy: 0, rise: T, kind: "life" }); SFX.bump(); }
  } else if (c === "B") {
    if (player.power) { grid[ty][tx] = " "; SFX.brick(); burst(tx * T + 16, ty * T + 16, "#C96442", 10, 260); addScore(50); shake = 0.12; }
    else { bumps.push({ x: tx, y: ty, t: 0.15 }); SFX.bump(); }
  } else SFX.bump();
}
let bumps = [];

function killEnemy(e, flip) {
  e.dead = true; e.deadT = 0;
  if (flip) { e.vy = -380; e.flip = true; } else { e.flat = true; }
  burst(e.x + e.w / 2, e.y + e.h / 2, e.t === "ghost" ? "#9a8fb0" : "#D97757", 8);
}

function hurtPlayer() {
  if (player.inv > 0 || player.dead) return;
  if (player.power) { player.power = false; player.inv = 1.6; SFX.hurt(); shake = 0.2; return; }
  die();
}
function die() {
  if (player.dead) return;
  player.dead = true; player.vy = -620; player.vx = 0; SFX.die(); shake = 0.3; state = "dying"; stateT = 0;
}

// ---------- update ----------
const DT = 1 / 60;
function update() {
  stateT += DT;
  if (jumpPressed > 0) jumpPressed -= DT;
  if (state === "title") { if (anyPressed) { anyPressed = 0; score = 0; tokens = 0; lives = 3; levelIdx = 0; loadLevel(0); state = "intro"; stateT = 0; } return; }
  if (state === "intro") { if (stateT > 1.6) { state = "play"; stateT = 0; levelStart = performance.now(); } anyPressed = 0; return; }
  if (state === "over") { if (stateT > 1 && anyPressed) { state = "title"; stateT = 0; } anyPressed = 0; return; }
  if (state === "done") { if (stateT > 1 && anyPressed) { state = "title"; stateT = 0; } anyPressed = 0; return; }
  if (paused) return;
  anyPressed = 0;
  musicTick(DT);
  const p = player;
  if (comboT > 0) { comboT -= DT; if (comboT <= 0) combo = 0; }
  if (shake > 0) shake -= DT;
  if (flash > 0) flash -= DT;

  if (state === "dying") {
    p.vy += 1800 * DT; p.y += p.vy * DT;
    if (stateT > 2.2) { lives--; if (lives <= 0) { state = "over"; stateT = 0; } else { const keep = levelIdx; loadLevel(keep); state = "intro"; stateT = 0; } }
    updateParts(); return;
  }
  if (state === "clear") {
    // slide down the pole, then walk off to the right
    if (stateT < 1.2) { p.vy = 0; p.y = Math.min(p.y + 260 * DT, 14 * T + 0 - 12); }
    else { p.vx = 160; p.vy += 2200 * DT; collide(p); p.an += DT * 10; }
    if (stateT > 1.2 && timeLeft > 0) { const dec = Math.min(timeLeft, 4); timeLeft -= dec; score += dec * 10; if (Math.floor(stateT * 30) % 2) tone(1200, 0.03, "square", 0.02); }
    if (stateT > 4.2) {
      if (levelIdx + 1 < LEVELS.length) { levelIdx++; loadLevel(levelIdx); state = "intro"; stateT = 0; }
      else { state = "done"; stateT = 0; if (!best.score || score > best.score) { best.score = score; saveBest(); } }
    }
    camFollow(); updateParts(); return;
  }

  timeLeft -= DT; if (timeLeft <= 0) { timeLeft = 0; die(); }

  // horizontal control with momentum
  p.crouch = K.down && p.ground;
  const max = K.run || K.fire ? 330 : 230, acc = p.ground ? 1500 : 1000;
  const dir = p.crouch ? 0 : (K.right - K.left);
  if (dir) { p.vx += dir * acc * DT * (Math.sign(p.vx) === -dir ? 2.2 : 1); p.face = dir; }
  else { const f = (p.ground ? 1700 : 400) * DT; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
  p.vx = Math.max(-max, Math.min(max, p.vx));

  // jump: coyote time + buffering + variable height
  p.coyote = p.ground ? 0.1 : p.coyote - DT;
  if (jumpPressed > 0 && p.coyote > 0) { p.vy = -(700 + Math.abs(p.vx) * 0.35); p.coyote = 0; jumpPressed = 0; SFX.jump(); p.sq = 0.75; burst(p.x + p.w / 2, p.y + p.h, "#e8dccb", 4, 80); }
  const g = p.vy < 0 && K.jump ? 1300 : 2400;
  p.vy = Math.min(p.vy + g * DT, 900);

  const wasGround = p.ground;
  collide(p, (tx, ty) => hitBlock(tx, ty));
  if (!wasGround && p.ground) { p.sq = 1.2; }
  p.sq += (1 - p.sq) * 0.25;
  if (p.x < camX) { p.x = camX; p.vx = Math.max(0, p.vx); }
  if (p.y > H + 40) die();
  if (p.inv > 0) p.inv -= DT;
  p.an += Math.abs(p.vx) * DT * 0.06;
  if (p.throwT > 0) p.throwT -= DT;

  // fire sparks
  if (firePressed && p.power && ents.filter((e) => e.t === "shot").length < 2) {
    ents.push({ t: "shot", x: p.x + (p.face > 0 ? p.w : -14), y: p.y + 14, w: 14, h: 14, vx: p.face * 520, vy: 120, life: 2 });
    SFX.throw(); p.throwT = 0.18;
  }
  firePressed = 0;

  // entities
  for (const e of ents) {
    if (e.t === "token") { e.ph += DT * 4; if (overlap(p, e)) { e.gone = true; gainToken(e.x, e.y); burst(e.x + 10, e.y + 10, "#f0c060", 6, 120); } }
    else if (e.t === "poptoken") { e.vy += 1600 * DT; e.y += e.vy * DT; e.life -= DT; if (e.life <= 0) { e.gone = true; burst(e.x + 10, e.y + 10, "#f0c060", 5, 100); popText(e.x, e.y, 100); } }
    else if (e.t === "spark") {
      if (e.rise > 0) { const d = Math.min(e.rise, 40 * DT); e.y -= d; e.rise -= d; if (e.rise <= 0) e.vx = e.kind === "life" ? 120 : 90; continue; }
      e.vy = Math.min(e.vy + 1800 * DT, 800); collide(e);
      if (e.kind === "power" && e.ground) e.vy = -420;
      if (e.y > H) e.gone = true;
      if (overlap(p, e)) { e.gone = true; if (e.kind === "power") { p.power = true; SFX.power(); addScore(1000, e.x, e.y); flash = 0.3; } else { lives++; SFX.oneup(); popText(e.x, e.y, "1UP", "#C96442"); } burst(e.x + 14, e.y + 14, "#D97757", 14, 240); }
    }
    else if (e.t === "shot") {
      e.vy = Math.min(e.vy + 2000 * DT, 700); collide(e); if (e.ground) e.vy = -380; e.life -= DT;
      if (e.hitWall || e.life <= 0 || e.y > H) { e.gone = true; burst(e.x + 7, e.y + 7, "#D97757", 5, 120); }
      for (const o of ents) if ((o.t === "bug" || o.t === "ghost") && !o.dead && overlap(e, o)) { killEnemy(o, true); e.gone = true; SFX.stomp(1); addScore(200, o.x, o.y); }
    }
    else if (e.t === "bug") {
      if (e.x > camX + W + 64 && !e.awake) continue;
      e.awake = true;
      if (e.dead) { e.deadT += DT; if (e.flip) { e.vy += 1800 * DT; e.y += e.vy * DT; } if (e.deadT > (e.flip ? 1.5 : 0.5)) e.gone = true; continue; }
      e.an += DT * 6; e.vy = Math.min(e.vy + 2000 * DT, 800); e.hitWall = 0;
      // turn around at ledges? no: bugs walk off edges (classic chaos)
      collide(e); if (e.y > H + 50) e.gone = true;
      stompOrHurt(e);
    }
    else if (e.t === "ghost") {
      if (e.x > camX + W + 64 && !e.awake) continue;
      e.awake = true;
      if (e.dead) { e.deadT += DT; if (e.flip) { e.vy += 1800 * DT; e.y += e.vy * DT; } if (e.deadT > 1.2) e.gone = true; continue; }
      e.an += DT; const tx = p.x - e.x; e.vx += Math.sign(tx) * 60 * DT; e.vx = Math.max(-90, Math.min(90, e.vx));
      e.x += e.vx * DT; e.y = e.y0 + Math.sin(e.an * 2.4) * 40;
      stompOrHurt(e);
    }
    else if (e.t === "goal") {
      if (overlap(p, { x: e.x + 12, y: e.y, w: 8, h: e.h })) {
        state = "clear"; stateT = 0; p.vx = 0; p.x = e.x - 8; SFX.win();
        const h = Math.max(0, Math.round((14 * T - p.y) / T)); const bonus = [100, 200, 400, 800, 1000, 2000, 4000, 5000][Math.min(7, h)];
        addScore(bonus, p.x, p.y - 20); burst(p.x, p.y, "#D97757", 24, 300); flash = 0.25;
        const secs = (performance.now() - levelStart) / 1000, key = "L" + levelIdx;
        if (!best[key] || secs < best[key]) { best[key] = secs; saveBest(); popText(p.x, p.y - 50, "NEW BEST!", "#C96442"); }
      }
    }
  }
  ents = ents.filter((e) => !e.gone);
  bumps = bumps.filter((b) => (b.t -= DT) > 0);
  camFollow(); updateParts();
}
function stompOrHurt(e) {
  const p = player;
  if (!overlap(p, e)) return;
  if (p.vy > 60 && p.y + p.h - e.y < 18) {
    killEnemy(e, e.t === "ghost"); p.vy = K.jump ? -720 : -420; combo++; comboT = 1.2;
    const pts = [100, 200, 400, 800, 1000, 2000, 4000, 8000][Math.min(7, combo - 1)];
    addScore(pts, e.x, e.y - 10); SFX.stomp(combo); shake = 0.08;
    if (combo >= 8) { lives++; SFX.oneup(); popText(e.x, e.y - 30, "1UP", "#C96442"); }
  } else hurtPlayer();
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function camFollow() { const target = player.x - W * 0.38; camX = Math.max(camX, Math.min(target, LW * T - W)); camX = Math.max(0, camX); }
function updateParts() {
  for (const q of parts) { q.vy += 900 * DT; q.x += q.vx * DT; q.y += q.vy * DT; q.life -= DT; }
  parts = parts.filter((q) => q.life > 0);
  for (const t of texts) { t.y -= 50 * DT; t.life -= DT; }
  texts = texts.filter((t) => t.life > 0);
}

// ---------- drawing ----------
function drawImg(name, x, y, w, h, flip) {
  const i = IMG[name];
  if (!ok(i)) { ctx.fillStyle = "#D97757"; ctx.fillRect(x, y, w, h); return; }
  if (flip) { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(i, 0, 0, w, h); ctx.restore(); }
  else ctx.drawImage(i, x, y, w, h);
}
// draws a sprite anchored at bottom-centre with fixed height, keeping the image's aspect
function drawAnchored(name, cx, by, h, flip, sx = 1, sy = 1) {
  const i = IMG[name]; if (!ok(i)) return;
  const hh = h * sy, ww = (i.naturalWidth / i.naturalHeight) * h * sx;
  drawImg(name, Math.round(cx - ww / 2), Math.round(by - hh), Math.round(ww), Math.round(hh), flip);
}
const K_HERO = 0.52, K_BUG = 0.47, K_GHOST = 0.45; // assets are stored at ~2x game size
const natH = (n) => (ok(IMG[n]) ? IMG[n].naturalHeight : 64);
function heroFrame() {
  const p = player;
  if (p.dead) return "dario-hurt";
  if (state === "clear" && stateT < 1.2) return "dario-win";
  if (p.throwT > 0) return "dario-throw";
  if (p.crouch) return "dario-crouch";
  if (!p.ground) return "dario-jump";
  if (Math.abs(p.vx) > 10) return Math.floor(p.an) % 2 ? "dario-run-a" : "dario-run-b";
  return "dario-idle";
}

function drawBg() {
  const i = IMG.bg;
  if (ok(i)) {
    const h = H, w = (i.naturalWidth / i.naturalHeight) * h, off = -((camX * 0.3) % w);
    for (let x = off; x < W; x += w) ctx.drawImage(i, Math.floor(x), 0, Math.ceil(w) + 1, h);
  } else { ctx.fillStyle = "#F5F0E8"; ctx.fillRect(0, 0, W, H); }
}
function drawTiles() {
  const x0 = Math.floor(camX / T), x1 = Math.min(LW - 1, x0 + Math.ceil(W / T) + 1);
  const now = performance.now() / 1000;
  for (let y = 0; y < ROWS; y++) for (let x = x0; x <= x1; x++) {
    const c = grid[y][x]; if (c === " ") continue;
    let px = x * T - Math.round(camX), py = y * T;
    const bp = bumps.find((b) => b.x === x && b.y === y); if (bp) py -= Math.sin((bp.t / 0.15) * Math.PI) * 10;
    if (c === "#") { const top = y === 0 || grid[y - 1][x] !== "#"; drawImg(top ? "ground" : "dirt", px, py, T, T); }
    else if (c === "B") drawImg("brick", px, py, T, T);
    else if (c === "S") drawImg("block-star", px, py, T, T);
    else if (c === "=") drawImg("block-used", px, py, T, T);
    else { // hittable star block: shimmer
      drawImg("block-star", px, py, T, T);
      const a = 0.35 + 0.35 * Math.sin(now * 5 + x);
      ctx.strokeStyle = `rgba(255,214,120,${a})`; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
      if (Math.sin(now * 5 + x) > 0.85) { ctx.fillStyle = "#fff6dc"; ctx.fillRect(px + 4 + ((now * 40) % 20), py + 4, 3, 3); }
    }
  }
}
function drawEnts() {
  for (const e of ents) {
    const x = e.x - Math.round(camX);
    if (x < -300 || x > W + 300) continue;
    if (e.t === "token") { const s = Math.abs(Math.cos(e.ph)); const w = Math.max(4, 22 * s); drawImg("token", x + 10 - w / 2, e.y - 1, w, 22); }
    else if (e.t === "poptoken") drawImg("token", x, e.y, 22, 22);
    else if (e.t === "spark") { const pul = 1 + Math.sin(performance.now() / 90) * 0.08; drawAnchored("spark", x + 14, e.y + 28, 30 * pul, false); }
    else if (e.t === "shot") { ctx.save(); ctx.translate(x + 7, e.y + 7); ctx.rotate(performance.now() / 60); drawImg("spark", -9, -9, 18, 18); ctx.restore(); }
    else if (e.t === "bug") {
      if (e.flat) drawAnchored("bug-flat", x + e.w / 2, e.y + e.h + 1, natH("bug-flat") * K_BUG, false);
      else if (e.flip) { ctx.save(); ctx.translate(x + e.w / 2, e.y + e.h / 2); ctx.scale(1, -1); drawAnchored(Math.floor(e.an) % 2 ? "bug-a" : "bug-b", 0, e.h / 2, natH("bug-a") * K_BUG, e.vx > 0); ctx.restore(); }
      else drawAnchored(Math.floor(e.an) % 2 ? "bug-a" : "bug-b", x + e.w / 2, e.y + e.h + 1, natH("bug-a") * K_BUG, e.vx > 0);
    }
    else if (e.t === "ghost") {
      ctx.globalAlpha = e.dead ? 0.5 : 0.92;
      drawAnchored(Math.floor(e.an * 4) % 2 ? "ghost-a" : "ghost-b", x + e.w / 2, e.y + e.h + 4, natH("ghost-a") * K_GHOST, e.vx > 0);
      ctx.globalAlpha = 1;
    }
    else if (e.t === "goal") drawAnchored("goal", x + 16, e.y + e.h, e.h, false);
  }
}
function drawPlayer() {
  const p = player;
  if (p.inv > 0 && Math.floor(p.inv * 20) % 2) return;
  const f = heroFrame(), cx = p.x + p.w / 2 - Math.round(camX), by = p.y + p.h + 2;
  const sx = 2 - p.sq, sy = p.sq;
  if (p.power) { ctx.fillStyle = "rgba(217,119,87,.28)"; ctx.beginPath(); ctx.ellipse(cx, by - 28, 26, 34, 0, 0, Math.PI * 2); ctx.fill(); }
  const faceViewer = f === "dario-hurt" || f === "dario-win";
  drawAnchored(f, cx, by, natH(f) * K_HERO, !faceViewer && p.face < 0, sx, sy);
}
function drawParts() {
  for (const q of parts) { ctx.globalAlpha = Math.min(1, q.life * 2); ctx.fillStyle = q.col; ctx.fillRect(q.x - Math.round(camX), q.y, q.sz, q.sz); }
  ctx.globalAlpha = 1;
  ctx.font = "12px 'Press Start 2P', monospace"; ctx.textAlign = "center";
  for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life * 2); ctx.fillStyle = "#fff"; ctx.fillText(t.s, t.x - camX + 12, t.y + 2); ctx.fillStyle = t.col; ctx.fillText(t.s, t.x - camX + 10, t.y); }
  ctx.globalAlpha = 1; ctx.textAlign = "left";
}
function txt(s, x, y, size = 16, col = "#2b211c", align = "left", outline = "#F5F0E8") {
  ctx.font = `${size}px 'Press Start 2P', monospace`; ctx.textAlign = align;
  ctx.fillStyle = outline; for (const [dx, dy] of [[-2,0],[2,0],[0,-2],[0,2],[2,2]]) ctx.fillText(s, x + dx, y + dy);
  ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.textAlign = "left";
}
function hud() {
  txt("DARIO", 24, 34, 14); txt(String(score).padStart(7, "0"), 24, 58, 14);
  if (ok(IMG.token)) ctx.drawImage(IMG.token, 250, 30, 22, 22); txt("x" + String(tokens).padStart(2, "0"), 278, 50, 14);
  txt("WORLD", 440, 34, 14); txt(LEVELS[levelIdx].name.split(" ")[0], 452, 58, 14);
  txt("TIME", 640, 34, 14); txt(String(Math.ceil(timeLeft)), 650, 58, 14, timeLeft < 60 ? "#C96442" : "#2b211c");
  if (ok(IMG["dario-idle"])) drawAnchored("dario-idle", 838, 58, 34, false); txt("x" + lives, 858, 52, 14);
  if (combo > 1) txt(`COMBO x${combo}`, W / 2, 96, 14, "#C96442", "center");
  if (muted) txt("MUTE", W - 20, H - 16, 10, "#8a7a6a", "right");
}
function drawTitle() {
  drawBg();
  ctx.fillStyle = "rgba(245,240,232,.55)"; ctx.fillRect(0, 0, W, H);
  const bob = Math.sin(stateT * 3) * 6;
  txt("SUPER", W / 2, 150 + bob, 40, "#C96442", "center", "#2b211c");
  txt("DARIO", W / 2, 215 + bob, 64, "#D97757", "center", "#2b211c");
  if (ok(IMG["dario-win"])) drawAnchored("dario-win", W / 2 - 170, 360, 110, false);
  if (ok(IMG["bug-a"])) drawAnchored(Math.floor(stateT * 4) % 2 ? "bug-a" : "bug-b", W / 2 + 170, 360, 50, false);
  for (let i = 0; i < 9; i++) drawImg("block-star", W / 2 - 144 + i * T, 362, T, T);
  if (Math.floor(stateT * 2) % 2 === 0) txt("PRESS ENTER / TAP", W / 2, 440, 16, "#2b211c", "center");
  txt("ARROWS move  ·  Z/SPACE jump  ·  X fire/run  ·  M mute  ·  R or ● button records", W / 2, 490, 10, "#5a4a3e", "center");
  if (best.score) txt("BEST " + best.score, W / 2, 520, 10, "#C96442", "center");
}
function render() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  if (state === "title") { drawTitle(); ctx.restore(); return; }
  drawBg(); drawTiles(); drawEnts(); drawPlayer(); drawParts();
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = `rgba(255,248,236,${flash * 2})`; ctx.fillRect(0, 0, W, H); }
  hud();
  if (state === "intro") {
    ctx.fillStyle = "#2b211c"; ctx.fillRect(0, 0, W, H);
    txt(LEVELS[levelIdx].name, W / 2, 230, 24, "#F5F0E8", "center", "#2b211c");
    if (ok(IMG["dario-idle"])) drawAnchored("dario-idle", W / 2 - 40, 330, 64, false);
    txt("x " + lives, W / 2 + 30, 315, 20, "#F5F0E8", "center", "#2b211c");
    const b = best["L" + levelIdx]; if (b) txt("BEST TIME " + b.toFixed(1) + "s", W / 2, 400, 12, "#D97757", "center", "#2b211c");
  }
  if (state === "over") { ctx.fillStyle = "rgba(43,33,28,.85)"; ctx.fillRect(0, 0, W, H); txt("GAME OVER", W / 2, 250, 36, "#D97757", "center", "#2b211c"); txt("score " + score, W / 2, 310, 14, "#F5F0E8", "center", "#2b211c"); if (stateT > 1) txt("PRESS ENTER", W / 2, 380, 14, "#F5F0E8", "center", "#2b211c"); }
  if (state === "done") { ctx.fillStyle = "rgba(245,240,232,.9)"; ctx.fillRect(0, 0, W, H); txt("YOU SHIPPED IT!", W / 2, 200, 32, "#C96442", "center", "#2b211c"); drawAnchored("dario-win", W / 2, 360, 120, false); txt("final score " + score, W / 2, 410, 16, "#2b211c", "center"); txt("best " + (best.score || score), W / 2, 445, 12, "#C96442", "center"); if (stateT > 1) txt("PRESS ENTER TO PLAY AGAIN", W / 2, 500, 12, "#2b211c", "center"); }
  if (paused) { ctx.fillStyle = "rgba(43,33,28,.6)"; ctx.fillRect(0, 0, W, H); txt("PAUSED", W / 2, H / 2, 32, "#F5F0E8", "center", "#2b211c"); }
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= DT) { update(); acc -= DT; }
  ctx.imageSmoothingEnabled = false;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__dario = { get state() { return state; }, get player() { return player; }, get score() { return score; }, warp(i) { levelIdx = i; loadLevel(i); state = "play"; }, step(n) { for (let i = 0; i < n; i++) update(); render(); }, key(k, v) { if (v && !K[k] && k === "jump") jumpPressed = 0.12; if (v && k === "fire") firePressed = 1; K[k] = v; }, get ents() { return ents; }, get grid() { return grid; }, get lives() { return lives; }, get levelIdx() { return levelIdx; }, set lives(v) { lives = v; } };
})();
