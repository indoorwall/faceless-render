// Playable World — juegos de Reto Imposible que parecen pequeños videojuegos.
// Lógica pura (sin dibujo): cada juego genera el reto, lo valida y lo SIMULA. La simulación es la única
// fuente de verdad: de ella salen la respuesta, la animación de la revelación y los sonidos de la acción,
// así que el vídeo nunca puede contradecir la solución. El dibujo está en world-draw.js.
import { rng } from "./util.js";

export const WORLD_VERSION = "1.0";
const DIFFS = ["easy", "medium", "hard", "extreme"];
const di = (d) => Math.max(0, DIFFS.indexOf(d));
export const LETTERS = ["A", "B", "C", "D", "E"];

// ---------- Efectos de las acciones (se generan una vez por canal y se reutilizan) ----------
export const WORLD_SOUNDS = [
  { code: "S13", name: "Rodadura", emoji: "⚪", event: "Una bola rueda", group: "sfx", seconds: 1.2, prompt: "small glass marble rolling on a smooth wooden track, steady soft rolling, 1 second, no impacts, clean" },
  { code: "S14", name: "Palanca", emoji: "🎚️", event: "Palanca o interruptor", group: "sfx", seconds: 0.4, prompt: "single crisp mechanical lever click, small plastic switch flipping, toy game mechanism, short, dry" },
  { code: "S15", name: "Engranajes", emoji: "⚙️", event: "La máquina se activa", group: "sfx", seconds: 1.2, prompt: "small toy gears and clockwork mechanism starting to turn, soft ratcheting, cartoon machine activation, short" },
  { code: "S16", name: "Puerta", emoji: "🚪", event: "Puerta o cofre que se abre", group: "sfx", seconds: 1, prompt: "small wooden door or treasure chest opening, soft creak and a light thump, cartoon game, short" },
  { code: "S17", name: "Aparecer", emoji: "✨", event: "Un objeto aparece", group: "sfx", seconds: 0.6, prompt: "magical pop appear sound, bright soft sparkle with a bubbly pop, casual mobile game, short" },
  { code: "S18", name: "Desaparecer", emoji: "💨", event: "Un objeto desaparece", group: "sfx", seconds: 0.6, prompt: "quick soft poof disappear sound, airy puff with a light downward sweep, cartoon game, short" },
  { code: "S19", name: "Salto", emoji: "🦘", event: "Un personaje salta", group: "sfx", seconds: 0.5, prompt: "cute cartoon jump boing, light springy hop, casual game character, short" },
  { code: "S20", name: "Choque", emoji: "💥", event: "Un objeto choca", group: "sfx", seconds: 0.5, prompt: "soft cartoon bump, small ball hitting a wooden wall, muted thud with a tiny wobble, short, not loud" },
  { code: "S21", name: "Caída en cubo", emoji: "🪣", event: "Una bola cae en un recipiente", group: "sfx", seconds: 0.6, prompt: "small marble dropping into a plastic bucket, light hollow plunk with a short rattle, toy game, short" },
  { code: "S22", name: "Zoom", emoji: "🔎", event: "Acercamiento a una pista", group: "transition", seconds: 0.6, prompt: "quick soft zoom in whoosh with a subtle rising tone, magnifying glass reveal, casual game, short" },
];

