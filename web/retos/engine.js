// Motor B — Retos interactivos: generación de acertijos, validación por código y línea de tiempo.
// Es JavaScript puro, sin dependencias: lo usan igual la web (previsualización y edición),
// el servidor de montaje (node-canvas + FFmpeg) y el motor de Supabase (validación antes de montar).
// El dibujo está en draw.js.

export const ENGINE_VERSION = "1.0";
export const FPS = 30;

// ---------- Identidad por defecto (todo configurable por canal) ----------
export const DEFAULT_THEME = {
  bg: "#15213B", // azul marino principal
  timer: "#FFC83D", // amarillo: temporizadores y acentos
  ok: "#2ED47A", // verde: soluciones
  alert: "#FF6B5B", // rojo coral: alertas y últimos segundos
  text: "#FFFFFF", // blanco: textos
  teal: "#2EC4C4", // turquesa: elementos secundarios
};
export const DIFFS = ["easy", "medium", "hard", "extreme"];
export const DIFF_LABEL = { easy: "Fácil", medium: "Intermedio", hard: "Difícil", extreme: "Extremo" };
export const DEFAULT_CONFIG = {
  timer_mode: "normal", // normal | focus | extreme
  timer_sounds: true,
  points: { easy: 1, medium: 2, hard: 3, extreme: 5 },
  times: { easy: 6, medium: 8, hard: 10, extreme: 12 }, // segundos de temporizador por dificultad
  long_minutes: 8,
  short_seconds: [15, 35],
  narration: "minimal", // none | minimal | moderate | full
  music_mode: "library", // library | none
  // Volúmenes en % (el mezclador los convierte a ganancia: 100 % = 0 dB)
  volumes: { music: 10, voice: 100, sfx: 35, clock: 25, transition: 30, reward: 40 },
  ranks: ["Aprendiz", "Buen observador", "Mente brillante", "Experto", "Reto Imposible superado"],
};
export function mergeConfig(c) {
  const x = c || {};
  return { ...DEFAULT_CONFIG, ...x, points: { ...DEFAULT_CONFIG.points, ...(x.points || {}) }, times: { ...DEFAULT_CONFIG.times, ...(x.times || {}) }, volumes: { ...DEFAULT_CONFIG.volumes, ...(x.volumes || {}) }, ranks: Array.isArray(x.ranks) && x.ranks.length >= 3 ? x.ranks : DEFAULT_CONFIG.ranks };
}
export function mergeTheme(t) { return { ...DEFAULT_THEME, ...(t || {}) }; }

// ---------- Identidad sonora: los 12 efectos del canal (se generan una vez y se reutilizan) ----------
// group = qué control de volumen les afecta
export const SOUNDS = [
  { code: "S01", name: "Inicio", emoji: "🎬", event: "Identidad sonora del canal", group: "sfx", seconds: 2.5, prompt: "short modern game show intro sting, bright synth swell with a punchy finish, energetic but clean, no voice" },
  { code: "S02", name: "Nueva pregunta", emoji: "❓", event: "Entrada de un desafío", group: "transition", seconds: 1, prompt: "quick soft game UI pop with a light rising whoosh, new question appears, clean and modern, not harsh" },
  { code: "S03", name: "Tic reloj", emoji: "⏱️", event: "Paso de un segundo", group: "clock", seconds: 0.5, prompt: "single soft wooden clock tick, short, dry, warm, low volume, no ring" },
  { code: "S04", name: "Cuenta atrás final", emoji: "⏳", event: "Últimos segundos", group: "clock", seconds: 0.6, prompt: "single tense countdown beep, soft synth blip with a slight low thump, short, game show final seconds, not shrill" },
  { code: "S05", name: "Respuesta correcta", emoji: "✅", event: "Revelación positiva", group: "reward", seconds: 1.5, prompt: "satisfying correct answer chime, bright two-note arpeggio with sparkle, quiz game reward, warm, not piercing" },
  { code: "S06", name: "Tiempo agotado", emoji: "⏰", event: "Final del temporizador", group: "clock", seconds: 1, prompt: "time is up sound, short soft buzzer with a low synth drop, game show, not aggressive" },
  { code: "S07", name: "Cambio de nivel", emoji: "📈", event: "Nueva ronda", group: "transition", seconds: 2, prompt: "level up transition, rising synth sweep ending in a bright hit, modern video game, energetic" },
  { code: "S08", name: "Nivel extremo", emoji: "🔥", event: "Anuncio especial", group: "transition", seconds: 2.5, prompt: "dramatic final round announcement, deep cinematic boom with a tense rising synth, epic but short, not distorted" },
  { code: "S09", name: "Puntuación", emoji: "🏅", event: "Recuento de puntos", group: "reward", seconds: 0.8, prompt: "quick coin collect sound, light arcade score counter ding, pleasant, short" },
  { code: "S10", name: "Victoria", emoji: "🏆", event: "Final del vídeo", group: "reward", seconds: 3, prompt: "victory fanfare, short triumphant synth and brass flourish, game show winner, joyful, clean ending" },
  { code: "S11", name: "Transición", emoji: "🔀", event: "Cambio de escena", group: "transition", seconds: 0.8, prompt: "fast smooth swoosh transition, airy, modern UI, subtle" },
  { code: "S12", name: "Error", emoji: "❌", event: "Solo si el formato identifica un fallo", group: "sfx", seconds: 0.8, prompt: "soft wrong answer sound, gentle low two-note descending synth, quiz game, not harsh" },
];
export const MUSIC = [
  { code: "M1", mood: "normal", name: "Normal", emoji: "🎵", seconds: 60, prompt: "light minimal electronic background music for a quiz game, playful and modern, steady pleasant groove around 110 bpm, soft synths and plucks, no vocals, seamless loop, leaves room for sound effects" },
  { code: "M2", mood: "focus", name: "Concentración", emoji: "🧠", seconds: 60, prompt: "soft calm ambient background music for concentration, very few instruments, gentle pads and a light pulse, no distracting melody, no vocals, seamless loop" },
  { code: "M3", mood: "extreme", name: "Extremo", emoji: "🔥", seconds: 60, prompt: "intense but not aggressive electronic background music for the final round of a quiz game, driving rhythm, tense synth bass, building energy, no vocals, seamless loop" },
];
export const ROUND_MOOD = { easy: "normal", medium: "normal", hard: "focus", extreme: "extreme" };

