// Motor B — dibujo 2D de los retos con la API Canvas (igual en el navegador y en el servidor con node-canvas).
// Estética de videojuego casual: fondos claros por tipo de juego, tarjetas blancas con sombra suave,
// figuras grandes, temporizador limpio y revelaciones progresivas. Nada de imágenes generadas.
import { mergeTheme, mergeConfig, PALETTE, FLAGS, DIFF_LABEL, REVEAL_FIRST, REVEAL_STEP, hashStr, solvedAt } from "./engine.js";
import { drawWorldScene, isWorldMechanic } from "./world-draw.js";
import { drawPix } from "./pix.js";

const LETTERS = ["A", "B", "C", "D"];
let FONT = "Montserrat, 'Arial Black', sans-serif";
// Escala segura: cairo (servidor) deja el lienzo inservible si la matriz no es invertible (escala 0)
const zs = (ctx, a, b = a) => ctx.scale(Math.abs(a) < 1e-3 ? 1e-3 : a, Math.abs(b) < 1e-3 ? 1e-3 : b);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const eOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
const eIn = (k) => Math.pow(clamp(k), 3);
let BACK = 1.70158; // rebote (lo regula la «intensidad de animaciones» del canal)
const eBack = (k) => { k = clamp(k); const c = BACK; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

// ---------- Color ----------
function rgb(hex) { const h = String(hex).replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, k) { const x = rgb(a), y = rgb(b); return "#" + x.map((v, i) => Math.round(lerp(v, y[i], k)).toString(16).padStart(2, "0")).join(""); }
function alpha(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }
// Colores de los objetos: el mismo nombre siempre (las preguntas dicen «blanco», «amarillo»…), con contorno para que destaquen en tarjetas claras
const itemHex = (k) => (PALETTE.find((p) => p.k === k) || PALETTE[0]).hex;
function palette(theme) {
  const T = mergeTheme(theme);
  FONT = `${T.font === "Nunito" ? "Nunito" : "Montserrat"}, Montserrat, 'Arial Black', sans-serif`;
  BACK = { low: 0.6, normal: 1.4, high: 2.2 }[T.anim];
  return { ...T, R: { small: 0.55, medium: 1, large: 1.45 }[T.radius], sh: { none: 0, soft: 1, medium: 1.8 }[T.shadowLevel] * T.shadow, dark: lum(T.bg) < 0.4 };
}
const ROUND_COLOR = (P, d) => ({ easy: P.teal, medium: P.timer, hard: P.alert, extreme: P.alert }[d] || P.teal);
// Fondo suave según el tipo de juego (y los retos extremos)
function bgFor(P, c) {
  if (!c) return P.bg;
  if (c.difficulty === "extreme") return P.bgs.extreme;
  if (c.category === "memory") return P.bgs.memory;
  if (c.category === "logic" || c.category === "sequence") return P.bgs.logic;
  return P.bgs.observation;
}

// ---------- Formas ----------
function rrect(ctx, x, y, w, h, r) { w = Math.max(0, w); h = Math.max(0, h); r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// Tarjeta: sombra suave (dos capas, sin desenfoque: rápido en el servidor), relleno y contorno fino
function card(ctx, P, x, y, w, h, r, fill, opts = {}) {
  r *= P.R;
  if (P.chunky && !opts.flat) { ctx.fillStyle = `rgba(31,36,48,${0.1 + P.sh * 0.4})`; rrect(ctx, x, y + 7, w, h + 2, r); ctx.fill(); }
  else if (P.sh > 0 && !opts.flat) { ctx.fillStyle = `rgba(20,24,32,${P.sh * 0.55})`; rrect(ctx, x - 1, y + 3, w + 2, h + 4, r + 1); ctx.fill(); ctx.fillStyle = `rgba(20,24,32,${P.sh * 0.35})`; rrect(ctx, x - 3, y + 7, w + 6, h + 8, r + 3); ctx.fill(); }
  rrect(ctx, x, y, w, h, r); ctx.fillStyle = fill || P.card; ctx.fill();
  if (opts.stroke !== false) { ctx.lineWidth = opts.lw || (P.chunky ? 3 : 2); ctx.strokeStyle = opts.stroke || alpha(P.dark ? "#000000" : "#20242B", 0.07); ctx.stroke(); }
}
function poly(ctx, n, cx, cy, r, rot = -Math.PI / 2) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; ctx[i ? "lineTo" : "moveTo"](cx + r * Math.cos(a), cy + r * Math.sin(a)); } ctx.closePath(); }
function star(ctx, n, cx, cy, r, ri) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? ri : r; ctx[i ? "lineTo" : "moveTo"](cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } ctx.closePath(); }
function iconPath(ctx, icon, r) {
  switch (icon) {
    case "circle": ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); break;
    case "square": rrect(ctx, -r * 0.82, -r * 0.82, r * 1.64, r * 1.64, r * 0.2); break;
    case "triangle": poly(ctx, 3, 0, r * 0.12, r * 1.02); break;
    case "diamond": ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.72, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.72, 0); ctx.closePath(); break;
    case "star": star(ctx, 5, 0, r * 0.06, r, r * 0.46); break;
    case "star6": star(ctx, 6, 0, 0, r, r * 0.56); break;
    case "hexagon": poly(ctx, 6, 0, 0, r * 0.95, 0); break;
    case "pentagon": poly(ctx, 5, 0, r * 0.05, r * 0.95); break;
    case "heptagon": poly(ctx, 7, 0, r * 0.03, r * 0.95); break;
    case "octagon": poly(ctx, 8, 0, 0, r * 0.95, Math.PI / 8); break;
    case "plus": { const a = r * 0.34; ctx.beginPath(); ctx.moveTo(-a, -r); ctx.lineTo(a, -r); ctx.lineTo(a, -a); ctx.lineTo(r, -a); ctx.lineTo(r, a); ctx.lineTo(a, a); ctx.lineTo(a, r); ctx.lineTo(-a, r); ctx.lineTo(-a, a); ctx.lineTo(-r, a); ctx.lineTo(-r, -a); ctx.lineTo(-a, -a); ctx.closePath(); break; }
    case "heart": ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.bezierCurveTo(-r * 1.3, r * 0.05, -r * 0.75, -r * 1.05, 0, -r * 0.42); ctx.bezierCurveTo(r * 0.75, -r * 1.05, r * 1.3, r * 0.05, 0, r * 0.9); ctx.closePath(); break;
    case "moon": ctx.beginPath(); ctx.arc(0, 0, r * 0.9, Math.PI * 0.3, Math.PI * 1.7); ctx.arc(r * 0.42, -r * 0.05, r * 0.68, Math.PI * 1.55, Math.PI * 0.45, true); ctx.closePath(); break;
    case "bolt": ctx.beginPath(); ctx.moveTo(r * 0.2, -r); ctx.lineTo(-r * 0.62, r * 0.12); ctx.lineTo(-r * 0.05, r * 0.12); ctx.lineTo(-r * 0.22, r); ctx.lineTo(r * 0.62, -r * 0.18); ctx.lineTo(r * 0.05, -r * 0.18); ctx.closePath(); break;
    case "drop": ctx.beginPath(); ctx.moveTo(0, -r); ctx.bezierCurveTo(r * 0.35, -r * 0.45, r * 0.8, -r * 0.05, r * 0.8, r * 0.3); ctx.arc(0, r * 0.3, r * 0.8, 0, Math.PI); ctx.bezierCurveTo(-r * 0.8, -r * 0.05, -r * 0.35, -r * 0.45, 0, -r); ctx.closePath(); break;
    case "ring": ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); ctx.arc(0, 0, r * 0.5, 0, 7, true); ctx.closePath(); break;
    case "arrow": ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.78, -r * 0.1); ctx.lineTo(r * 0.3, -r * 0.1); ctx.lineTo(r * 0.3, r * 0.95); ctx.lineTo(-r * 0.3, r * 0.95); ctx.lineTo(-r * 0.3, -r * 0.1); ctx.lineTo(-r * 0.78, -r * 0.1); ctx.closePath(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 7);
  }
}
// Icono centrado en (cx,cy), radio r, rot en grados. outline: contorno más oscuro del mismo color («pegatina»)
export function drawIcon(ctx, icon, cx, cy, r, fill, rot = 0, outline) {
  ctx.save(); ctx.translate(cx, cy); if (rot) ctx.rotate((rot * Math.PI) / 180);
  iconPath(ctx, icon, r); ctx.fillStyle = fill; ctx.fill("evenodd");
  if (outline) { ctx.lineJoin = "round"; ctx.lineWidth = Math.max(2.5, r * 0.09); ctx.strokeStyle = outline; ctx.stroke(); }
  ctx.restore();
}
// Objeto de color con nombre (blanco, amarillo…) sobre tarjeta clara: contorno para que siempre se vea
const outlineOf = (k) => (k === "white" ? "#7E889A" : mix(itemHex(k), "#000000", 0.22));
function item(ctx, icon, x, y, r, colorKey, rot = 0) { drawIcon(ctx, icon, x, y, r, itemHex(colorKey), rot, outlineOf(colorKey)); }
function check(ctx, cx, cy, r, color) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = r * 0.3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.02); ctx.lineTo(cx - r * 0.12, cy + r * 0.4); ctx.lineTo(cx + r * 0.55, cy - r * 0.38); ctx.stroke(); ctx.restore(); }
function flag(ctx, name, x, y, w, h) {
  const f = FLAGS[name]; if (!f) return;
  ctx.save(); rrect(ctx, x, y, w, h, Math.min(w, h) * 0.05); ctx.clip();
  const c = f.c;
  if (f.t === "v3") c.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x + (w * i) / 3, y, w / 3 + 1, h); });
  else if (f.t === "h3") c.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x, y + (h * i) / 3, w, h / 3 + 1); });
  else if (f.t === "h2") c.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x, y + (h * i) / 2, w, h / 2 + 1); });
  else if (f.t === "disc") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(x + w * (f.off ?? 0.5), y + h / 2, h * 0.3, 0, 7); ctx.fill(); }
  else if (f.t === "nordic" || f.t === "nordic2") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); const cx = x + w * 0.36, t = h * (f.t === "nordic2" ? 0.24 : 0.18); ctx.fillStyle = c[1]; ctx.fillRect(cx - t / 2, y, t, h); ctx.fillRect(x, y + h / 2 - t / 2, w, t); if (f.t === "nordic2") { const t2 = t * 0.5; ctx.fillStyle = c[2]; ctx.fillRect(cx - t2 / 2, y, t2, h); ctx.fillRect(x, y + h / 2 - t2 / 2, w, t2); } }
  else if (f.t === "swiss") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); const s = h * 0.6, a = s * 0.22; ctx.fillStyle = c[1]; ctx.fillRect(x + w / 2 - a, y + h / 2 - s / 2, a * 2, s); ctx.fillRect(x + w / 2 - s / 2, y + h / 2 - a, s, a * 2); }
  else if (f.t === "laos") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); ctx.fillStyle = c[1]; ctx.fillRect(x, y + h / 4, w, h / 2); ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.2, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.save(); rrect(ctx, x, y, w, h, Math.min(w, h) * 0.05); ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}