// ================= A. LABERINTO: «¿CUÁL ES EL CAMINO?» =================
// Tres entradas arriba, una meta abajo. Solo una entrada llega a la meta.
// Paredes: right[y][x] = pared a la derecha de la casilla; down[y][x] = pared debajo.
function mazeOpen(m, x, y, dx, dy) {
  if (dx === 1) return x < m.w - 1 && !m.right[y][x];
  if (dx === -1) return x > 0 && !m.right[y][x - 1];
  if (dy === 1) return y < m.h - 1 && !m.down[y][x];
  return y > 0 && !m.down[y - 1][x];
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Recorrido en anchura: devuelve el camino más corto entre dos casillas (o null)
export function mazePath(m, from, to) {
  const key = (x, y) => y * m.w + x, prev = new Map([[key(...from), null]]), q = [from];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === to[0] && y === to[1]) { const path = []; let k = key(x, y); while (k != null) { path.push([k % m.w, Math.floor(k / m.w)]); k = prev.get(k); } return path.reverse(); }
    for (const [dx, dy] of DIRS) if (mazeOpen(m, x, y, dx, dy)) { const k = key(x + dx, y + dy); if (!prev.has(k)) { prev.set(k, key(x, y)); q.push([x + dx, y + dy]); } }
  }
  return null;
}
function mazeReach(m, from) { const seen = new Set([from[1] * m.w + from[0]]), q = [from]; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of DIRS) if (mazeOpen(m, x, y, dx, dy)) { const k = (y + dy) * m.w + x + dx; if (!seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); } } } return seen; }
// Simulación: la bola de cada entrada intenta llegar a la meta; las equivocadas avanzan hasta la casilla
// de su zona más cercana a la meta y chocan. Todo sale de las paredes guardadas.
export function simMaze(c) {
  const m = c.data, goal = [m.goal, m.h - 1];
  const runs = m.entrances.map((ex, i) => {
    const start = [ex, 0], full = mazePath(m, start, goal);
    if (full) return { entrance: i, reaches: true, path: full };
    const zone = mazeReach(m, start); let best = null, bd = 1e9;
    for (const k of zone) { const x = k % m.w, y = Math.floor(k / m.w), d = Math.abs(x - goal[0]) + Math.abs(y - goal[1]); if (d < bd || (d === bd && k < best)) { bd = d; best = k; } }
    return { entrance: i, reaches: false, path: mazePath(m, start, [best % m.w, Math.floor(best / m.w)]) };
  });
  return { runs, winner: runs.findIndex((r) => r.reaches) };
}
function genMaze(r, d, o = {}) {
  // Las proporciones del laberinto se adaptan a la pantalla: alto en Short, ancho en vídeo largo
  const L = di(d), long = o.format === "long", w = long ? [9, 12, 14, 16][L] : [6, 7, 8, 9][L], h = long ? [5, 6, 7, 8][L] : [7, 9, 10, 12][L];
  for (let attempt = 0; attempt < 150; attempt++) {
    const right = Array.from({ length: h }, () => Array(w).fill(true)), down = Array.from({ length: h }, () => Array(w).fill(true));
    // Laberinto perfecto (backtracking iterativo)
    const seen = new Set([0]), st = [[0, 0]];
    while (st.length) {
      const [x, y] = st[st.length - 1];
      const nb = r.shuffle(DIRS).filter(([dx, dy]) => x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && !seen.has((y + dy) * w + x + dx));
      if (!nb.length) { st.pop(); continue; }
      const [dx, dy] = nb[0];
      if (dx === 1) right[y][x] = false; else if (dx === -1) right[y][x - 1] = false; else if (dy === 1) down[y][x] = false; else down[y - 1][x] = false;
      seen.add((y + dy) * w + x + dx); st.push([x + dx, y + dy]);
    }
    const m = { w, h, right, down };
    const cols = [Math.round((w - 1) * 0.12), Math.round((w - 1) * 0.5), Math.round((w - 1) * 0.88)].map((x, i) => Math.min(w - 1, Math.max(0, x + (i === 1 ? r.int(-1, 1) : 0))));
    if (new Set(cols).size < 3) continue;
    const goal = r.int(0, w - 1), win = r.int(0, 2), G = [goal, h - 1];
    const keyE = (a, b) => `${a[0]},${a[1]}|${b[0]},${b[1]}`;
    // Se corta un tramo del camino de cada entrada equivocada que no pertenezca al camino bueno
    const good = mazePath(m, [cols[win], 0], G), goodEdges = new Set(); for (let i = 1; i < good.length; i++) { goodEdges.add(keyE(good[i - 1], good[i])); goodEdges.add(keyE(good[i], good[i - 1])); }
    for (let e = 0; e < 3; e++) {
      if (e === win) continue;
      const p = mazePath(m, [cols[e], 0], G); if (!p) continue;
      const own = []; for (let i = 1; i < p.length; i++) if (!goodEdges.has(keyE(p[i - 1], p[i]))) own.push([p[i - 1], p[i]]);
      if (own.length < 2) { own.length = 0; break; }
      // Corte en la parte central del tramo propio: ni pegado a la entrada ni obvio
      const [a, b] = own[Math.min(own.length - 1, Math.max(1, Math.floor(own.length * (0.4 + r() * 0.35))))];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (dx === 1) right[a[1]][a[0]] = true; else if (dx === -1) right[b[1]][b[0]] = true; else if (dy === 1) down[a[1]][a[0]] = true; else down[b[1]][b[0]] = true;
    }
    const c = { data: { w, h, right, down, entrances: cols, goal }, answer: {} };
    const s = simMaze(c);
    if (s.runs.filter((x) => x.reaches).length !== 1 || s.winner !== win) continue;
    if (s.runs[win].path.length < h + (L ? 2 : 0)) continue; // que haya que pensar
    if (s.runs.some((x) => !x.reaches && x.path.length < 4)) continue; // las equivocadas no se descartan a simple vista
    return { question: "¿Cuál es el camino?", instructions: "¿Qué entrada llega a la meta?", data: c.data, answer: { entrance: win, label: `Entrada ${LETTERS[win]}` }, explanation: "" };
  }
  throw new Error("laberinto sin solución única");
}
function valMaze(c) {
  const m = c.data, out = [];
  if (!(m.w >= 4 && m.h >= 4 && m.right?.length === m.h && m.down?.length === m.h)) return ["Laberinto mal formado"];
  if (!(m.entrances?.length === 3 && new Set(m.entrances).size === 3 && m.entrances.every((x) => x >= 0 && x < m.w))) out.push("Entradas no válidas");
  if (!(m.goal >= 0 && m.goal < m.w)) out.push("Meta fuera del laberinto");
  const s = simMaze(c), ok = s.runs.filter((x) => x.reaches);
  if (ok.length !== 1) out.push(`Llegan a la meta ${ok.length} entradas (debe ser 1)`);
  if (s.winner !== c.answer?.entrance) out.push("La respuesta no es la entrada que llega a la meta");
  return out.length ? out : [true];
}