// ---------- Categorías y mecánicas (añadir una nueva = añadir un generador al registro) ----------
export const CATEGORIES = {
  odd: { label: "Encuentra el diferente", emoji: "🔍", mechanics: ["odd_symbol", "odd_color", "odd_rotation"] },
  differences: { label: "Encuentra las diferencias", emoji: "👀", mechanics: ["differences"] },
  memory: { label: "Memoria visual", emoji: "🧠", mechanics: ["memory_missing"] },
  logic: { label: "Lógica", emoji: "🧩", mechanics: ["logic_equations"] },
  sequence: { label: "Secuencias", emoji: "🔢", mechanics: ["sequence_number", "sequence_shape"] },
  culture: { label: "Cultura general visual", emoji: "🌍", mechanics: ["flags"] },
  hidden: { label: "Objetos ocultos", emoji: "🕵️", mechanics: ["hidden_object"] },
  silhouette: { label: "Siluetas", emoji: "👤", mechanics: ["silhouette"] },
  observation: { label: "Observación", emoji: "👁️", mechanics: ["count_shapes"] },
};
export const CATEGORY_ORDER = ["odd", "differences", "memory", "logic", "sequence", "culture", "hidden", "silhouette", "observation"];

// ---------- Azar reproducible ----------
export function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h >>> 0); }
export function rng(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashStr(String(seed));
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (a2, b) => a2 + Math.floor(r() * (b - a2 + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.shuffle = (arr) => { const x = [...arr]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  return r;
}
const di = (d) => Math.max(0, DIFFS.indexOf(d));

// ---------- Iconos programáticos (los dibuja draw.js) ----------
export const ICONS = ["circle", "square", "triangle", "diamond", "star", "heart", "hexagon", "pentagon", "plus", "moon", "bolt", "drop", "ring", "octagon", "arrow", "star6"];
// Género y plural para que las preguntas suenen naturales
const FEM = new Set(["star", "moon", "drop", "star6"]);
const PLURAL = { circle: "círculos", square: "cuadrados", triangle: "triángulos", heart: "corazones", star: "estrellas", diamond: "rombos", hexagon: "hexágonos" };
const ADJ = { yellow: ["amarillo", "amarilla"], green: ["verde", "verde"], coral: ["rojo", "roja"], teal: ["turquesa", "turquesa"], white: ["blanco", "blanca"], purple: ["morado", "morada"], orange: ["naranja", "naranja"], pink: ["rosa", "rosa"] };
const plAdj = (a) => (/[aeiou]$/.test(a) ? a + "s" : a + "es");
export const ICON_NAME = { circle: "círculo", square: "cuadrado", triangle: "triángulo", diamond: "rombo", star: "estrella", heart: "corazón", hexagon: "hexágono", pentagon: "pentágono", plus: "cruz", moon: "luna", bolt: "rayo", drop: "gota", ring: "anillo", octagon: "octógono", arrow: "flecha", star6: "estrella de seis puntas" };
// Colores de los objetos (bien distintos entre sí sobre azul marino)
export const PALETTE = [
  { k: "yellow", hex: "#FFC83D", es: "amarillo" }, { k: "green", hex: "#2ED47A", es: "verde" }, { k: "coral", hex: "#FF6B5B", es: "rojo" },
  { k: "teal", hex: "#2EC4C4", es: "turquesa" }, { k: "white", hex: "#FFFFFF", es: "blanco" }, { k: "purple", hex: "#A98BFF", es: "morado" },
  { k: "orange", hex: "#FF9F43", es: "naranja" }, { k: "pink", hex: "#FF7AC6", es: "rosa" },
];
const colorHex = (k) => (PALETTE.find((p) => p.k === k) || PALETTE[0]).hex;
const colorEs = (k) => (PALETTE.find((p) => p.k === k) || PALETTE[0]).es;
const LETTERS = ["A", "B", "C", "D"];

// Banderas sencillas que se pueden dibujar con exactitud (sin escudos). same = grupos que se parecen demasiado y no deben salir juntos como opciones
export const FLAGS = {
  "Francia": { t: "v3", c: ["#0055A4", "#FFFFFF", "#EF4135"] }, "Italia": { t: "v3", c: ["#009246", "#FFFFFF", "#CE2B37"] }, "Irlanda": { t: "v3", c: ["#169B62", "#FFFFFF", "#FF883E"] },
  "Bélgica": { t: "v3", c: ["#000000", "#FDDA24", "#EF3340"] }, "Rumanía": { t: "v3", c: ["#002B7F", "#FCD116", "#CE1126"] }, "Nigeria": { t: "v3", c: ["#008751", "#FFFFFF", "#008751"] },
  "Alemania": { t: "h3", c: ["#000000", "#DD0000", "#FFCE00"] }, "Países Bajos": { t: "h3", c: ["#AE1C28", "#FFFFFF", "#21468B"] }, "Rusia": { t: "h3", c: ["#FFFFFF", "#0039A6", "#D52B1E"] },
  "Austria": { t: "h3", c: ["#ED2939", "#FFFFFF", "#ED2939"] }, "Hungría": { t: "h3", c: ["#CE2939", "#FFFFFF", "#477050"] }, "Bulgaria": { t: "h3", c: ["#FFFFFF", "#00966E", "#D62612"] },
  "Estonia": { t: "h3", c: ["#0072CE", "#000000", "#FFFFFF"] }, "Lituania": { t: "h3", c: ["#FDB913", "#006A44", "#C1272D"] }, "Ucrania": { t: "h2", c: ["#0057B7", "#FFD700"] },
  "Polonia": { t: "h2", c: ["#FFFFFF", "#DC143C"] }, "Japón": { t: "disc", c: ["#FFFFFF", "#BC002D"] }, "Bangladés": { t: "disc", c: ["#006A4E", "#F42A41"], off: 0.45 },
  "Suecia": { t: "nordic", c: ["#006AA7", "#FECC00"] }, "Dinamarca": { t: "nordic", c: ["#C8102E", "#FFFFFF"] }, "Finlandia": { t: "nordic", c: ["#FFFFFF", "#002F6C"] },
  "Noruega": { t: "nordic2", c: ["#BA0C2F", "#FFFFFF", "#00205B"] }, "Suiza": { t: "swiss", c: ["#DA291C", "#FFFFFF"] }, "Laos": { t: "laos", c: ["#CE1126", "#002868", "#FFFFFF"] },
};
const FLAG_SAME = [["Rumanía", "Chad"], ["Rusia", "Eslovenia"], ["Irlanda", "Costa de Marfil"], ["Países Bajos", "Luxemburgo"]];
const flagSig = (f) => `${f.t}|${f.c.join(",")}|${f.off ?? ""}`;

// ---------- Generadores: cada uno devuelve los datos del reto (sin posiciones de pantalla) ----------
const GEN = {
  // 49 números iguales y uno distinto
  odd_symbol(r, d) {
    const L = di(d);
    const pairs = [
      [["8", "3"], ["E", "F"], ["O", "Q"], ["M", "N"], ["7", "1"]],
      [["6", "8"], ["5", "6"], ["P", "R"], ["V", "Y"], ["C", "G"]],
      [["8", "B"], ["5", "S"], ["69", "96"], ["E", "F"], ["2", "Z"]],
      [["0", "O"], ["818", "881"], ["101", "110"], ["8", "B"], ["5", "S"]],
    ][L];
    let [base, odd] = r.pick(pairs); if (r() < 0.5) [base, odd] = [odd, base];
    const [cols, rows] = [[5, 4], [7, 5], [8, 6], [9, 7]][L];
    const n = cols * rows, at = r.int(0, n - 1);
    return { question: "Encuentra el diferente", instructions: `Hay un «${odd}» entre los «${base}»`, data: { cols, rows, base, odd, at }, answer: { at, label: odd }, explanation: "" };
  },
  // Un color un poco distinto
  odd_color(r, d) {
    const L = di(d);
    const hue = r.int(0, 359), sat = r.int(55, 80), light = r.int(48, 60);
    const delta = [16, 10, 7, 5][L] * (r() < 0.5 ? -1 : 1);
    const [cols, rows] = [[5, 4], [6, 5], [8, 5], [9, 6]][L];
    const n = cols * rows, at = r.int(0, n - 1), shape = r.pick(["circle", "square", "hexagon", "diamond"]);
    return { question: "¿Cuál tiene otro color?", instructions: "Solo uno es un poco diferente", data: { cols, rows, shape, hsl: [hue, sat, light], delta, at }, answer: { at, label: "tono distinto" }, explanation: "" };
  },
  // Una flecha girada
  odd_rotation(r, d) {
    const L = di(d);
    const base = r.pick([0, 90, 180, 270]), off = [90, 45, 25, 15][L] * (r() < 0.5 ? -1 : 1);
    const [cols, rows] = [[5, 4], [7, 4], [8, 5], [9, 6]][L];
    const n = cols * rows, at = r.int(0, n - 1), color = r.pick(PALETTE.slice(0, 5)).k;
    return { question: "¿Qué flecha apunta a otro sitio?", instructions: "Solo una está girada", data: { cols, rows, icon: "arrow", color, base, rot: base + off, at }, answer: { at, label: `girada ${Math.abs(off)}°` }, explanation: "" };
  },
  // Dos paneles con K diferencias
  differences(r, d) {
    const L = di(d);
    const K = [3, 4, 5, 6][L], N = [9, 11, 13, 15][L];
    const items = scatter(r, N, 0.13, 0.08).map((p) => ({ ...p, icon: r.pick(ICONS.filter((i) => i !== "arrow")), color: r.pick(PALETTE).k, rot: 0, s: 1 }));
    const right = items.map((x) => ({ ...x }));
    const idx = r.shuffle(items.map((_, i) => i)).slice(0, K);
    const diffs = [];
    for (const i of idx) {
      const kind = r.pick(["color", "missing", "icon", "size"]);
      if (kind === "color") right[i].color = r.pick(PALETTE.filter((p) => p.k !== items[i].color)).k;
      else if (kind === "missing") right[i].hidden = true;
      else if (kind === "icon") right[i].icon = r.pick(ICONS.filter((x) => x !== items[i].icon && x !== "arrow"));
      else right[i].s = 0.62;
      diffs.push({ i, kind });
    }
    return { question: `Encuentra las ${K} diferencias`, instructions: "Compara las dos imágenes", data: { left: items, right, diffs }, answer: { diffs: idx, label: `${K} diferencias` }, explanation: "" };
  },
  // Memorizar objetos: ¿cuál ha desaparecido?
  memory_missing(r, d) {
    const L = di(d);
    const N = [5, 6, 8, 9][L], memo = [4, 5, 6, 6][L];
    const used = new Set(); const items = [];
    while (items.length < N) { const icon = r.pick(ICONS.filter((i) => i !== "arrow")), color = r.pick(PALETTE).k, k = `${icon}|${color}`; if (used.has(k)) continue; used.add(k); items.push({ icon, color }); }
    const gone = r.int(0, N - 1);
    // Distractores que NO estaban: mismo objeto con otro color o mismo color con otro objeto (obliga a recordar)
    const distr = [];
    let guard = 0;
    while (distr.length < 3 && guard++ < 200) {
      const src = r.pick(items); const o = r() < 0.5 ? { icon: src.icon, color: r.pick(PALETTE).k } : { icon: r.pick(ICONS.filter((i) => i !== "arrow")), color: src.color };
      const k = `${o.icon}|${o.color}`; if (used.has(k) || distr.some((x) => `${x.icon}|${x.color}` === k)) continue; distr.push(o);
    }
    const opts = r.shuffle([{ ...items[gone], ok: true }, ...distr]);
    const correct = opts.findIndex((o) => o.ok);
    const after = r.shuffle(items.map((x, i) => ({ ...x, i })).filter((x) => x.i !== gone));
    return { question: "¿Qué objeto ha desaparecido?", instructions: `Memoriza los ${N} objetos`, memo, data: { items, gone, after, options: opts.map(({ icon, color }) => ({ icon, color })) }, answer: { option: correct, label: `${LETTERS[correct]}: ${ICON_NAME[items[gone].icon]} ${colorEs(items[gone].color)}` }, explanation: "" };
  },
  // Ecuaciones con iconos: sistema con solución única calculada por código
  logic_equations(r, d) {
    const L = di(d);
    const [icA, icB, icC] = r.shuffle(["star", "heart", "moon", "bolt", "drop", "hexagon", "diamond", "triangle"]).slice(0, 3);
    const max = [6, 9, 12, 15][L];
    const A = r.int(2, max), B = r.int(1, max), C = r.int(1, max);
    const ops = L >= 2 ? r.pick([["+", "×"], ["×", "+"], ["+", "+"]]) : ["+", "+"];
    const eqs = [
      { terms: [icA, icA, icA], op: "+", value: 3 * A },
      { terms: [icA, icB, icB], op: "+", value: A + 2 * B },
      { terms: [icB, icC], op: ops[0], value: ops[0] === "×" ? B * C : B + C },
    ];
    const qop = ops[1];
    const ans = qop === "×" ? A + B * C : A + B + C;
    const q = { terms: qop === "×" ? [icA, "+", icB, "×", icC] : [icA, "+", icB, "+", icC] };
    const options = numberOptions(r, ans, L);
    return { question: "¿Cuánto vale la última fila?", instructions: "Cada símbolo vale siempre lo mismo", data: { icons: { A: icA, B: icB, C: icC }, eqs, q, options, values: { A, B, C } }, answer: { option: options.indexOf(ans), value: ans, label: String(ans) }, explanation: `${ICON_NAME[icA]} = ${A}, ${ICON_NAME[icB]} = ${B}, ${ICON_NAME[icC]} = ${C}${qop === "×" ? " (primero la multiplicación)" : ""}` };
  },
  // Serie numérica con regla verificable
  sequence_number(r, d) {
    const L = di(d);
    const rules = [
      [() => { const a = r.int(1, 20), k = r.int(2, 9); return { rule: "add", a, k, text: `Cada número suma ${k}` }; }],
      [() => { const a = r.int(1, 5), k = 2; return { rule: "mul", a, k, text: "Cada número se multiplica por 2" }; }, () => { const a = r.int(1, 10), k1 = r.int(2, 6), k2 = r.int(1, 9); return { rule: "alt", a, k1, k2, text: `Se suma ${k1} y ${k2} alternativamente` }; }],
      [() => { const a = r.int(1, 6); return { rule: "sq", a, text: "Son cuadrados de números seguidos" }; }, () => { const a = r.int(1, 10), k = r.int(1, 4); return { rule: "inc", a, k, text: `Lo que se suma crece de 1 en 1 (empieza en ${k})` }; }],
      [() => { const a = r.int(1, 4), b = r.int(1, 5); return { rule: "fib", a, b, text: "Cada número es la suma de los dos anteriores" }; }, () => { const a = r.int(1, 4); return { rule: "mul_add", a, text: "Cada número se multiplica por 2 y se suma 1" }; }],
    ][L];
    const spec = r.pick(rules)();
    const terms = seqTerms(spec, 6);
    const shown = terms.slice(0, 5), next = terms[5];
    const options = numberOptions(r, next, L, shown);
    return { question: "¿Qué número sigue?", instructions: "Descubre la regla", data: { spec, shown, options }, answer: { option: options.indexOf(next), value: next, label: String(next) }, explanation: spec.text };
  },
  // Serie de figuras: giro, color o número de lados
  sequence_shape(r, d) {
    const L = di(d);
    const kind = r.pick(L === 0 ? ["rot", "color"] : L === 1 ? ["rot", "color", "sides"] : ["rot2", "sides", "colorrot"]);
    const cols = r.shuffle(PALETTE.slice(0, 6)).map((p) => p.k);
    const step = L >= 2 ? r.pick([45, 135]) : r.pick([45, 90]);
    const base = r.int(0, 3) * 90;
    const spec = { kind, step, base, cols: cols.slice(0, 3) };
    const n = kind === "sides" ? 4 : 5;
    const shown = Array.from({ length: n }, (_, i) => shapeTerm(spec, i)), next = shapeTerm(spec, n);
    const pool = [];
    const alt = (o) => ({ ...next, ...o });
    if (kind.includes("rot")) for (const a of [45, 90, 135, 180, 225, 270, 315]) pool.push(alt({ rot: (next.rot + a) % 360 }));
    if (kind.includes("color")) for (const c of cols) pool.push(alt({ color: c }));
    if (kind === "sides") for (const ic of ["square", "pentagon", "octagon", "circle", "triangle"]) pool.push(alt({ icon: ic }));
    const same = sameShape;
    const distr = []; for (const o of r.shuffle(pool)) if (!same(o, next) && !distr.some((x) => same(x, o))) { distr.push(o); if (distr.length === 3) break; }
    const options = r.shuffle([next, ...distr]);
    const text = { rot: `Gira ${step}° cada vez`, rot2: "Gira 45°, luego 90°, luego 135°… cada vez más", color: "Los colores se repiten de tres en tres", colorrot: "Gira 90° y los colores se repiten de tres en tres", sides: "Cada figura tiene un lado más" }[kind];
    return { question: "¿Qué figura sigue?", instructions: "Descubre el patrón", data: { kind, step, spec, shown, options }, answer: { option: options.findIndex((o) => same(o, next)), label: "" }, explanation: text };
  },
  // ¿De qué país es esta bandera?
  flags(r, d) {
    const L = di(d);
    const easy = ["Francia", "Italia", "Alemania", "Japón", "Polonia", "Ucrania", "Suiza", "Suecia"];
    const pool = L === 0 ? easy : Object.keys(FLAGS);
    const country = r.pick(pool);
    const similar = (a, b) => FLAGS[a].t === FLAGS[b].t; // en difícil, opciones del mismo tipo de bandera
    const others = r.shuffle(Object.keys(FLAGS).filter((x) => x !== country && (L < 2 || similar(x, country) || r() < 0.3))).slice(0, 3);
    while (others.length < 3) { const x = r.pick(Object.keys(FLAGS)); if (x !== country && !others.includes(x)) others.push(x); }
    const options = r.shuffle([country, ...others]);
    return { question: "¿De qué país es esta bandera?", instructions: "", data: { country, options }, answer: { option: options.indexOf(country), label: country }, explanation: "" };
  },
  // Un único objeto escondido entre muchos
  hidden_object(r, d) {
    const L = di(d);
    const N = [24, 34, 46, 58][L];
    const target = r.pick(["heart", "star", "moon", "bolt", "drop", "star6"]);
    const pts = scatter(r, N, [0.09, 0.075, 0.064, 0.056][L], 0.05);
    const others = ICONS.filter((i) => i !== target && i !== "arrow");
    const at = r.int(0, N - 1);
    const items = pts.map((p, i) => ({ ...p, icon: i === at ? target : r.pick(others), color: r.pick(PALETTE).k, rot: r.int(-30, 30) }));
    return { question: `Encuentra ${FEM.has(target) ? "la" : "el"} ${ICON_NAME[target]}`, instructions: "Solo hay uno", data: { items, target, at }, answer: { at, label: ICON_NAME[target] }, explanation: "" };
  },
  // Silueta de una figura compuesta: ¿cuál de las cuatro es?
  silhouette(r, d) {
    const L = di(d);
    const parts = [3, 3, 4, 5][L];
    const slots = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [2, 1], [0, 2], [1, 2]];
    const shapes = ["circle", "square", "triangle", "diamond", "star", "hexagon", "heart", "moon"];
    const fig = () => r.shuffle(slots).slice(0, parts).map(([x, y]) => ({ x, y, icon: r.pick(shapes), rot: r.pick([0, 0, 90]) }));
    const target = fig();
    const key = (f) => f.map((p) => `${p.x},${p.y},${p.icon},${p.rot}`).sort().join(";");
    const variants = [];
    let guard = 0;
    while (variants.length < 3 && guard++ < 200) {
      const v = target.map((p) => ({ ...p }));
      const i = r.int(0, v.length - 1);
      if (r() < 0.5) v[i].icon = r.pick(shapes.filter((s) => s !== v[i].icon));
      else { const free = slots.filter(([x, y]) => !v.some((p) => p.x === x && p.y === y)); const [x, y] = r.pick(free); v[i].x = x; v[i].y = y; }
      if (key(v) === key(target) || variants.some((w) => key(w) === key(v))) continue;
      variants.push(v);
    }
    const color = r.pick(PALETTE.slice(0, 4)).k;
    const options = r.shuffle([target, ...variants]);
    return { question: "¿De quién es esta sombra?", instructions: "Una sola encaja exactamente", data: { target, options, color }, answer: { option: options.findIndex((o) => key(o) === key(target)), label: "" }, explanation: "" };
  },
  // Contar un tipo de objeto
  count_shapes(r, d) {
    const L = di(d);
    const N = [14, 20, 28, 36][L];
    const icon = r.pick(["star", "triangle", "heart", "circle", "square"]), color = r.pick(PALETTE.slice(0, 5)).k;
    const pts = scatter(r, N, [0.11, 0.095, 0.08, 0.07][L], 0.06);
    const want = r.int([3, 4, 6, 7][L], [6, 8, 10, 12][L]);
    const idx = new Set(r.shuffle(pts.map((_, i) => i)).slice(0, want));
    // En difícil: señuelos del mismo objeto en otro color y de otro objeto en el mismo color
    const items = pts.map((p, i) => idx.has(i) ? { ...p, icon, color, rot: 0 } : (() => {
      const decoy = L >= 2 && r() < 0.5;
      const o = decoy ? (r() < 0.5 ? { icon, color: r.pick(PALETTE.filter((x) => x.k !== color)).k } : { icon: r.pick(ICONS.filter((x) => x !== icon && x !== "arrow")), color }) : { icon: r.pick(ICONS.filter((x) => x !== icon && x !== "arrow")), color: r.pick(PALETTE).k };
      return { ...p, ...o, rot: 0 };
    })());
    const count = items.filter((x) => x.icon === icon && x.color === color).length;
    const options = numberOptions(r, count, 0);
    const f = FEM.has(icon);
    return { question: `¿Cuánt${f ? "as" : "os"} ${PLURAL[icon]} ${plAdj(ADJ[color][f ? 1 : 0])} hay?`, instructions: "Cuenta solo los de ese color", data: { items, icon, color, options }, answer: { option: options.indexOf(count), value: count, label: String(count) }, explanation: "" };
  },
};

// Término i de una serie de figuras (la regla vive aquí para que generador y validador usen la misma)
function shapeTerm(sp, i) {
  if (sp.kind === "rot") return { icon: "arrow", color: sp.cols[0], rot: (sp.base + i * sp.step) % 360 };
  if (sp.kind === "rot2") return { icon: "arrow", color: sp.cols[0], rot: (sp.base + ((i * (i + 1)) / 2) * 45) % 360 };
  if (sp.kind === "color") return { icon: "circle", color: sp.cols[i % 3], rot: 0 };
  if (sp.kind === "colorrot") return { icon: "arrow", color: sp.cols[i % 3], rot: (sp.base + i * 90) % 360 };
  return { icon: ["triangle", "square", "pentagon", "hexagon", "heptagon", "octagon"][i], color: sp.cols[1], rot: 0 };
}
const sameShape = (a, b) => a.icon === b.icon && a.color === b.color && (((a.rot - b.rot) % 360) + 360) % 360 === 0;
// Puntos sin solaparse en un rectángulo unitario (x,y en 0..1). minD = distancia mínima, pad = margen
function scatter(r, n, minD, pad) {
  const pts = []; let tries = 0, d = minD;
  while (pts.length < n) {
    if (tries++ > 4000) { d *= 0.92; tries = 0; }
    const p = { x: pad + r() * (1 - 2 * pad), y: pad + r() * (1 - 2 * pad) };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= d)) pts.push(p);
  }
  return pts;
}
function seqTerms(s, n) {
  const t = [];
  for (let i = 0; i < n; i++) {
    if (s.rule === "add") t.push(s.a + i * s.k);
    else if (s.rule === "mul") t.push(s.a * Math.pow(s.k, i));
    else if (s.rule === "alt") t.push(i === 0 ? s.a : t[i - 1] + (i % 2 === 1 ? s.k1 : s.k2));
    else if (s.rule === "sq") t.push((s.a + i) * (s.a + i));
    else if (s.rule === "inc") t.push(i === 0 ? s.a : t[i - 1] + s.k + (i - 1));
    else if (s.rule === "fib") t.push(i === 0 ? s.a : i === 1 ? s.b : t[i - 1] + t[i - 2]);
    else if (s.rule === "mul_add") t.push(i === 0 ? s.a : t[i - 1] * 2 + 1);
  }
  return t;
}
function numberOptions(r, ans, L, shown) {
  const set = new Set([ans]);
  const near = [1, 2, 3, 4, 5, 6, 10].map((k) => [ans + k, ans - k]).flat().filter((x) => x > 0);
  if (shown) { const last = shown[shown.length - 1]; for (const x of [last + (shown[1] - shown[0]), ans + (L + 1), last * 2]) if (x > 0) near.unshift(x); }
  for (const x of r.shuffle(near)) { if (set.size >= 4) break; if (!set.has(x)) set.add(x); }
  return r.shuffle([...set]);
}