function text(ctx, s, x, y, size, color, align = "center", base = "middle") { ctx.font = `800 ${Math.round(size)}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y); }
function fitText(ctx, s, x, y, size, maxW, color, align = "center") { ctx.font = `800 ${Math.round(size)}px ${FONT}`; const w = ctx.measureText(s).width; text(ctx, s, x, y, w > maxW ? (size * maxW) / w : size, color, align); }
function wrap(ctx, s, maxW, size) { ctx.font = `800 ${Math.round(size)}px ${FONT}`; const words = String(s).split(/\s+/); const lines = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
function pill(ctx, P, x, y, w, h, fill, opts = {}) { card(ctx, P, x, y, w, h, h / 2 / P.R, fill, { flat: opts.flat, stroke: opts.stroke ?? false }); }
export function setCanvasFactory() { /* compatibilidad: el fondo ya no necesita lienzos auxiliares */ }

// ---------- Fondo: color suave del tipo de juego, sin movimiento (no distrae) ----------
function background(ctx, W, H, P, col, accent) {
  ctx.fillStyle = col; ctx.fillRect(0, 0, W, H);
  // Dos manchas muy suaves en las esquinas, fijas
  const m = Math.min(W, H);
  ctx.fillStyle = alpha(P.dark ? "#FFFFFF" : P.teal, P.dark ? 0.03 : 0.06); ctx.beginPath(); ctx.arc(W * 0.02, H * 0.98, m * 0.42, 0, 7); ctx.fill();
  ctx.fillStyle = alpha(P.timer, P.dark ? 0.05 : 0.08); ctx.beginPath(); ctx.arc(W * 0.99, H * 0.03, m * 0.3, 0, 7); ctx.fill();
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 8); }
}

// ---------- Maquetación por formato (tamaño de diseño: 1920×1080 o 1080×1920) ----------
export function frameLayout(W, H) {
  const v = H > W;
  // Short: cabecera arriba (fuera de la barra de YouTube), pregunta grande, reto a pantalla casi completa y los últimos 330 px libres para la interfaz de Shorts
  if (v) return { v, W, H, u: 1, hud: { x: 44, y: 182 }, timer: { cx: W - 122, cy: 188, r: 78 }, q: { x: W / 2, y: 352, size: 72, maxW: 980 }, box: { x: 36, y: 452, w: W - 72, h: H - 452 - 330 }, wq: { x: W / 2, y: 330, size: 80, maxW: 1000 }, wbox: { x: 26, y: 410, w: W - 52, h: H - 410 - 300 }, optsH: 340, optsFigH: 400, cols: 2, gap: 22 };
  return { v, W, H, u: 1, hud: { x: 44, y: 46 }, timer: { cx: W - 104, cy: 92, r: 68 }, q: { x: W / 2 - 30, y: 122, size: 58, maxW: 1380 }, box: { x: 56, y: 172, w: W - 112, h: H - 172 - 50 }, wq: { x: W / 2 - 30, y: 122, size: 64, maxW: 1380 }, wbox: { x: 48, y: 168, w: W - 96, h: H - 168 - 44 }, optsH: 150, optsFigH: 200, cols: 4, gap: 22 };
}
const revealN = (c) => (c.mechanic === "differences" ? c.answer.diffs.length : 1);
const hasOptions = (c) => "option" in (c.answer || {});
const FIG_OPTS = new Set(["silhouette", "sequence_shape", "memory_missing"]);
function optsBox(L, c) { const h = FIG_OPTS.has(c.mechanic) ? L.optsFigH : L.optsH; return { x: L.box.x, y: L.box.y + L.box.h - h, w: L.box.w, h, cols: L.cols }; }
function contentBox(L, c) { const b = { ...L.box }; if (hasOptions(c)) b.h = optsBox(L, c).y - b.y - L.gap; return b; }
const inset = (b, p) => ({ x: b.x + p, y: b.y + p, w: b.w - 2 * p, h: b.h - 2 * p });

// Rejilla con pequeño desorden: reparte n figuras por todo el espacio, grandes y sin tocarse.
// Solo cambia dónde se dibujan; los datos del reto (y su validación) no se tocan.
const _grid = new Map();
export function gridLayout(n, b, seed, fill = 0.36, jitter = 0.65) {
  const key = `${n}|${Math.round(b.w)}|${Math.round(b.h)}|${seed}|${fill}|${jitter}`; if (_grid.has(key)) return _grid.get(key);
  let cols = Math.max(1, Math.round(Math.sqrt((n * b.w) / b.h))); let rows = Math.ceil(n / cols);
  while (cols > 1 && (cols - 1) * rows >= n) cols--; rows = Math.ceil(n / cols);
  const cw = b.w / cols, ch = b.h / rows, r = Math.min(cw, ch) * fill;
  let h = hashStr(String(seed)) || 1; const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const slots = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const pos = slots.slice(0, n).map((s) => { const cx = b.x + cw * ((s % cols) + 0.5), cy = b.y + ch * (Math.floor(s / cols) + 0.5); const jx = (cw / 2 - r * 1.08) * jitter, jy = (ch / 2 - r * 1.08) * jitter; return { x: cx + (rnd() * 2 - 1) * Math.max(0, jx), y: cy + (rnd() * 2 - 1) * Math.max(0, jy) }; });
  const v = { pos, r, cols, rows, cw, ch }; if (_grid.size > 300) _grid.clear(); _grid.set(key, v); return v;
}

// ---------- Estado de revelación ----------
// k-ésima solución: aparece en reveal[0] + REVEAL_FIRST + k·REVEAL_STEP (igual que su sonido en engine.timeline)
const revealK = (st, k) => (st.revealAt == null ? 0 : clamp((st.t - (st.revealAt + REVEAL_FIRST + k * REVEAL_STEP)) / 0.35));
function solutionRing(ctx, P, x, y, r, k) {
  if (k <= 0) return;
  const s = eBack(k), rr = r * (1.25 + 0.5 * (1 - s));
  ctx.save();
  ctx.fillStyle = alpha(P.ok, 0.13 * k); ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
  ctx.lineWidth = Math.max(6, r * 0.13); ctx.strokeStyle = P.ok; ctx.beginPath(); ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * eOut(k * 1.4)); ctx.stroke();
  // Insignia de acierto en el borde (no tapa el objeto)
  const bx = x + rr * 0.72, by = y - rr * 0.72, br = Math.max(14, r * 0.3) * clamp(k * 2);
  if (br > 1) { ctx.fillStyle = P.ok; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); check(ctx, bx, by, br * 0.9, "#FFFFFF"); }
  ctx.restore();
}
function fadeOthers(st) { return st.revealAt == null ? 1 : 1 - 0.55 * eOut((st.t - st.revealAt) / 0.4); }
function pop(st, i, n) { const d = Math.min(0.45, 0.012 * n); return eBack((st.appear - (i / Math.max(1, n)) * d) / Math.max(0.05, 1 - d)); }

// ---------- Plantillas: cada mecánica con su propia composición ----------
const TPL = {
  // Encuentra el diferente: tablero blanco con la cuadrícula aprovechando todo el espacio
  grid(ctx, c, b0, L, P, st) {
    card(ctx, P, b0.x, b0.y, b0.w, b0.h, 34);
    const b = inset(b0, L.v ? 22 : 26);
    let { cols, rows } = c.data; const swap = L.v && cols > rows; if (swap) [cols, rows] = [rows, cols];
    const cell = Math.min(b.w / cols, b.h / rows), ox = b.x + (b.w - cell * cols) / 2, oy = b.y + (b.h - cell * rows) / 2;
    const n = cols * rows, at = c.data.at;
    for (let i = 0; i < n; i++) {
      let cc = i % c.data.cols, rr = Math.floor(i / c.data.cols); if (swap) [cc, rr] = [rr, cc];
      const x = ox + cell * (cc + 0.5), y = oy + cell * (rr + 0.5), s = pop(st, i, n); if (s <= 0) continue;
      const isAns = i === at, k = revealK(st, 0);
      ctx.save(); ctx.globalAlpha = isAns ? 1 : fadeOthers(st); ctx.translate(x, y); const pulse = isAns && k > 0 ? 1 + 0.16 * Math.sin(clamp(k * 1.2) * Math.PI) : 1; zs(ctx, s * pulse, s * pulse);
      if (c.mechanic === "odd_symbol") { const v = isAns ? c.data.odd : c.data.base; const fs = cell * (v.length > 2 ? 0.4 : v.length > 1 ? 0.52 : 0.7); text(ctx, v, 0, fs * 0.04, fs, isAns && k > 0 ? P.ok : P.cardInk); }
      else if (c.mechanic === "odd_color") { const [h, s2, l] = c.data.hsl; drawIcon(ctx, c.data.shape, 0, 0, cell * 0.4, hsl(h, s2, isAns ? l + c.data.delta : l)); }
      else if (c.mechanic === "odd_rotation") drawIcon(ctx, "arrow", 0, 0, cell * 0.38, isAns && k > 0 ? P.ok : itemHex(c.data.color), isAns ? c.data.rot : c.data.base, outlineOf(c.data.color));
      ctx.restore();
      if (isAns) solutionRing(ctx, P, x, y, cell * 0.4, k);
    }
  },
  // Contar u objeto escondido: tablero con las figuras repartidas en rejilla desordenada (grandes)
  scatter(ctx, c, b0, L, P, st) {
    card(ctx, P, b0.x, b0.y, b0.w, b0.h, 34);
    const items = c.data.items, n = items.length, hidden = c.mechanic === "hidden_object";
    const g = gridLayout(n, inset(b0, L.v ? 20 : 26), c.id || c.seed, hidden ? 0.36 : 0.37, 0.6);
    const targets = items.map((it, i) => (hidden ? i === c.data.at : it.icon === c.data.icon && it.color === c.data.color));
    let ti = 0;
    items.forEach((it, i) => {
      const p = g.pos[i], s = pop(st, i, n); if (s <= 0) return;
      const isAns = targets[i]; const k = isAns ? (hidden ? revealK(st, 0) : clamp(revealK(st, 0) * 1.6 - (ti++) * 0.12)) : 0;
      ctx.save(); ctx.globalAlpha = isAns ? 1 : fadeOthers(st);
      item(ctx, it.icon, p.x, p.y, g.r * s * (k > 0 ? 1 + 0.12 * Math.sin(clamp(k) * Math.PI) : 1), it.color, it.rot || 0);
      ctx.restore();
      if (isAns) solutionRing(ctx, P, p.x, p.y, g.r, k);
    });
  },
  // Diferencias: dos ilustraciones grandes (una encima de otra en vertical, lado a lado en horizontal)
  differences(ctx, c, b, L, P, st) {
    const gap = L.v ? 26 : 34;
    const panels = L.v ? [{ x: b.x, y: b.y, w: b.w, h: (b.h - gap) / 2 }, { x: b.x, y: b.y + (b.h + gap) / 2, w: b.w, h: (b.h - gap) / 2 }] : [{ x: b.x, y: b.y, w: (b.w - gap) / 2, h: b.h }, { x: b.x + (b.w + gap) / 2, y: b.y, w: (b.w - gap) / 2, h: b.h }];
    const g = gridLayout(c.data.left.length, inset({ x: 0, y: 0, w: panels[0].w, h: panels[0].h }, 18), c.id || c.seed, 0.41, 0.5);
    const order = c.answer.diffs;
    [c.data.left, c.data.right].forEach((items, side) => {
      const p = panels[side], s0 = eOut(st.appear * 1.5 - side * 0.25);
      ctx.save(); ctx.globalAlpha = s0; ctx.translate(0, (1 - s0) * 30);
      card(ctx, P, p.x, p.y, p.w, p.h, 34, side ? mix(P.card, P.timer, 0.04) : P.card);
      items.forEach((it, i) => { if (it.hidden) return; const q = g.pos[i]; item(ctx, it.icon, p.x + q.x, p.y + q.y, g.r * (it.s || 1), it.color, it.rot || 0); });
      ctx.restore();
      order.forEach((i, k) => { const q = g.pos[i]; solutionRing(ctx, P, p.x + q.x, p.y + q.y, g.r * 0.95, revealK(st, k)); });
    });
  },
  // Memoria: objetos grandes en tarjetas separadas; tras taparlos se reordenan sin uno
  memory(ctx, c, b0, L, P, st) {
    const list = st.memoPhase ? c.data.items : c.data.after;
    const show = st.memoPhase ? st.appear : st.afterAppear;
    const g = gridLayout(list.length, b0, `${c.id}-${st.memoPhase ? "m" : "a"}`, 0.42, 0);
    list.forEach((it, i) => {
      const s = eBack(clamp(show * 1.5 - i * 0.05)); if (s <= 0) return; const p = g.pos[i], tw = Math.min(g.cw, g.ch) * 0.9;
      ctx.save(); ctx.translate(p.x, p.y); zs(ctx, s, s); card(ctx, P, -tw / 2, -tw / 2, tw, tw, 30); item(ctx, it.icon, 0, 0, tw * 0.32, it.color); ctx.restore();
    });
    if (st.cover > 0) { const k = eOut(st.cover); ctx.save(); card(ctx, P, b0.x, b0.y, b0.w, b0.h * k, 34, mix(P.card, P.timer, 0.18)); text(ctx, "?", b0.x + b0.w / 2, b0.y + (b0.h * k) / 2, 200 * k, alpha(P.cardInk, 0.35)); ctx.restore(); }
  },
  // Lógica: tablero con filas claras de símbolos y resultados
  equations(ctx, c, b0, L, P, st) {
    card(ctx, P, b0.x, b0.y, b0.w, b0.h, 34);
    const b = inset(b0, 20);
    const rowsAll = [...c.data.eqs.map((e) => ({ terms: e.terms.flatMap((x, i) => (i ? [e.op, x] : [x])), value: String(e.value) })), { terms: c.data.q.terms, value: "?" }];
    const maxItems = Math.max(...rowsAll.map((r) => r.terms.length + 2));
    const rh = b.h / rowsAll.length, colW = b.w / maxItems, size = Math.min(rh * 0.5, colW * 0.62);
    const iconCol = (it) => [P.timer, P.alert, P.teal][["A", "B", "C"].findIndex((K) => c.data.icons[K] === it)] || P.cardInk;
    rowsAll.forEach((row, ri) => {
      const s = eOut(st.appear * 1.6 - ri * 0.16); if (s <= 0) return;
      const y = b.y + rh * (ri + 0.5), items = [...row.terms, "=", row.value], total = items.length * colW, x0 = b.x + (b.w - total) / 2 + colW / 2;
      ctx.save(); ctx.globalAlpha = s; ctx.translate((1 - s) * -30, 0);
      if (ri === rowsAll.length - 1) { rrect(ctx, b.x + (b.w - total) / 2 - 10, y - rh * 0.42, total + 20, rh * 0.84, 22 * P.R); ctx.fillStyle = alpha(P.timer, 0.2); ctx.fill(); }
      items.forEach((it, k) => { const x = x0 + k * colW; if (["+", "×", "="].includes(it)) text(ctx, it, x, y, size * 0.8, P.muted); else if (/^\d+$|^\?$/.test(it)) text(ctx, it, x, y, size * 1.05, it === "?" ? mix(P.timer, "#000000", 0.25) : P.cardInk); else { const col = iconCol(it); drawIcon(ctx, it, x, y, size * 0.62, col, 0, mix(col, "#000000", 0.2)); } });
      ctx.restore();
    });
  },
  seqNumbers(ctx, c, b, L, P, st) { seqTiles(ctx, c, b, L, P, st, [...c.data.shown.map(String), null], (v, w, h) => fitText(ctx, v, 0, 4, h * 0.46, w * 0.78, P.cardInk)); },
  seqShapes(ctx, c, b, L, P, st) { seqTiles(ctx, c, b, L, P, st, [...c.data.shown, null], (it, w, h) => item(ctx, it.icon, 0, 0, Math.min(w, h) * 0.32, it.color, it.rot)); },
  // Cultura: bandera grande en su marco
  flag(ctx, c, b, L, P, st) {
    const s = eBack(st.appear); const fw = Math.min(b.w * 0.86, (b.h - 40) * 1.5), fh = fw / 1.5;
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); zs(ctx, s, s);
    card(ctx, P, -fw / 2 - 18, -fh / 2 - 18, fw + 36, fh + 36, 30); flag(ctx, c.data.country, -fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  },
  // Siluetas: sombra grande sobre tarjeta clara; al revelar se colorea
  silhouette(ctx, c, b, L, P, st) {
    const s = eBack(st.appear), size = Math.min(b.w, b.h) * 0.98;
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); zs(ctx, s, s);
    card(ctx, P, -size / 2, -size / 2, size, size, 34, mix(P.card, P.teal, 0.12));
    const k = revealK(st, 0);
    figure(ctx, c.data.target, 0, 0, size * 0.82, k > 0 ? mix("#2A2F3A", itemHex(c.data.color), eOut(k)) : "#2A2F3A");
    ctx.restore();
  },
};
// Fichas de una serie: en horizontal en una fila; en vertical en filas de 3
function seqTiles(ctx, c, b, L, P, st, items, drawOne) {
  const n = items.length, perRow = L.v ? 3 : n, rows = Math.ceil(n / perRow), gap = 22;
  const w = Math.min((b.w - gap * (perRow - 1)) / perRow, L.v ? 320 : 290), h = Math.min(w * 0.92, (b.h - gap * (rows - 1)) / rows);
  items.forEach((it, i) => {
    const s = eBack(clamp(st.appear * 1.6 - i * 0.1)); if (s <= 0) return;
    const col = i % perRow, row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
    const x = b.x + (b.w - inRow * w - (inRow - 1) * gap) / 2 + (w + gap) * col + w / 2, y = b.y + (b.h - rows * h - (rows - 1) * gap) / 2 + (h + gap) * row + h / 2;
    ctx.save(); ctx.translate(x, y); zs(ctx, s, s);
    if (it == null) { card(ctx, P, -w / 2, -h / 2, w, h, 30, mix(P.card, P.timer, 0.16), { stroke: P.timer, lw: 5 }); text(ctx, "?", 0, 6, h * 0.5, mix(P.timer, "#000000", 0.3)); }
    else { card(ctx, P, -w / 2, -h / 2, w, h, 30); drawOne(it, w, h); }
    ctx.restore();
  });
}
function figure(ctx, parts, cx, cy, size, color) { const cell = size / 3; for (const p of parts) drawIcon(ctx, p.icon, cx + (p.x - 1) * cell, cy + (p.y - 1) * cell, cell * 0.48, color, p.rot); }
const TPL_OF = { odd_symbol: "grid", odd_color: "grid", odd_rotation: "grid", differences: "differences", memory_missing: "memory", logic_equations: "equations", sequence_number: "seqNumbers", sequence_shape: "seqShapes", flags: "flag", hidden_object: "scatter", silhouette: "silhouette", count_shapes: "scatter" };

// Opciones A-D: tarjetas blancas; la correcta se vuelve verde con ✓ y las demás se atenúan
function options(ctx, c, L, P, st) {
  const o = optsBox(L, c), n = 4, cols = o.cols, rows = Math.ceil(n / cols), gap = L.gap;
  const w = (o.w - gap * (cols - 1)) / cols, h = (o.h - gap * (rows - 1)) / rows;
  const list = c.data.options, rv = revealK(st, 0);
  for (let i = 0; i < n; i++) {
    const s = eBack(clamp(st.appear * 1.4 - 0.25 - i * 0.07)); if (s <= 0) continue;
    const x = o.x + (i % cols) * (w + gap), y = o.y + Math.floor(i / cols) * (h + gap), ok = i === c.answer.option;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); const sc = s * (ok && rv > 0 ? 1 + 0.05 * Math.sin(clamp(rv) * Math.PI) + 0.02 * eOut(rv) : 1); zs(ctx, sc, sc);
    ctx.globalAlpha = ok || st.revealAt == null ? 1 : fadeOthers(st);
    card(ctx, P, -w / 2, -h / 2, w, h, 26, ok && rv > 0 ? mix(P.card, P.ok, 0.22 * eOut(rv)) : P.card, ok && rv > 0 ? { stroke: P.ok, lw: 6 } : {});
    const lr = Math.min(h * 0.24, 34); const lx = -w / 2 + lr + 18;
    ctx.beginPath(); ctx.arc(lx, 0, lr, 0, 7); ctx.fillStyle = ok && rv > 0 ? P.ok : P.timer; ctx.fill(); text(ctx, LETTERS[i], lx, 2, lr * 1.15, ok && rv > 0 ? "#FFFFFF" : "#20242B");
    const cx = (lr * 2 + 18) / 2, aw = w - lr * 2 - 46, it = list[i];
    if (typeof it === "number") fitText(ctx, String(it), cx, 3, h * 0.52, aw, P.cardInk);
    else if (typeof it === "string") fitText(ctx, it, cx, 3, h * 0.34, aw, P.cardInk);
    else if (Array.isArray(it)) figure(ctx, it, cx, 0, Math.min(aw, h) * 1.02, itemHex(c.data.color));
    else if (it && it.icon) item(ctx, it.icon, cx, 0, Math.min(aw, h) * 0.36, it.color, it.rot || 0);
    if (ok && rv > 0) { const br = 22 * clamp(rv * 2); ctx.fillStyle = P.ok; ctx.beginPath(); ctx.arc(w / 2 - 6, -h / 2 + 6, br, 0, 7); ctx.fill(); check(ctx, w / 2 - 6, -h / 2 + 6, br * 0.9, "#FFFFFF"); }
    ctx.restore();
  }
}

// ---------- Temporizador: círculo limpio, número grande, anillo amarillo que pasa a coral al final ----------
export function drawTimer(ctx, cx, cy, r, P0, k, secondsLeft, mode = "normal", state = "play") {
  const P = P0.card ? P0 : palette(P0);
  const last = secondsLeft <= 3 && state === "play";
  const frac = secondsLeft - Math.floor(secondsLeft);
  const beat = last ? 1 + (mode === "focus" ? 0.03 : mode === "extreme" ? 0.1 : 0.06) * Math.pow(frac, 3) : 1;
  const col = state === "timeout" || last ? P.alert : P.timer;
  ctx.save(); ctx.translate(cx, cy); zs(ctx, beat, beat);
  card(ctx, P, -r, -r, r * 2, r * 2, r / P.R, P.card);
  ctx.lineWidth = r * 0.16; ctx.strokeStyle = P.line; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 7); ctx.stroke();
  if (k > 0.001) { ctx.lineCap = "round"; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(k)); ctx.stroke(); }
  text(ctx, state === "timeout" ? "0" : String(Math.max(0, Math.ceil(secondsLeft - 1e-6))), 0, r * 0.06, r * 0.86, last || state === "timeout" ? P.alert : P.cardInk);
  ctx.restore();
}

// ---------- Cabecera: reto, dificultad y puntos; barra de progreso del vídeo ----------
function hud(ctx, L, P, seg, c, t, tl, k) {
  const col = ROUND_COLOR(P, c.difficulty);
  ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * -16);
  const label = `RETO ${seg.index + 1}/${seg.total}`, fs = L.v ? 30 : 27;
  ctx.font = `800 ${fs}px ${FONT}`; const w1 = ctx.measureText(label).width + 44, h = fs * 1.7;
  pill(ctx, P, L.hud.x, L.hud.y - h / 2, w1, h, P.card); text(ctx, label, L.hud.x + w1 / 2, L.hud.y + 2, fs, P.cardInk);
  const d = `${DIFF_LABEL[c.difficulty].toUpperCase()} · ${c.points} ${c.points === 1 ? "PTO" : "PTOS"}`; ctx.font = `800 ${fs * 0.88}px ${FONT}`; const w2 = ctx.measureText(d).width + 40;
  pill(ctx, P, L.hud.x + w1 + 12, L.hud.y - h / 2, w2, h, col, { flat: true }); text(ctx, d, L.hud.x + w1 + 12 + w2 / 2, L.hud.y + 2, fs * 0.88, lum(col) > 0.6 ? "#20242B" : "#FFFFFF");
  if (!L.v) { const pw = L.W - 112, pr = clamp(t / tl.duration); rrect(ctx, 56, L.H - 26, pw, 8, 4); ctx.fillStyle = alpha(P.dark ? "#FFFFFF" : "#20242B", 0.08); ctx.fill(); rrect(ctx, 56, L.H - 26, Math.max(8, pw * pr), 8, 4); ctx.fillStyle = P.timer; ctx.fill(); }
  ctx.restore();
}

// ---------- Pantallas de ronda, resultados y cierre ----------
function roundScreen(ctx, L, P, seg, t, cfg) {
  const k = (t - seg.start) / (seg.end - seg.start), col = ROUND_COLOR(P, seg.difficulty);
  const inK = eBack(clamp(k * 4)), outK = eIn(clamp((k - 0.8) / 0.2));
  const cw = L.v ? 880 : 1100, ch = L.v ? 640 : 520, x = (L.W - cw) / 2 + (1 - inK) * L.W * 0.6 - outK * L.W * 0.8, y = (L.H - ch) / 2;
  ctx.save(); ctx.globalAlpha = 1 - outK * 0.6;
  card(ctx, P, x, y, cw, ch, 44);
  ctx.save(); rrect(ctx, x, y, cw, ch, 44 * P.R); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x, y, cw, ch * 0.3);
  ctx.fillStyle = alpha("#FFFFFF", 0.18); for (let i = -4; i < 14; i++) { ctx.beginPath(); ctx.moveTo(x + i * 110, y); ctx.lineTo(x + i * 110 + 50, y); ctx.lineTo(x + i * 110 - 40, y + ch * 0.3); ctx.lineTo(x + i * 110 - 90, y + ch * 0.3); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  text(ctx, `RONDA ${seg.round}`, x + cw / 2, y + ch * 0.15, L.v ? 64 : 56, lum(col) > 0.6 ? "#20242B" : "#FFFFFF");
  const s = eBack(clamp((k - 0.1) * 3.5));
  ctx.save(); ctx.translate(x + cw / 2, y + ch * 0.55); zs(ctx, s, s); fitText(ctx, DIFF_LABEL[seg.difficulty].toUpperCase(), 0, 0, L.v ? 130 : 128, cw - 80, P.cardInk); ctx.restore();
  const pts = mergeConfig(cfg).points[seg.difficulty];
  ctx.globalAlpha = clamp((k - 0.25) * 4) * (1 - outK); text(ctx, `Cada acierto: ${pts} ${pts === 1 ? "punto" : "puntos"}`, x + cw / 2, y + ch * 0.82, L.v ? 42 : 38, P.muted);
  ctx.restore();
}
function resultsScreen(ctx, L, P, seg, t) {
  const k = t - seg.start;
  ctx.save(); ctx.globalAlpha = eOut(k / 0.5); ctx.translate(0, (1 - eOut(k / 0.5)) * -20);
  const tl = L.v ? ["¿CUÁNTOS PUNTOS", "HAS SACADO?"] : ["¿CUÁNTOS PUNTOS HAS SACADO?"];
  tl.forEach((l, i) => fitText(ctx, l, L.W / 2, (L.v ? 330 : 110) + i * 84, L.v ? 78 : 66, L.W - 120, P.ink));
  text(ctx, `Máximo: ${seg.max} puntos`, L.W / 2, L.v ? 520 : 190, 38, P.muted);
  ctx.restore();
  const rows = [...seg.ranks].reverse(), rh = L.v ? 150 : 112, w = Math.min(L.W - 120, 1150), x = (L.W - w) / 2, y0 = L.v ? 620 : 250;
  rows.forEach((r, i) => {
    const s = eBack(clamp((k - 0.45 - i * 0.16) * 2.6)); if (s <= 0) return;
    const y = y0 + i * (rh + 18), top = i === 0;
    ctx.save(); ctx.translate(x + w / 2, y + rh / 2); zs(ctx, s, s);
    card(ctx, P, -w / 2, -rh / 2, w, rh, 28, top ? P.ok : P.card);
    const range = r.from === r.to ? `${r.to}` : `${r.from} – ${r.to}`;
    text(ctx, r.name, -w / 2 + 40, 2, L.v ? 44 : 40, top ? "#FFFFFF" : P.cardInk, "left");
    text(ctx, `${range} pts`, w / 2 - 40, 2, L.v ? 42 : 38, top ? "#FFFFFF" : mix(P.timer, "#000000", 0.3), "right");
    ctx.restore();
  });
  if (k > 0.3) confetti(ctx, P, L.W / 2, L.v ? 300 : 110, clamp((k - 0.3) / 1.6), 3);
}
function outroScreen(ctx, L, P, seg, t) {
  const k = t - seg.start, s = eBack(clamp(k * 2.5)), cw = L.v ? 900 : 1100, ch = L.v ? 560 : 440;
  ctx.save(); ctx.translate(L.W / 2, L.H / 2); zs(ctx, s, s);
  card(ctx, P, -cw / 2, -ch / 2, cw, ch, 44);
  text(ctx, "¿LO HAS", 0, -ch * 0.2, L.v ? 104 : 96, P.cardInk); text(ctx, "CONSEGUIDO?", 0, ch * 0.03, L.v ? 104 : 96, mix(P.timer, "#000000", 0.18));
  text(ctx, "Más retos en el canal", 0, ch * 0.3, L.v ? 46 : 42, P.muted);
  ctx.restore();
}
function confetti(ctx, P, x, y, k, seed) {
  if (k <= 0 || k >= 1) return;
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 + seed, d = eOut(k) * 170 * (0.6 + ((i * 7) % 5) / 8); ctx.globalAlpha = clamp(1.2 - k); drawIcon(ctx, i % 2 ? "square" : "circle", x + Math.cos(a) * d, y + Math.sin(a) * d - k * 30, 10, [P.timer, P.ok, P.teal, P.alert][i % 4], i * 20 + k * 200); }
  ctx.globalAlpha = 1;
}
// «+N PUNTOS» junto al temporizador
function pointsPill(ctx, P, L, k, pts) {
  if (k <= 0) return;
  // Ocupa el sitio del temporizador (ya en 0): nunca tapa el reto
  const s = eBack(clamp(k * 2.2)), x = Math.min(L.timer.cx, L.W - 136), y = L.timer.cy;
  confetti(ctx, P, x, y, clamp(k * 0.9), pts);
  ctx.save(); ctx.translate(x, y - 10 * eOut(k)); zs(ctx, s, s); pill(ctx, P, -112, -36, 224, 72, P.timer); text(ctx, `+${pts} ${pts === 1 ? "PUNTO" : "PUNTOS"}`, 0, 2, 31, "#20242B"); ctx.restore();
}


// ---------- Playable World: portada y mapa de niveles ----------
const MECH_NAME = { maze: "Laberinto", machine: "Máquina", room_error: "Encuentra el error" };
function mechIcon(ctx, m, x, y, r, col) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = r * 0.16; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (m === "maze") { ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6); ctx.lineTo(-r * 0.6, -r * 0.2); ctx.moveTo(-r * 0.2, -r * 0.6); ctx.lineTo(-r * 0.2, r * 0.2); ctx.lineTo(r * 0.25, r * 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.2, r * 0.14, 0, 7); ctx.fill(); }
  else if (m === "machine") { ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.48 : r * 0.68; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 7); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.12, r * 0.42, 0, 7); ctx.stroke(); ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.2); ctx.lineTo(r * 0.6, r * 0.6); ctx.stroke(); }
  ctx.restore();
}
function mapNodes(L, n) {
  return Array.from({ length: n }, (_, i) => {
    const f = n === 1 ? 0.5 : i / (n - 1);
    return L.v ? { x: L.W * (i % 2 ? 0.7 : 0.3), y: L.H * (0.3 + 0.45 * f) } : { x: L.W * (0.14 + 0.72 * f), y: L.H * (0.56 + (i % 2 ? -0.12 : 0.1)) };
  });
}
function mapScreen(ctx, L, P, seg, t) {
  const k = clamp((t - seg.start) / (seg.end - seg.start)), N = mapNodes(L, seg.total), r = L.v ? 74 : 66;
  const inK = eOut(clamp(k * 5)), hop = eOut(clamp((k - 0.22) / 0.4));
  ctx.save(); ctx.globalAlpha = inK * (1 - eIn(clamp((k - 0.88) / 0.12)));
  fitText(ctx, seg.to === seg.total - 1 && seg.total > 2 ? "DESAFÍO FINAL" : `NIVEL ${seg.to + 1}`, L.W / 2, L.v ? 300 : 120, L.v ? 110 : 96, L.W - 120, P.ink);
  text(ctx, (MECH_NAME[seg.mechanics[seg.to]] || "").toUpperCase(), L.W / 2, L.v ? 400 : 205, L.v ? 46 : 40, mix(P.teal, "#000000", 0.15));
  // Camino
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = alpha(P.dark ? "#FFFFFF" : "#20242B", 0.12); ctx.lineWidth = 26; ctx.setLineDash([2, 44]); ctx.beginPath(); N.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = P.ok; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(N[0].x, N[0].y); for (let i = 1; i <= seg.from; i++) ctx.lineTo(N[i].x, N[i].y); const a = N[seg.from], b = N[seg.to]; ctx.lineTo(lerp(a.x, b.x, hop), lerp(a.y, b.y, hop)); ctx.stroke();
  // Nodos
  N.forEach((p, i) => {
    const done = i <= seg.from, cur = i === seg.to, s = cur ? 1 + 0.08 * Math.sin(t * 7) * (hop > 0.99 ? 1 : 0) + 0.15 * eBack(clamp((k - 0.55) / 0.25)) : 1;
    ctx.save(); ctx.translate(p.x, p.y); zs(ctx, s);
    card(ctx, P, -r, -r, r * 2, r * 2, r / P.R, done ? P.ok : P.card, cur ? { stroke: P.timer, lw: 8 } : {});
    mechIcon(ctx, seg.mechanics[i], 0, 0, r * 0.75, done ? "#FFFFFF" : cur ? mix(P.timer, "#000000", 0.2) : "#B5BCC8");
    ctx.restore();
    if (done) { const sx = p.x + r * 0.7, sy = p.y - r * 0.7; ctx.fillStyle = P.timer; ctx.beginPath(); for (let j = 0; j < 10; j++) { const an = -Math.PI / 2 + (j * Math.PI) / 5, rr = j % 2 ? 11 : 25; ctx.lineTo(sx + Math.cos(an) * rr, sy + Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); }
    text(ctx, String(i + 1), p.x, p.y + r + 34, 34, P.muted);
  });
  // PIX salta al siguiente nivel
  const px = lerp(a.x, b.x, hop), py = lerp(a.y, b.y, hop) - Math.sin(hop * Math.PI) * (L.v ? 220 : 180) - r * 0.9;
  drawPix(ctx, px, py + r * 0.15, L.v ? 200 : 170, hop > 0 && hop < 1 ? "happy" : hop >= 1 ? "curious" : "normal", t * 0.5, b.x < a.x);
  ctx.restore();
}
function introScreen(ctx, L, P, seg, t, project) {
  const k = t - seg.start, d = seg.end - seg.start, out = eIn(clamp((k - (d - 0.35)) / 0.35));
  ctx.save(); ctx.globalAlpha = 1 - out;
  const s = eBack(clamp(k / 0.6));
  ctx.save(); ctx.translate(L.W / 2, L.v ? L.H * 0.56 : L.H * 0.62); zs(ctx, s);
  ctx.fillStyle = alpha(P.timer, 0.25); ctx.beginPath(); ctx.arc(0, -150, L.v ? 300 : 250, 0, 7); ctx.fill();
  drawPix(ctx, 0, L.v ? 120 : 110, L.v ? 520 : 420, k < d * 0.45 ? "happy" : "victory", t * 0.5);
  ctx.restore();
  const tk = eOut(clamp((k - 0.15) / 0.5)), lines = wrap(ctx, String(project.title || "¿Puedes con todos?").toUpperCase(), L.v ? 960 : 1500, L.v ? 92 : 84).slice(0, 3);
  ctx.save(); ctx.globalAlpha *= tk; ctx.translate(0, (1 - tk) * -30);
  lines.forEach((ln, i) => fitText(ctx, ln, L.W / 2, (L.v ? 300 : 110) + i * (L.v ? 100 : 90), L.v ? 92 : 84, L.W - 100, P.ink));
  const lk = eBack(clamp((k - 0.5) / 0.4)), ly = L.v ? 300 + lines.length * 100 + 30 : 110 + lines.length * 90 + 10;
  ctx.translate(L.W / 2, ly); zs(ctx, lk); pill(ctx, P, -190, -38, 380, 76, P.timer); text(ctx, `${seg.total} NIVELES`, 0, 3, 40, "#20242B");
  ctx.restore(); ctx.restore();
}

// ---------- Fotograma completo ----------
// Se dibuja siempre en el tamaño de diseño (1920×1080 o 1080×1920) y se escala: la vista previa es idéntica al vídeo
export function drawFrame(ctx, W, H, project, tl, t, theme) {
  const DW = H > W ? 1080 : 1920, DH = H > W ? 1920 : 1080;
  if (W === DW && H === DH) return drawDesign(ctx, W, H, project, tl, t, theme);
  ctx.save(); zs(ctx, W / DW, H / DH); drawDesign(ctx, DW, DH, project, tl, t, theme); ctx.restore();
}
function drawDesign(ctx, W, H, project, tl, t, theme) {
  const P = palette(theme || project.theme), L = frameLayout(W, H);
  const segs = tl.segments;
  const found = segs.findIndex((s) => t >= s.start && t < (s.end ?? s.start));
  const si = found >= 0 ? found : segs.length - 1, seg = segs[si];
  const chOf = (s) => (s && s.type === "challenge" ? project.challenges.find((x) => x.id === s.challenge) : null);
  // Fondo del tipo de juego, con transición suave al cambiar de reto
  const c0 = chOf(seg), prev = chOf(segs[si - 1]);
  let bg = c0 ? bgFor(P, c0) : seg.type === "round" && seg.difficulty === "extreme" ? P.bgs.extreme : P.bg;
  if (prev && c0 && t - seg.start < 0.45) bg = mix(bgFor(P, prev), bg, eOut((t - seg.start) / 0.45));
  background(ctx, W, H, P, bg, (c0 && c0.difficulty === "extreme") || (seg.type === "round" && seg.difficulty === "extreme") ? P.alert : null);
  if (seg.type === "intro") return introScreen(ctx, L, P, seg, t, project);
  if (seg.type === "map") return mapScreen(ctx, L, P, seg, t);
  if (seg.type === "round") return roundScreen(ctx, L, P, seg, t, project.config);
  if (seg.type === "results") return resultsScreen(ctx, L, P, seg, t);
  if (seg.type === "outro") { outroScreen(ctx, L, P, seg, t); if (project.game_style === "world") drawPix(ctx, L.W / 2, L.v ? L.H * 0.8 : L.H * 0.97, L.v ? 260 : 200, "victory", t * 0.5); return; }
  const c = c0; if (!c) return;
  const cfg = mergeConfig(project.config);
  const inK = clamp((t - seg.intro[0]) / (seg.intro[1] - seg.intro[0])), outK = clamp((t - seg.out[0]) / (seg.out[1] - seg.out[0]));
  const st = { t, appear: 0, cover: 0, memoPhase: false, afterAppear: 0, revealAt: seg.reveal && t >= seg.reveal[0] ? seg.reveal[0] : null };
  if (seg.memo) {
    if (t < seg.memo[1]) { st.memoPhase = true; st.appear = eOut(clamp((t - seg.intro[0]) / 0.9)); st.cover = clamp((t - (seg.memo[1] - 0.6)) / 0.6); }
    else st.afterAppear = clamp((t - seg.play[0]) / 0.7);
  } else st.appear = clamp((t - seg.intro[0] - 0.25) / 0.9);
  // Salida: el reto se desliza y se desvanece (rápido)
  ctx.save();
  if (outK > 0) { ctx.globalAlpha = 1 - eIn(outK); ctx.translate(-W * 0.18 * eIn(outK), 0); }
  hud(ctx, L, P, seg, c, t, tl, eOut(inK * 2.2));
  // Pregunta: grande y oscura; durante el «¡TIEMPO!» la sustituye el aviso (no tapa el reto)
  const tk = seg.timeout && t >= seg.timeout[0] && t < seg.reveal[0] + 0.35 ? (t - seg.timeout[0]) / (seg.reveal[0] + 0.35 - seg.timeout[0]) : -1;
  const qk = eOut(clamp(inK * 1.8));
  const world = isWorldMechanic(c.mechanic), Q = world ? L.wq : L.q;
  ctx.save(); ctx.globalAlpha = tk >= 0 ? clamp(1 - clamp(tk * 4) + clamp((tk - 0.8) * 5)) : qk; ctx.translate(Q.x, Q.y - (1 - qk) * 24);
  const lines = L.v ? wrap(ctx, c.question.toUpperCase(), Q.maxW, Q.size).slice(0, 2) : [c.question.toUpperCase()], qs = lines.length > 1 ? Q.size * 0.82 : Q.size;
  // Playable World: al resolverse, la pregunta se convierte en la solución («ENTRADA C», «¡LA VELA…!»)
  const solvedT = world && seg.reveal ? seg.reveal[0] + solvedAt(c) : Infinity, sk = clamp((t - solvedT) / 0.3);
  if (sk > 0 && c.answer?.label) {
    ctx.globalAlpha = 1; const ls = wrap(ctx, c.answer.label.toUpperCase(), Q.maxW, Q.size * 0.9).slice(0, 2), s2 = (ls.length > 1 ? Q.size * 0.72 : Q.size * 0.9) * eBack(sk);
    ls.forEach((ln, i) => fitText(ctx, ln, 0, (i - (ls.length - 1) / 2) * s2 * 1.08, s2, Q.maxW, P.dark ? P.ok : mix(P.ok, "#000000", 0.25)));
  } else lines.forEach((ln, i) => fitText(ctx, ln, 0, (i - (lines.length - 1) / 2) * qs * 1.08, qs, Q.maxW, P.ink));
  if (seg.memo && t < seg.memo[1]) text(ctx, (c.instructions || "¡Memoriza!").toUpperCase(), 0, qs * (lines.length * 0.55 + 0.45), qs * 0.48, P.dark ? P.teal : mix(P.teal, "#000000", 0.15));
  ctx.restore();
  if (tk >= 0 && tk < 1) { const s = eBack(clamp(tk * 5)) * (1 - eIn(clamp((tk - 0.8) * 5))); ctx.save(); ctx.translate(Q.x, Q.y); ctx.rotate(-0.03); zs(ctx, s, s); pill(ctx, P, -230, -56, 460, 112, P.alert); text(ctx, "¡TIEMPO!", 0, 4, 66, "#FFFFFF"); ctx.restore(); }
  // Reto
  if (world) {
    // Playable World: la escena ocupa casi todo el fotograma y se anima con la simulación del reto
    const wb = L.wbox, ak = eOut(clamp((t - seg.intro[0]) / 0.7));
    ctx.save(); ctx.globalAlpha *= ak; ctx.translate(0, (1 - ak) * 40);
    drawWorldScene(ctx, c, wb, L, P, { t, rt: st.revealAt != null ? t - st.revealAt : null, play: clamp((t - seg.play[0]) / (seg.play[1] - seg.play[0])), timeout: t >= seg.play[1] });
    ctx.restore();
  } else {
  const b = contentBox(L, c);
  TPL[TPL_OF[c.mechanic]](ctx, c, b, L, P, st);
  if (hasOptions(c) && (!seg.memo || t >= seg.play[0])) options(ctx, c, L, P, { ...st, appear: seg.memo ? clamp((t - seg.play[0]) / 0.8) : st.appear });
  }
  // Temporizador (o barra de memorizar)
  const T = seg.play[1] - seg.play[0];
  const ptsK = st.revealAt != null ? clamp((t - (st.revealAt + solvedAt(c) + 0.6)) / 1.0) : 0;
  if (seg.memo && t < seg.memo[1]) {
    const mk = 1 - clamp((t - seg.memo[0]) / (seg.memo[1] - seg.memo[0] - 0.6)), bw = L.v ? 300 : 360, bx = L.timer.cx - bw + L.timer.r, by = L.timer.cy - 12;
    rrect(ctx, bx, by, bw, 24, 12); ctx.fillStyle = P.line; ctx.fill(); rrect(ctx, bx, by, Math.max(24, bw * mk), 24, 12); ctx.fillStyle = P.teal; ctx.fill();
  } else {
    const left = clamp(seg.play[1] - t, 0, T), k = left / T, state = t >= seg.play[1] ? "timeout" : "play";
    const tk2 = seg.memo ? eBack(clamp((t - seg.play[0]) * 3)) : eBack(clamp(inK * 2));
    const ts = tk2 * (1 - eIn(clamp(ptsK * 3)));
    // Nunca escalar a 0: cairo deja el lienzo inservible con una matriz no invertible
    if (ts > 0.01) { ctx.save(); ctx.translate(L.timer.cx, L.timer.cy); zs(ctx, ts, ts); drawTimer(ctx, 0, 0, L.timer.r, P, t < seg.play[0] ? 1 : k, t < seg.play[0] ? T : left, cfg.timer_mode, state); ctx.restore(); }
    // Últimos segundos: borde coral muy suave (nada de destellos)
    if (state === "play" && left <= 3 && left > 0 && cfg.timer_mode !== "focus") { const f = Math.pow(left - Math.floor(left), 3) * (cfg.timer_mode === "extreme" ? 0.3 : 0.16); ctx.save(); ctx.strokeStyle = alpha(P.alert, f); ctx.lineWidth = 24; ctx.strokeRect(0, 0, W, H); ctx.restore(); }
  }
  pointsPill(ctx, P, L, ptsK, c.points);
  // Explicación: tarjeta encima de las opciones (o al pie del reto)
  const ex = seg.explain && t >= seg.explain[0] ? clamp((t - seg.explain[0]) / 0.35) : 0;
  if (ex > 0 && c.explanation) {
    const bw = L.box.w - (L.v ? 0 : 400), size = L.v ? 40 : 36, ls = wrap(ctx, c.explanation, bw - 80, size), bh = ls.length * size * 1.25 + 44;
    const by = hasOptions(c) ? optsBox(L, c).y - bh - 14 : L.box.y + L.box.h - bh;
    ctx.save(); ctx.globalAlpha = eOut(ex); ctx.translate(0, (1 - eOut(ex)) * 20);
    card(ctx, P, (W - bw) / 2, by, bw, bh, 24); ctx.fillStyle = P.teal; rrect(ctx, (W - bw) / 2, by, 12, bh, 6); ctx.fill();
    ls.forEach((l, i) => text(ctx, l, W / 2 + 6, by + 22 + size * 0.62 + i * size * 1.25, size, P.cardInk)); ctx.restore();
  }
  ctx.restore();
}

// ---------- Miniatura (programática, en el estilo del canal) ----------
export function drawThumbnail(ctx, W, H, project, theme) {
  const P = palette(theme || project.theme), u = H / 1080;
  ctx.save(); zs(ctx, u, u); const DW = W / u, DH = 1080;
  background(ctx, DW, DH, P, P.bg, null);
  const cols = 6, rows = 5, cell = 128, ox = DW - cols * cell - 110, oy = (DH - rows * cell) / 2 + 30;
  card(ctx, P, ox - 34, oy - 34, cols * cell + 68, rows * cell + 68, 40);
  for (let i = 0; i < cols * rows; i++) { const x = ox + cell * ((i % cols) + 0.5), y = oy + cell * (Math.floor(i / cols) + 0.5), odd = i === 17; text(ctx, odd ? "B" : "8", x, y + 4, 86, odd ? P.ok : P.cardInk); if (odd) solutionRing(ctx, P, x, y, 52, 1); }
  drawTimer(ctx, ox + cols * cell - 6, oy - 30, 86, P, 0.3, 3, "normal", "play");
  const words = String(project.title || "¿Puedes superar estos retos?").toUpperCase();
  const size = wrap(ctx, words, DW * 0.42, 116).length > 3 ? 96 : 116;
  wrap(ctx, words, DW * 0.42, size).slice(0, 4).forEach((l, i, a) => { const y = DH / 2 - ((a.length - 1) * size * 1.08) / 2 + i * size * 1.08; text(ctx, l, 90, y, size, /\d/.test(l) ? mix(P.timer, "#000000", 0.12) : P.ink, "left"); });
  ctx.restore();
}
export { palette };