// ================= B. MÁQUINA DE BOLAS Y PALANCAS: «¿DÓNDE CAE?» =================
// Tablero triangular de palancas. Cada palanca manda la bola a un lado (0 izquierda, 1 derecha)
// y cambia de posición al pasar la bola. Caen varias bolas, una tras otra.
export function simMachine(c) {
  const { levels, state, balls } = c.data, st = state.map((row) => [...row]), runs = [];
  for (let b = 0; b < balls; b++) {
    let pos = 0; const hits = [];
    for (let k = 0; k < levels; k++) { const dir = st[k][pos]; hits.push({ k, pos, dir }); st[k][pos] = 1 - dir; pos += dir; }
    runs.push({ hits, bucket: pos });
  }
  return { runs, last: runs[runs.length - 1].bucket, final: st };
}
function genMachine(r, d) {
  const L = di(d), levels = [3, r.pick([3, 4]), r.pick([3, 4]), 4][L], balls = [1, 2, 3, 3][L];
  for (let attempt = 0; attempt < 60; attempt++) {
    const state = Array.from({ length: levels }, (_, k) => Array.from({ length: k + 1 }, () => r.int(0, 1)));
    const c = { data: { levels, state, balls } };
    const s = simMachine(c);
    // Que haga falta pensar: con varias bolas, la última no cae donde caería la primera
    if (balls > 1 && s.runs[0].bucket === s.last) continue;
    if (L === 0 && s.last === 0 && r() < 0.6) continue; // evitar siempre «todo a la izquierda»
    const q = balls === 1 ? "¿Dónde cae la bola?" : "¿Dónde cae la última bola?";
    return { question: q, instructions: balls === 1 ? "Sigue las palancas" : `Caen ${balls} bolas · cada palanca cambia de lado al pasar`, data: c.data, answer: { bucket: s.last, label: `Cubo ${LETTERS[s.last]}` }, explanation: "" };
  }
  throw new Error("máquina sin reto interesante");
}
function valMachine(c) {
  const { levels, state, balls } = c.data || {}, out = [];
  if (!(levels >= 2 && levels <= 4 && state?.length === levels && state.every((row, k) => row.length === k + 1 && row.every((v) => v === 0 || v === 1)))) return ["Palancas mal definidas"];
  if (!(balls >= 1 && balls <= 4)) out.push("Número de bolas no válido");
  const s = simMachine(c);
  if (s.last !== c.answer?.bucket) out.push("La respuesta no coincide con la simulación");
  return out.length ? out : [true];
}