// ---------- Validación por código: cada mecánica comprueba que su respuesta es correcta y única ----------
const VAL = {
  odd_symbol(c) { const { cols, rows, base, odd, at } = c.data; const cells = Array.from({ length: cols * rows }, (_, i) => (i === at ? odd : base)); const diff = cells.filter((x) => x !== base); return [diff.length === 1 || "Debe haber exactamente un símbolo distinto", base !== odd || "El diferente es igual que los demás", at === c.answer.at || "La posición de la respuesta no coincide"]; },
  odd_color(c) { const { cols, rows, at, delta } = c.data; return [at >= 0 && at < cols * rows || "Posición fuera de la cuadrícula", Math.abs(delta) >= 4 || "La diferencia de color es imperceptible", at === c.answer.at || "La respuesta no coincide"]; },
  odd_rotation(c) { const { base, rot, at, cols, rows } = c.data; const d = ((rot - base) % 360 + 360) % 360; return [d !== 0 || "La flecha distinta no está girada", at >= 0 && at < cols * rows || "Posición fuera de la cuadrícula", at === c.answer.at || "La respuesta no coincide"]; },
  differences(c) {
    const { left, right } = c.data; let n = 0;
    left.forEach((a, i) => { const b = right[i]; if (a.icon !== b.icon || a.color !== b.color || !!a.hidden !== !!b.hidden || a.s !== b.s || a.x !== b.x || a.y !== b.y) n++; });
    return [n === c.answer.diffs.length || `Hay ${n} diferencias reales y la respuesta dice ${c.answer.diffs.length}`, noOverlap(left, 0.09) || "Hay figuras que se tocan"];
  },
  memory_missing(c) {
    const { items, gone, after, options } = c.data; const k = (x) => `${x.icon}|${x.color}`;
    const orig = new Set(items.map(k)), now = new Set(after.map(k)), opt = options.map(k);
    const goneK = k(items[gone]);
    return [!now.has(goneK) || "El objeto desaparecido sigue en pantalla", after.length === items.length - 1 || "Falta o sobra algún objeto", opt[c.answer.option] === goneK || "La opción correcta no es el objeto que falta",
      opt.filter((x) => orig.has(x) && !now.has(x)).length === 1 || "Varias opciones podrían ser correctas", new Set(opt).size === 4 || "Hay opciones repetidas"];
  },
  logic_equations(c) {
    const { eqs, q, options, icons } = c.data;
    // Resolver: A de la 1.ª, B de la 2.ª, C de la 3.ª
    const A = eqs[0].value / 3, B = (eqs[1].value - A) / 2;
    const C = eqs[2].op === "×" ? eqs[2].value / B : eqs[2].value - B;
    const v = { [icons.A]: A, [icons.B]: B, [icons.C]: C };
    const ans = q.terms[3] === "×" ? v[q.terms[0]] + v[q.terms[2]] * v[q.terms[4]] : v[q.terms[0]] + v[q.terms[2]] + v[q.terms[4]];
    return [[A, B, C].every((x) => Number.isInteger(x) && x > 0) || "El sistema no tiene solución entera única", ans === c.answer.value || "La respuesta no es la solución", options[c.answer.option] === ans || "La opción marcada no es la correcta", new Set(options).size === options.length || "Opciones repetidas", options.filter((o) => o === ans).length === 1 || "Varias opciones correctas"];
  },
  sequence_number(c) {
    const { spec, shown, options } = c.data; const t = seqTerms(spec, 6);
    const ok = shown.every((x, i) => x === t[i]);
    // Ambigüedad: ¿alguna otra regla sencilla explica la serie y lleva a otra opción?
    const alt = [];
    const d1 = shown.slice(1).map((x, i) => x - shown[i]);
    if (d1.every((x) => x === d1[0])) alt.push(shown[4] + d1[0]);
    const q = shown[1] / shown[0]; if (Number.isInteger(q) && shown.every((x, i) => i === 0 || x === shown[i - 1] * q)) alt.push(shown[4] * q);
    const d2 = d1.slice(1).map((x, i) => x - d1[i]); if (d2.every((x) => x === d2[0])) alt.push(shown[4] + d1[3] + d2[0]);
    const amb = alt.filter((x) => x !== t[5] && options.includes(x));
    return [ok || "Los números mostrados no siguen la regla", options[c.answer.option] === t[5] || "La opción marcada no es la siguiente", options.filter((o) => o === t[5]).length === 1 || "Varias opciones correctas", amb.length === 0 || "Otra regla sencilla llevaría a otra opción", new Set(options).size === 4 || "Opciones repetidas"];
  },
  sequence_shape(c) {
    // Se recalcula la serie desde la regla: lo mostrado debe seguirla y solo una opción puede ser el siguiente término
    const { spec, shown, options } = c.data; const k = (o) => `${o.icon}|${o.color}|${((o.rot % 360) + 360) % 360}`;
    const next = shapeTerm(spec, shown.length);
    return [shown.every((x, i) => sameShape(x, shapeTerm(spec, i))) || "Las figuras mostradas no siguen la regla", options.filter((o) => sameShape(o, next)).length === 1 || "Debe haber exactamente una opción correcta",
      sameShape(options[c.answer.option] || {}, next) || "La opción marcada no es la siguiente", new Set(options.map(k)).size === 4 || "Opciones repetidas"];
  },
  flags(c) {
    const { country, options } = c.data; const sigs = options.map((x) => flagSig(FLAGS[x]));
    const bad = FLAG_SAME.some((g) => g.filter((x) => options.includes(x)).length > 1);
    return [FLAGS[country] !== undefined || "País sin bandera", options[c.answer.option] === country || "La opción marcada no es el país", new Set(sigs).size === 4 || "Hay dos banderas iguales entre las opciones", !bad || "Hay banderas casi idénticas entre las opciones"];
  },
  hidden_object(c) { const { items, target, at } = c.data; return [items.filter((x) => x.icon === target).length === 1 || "El objeto escondido aparece más de una vez", items[at]?.icon === target || "La posición no es la del objeto", noOverlap(items, 0.05) || "Hay figuras que se tocan"]; },
  silhouette(c) {
    const { target, options } = c.data; const key = (f) => f.map((p) => `${p.x},${p.y},${p.icon},${p.rot}`).sort().join(";");
    const m = options.filter((o) => key(o) === key(target)).length;
    return [m === 1 || "Debe haber exactamente una opción igual a la sombra", key(options[c.answer.option]) === key(target) || "La opción marcada no coincide"];
  },
  count_shapes(c) { const { items, icon, color, options } = c.data; const n = items.filter((x) => x.icon === icon && x.color === color).length; return [options[c.answer.option] === n || "La opción marcada no es el número real", options.filter((x) => x === n).length === 1 || "Varias opciones correctas", noOverlap(items, 0.06) || "Hay figuras que se tocan"]; },
};
function noOverlap(items, minD) { for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y) < minD * 0.98) return false; return true; }