// ================= C. HABITACIÓN CON UN ERROR: «ENCUENTRA EL ERROR» =================
// La escena se compone de objetos cotidianos. Uno (y solo uno) tiene un error comprobable.
export const ROOM_ERRORS = {
  picture: { err: "upside", why: "¡El cuadro está del revés!", level: 0 },
  candle: { err: "flame_down", why: "¡La llama de la vela va hacia abajo!", level: 0 },
  shelf: { err: "floating_book", why: "¡Un libro flota en el aire!", level: 0 },
  cup: { err: "steam_upside", why: "¡La taza está boca abajo y echa vapor!", level: 1 },
  table: { err: "one_leg", why: "¡La mesa se sostiene con una sola pata en un extremo!", level: 1 },
  calendar: { err: "feb30", why: "¡El 30 de febrero no existe!", level: 1 },
  clock: { err: "numbers", why: "¡El reloj tiene el 12 abajo!", level: 2 },
  door: { err: "handle_hinge", why: "¡El pomo está en el lado de las bisagras!", level: 2 },
};
export const ROOM_OBJECTS = ["window", "clock", "picture", "calendar", "shelf", "door", "lamp", "sofa", "table", "cup", "candle", "plant"];
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"], MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function genRoom(r, d) {
  const L = di(d), pool = Object.keys(ROOM_ERRORS).filter((k) => ROOM_ERRORS[k].level <= Math.min(2, L) && ROOM_ERRORS[k].level >= Math.max(0, L - 1));
  const target = r.pick(pool);
  const items = ROOM_OBJECTS.map((kind) => ({ kind, ...(kind === target ? { err: ROOM_ERRORS[kind].err } : {}) }));
  const month = target === "calendar" ? 1 : r.pick([0, 2, 3, 4, 5, 6, 8, 9, 10, 11]);
  const data = {
    items,
    palette: r.int(0, 3), // combinación de colores de la habitación
    clock: { h: r.int(1, 11), m: r.pick([0, 10, 15, 20, 30, 40, 45]) },
    calendar: { day: target === "calendar" ? 30 : r.int(1, MDAYS[month]), month: MONTHS[month] },
    picture: r.pick(["mountain", "house", "boat"]),
    pix: r.pick(["left", "right"]),
  };
  return { question: "Encuentra el error", instructions: "Algo no puede ser así", data, answer: { object: target, label: ROOM_ERRORS[target].why }, explanation: "" };
}
function valRoom(c) {
  const { items, calendar } = c.data || {}, out = [];
  if (!Array.isArray(items) || !items.every((i) => ROOM_OBJECTS.includes(i.kind))) return ["Objetos de la escena no válidos"];
  const errs = items.filter((i) => i.err);
  if (errs.length !== 1) out.push(`Hay ${errs.length} errores (debe haber 1)`);
  for (const e of errs) if (ROOM_ERRORS[e.kind]?.err !== e.err) out.push(`Error desconocido en ${e.kind}`);
  if (errs[0] && errs[0].kind !== c.answer?.object) out.push("La respuesta no es el objeto con el error");
  // Los objetos «correctos» tienen que serlo de verdad
  const mi = MONTHS.indexOf(calendar?.month);
  if (mi < 0) out.push("Mes no válido");
  else if (c.answer?.object !== "calendar" && !(calendar.day >= 1 && calendar.day <= MDAYS[mi])) out.push("El calendario tiene una fecha imposible sin ser el error");
  else if (c.answer?.object === "calendar" && calendar.day <= MDAYS[mi]) out.push("El error del calendario no es una fecha imposible");
  return out.length ? out : [true];
}

// ---------- Registro de juegos: generador, validador y guion de la revelación ----------
// reveal(c) → { dur, solved, events:[{t, code, gain}] } en segundos desde el inicio de la revelación.
// Las duraciones salen de la misma simulación que valida la respuesta.
const MAZE_SPEED = 6.5, GHOST_SPEED = 8; // casillas por segundo
export function mazeScript(c) {
  const s = simMaze(c), ghosts = s.runs.filter((x) => !x.reaches);
  const gDur = Math.min(2.2, Math.max(...ghosts.map((g) => (g.path.length - 1) / GHOST_SPEED)) + 0.25);
  const win = s.runs[s.winner], mDur = Math.min(4.8, Math.max(1.6, (win.path.length - 1) / MAZE_SPEED));
  return { s, gStart: 0.1, gDur, mStart: 0.1 + gDur + 0.25, mDur, open: 0.1 + gDur + 0.25 + mDur };
}
const PER_LEVEL = 0.36, DROP = 0.45, LAND = 0.35;
export function machineScript(c) {
  const s = simMachine(c), L = c.data.levels;
  // Cada bola sale cuando la anterior ha caído; la última va un poco más despacio para verla bien
  let t = 0.9; const balls = s.runs.map((run, b) => { const last = b === s.runs.length - 1, per = last ? PER_LEVEL * 1.25 : PER_LEVEL; const x = { start: t, per, hitAt: run.hits.map((_, k) => t + DROP + k * per), landAt: t + DROP + L * per + LAND * 0.4 }; t = x.landAt + (last ? 0 : 0.15); return x; });
  return { s, balls, end: balls[balls.length - 1].landAt };
}
export const roomScript = () => ({ zoomIn: 0.15, mark: 0.85, fix: 1.9, zoomOut: 3.1, end: 3.6 });
export const WORLD = {
  maze: {
    category: "maze", gen: genMaze, val: valMaze, time: [10, 12, 15, 18],
    reveal(c) {
      const k = mazeScript(c), ev = [];
      k.s.runs.forEach((g) => { if (!g.reaches) ev.push({ t: k.gStart + (g.path.length - 1) / GHOST_SPEED, code: "S20", gain: 0.8 }); });
      for (let t = k.mStart; t < k.mStart + k.mDur - 0.3; t += 1.0) ev.push({ t, code: "S13", gain: 0.9 });
      ev.push({ t: k.open, code: "S16", gain: 0.9 });
      return { dur: k.open + 1.3, solved: k.open + 0.15, events: ev };
    },
  },
  machine: {
    category: "machine", gen: genMachine, val: valMachine, time: [8, 12, 15, 18],
    reveal(c) {
      const k = machineScript(c), ev = [{ t: 0.05, code: "S15", gain: 0.9 }];
      k.balls.forEach((b) => { b.hitAt.forEach((t) => ev.push({ t, code: "S14", gain: 0.85 })); ev.push({ t: b.start + DROP, code: "S13", gain: 0.5 }); ev.push({ t: b.landAt, code: "S21", gain: 0.9 }); });
      return { dur: k.end + 1.4, solved: k.end + 0.05, events: ev };
    },
  },
  room_error: {
    category: "error", gen: genRoom, val: valRoom, time: [8, 10, 12, 14],
    reveal() { const k = roomScript(); return { dur: k.end + 0.9, solved: k.mark, events: [{ t: k.zoomIn, code: "S22", gain: 0.9 }, { t: k.fix, code: "S17", gain: 0.9 }] }; },
  },
};
export const WORLD_CATEGORIES = {
  maze: { label: "Laberintos", emoji: "🌀", mechanics: ["maze"], world: true },
  machine: { label: "Máquinas y mecanismos", emoji: "⚙️", mechanics: ["machine"], world: true },
  error: { label: "Encuentra el error", emoji: "🔎", mechanics: ["room_error"], world: true },
};
export const WORLD_ORDER = ["maze", "machine", "error"];
export const isWorld = (c) => !!(c && WORLD[c.mechanic]);
export { rng };