export function validateChallenge(c) {
  const errors = [];
  if (!c || !GEN[c.mechanic]) return { ok: false, errors: ["Mecánica desconocida"] };
  try { for (const r of VAL[c.mechanic](c)) if (r !== true) errors.push(r); } catch (e) { errors.push(`Error al validar: ${e.message}`); }
  if (!(c.time >= 3 && c.time <= 30)) errors.push("El temporizador debe durar entre 3 y 30 s");
  if (c.mechanic === "memory_missing" && !(c.memo >= 2 && c.memo <= 12)) errors.push("El tiempo para memorizar no es razonable");
  if (!DIFFS.includes(c.difficulty)) errors.push("Dificultad no válida");
  return { ok: errors.length === 0, errors };
}

// ---------- Crear retos ----------
let _n = 0;
export function makeChallenge({ category, mechanic, difficulty, seed, config }) {
  const cfg = mergeConfig(config);
  const r = rng(seed ?? `${Date.now()}-${_n++}-${Math.random()}`);
  const cat = category && CATEGORIES[category] ? category : r.pick(CATEGORY_ORDER);
  const mech = mechanic && GEN[mechanic] ? mechanic : r.pick(CATEGORIES[cat].mechanics);
  const d = DIFFS.includes(difficulty) ? difficulty : "medium";
  for (let attempt = 0; attempt < 25; attempt++) {
    const s = `${seed ?? Math.random()}#${attempt}`;
    const g = GEN[mech](rng(s), d);
    const c = { id: `c${hashStr(s + mech).toString(36)}`, category: cat, mechanic: mech, difficulty: d, seed: s, time: cfg.times[d] + (mech === "differences" ? 6 : mech === "hidden_object" || mech === "logic_equations" ? 3 : 0), points: cfg.points[d], layout_seed: 0, ...g };
    c.signature = signature(c);
    const v = validateChallenge(c);
    if (v.ok) return { ...c, validation: { ok: true, errors: [], engine: ENGINE_VERSION } };
  }
  throw new Error(`No se pudo generar un reto válido de ${mech}`);
}
export function signature(c) { const x = { ...c.data }; delete x.after; return `${c.mechanic}:${hashStr(JSON.stringify(x)).toString(36)}`; }

// Plan de un vídeo: rondas progresivas, mezcla de categorías y número de retos según la duración
export function estimateSeconds(c) { const t = timingOf(c); return t.total; }
export function buildProject(opts) {
  const cfg = mergeConfig(opts.config);
  const format = opts.format === "short" ? "short" : "long";
  const r = rng(opts.seed ?? `${Date.now()}-${Math.random()}`);
  const cats = opts.category && opts.category !== "mixed" ? [opts.category] : (opts.categories?.length ? opts.categories : CATEGORY_ORDER);
  const recent = new Set(opts.history || []);
  const diffMode = opts.difficulty || "progressive";
  let n = Number(opts.count) || 0;
  const target = format === "short" ? (opts.seconds || 30) : (opts.minutes || cfg.long_minutes) * 60;
  const plan = (k) => diffMode !== "progressive" ? Array(k).fill(diffMode) : format === "short" ? Array.from({ length: k }, (_, i) => (i === 0 ? "medium" : "hard")) : Array.from({ length: k }, (_, i) => DIFFS[Math.min(3, Math.floor((i / k) * 4))]);
  // Mixto: las categorías se reparten por turnos (barajadas) para que todas aparezcan
  const order = r.shuffle(cats);
  const make = (diff, i) => {
    for (let t = 0; t < 8; t++) {
      const cat = order[(i + t) % order.length];
      const c = makeChallenge({ category: cat, difficulty: diff, seed: `${opts.seed ?? "p"}-${i}-${t}-${r()}`, config: cfg });
      if (!recent.has(c.signature)) { recent.add(c.signature); return c; }
    }
    return makeChallenge({ category: r.pick(cats), difficulty: diff, seed: `${r()}`, config: cfg });
  };
  let challenges = [];
  if (n > 0) challenges = plan(n).map(make);
  else {
    // Automático: se añaden retos hasta acercarse a la duración objetivo con el tiempo real de juego
    n = format === "short" ? 1 : 4;
    for (let guard = 0; guard < 80; guard++) {
      challenges = plan(n).map(make);
      const dur = timeline({ format, challenges, config: cfg, title: opts.title }).duration;
      if (dur >= target * (format === "short" ? 0.6 : 0.92) || (format === "short" && n >= 2)) break;
      n += format === "short" ? 1 : Math.max(1, Math.round((target - dur) / 16));
    }
    // Si se ha pasado más de un 5 %, se quita el último reto de la ronda más larga
    while (format !== "short" && challenges.length > 4 && timeline({ format, challenges, config: cfg }).duration > target * 1.05) challenges.splice(Math.floor(challenges.length * 0.4), 1);
  }
  // Variedad: dos retos seguidos no repiten mecánica si se puede evitar
  for (let i = 1; i < challenges.length; i++) if (challenges[i].mechanic === challenges[i - 1].mechanic) { const j = challenges.findIndex((c, k) => k > i && c.difficulty === challenges[i].difficulty && c.mechanic !== challenges[i - 1].mechanic); if (j > 0) [challenges[i], challenges[j]] = [challenges[j], challenges[i]]; }
  return { engine: ENGINE_VERSION, format, title: opts.title || (format === "short" ? "¿Lo resuelves a tiempo?" : `¿Puedes superar estos ${challenges.length} retos?`), difficulty: diffMode, category: opts.category || "mixed", target_seconds: target, challenges };
}
export function validateProject(p) {
  const res = (p.challenges || []).map((c, i) => ({ i, id: c.id, ...validateChallenge(c) }));
  const errors = res.filter((x) => !x.ok).map((x) => `Reto ${x.i + 1}: ${x.errors.join("; ")}`);
  if (!p.challenges?.length) errors.push("El proyecto no tiene retos");
  return { ok: errors.length === 0, errors, results: res };
}

// ---------- Línea de tiempo: tramos, eventos de sonido, voz y música (en segundos, alineados a fotogramas) ----------
const fr = (t) => Math.round(t * FPS) / FPS;
export function timingOf(c, short) {
  const intro = short ? 1.0 : 1.4, memo = c.mechanic === "memory_missing" ? c.memo + 0.8 : 0, play = c.time, timeout = 0.6, reveal = 2.4;
  const explain = c.explanation && c.show_explanation !== false ? Math.min(4, 1.6 + c.explanation.length / 40) : 0, out = 0.5;
  return { intro, memo, play, timeout, reveal, explain, out, total: intro + memo + play + timeout + reveal + explain + out };
}
const VOICE = {
  start: ["¿Preparado? ¡Vamos!", "¿Listo? ¡Empezamos!"],
  round: { medium: "Siguiente nivel.", hard: "Ahora se complica.", extreme: "Nivel extremo. Solo para los mejores." },
  last: "Última pregunta.",
  end: "¿Cuántos has acertado?",
};
export function timeline(project, opts = {}) {
  const cfg = mergeConfig(project.config || opts.config);
  const short = project.format === "short";
  const narr = cfg.narration;
  const segs = [], events = [], voice = [], music = [];
  const ev = (t, code, gain = 1) => events.push({ t: fr(t), code, gain });
  const say = (t, text) => { if (narr !== "none" && text) voice.push({ t: fr(t), text }); };
  let t = 0;
  const chs = project.challenges || [];
  const total = chs.length;
  let maxPts = 0;
  // Rondas: tramos consecutivos de la misma dificultad
  let round = 0, prevD = null;
  if (!short) { ev(0, "S01", 0.9); say(0.3, VOICE.start[0]); }
  chs.forEach((c, i) => {
    if (!short && c.difficulty !== prevD) {
      round++;
      if (i > 0) {
        // Pantalla de ronda (la primera ronda no lleva: el vídeo empieza jugando)
        const dur = 2.6;
        segs.push({ type: "round", start: fr(t), end: fr(t + dur), round, difficulty: c.difficulty });
        ev(t, c.difficulty === "extreme" ? "S08" : "S07");
        if (narr !== "none") say(t + 0.5, VOICE.round[c.difficulty]);
        t += dur;
      }
      music.push({ t: fr(Math.max(0, t - (i > 0 ? 2.6 : 0))), mood: ROUND_MOOD[c.difficulty] });
      prevD = c.difficulty;
    }
    if (short && i === 0) music.push({ t: 0, mood: ROUND_MOOD[c.difficulty] === "extreme" ? "extreme" : "normal" });
    const tm = timingOf(c, short);
    const s = { type: "challenge", index: i, total, round, start: fr(t), challenge: c.id };
    let x = t;
    s.intro = [fr(x), fr(x += tm.intro)];
    ev(s.intro[0], "S02");
    if (i === total - 1 && total > 2 && narr !== "none" && !short) say(s.intro[0] + 0.1, VOICE.last);
    if (tm.memo) { s.memo = [fr(x), fr(x += tm.memo)]; ev(s.memo[1] - 0.6, "S11"); }
    s.play = [fr(x), fr(x += tm.play)];
    // Temporizador: tic por segundo según el modo, más marcado al final
    if (cfg.timer_sounds) {
      const T = Math.round(tm.play);
      for (let k = T; k >= 1; k--) {
        const at = s.play[1] - k;
        if (k <= 3) ev(at, "S04", k === 1 ? 1 : k === 2 ? 0.85 : 0.7);
        else if (cfg.timer_mode === "normal" && k <= 5) ev(at, "S03", 0.8);
        else if (cfg.timer_mode === "normal") ev(at, "S03", 0.55);
        else if (cfg.timer_mode === "extreme") ev(at, "S03", 0.6 + 0.4 * (1 - k / T));
      }
    }
    s.timeout = [fr(x), fr(x += tm.timeout)];
    ev(s.timeout[0], "S06");
    s.reveal = [fr(x), fr(x += tm.reveal)];
    ev(s.reveal[0] + 0.05, "S05"); ev(s.reveal[0] + 0.9, "S09", 0.8);
    if (tm.explain) { s.explain = [fr(x), fr(x += tm.explain)]; if (narr === "moderate" || narr === "full") say(s.explain[0] + 0.1, c.explanation); }
    s.out = [fr(x), fr(x += tm.out)];
    if (i < total - 1) ev(s.out[0], "S11");
    s.end = fr(x);
    maxPts += c.points || 0;
    s.score_after = maxPts;
    segs.push(s);
    t = x;
  });
  // Resultados (largo) o cierre rápido (Short)
  const endDur = short ? 2.2 : 8;
  segs.push({ type: short ? "outro" : "results", start: fr(t), end: fr(t + endDur), max: maxPts, ranks: ranksFor(maxPts, cfg.ranks) });
  ev(t + 0.2, "S10");
  if (!short) say(t + 0.4, VOICE.end);
  t += endDur;
  return { duration: fr(t), segments: segs, events: events.sort((a, b) => a.t - b.t), voice, music, max_points: maxPts };
}
// Rangos según los puntos reales del episodio (el espectador lleva su propia cuenta)
// El último rango es la puntuación perfecta; los demás se reparten de 0 a max-1
export function ranksFor(max, names) {
  const n = names.length, out = [];
  for (let i = 0; i < n - 1; i++) {
    const from = Math.round((max * i) / (n - 1)), to = Math.round((max * (i + 1)) / (n - 1)) - 1;
    out.push({ name: names[i], from, to: Math.max(from, to) });
  }
  out.push({ name: names[n - 1], from: max, to: max });
  return out;
}
export function challengeById(project, id) { return (project.challenges || []).find((c) => c.id === id); }

// Recursos usados por un proyecto (para el control de costes)
export function resourcesOf(project, tl) {
  const sounds = new Set(tl.events.map((e) => e.code));
  return { ai_images: 0, sound_events: tl.events.length, sounds_used: [...sounds].sort(), music_moods: [...new Set(tl.music.map((m) => m.mood))], voice_lines: tl.voice.length, voice_chars: tl.voice.reduce((a, v) => a + v.text.length, 0), challenges: project.challenges.length, duration: tl.duration };
}
