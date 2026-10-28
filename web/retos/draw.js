// Motor B — dibujo 2D de los retos con la API Canvas (igual en el navegador y en el servidor con node-canvas).
// Todo se dibuja con código: cuadrículas, figuras, banderas, temporizador, rondas y resultados. Nada de imágenes generadas.
import { mergeTheme, mergeConfig, PALETTE, FLAGS, DIFF_LABEL } from "./engine.js";

const LETTERS = ["A", "B", "C", "D"];
const FONT = "Montserrat, 'Arial Black', sans-serif";
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const eOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
const eIn = (k) => Math.pow(clamp(k), 3);
const eBack = (k) => { k = clamp(k); const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const prog = (t, [a, b]) => clamp((t - a) / Math.max(1e-6, b - a));
const colorHex = (k) => (PALETTE.find((p) => p.k === k) || PALETTE[0]).hex;

// ---------- Color ----------
function rgb(hex) { const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, k) { const x = rgb(a), y = rgb(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], k))).join(",")})`; }
function alpha(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }
function palette(theme) { const T = mergeTheme(theme); return { ...T, panel: mix(T.bg, "#FFFFFF", 0.07), panel2: mix(T.bg, "#FFFFFF", 0.13), deep: mix(T.bg, "#000000", 0.35), dim: alpha(T.text, 0.55) }; }
const ROUND_COLOR = (P, d) => ({ easy: P.teal, medium: P.timer, hard: P.alert, extreme: P.alert }[d] || P.teal);

// ---------- Formas ----------
function rrect(ctx, x, y, w, h, r) { w = Math.max(0, w); h = Math.max(0, h); r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function poly(ctx, n, cx, cy, r, rot = -Math.PI / 2) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; ctx[i ? "lineTo" : "moveTo"](cx + r * Math.cos(a), cy + r * Math.sin(a)); } ctx.closePath(); }
function star(ctx, n, cx, cy, r, ri) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? ri : r; ctx[i ? "lineTo" : "moveTo"](cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } ctx.closePath(); }
// Icono centrado en (cx,cy) con radio r; rot en grados
export function drawIcon(ctx, icon, cx, cy, r, fill, rot = 0, stroke) {
  ctx.save(); ctx.translate(cx, cy); if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.fillStyle = fill;
  switch (icon) {
    case "circle": ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); break;
    case "square": rrect(ctx, -r * 0.82, -r * 0.82, r * 1.64, r * 1.64, r * 0.18); break;
    case "triangle": poly(ctx, 3, 0, r * 0.12, r * 1.02); break;
    case "diamond": ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.72, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.72, 0); ctx.closePath(); break;
    case "star": star(ctx, 5, 0, r * 0.06, r, r * 0.45); break;
    case "star6": star(ctx, 6, 0, 0, r, r * 0.55); break;
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
  ctx.fill("evenodd");
  if (stroke) { ctx.lineWidth = stroke.w; ctx.strokeStyle = stroke.c; ctx.stroke(); }
  ctx.restore();
}
function check(ctx, cx, cy, r, color) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = r * 0.28; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.02); ctx.lineTo(cx - r * 0.12, cy + r * 0.4); ctx.lineTo(cx + r * 0.55, cy - r * 0.38); ctx.stroke(); ctx.restore(); }
function flag(ctx, name, x, y, w, h) {
  const f = FLAGS[name]; if (!f) return;
  ctx.save(); rrect(ctx, x, y, w, h, Math.min(w, h) * 0.06); ctx.clip();
  const c = f.c;
  if (f.t === "v3") c.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x + (w * i) / 3, y, w / 3 + 1, h); });
  else if (f.t === "h3") c.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x, y + (h * i) / 3, w, h / 3 + 1); });
  else if (f.t === "h2") c.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x, y + (h * i) / 2, w, h / 2 + 1); });
  else if (f.t === "disc") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(x + w * (f.off ?? 0.5), y + h / 2, h * 0.3, 0, 7); ctx.fill(); }
  else if (f.t === "nordic" || f.t === "nordic2") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); const cx = x + w * 0.36, t = h * (f.t === "nordic2" ? 0.24 : 0.18); ctx.fillStyle = c[1]; ctx.fillRect(cx - t / 2, y, t, h); ctx.fillRect(x, y + h / 2 - t / 2, w, t); if (f.t === "nordic2") { const t2 = t * 0.5; ctx.fillStyle = c[2]; ctx.fillRect(cx - t2 / 2, y, t2, h); ctx.fillRect(x, y + h / 2 - t2 / 2, w, t2); } }
  else if (f.t === "swiss") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); const s = h * 0.6, a = s * 0.22; ctx.fillStyle = c[1]; ctx.fillRect(x + w / 2 - a, y + h / 2 - s / 2, a * 2, s); ctx.fillRect(x + w / 2 - s / 2, y + h / 2 - a, s, a * 2); }
  else if (f.t === "laos") { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); ctx.fillStyle = c[1]; ctx.fillRect(x, y + h / 4, w, h / 2); ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.2, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.save(); rrect(ctx, x, y, w, h, Math.min(w, h) * 0.06); ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}
function text(ctx, s, x, y, size, color, align = "center", base = "middle") { ctx.font = `800 ${Math.round(size)}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y); }
function fitText(ctx, s, x, y, size, maxW, color, align = "center") { ctx.font = `800 ${Math.round(size)}px ${FONT}`; const w = ctx.measureText(s).width; text(ctx, s, x, y, w > maxW ? (size * maxW) / w : size, color, align); }
function wrap(ctx, s, maxW, size) { ctx.font = `800 ${Math.round(size)}px ${FONT}`; const words = String(s).split(/\s+/); const lines = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
function pill(ctx, x, y, w, h, fill, stroke) { rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); } }
function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; }

// ---------- Fondo animado (formas geométricas tenues que flotan) ----------
// El degradado y la rejilla se dibujan una sola vez y se reutilizan (desplazados) en cada fotograma
let canvasFactory = (w, h) => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
export function setCanvasFactory(f) { canvasFactory = f; }
const _bg = new Map();
function bgCache(W, H, P) {
  const key = `${W}x${H}|${P.bg}`; if (_bg.has(key)) return _bg.get(key);
  const step = Math.round(Math.min(W, H) / 9), c = canvasFactory(W + step, H + step), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, mix(P.bg, "#FFFFFF", 0.05)); g.addColorStop(1, P.deep);
  x.fillStyle = g; x.fillRect(0, 0, W + step, H + step);
  x.strokeStyle = alpha("#FFFFFF", 0.035); x.lineWidth = 2;
  x.beginPath(); for (let i = 0; i <= W + step; i += step) { x.moveTo(i, 0); x.lineTo(i, H + step); } for (let j = 0; j <= H + step; j += step) { x.moveTo(0, j); x.lineTo(W + step, j); } x.stroke();
  const v = { c, step }; if (_bg.size > 6) _bg.clear(); _bg.set(key, v); return v;
}
function background(ctx, W, H, P, t, accent) {
  const { c, step } = bgCache(W, H, P), o = (t * 12) % step;
  ctx.drawImage(c, o - step, o - step);
  const shapes = ["circle", "triangle", "plus", "square", "ring", "diamond"];
  for (let i = 0; i < 9; i++) {
    const sx = ((i * 0.37 + 0.11) % 1) * W + Math.sin(t * 0.25 + i) * 40, sy = ((i * 0.61 + 0.07) % 1) * H + Math.cos(t * 0.2 + i * 1.7) * 40;
    drawIcon(ctx, shapes[i % shapes.length], sx, sy, Math.min(W, H) * (0.035 + (i % 3) * 0.015), alpha(i % 2 ? accent : "#FFFFFF", 0.05), t * 8 * (i % 2 ? 1 : -1));
  }
}

// ---------- Maquetación según formato ----------
function frameLayout(W, H) {
  const v = H > W; // vertical (Short)
  if (v) return { v, W, H, u: W / 1080, q: { x: W / 2, y: 470, size: 66, maxW: W - 160 }, hud: { y: 175 }, timer: { cx: W / 2, cy: 300, r: 82 }, box: { x: 70, y: 620, w: W - 140, h: H - 620 - 430 }, opts: { x: 70, y: H - 600, w: W - 140, h: 330, cols: 2 } };
  return { v, W, H, u: H / 1080, q: { x: W / 2 - 60, y: 112, size: 58, maxW: W - 520 }, hud: { y: 60 }, timer: { cx: W - 135, cy: 118, r: 72 }, box: { x: 150, y: 220, w: W - 300, h: H - 220 - 90 }, opts: { x: 150, y: H - 245, w: W - 300, h: 150, cols: 4 } };
}
const hasOptions = (c) => "option" in (c.answer || {});
// Las opciones con dibujos (siluetas, figuras, objetos) necesitan más alto que las de texto o números
const FIG_OPTS = new Set(["silhouette", "sequence_shape", "memory_missing"]);
function optsBox(L, c) { if (!FIG_OPTS.has(c.mechanic)) return L.opts; const h = L.v ? 440 : 215; return { ...L.opts, y: L.opts.y + L.opts.h - h, h }; }
function contentBox(L, c) { const b = { ...L.box }; if (hasOptions(c)) b.h = optsBox(L, c).y - b.y - (L.v ? 40 : 30); return b; }
// Área casi cuadrada centrada (proporción entre 3:4 y 3:2) para repartir figuras sin deformar demasiado
function squareIn(b) { const ar = clamp(b.w / b.h, 0.75, 1.5); let w = b.w, h = w / ar; if (h > b.h) { h = b.h; w = h * ar; } return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h }; }
// Radio máximo para que ninguna figura toque a otra: la mitad de la menor distancia real en píxeles
const _nn = new Map();
function safeRadius(items, b, cap) {
  const key = `${items.length}|${items[0]?.x}|${b.w}|${b.h}`; if (_nn.has(key)) return Math.min(cap, _nn.get(key));
  let m = Infinity; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) m = Math.min(m, Math.hypot((items[i].x - items[j].x) * b.w, (items[i].y - items[j].y) * b.h));
  const r = m * 0.44; if (_nn.size > 200) _nn.clear(); _nn.set(key, r); return Math.min(cap, r);
}

// ---------- Plantillas de contenido: dibujan un reto en su caja. st = estado de animación ----------
// st: { appear 0..1, reveal 0..1 (0 = sin revelar), dimOthers, t }
function cellPos(c, b, L, i) {
  let { cols, rows } = c.data; let cc = i % cols, rr = Math.floor(i / cols);
  if (L.v && cols > rows) { [cols, rows] = [rows, cols]; [cc, rr] = [rr, cc]; }
  const cell = Math.min(b.w / cols, b.h / rows), ox = b.x + (b.w - cell * cols) / 2, oy = b.y + (b.h - cell * rows) / 2;
  return { x: ox + cell * (cc + 0.5), y: oy + cell * (rr + 0.5), cell };
}
function pop(st, i, n) { const d = Math.min(0.5, 0.012 * n); return eBack((st.appear - (i / Math.max(1, n)) * d) / Math.max(0.05, 1 - d)); }
function revealRing(ctx, P, x, y, r, k, t) {
  if (k <= 0) return; ctx.save();
  const rr = r * (1.6 - 0.45 * eBack(k)), end = Math.PI * 2 * eOut(k * 1.3), lw = Math.max(6, r * 0.14);
  ctx.strokeStyle = alpha(P.ok, 0.22 * k); ctx.lineWidth = lw * 3; ctx.beginPath(); ctx.arc(x, y, rr, 0, end); ctx.stroke();
  ctx.strokeStyle = P.ok; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, rr, 0, end); ctx.stroke();
  ctx.restore();
}
function pointsBurst(ctx, P, x, y, k, pts, u, seed = 1) { // pts = null: solo confeti
  if (k <= 0) return;
  // Confeti: partículas deterministas
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2 + seed, d = eOut(k) * 140 * u * (0.6 + ((i * 7) % 5) / 8); ctx.globalAlpha = clamp(1.2 - k); drawIcon(ctx, i % 2 ? "square" : "circle", x + Math.cos(a) * d, y + Math.sin(a) * d - k * 30 * u, 9 * u, [P.timer, P.ok, P.teal, P.alert][i % 4], i * 20 + k * 200); }
  ctx.globalAlpha = 1;
  const s = eBack(clamp(k * 2.2)); if (s <= 0 || pts == null) return;
  ctx.save(); ctx.translate(x, y - 70 * u * eOut(k)); ctx.scale(s, s); pill(ctx, -105 * u, -34 * u, 210 * u, 68 * u, P.timer); text(ctx, `+${pts} ${pts === 1 ? "PUNTO" : "PUNTOS"}`, 0, 2 * u, 30 * u, P.bg); ctx.restore();
}
const TPL = {
  grid(ctx, c, b, L, P, st) {
    const { cols, rows, at } = c.data, n = cols * rows;
    for (let i = 0; i < n; i++) {
      const { x, y, cell } = cellPos(c, b, L, i); const s = pop(st, i, n); if (s <= 0) continue;
      const isAns = i === at; const fade = st.reveal > 0 && !isAns ? 1 - 0.65 * eOut(st.reveal) : 1;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(x, y); const pulse = isAns && st.reveal > 0 ? 1 + 0.18 * Math.sin(clamp(st.reveal * 1.5) * Math.PI) : 1; ctx.scale(s * pulse, s * pulse);
      if (c.mechanic === "odd_symbol") { const v = isAns ? c.data.odd : c.data.base; const fs = cell * (v.length > 2 ? 0.36 : v.length > 1 ? 0.46 : 0.62); text(ctx, v, 0, fs * 0.04, fs, isAns && st.reveal > 0 ? P.ok : P.text); }
      else if (c.mechanic === "odd_color") { const [h, s2, l] = c.data.hsl; drawIcon(ctx, c.data.shape, 0, 0, cell * 0.38, hsl(h, s2, isAns ? l + c.data.delta : l)); }
      else if (c.mechanic === "odd_rotation") drawIcon(ctx, "arrow", 0, 0, cell * 0.34, isAns && st.reveal > 0 ? P.ok : colorHex(c.data.color), isAns ? c.data.rot : c.data.base);
      ctx.restore();
      if (isAns) revealRing(ctx, P, x, y, cell * 0.45, st.reveal, st.t);
    }
  },
  scatter(ctx, c, b0, L, P, st) {
    const b = squareIn(b0);
    const items = c.data.items, n = items.length, unit = Math.min(b.w, b.h);
    const r0 = safeRadius(items, b, unit * (c.mechanic === "hidden_object" ? 0.045 : 0.055));
    items.forEach((it, i) => {
      const x = b.x + it.x * b.w, y = b.y + it.y * b.h, s = pop(st, i, n); if (s <= 0) return;
      const isAns = c.mechanic === "hidden_object" ? i === c.data.at : it.icon === c.data.icon && it.color === c.data.color;
      ctx.save(); ctx.globalAlpha = st.reveal > 0 && !isAns ? 1 - 0.7 * eOut(st.reveal) : 1;
      drawIcon(ctx, it.icon, x, y, r0 * s, colorHex(it.color), (it.rot || 0) + (st.reveal ? 0 : Math.sin(st.t * 1.4 + i) * 4));
      ctx.restore();
      if (isAns) revealRing(ctx, P, x, y, r0 * 1.15, st.reveal, st.t);
    });
  },
  differences(ctx, c, b, L, P, st) {
    // Dos paneles cuadrados lado a lado (también en vertical, para no deformar las distancias)
    const gap = L.v ? 24 : 40, side = Math.min((b.w - gap) / 2, b.h), ox = b.x + (b.w - side * 2 - gap) / 2, oy = b.y + (b.h - side) / 2;
    const panels = [{ x: ox, y: oy, w: side, h: side }, { x: ox + side + gap, y: oy, w: side, h: side }];
    const diffs = new Set(c.answer.diffs);
    [c.data.left, c.data.right].forEach((items, side) => {
      const p = panels[side], s0 = eOut(st.appear * 1.4 - side * 0.2);
      ctx.save(); ctx.globalAlpha = s0; rrect(ctx, p.x, p.y, p.w, p.h, 28 * L.u); ctx.fillStyle = P.panel; ctx.fill(); ctx.strokeStyle = alpha(P.text, 0.12); ctx.lineWidth = 3; ctx.stroke();
      const r0 = safeRadius(c.data.left, p, Math.min(p.w, p.h) * 0.068);
      items.forEach((it, i) => { if (it.hidden) return; drawIcon(ctx, it.icon, p.x + it.x * p.w, p.y + it.y * p.h, r0 * (it.s || 1), colorHex(it.color), it.rot || 0); });
      ctx.restore();
      if (st.reveal > 0) items.forEach((it, i) => { if (!diffs.has(i)) return; const k = clamp(st.reveal * 1.6 - [...diffs].indexOf(i) * 0.12); revealRing(ctx, P, p.x + it.x * p.w, p.y + it.y * p.h, r0 * 1.05, k, st.t); });
    });
  },
  memory(ctx, c, b, L, P, st) {
    const list = st.memoPhase ? c.data.items : c.data.after;
    const n = c.data.items.length, cols = L.v ? (n > 6 ? 3 : 2) : (n > 6 ? 5 : n), rows = Math.ceil(n / cols);
    const cell = Math.min(b.w / cols, b.h / rows), ox = b.x + (b.w - cell * cols) / 2, oy = b.y + (b.h - cell * rows) / 2;
    const show = st.memoPhase ? st.appear : st.afterAppear;
    list.forEach((it, i) => { const s = eBack(clamp(show * 1.5 - i * 0.05)); if (s <= 0) return; const x = ox + cell * ((i % cols) + 0.5), y = oy + cell * (Math.floor(i / cols) + 0.5); ctx.save(); rrect(ctx, x - cell * 0.42, y - cell * 0.42, cell * 0.84, cell * 0.84, cell * 0.14); ctx.fillStyle = P.panel; ctx.fill(); ctx.restore(); drawIcon(ctx, it.icon, x, y, cell * 0.3 * s, colorHex(it.color)); });
    if (st.cover > 0) { ctx.save(); ctx.fillStyle = P.panel2; rrect(ctx, b.x, b.y, b.w, b.h * eOut(st.cover), 30 * L.u); ctx.fill(); text(ctx, "?", b.x + b.w / 2, b.y + (b.h * eOut(st.cover)) / 2, 160 * L.u * eOut(st.cover), alpha(P.text, 0.5)); ctx.restore(); }
  },
  equations(ctx, c, b, L, P, st) {
    const rowsAll = [...c.data.eqs.map((e) => ({ terms: e.terms.flatMap((x, i) => (i ? [e.op, x] : [x])), value: String(e.value) })), { terms: c.data.q.terms, value: "?" }];
    const rh = b.h / rowsAll.length, size = Math.min(rh * 0.36, L.v ? 70 * L.u : 62 * L.u);
    rowsAll.forEach((row, ri) => {
      const s = eOut(st.appear * 1.6 - ri * 0.18); if (s <= 0) return;
      const y = b.y + rh * (ri + 0.5), items = [...row.terms, "=", row.value], w = size * 2.1, total = items.length * w, x0 = b.x + (b.w - total) / 2 + w / 2;
      ctx.save(); ctx.globalAlpha = s;
      if (ri === rowsAll.length - 1) { rrect(ctx, b.x + (b.w - total) / 2 - size * 0.6, y - rh * 0.42, total + size * 1.2, rh * 0.84, 24 * L.u); ctx.fillStyle = alpha(P.timer, 0.12); ctx.fill(); }
      items.forEach((it, k) => { const x = x0 + k * w; if (["+", "×", "="].includes(it)) text(ctx, it, x, y, size, P.dim); else if (/^\d+$|^\?$/.test(it)) text(ctx, it, x, y, size * 1.1, it === "?" ? P.timer : P.text); else drawIcon(ctx, it, x, y, size * 0.62, [P.timer, P.alert, P.teal][["A", "B", "C"].findIndex((K) => c.data.icons[K] === it)] || P.text); });
      ctx.restore();
    });
  },
  seqNumbers(ctx, c, b, L, P, st) {
    const items = [...c.data.shown.map(String), "?"], n = items.length;
    const perRow = L.v ? 3 : n, rows = Math.ceil(n / perRow), w = Math.min(b.w / perRow, L.v ? 280 * L.u : 230 * L.u), h = Math.min(w * 0.82, b.h / rows - 30 * L.u);
    items.forEach((v, i) => {
      const s = eBack(clamp(st.appear * 1.6 - i * 0.1)); if (s <= 0) return;
      const col = i % perRow, row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
      const x = b.x + (b.w - inRow * w) / 2 + w * (col + 0.5), y = b.y + (b.h - rows * (h + 30 * L.u)) / 2 + (h + 30 * L.u) * (row + 0.5);
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); rrect(ctx, -w * 0.44, -h / 2, w * 0.88, h, 26 * L.u); ctx.fillStyle = v === "?" ? alpha(P.timer, 0.16) : P.panel; ctx.fill(); if (v === "?") { ctx.strokeStyle = P.timer; ctx.lineWidth = 5; ctx.stroke(); }
      fitText(ctx, v, 0, 4, h * 0.5, w * 0.76, v === "?" ? P.timer : P.text); ctx.restore();
    });
  },
  seqShapes(ctx, c, b, L, P, st) {
    const items = [...c.data.shown, null], n = items.length, perRow = L.v ? 3 : n, rows = Math.ceil(n / perRow);
    const w = Math.min(b.w / perRow, L.v ? 290 * L.u : 250 * L.u), h = Math.min(w * 0.9, b.h / rows - 30 * L.u);
    items.forEach((it, i) => {
      const s = eBack(clamp(st.appear * 1.6 - i * 0.1)); if (s <= 0) return;
      const col = i % perRow, row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
      const x = b.x + (b.w - inRow * w) / 2 + w * (col + 0.5), y = b.y + (b.h - rows * (h + 30 * L.u)) / 2 + (h + 30 * L.u) * (row + 0.5);
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); rrect(ctx, -w * 0.44, -h / 2, w * 0.88, h, 26 * L.u); ctx.fillStyle = it ? P.panel : alpha(P.timer, 0.16); ctx.fill();
      if (it) drawIcon(ctx, it.icon, 0, 0, h * 0.3, colorHex(it.color), it.rot); else { ctx.strokeStyle = P.timer; ctx.lineWidth = 5; ctx.stroke(); text(ctx, "?", 0, 4, h * 0.5, P.timer); }
      ctx.restore();
    });
  },
  flag(ctx, c, b, L, P, st) {
    const s = eBack(st.appear); const fw = Math.min(b.w * 0.7, b.h * 1.5 * 0.9), fh = fw / 1.5;
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(s, s); ctx.rotate(Math.sin(st.t * 1.2) * 0.01); glow(ctx, "rgba(0,0,0,.35)", 40); flag(ctx, c.data.country, -fw / 2, -fh / 2, fw, fh); noGlow(ctx); ctx.restore();
  },
  silhouette(ctx, c, b, L, P, st) {
    const s = eBack(st.appear), size = Math.min(b.w, b.h) * 0.8;
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(s, s);
    rrect(ctx, -size / 2, -size / 2, size, size, 34 * L.u); ctx.fillStyle = mix(P.teal, "#FFFFFF", 0.75); ctx.fill();
    figure(ctx, c.data.target, 0, 0, size * 0.8, st.reveal > 0 ? mix("#0B1222", colorHex(c.data.color), eOut(st.reveal)) : "#0B1222");
    ctx.restore();
  },
};
function figure(ctx, parts, cx, cy, size, color) { const cell = size / 3; for (const p of parts) drawIcon(ctx, p.icon, cx + (p.x - 1) * cell, cy + (p.y - 1) * cell, cell * 0.48, color, p.rot); }
const TPL_OF = { odd_symbol: "grid", odd_color: "grid", odd_rotation: "grid", differences: "differences", memory_missing: "memory", logic_equations: "equations", sequence_number: "seqNumbers", sequence_shape: "seqShapes", flags: "flag", hidden_object: "scatter", silhouette: "silhouette", count_shapes: "scatter" };

// Opciones A-D (números, figuras, banderas o países)
function options(ctx, c, L, P, st) {
  const o = optsBox(L, c), n = 4, cols = o.cols, rows = Math.ceil(n / cols), gap = 22 * L.u;
  const w = (o.w - gap * (cols - 1)) / cols, h = (o.h - gap * (rows - 1)) / rows;
  const list = c.data.options;
  for (let i = 0; i < n; i++) {
    const s = eBack(clamp(st.appear * 1.4 - 0.25 - i * 0.07)); if (s <= 0) continue;
    const x = o.x + (i % cols) * (w + gap), y = o.y + Math.floor(i / cols) * (h + gap), ok = i === c.answer.option;
    const rv = st.reveal > 0 ? eOut(st.reveal * 1.5) : 0;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(s * (ok ? 1 + 0.06 * rv : 1), s * (ok ? 1 + 0.06 * rv : 1)); ctx.globalAlpha = ok || !rv ? 1 : 1 - 0.6 * rv;
    rrect(ctx, -w / 2, -h / 2, w, h, 22 * L.u); ctx.fillStyle = ok && rv ? mix(P.panel, P.ok, rv) : P.panel; ctx.fill(); ctx.strokeStyle = ok && rv ? P.ok : alpha(P.text, 0.14); ctx.lineWidth = 4; ctx.stroke();
    // Letra
    const lr = Math.min(h * 0.28, 34 * L.u); ctx.beginPath(); ctx.arc(-w / 2 + lr + 16 * L.u, 0, lr, 0, 7); ctx.fillStyle = ok && rv ? "#FFFFFF" : P.timer; ctx.fill(); text(ctx, LETTERS[i], -w / 2 + lr + 16 * L.u, 2, lr * 1.15, P.bg);
    const cx = (lr * 2 + 16 * L.u) / 2, aw = w - lr * 2 - 40 * L.u, it = list[i];
    if (typeof it === "number") fitText(ctx, String(it), cx, 3, h * 0.5, aw, P.text);
    else if (typeof it === "string") fitText(ctx, it, cx, 3, h * 0.34, aw, P.text);
    else if (Array.isArray(it)) figure(ctx, it, cx, 0, Math.min(aw, h) * 0.86, colorHex(c.data.color));
    else if (it && it.icon) drawIcon(ctx, it.icon, cx, 0, Math.min(aw, h) * 0.3, colorHex(it.color), it.rot || 0);
    if (ok && rv) check(ctx, w / 2 - 34 * L.u, -h / 2 + 30 * L.u, 26 * L.u * rv, "#FFFFFF");
    ctx.restore();
  }
}

// ---------- Temporizador reutilizable ----------
export function drawTimer(ctx, cx, cy, r, P, k, secondsLeft, mode = "normal", state = "play") {
  // k: fracción restante 1..0
  const last = secondsLeft <= 3 && state === "play";
  const frac = secondsLeft - Math.floor(secondsLeft); // 0..1 dentro del segundo
  const beat = last ? 1 + (mode === "focus" ? 0.04 : mode === "extreme" ? 0.14 : 0.09) * Math.pow(frac, 3) : 1;
  const col = state === "timeout" ? P.alert : last ? mix(P.timer, P.alert, clamp((3 - secondsLeft) / 2)) : P.timer;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(beat, beat);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = P.deep; ctx.fill();
  ctx.lineWidth = r * 0.17; ctx.strokeStyle = alpha(P.text, 0.1); ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, 7); ctx.stroke();
  ctx.lineCap = "round";
  const arc = () => { ctx.beginPath(); ctx.arc(0, 0, r * 0.84, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(k), false); };
  if (k > 0.001) { if (last && mode !== "focus") { ctx.strokeStyle = alpha(col.startsWith("#") ? col : P.alert, 0.25); ctx.lineWidth = r * 0.36; arc(); ctx.stroke(); ctx.lineWidth = r * 0.17; } ctx.strokeStyle = col; arc(); ctx.stroke(); }
  text(ctx, state === "timeout" ? "0" : String(Math.max(0, Math.ceil(secondsLeft - 1e-6))), 0, r * 0.05, r * 0.82, state === "timeout" ? P.alert : P.text);
  ctx.restore();
}

// ---------- Cabecera (reto, ronda, puntos) y barra de progreso ----------
function hud(ctx, L, P, seg, c, t, tl, k) {
  const u = L.u, col = ROUND_COLOR(P, c.difficulty);
  ctx.save(); ctx.globalAlpha = k;
  const label = `RETO ${seg.index + 1}/${seg.total}`;
  if (L.v) {
    ctx.font = `800 ${30 * u}px ${FONT}`; const w1 = ctx.measureText(label).width + 44 * u;
    pill(ctx, 70 * u, L.hud.y - 26 * u, w1, 52 * u, P.panel2); text(ctx, label, 70 * u + w1 / 2, L.hud.y + 2 * u, 30 * u, P.text);
    const d = DIFF_LABEL[c.difficulty].toUpperCase(); ctx.font = `800 ${26 * u}px ${FONT}`; const w2 = ctx.measureText(d).width + 40 * u;
    pill(ctx, L.W - 70 * u - w2, L.hud.y - 26 * u, w2, 52 * u, col); text(ctx, d, L.W - 70 * u - w2 / 2, L.hud.y + 2 * u, 26 * u, P.bg);
  } else {
    ctx.font = `800 ${28 * u}px ${FONT}`; const w1 = ctx.measureText(label).width + 44 * u;
    pill(ctx, 40 * u, L.hud.y - 24 * u, w1, 48 * u, P.panel2); text(ctx, label, 40 * u + w1 / 2, L.hud.y + 2 * u, 28 * u, P.text);
    const d = `${DIFF_LABEL[c.difficulty].toUpperCase()} · ${c.points} ${c.points === 1 ? "PUNTO" : "PUNTOS"}`; ctx.font = `800 ${24 * u}px ${FONT}`; const w2 = ctx.measureText(d).width + 40 * u;
    pill(ctx, 40 * u, L.hud.y + 34 * u, w2, 44 * u, alpha(col, 0.95)); text(ctx, d, 40 * u + w2 / 2, L.hud.y + 57 * u, 24 * u, P.bg);
    // Progreso del vídeo
    const pw = L.W - 80 * u, prog = clamp(t / tl.duration); rrect(ctx, 40 * u, L.H - 22 * u, pw, 8 * u, 4 * u); ctx.fillStyle = alpha(P.text, 0.1); ctx.fill(); rrect(ctx, 40 * u, L.H - 22 * u, Math.max(8 * u, pw * prog), 8 * u, 4 * u); ctx.fillStyle = P.teal; ctx.fill();
  }
  ctx.restore();
}

// ---------- Pantallas especiales ----------
function roundScreen(ctx, L, P, seg, t, cfg) {
  const k = (t - seg.start) / (seg.end - seg.start), u = L.u, col = ROUND_COLOR(P, seg.difficulty);
  const inK = eOut(k * 4), outK = eIn((k - 0.82) / 0.18);
  // Barrido de color con franjas diagonales
  ctx.save(); ctx.globalAlpha = 1 - outK; ctx.translate(L.W / 2, L.H / 2); ctx.rotate(-0.12);
  const bw = Math.hypot(L.W, L.H) * 1.2;
  ctx.fillStyle = alpha(col, 0.95); ctx.fillRect(-bw / 2 + (1 - inK) * -bw, -L.H * 0.17, bw, L.H * 0.34);
  ctx.fillStyle = alpha(P.bg, 0.25); for (let i = -12; i < 12; i++) ctx.fillRect(-bw / 2 + (1 - inK) * -bw + i * 120 * u + ((t * 200) % (120 * u)), -L.H * 0.17, 40 * u, L.H * 0.34);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = clamp(k * 5) * (1 - outK);
  const s = eBack(clamp((k - 0.08) * 3));
  ctx.translate(L.W / 2, L.H / 2); ctx.scale(s, s);
  text(ctx, `RONDA ${seg.round}`, 0, -60 * u, 64 * u, P.bg);
  text(ctx, DIFF_LABEL[seg.difficulty].toUpperCase(), 0, 30 * u, (L.v ? 120 : 140) * u, "#FFFFFF");
  ctx.restore();
  const pts = mergeConfig(cfg).points[seg.difficulty];
  ctx.save(); ctx.globalAlpha = clamp((k - 0.3) * 4) * (1 - outK); text(ctx, `Cada acierto: ${pts} ${pts === 1 ? "punto" : "puntos"}`, L.W / 2, L.H / 2 + (L.v ? 300 : 230) * u, 40 * u, P.text); ctx.restore();
  if (seg.difficulty === "extreme") { ctx.save(); ctx.globalAlpha = clamp(k * 3) * (1 - outK) * (0.5 + 0.5 * Math.sin(t * 12)); ctx.strokeStyle = P.alert; ctx.lineWidth = 18 * u; ctx.strokeRect(9 * u, 9 * u, L.W - 18 * u, L.H - 18 * u); ctx.restore(); }
}
function resultsScreen(ctx, L, P, seg, t, project) {
  const k = t - seg.start, u = L.u;
  const tk = eOut(k / 0.6);
  ctx.save(); ctx.globalAlpha = tk;
  const titleLines = L.v ? ["¿CUÁNTOS PUNTOS", "HAS SACADO?"] : ["¿CUÁNTOS PUNTOS HAS SACADO?"];
  titleLines.forEach((l, i) => fitText(ctx, l, L.W / 2, (L.v ? 330 : 120) * u + i * 80 * u, (L.v ? 74 : 64) * u, L.W - 140 * u, P.timer));
  text(ctx, `Máximo: ${seg.max} puntos`, L.W / 2, (L.v ? 520 : 200) * u, 36 * u, P.dim);
  ctx.restore();
  const rows = [...seg.ranks].reverse(), rh = (L.v ? 150 : 108) * u, w = Math.min(L.W - 140 * u, 1100 * u), x = (L.W - w) / 2, y0 = (L.v ? 640 : 270) * u;
  rows.forEach((r, i) => {
    const s = eBack(clamp((k - 0.5 - i * 0.18) * 2.5)); if (s <= 0) return;
    const y = y0 + i * (rh + 16 * u), top = i === 0;
    ctx.save(); ctx.translate(x + w / 2, y + rh / 2); ctx.scale(s, s);
    rrect(ctx, -w / 2, -rh / 2, w, rh, 26 * u); ctx.fillStyle = top ? alpha(P.ok, 0.9) : P.panel; ctx.fill();
    const range = r.from === r.to ? `${r.to}` : `${r.from} – ${r.to}`;
    text(ctx, r.name, -w / 2 + 40 * u, 2 * u, (L.v ? 42 : 40) * u, top ? P.bg : P.text, "left");
    text(ctx, `${range} pts`, w / 2 - 40 * u, 2 * u, (L.v ? 40 : 38) * u, top ? P.bg : P.timer, "right");
    ctx.restore();
  });
  if (k > 0.4) pointsBurst(ctx, P, L.W / 2, (L.v ? 300 : 110) * u, clamp((k - 0.4) / 1.4), null, u, 3);
}
function outroScreen(ctx, L, P, seg, t) {
  const k = t - seg.start, u = L.u, s = eBack(clamp(k * 2.5));
  ctx.save(); ctx.translate(L.W / 2, L.H / 2); ctx.scale(s, s);
  text(ctx, "¿LO HAS", 0, -90 * u, 110 * u, P.text); text(ctx, "CONSEGUIDO?", 0, 40 * u, 110 * u, P.timer);
  text(ctx, "Más retos en el canal", 0, 190 * u, 44 * u, P.dim);
  ctx.restore();
}

// ---------- Fotograma completo ----------
// project: { format, challenges, config, theme }, tl: timeline(project), t en segundos
// Se dibuja siempre en el tamaño de diseño (1920×1080 o 1080×1920) y se escala: la vista previa es idéntica al vídeo
export function drawFrame(ctx, W, H, project, tl, t, theme) {
  const DW = H > W ? 1080 : 1920, DH = H > W ? 1920 : 1080;
  if (W === DW && H === DH) return drawDesign(ctx, W, H, project, tl, t, theme);
  ctx.save(); ctx.scale(W / DW, H / DH); drawDesign(ctx, DW, DH, project, tl, t, theme); ctx.restore();
}
function drawDesign(ctx, W, H, project, tl, t, theme) {
  const P = palette(theme || project.theme), L = frameLayout(W, H);
  const seg = tl.segments.find((s) => t >= s.start && t < (s.end ?? s.start)) || tl.segments[tl.segments.length - 1];
  const accent = seg.type === "challenge" ? ROUND_COLOR(P, (project.challenges.find((c) => c.id === seg.challenge) || {}).difficulty) : seg.type === "round" ? ROUND_COLOR(P, seg.difficulty) : P.timer;
  background(ctx, W, H, P, t, accent);
  if (seg.type === "round") return roundScreen(ctx, L, P, seg, t, project.config);
  if (seg.type === "results") return resultsScreen(ctx, L, P, seg, t, project);
  if (seg.type === "outro") return outroScreen(ctx, L, P, seg, t);
  const c = project.challenges.find((x) => x.id === seg.challenge); if (!c) return;
  const cfg = mergeConfig(project.config);
  const u = L.u;
  // Estado de animación
  const inK = prog(t, seg.intro), outK = prog(t, seg.out);
  const st = { t, appear: 0, reveal: 0, cover: 0, memoPhase: false, afterAppear: 0 };
  if (seg.memo) {
    if (t < seg.memo[1]) { st.memoPhase = true; st.appear = eOut(clamp((t - seg.intro[0]) / 1.0)); st.cover = clamp((t - (seg.memo[1] - 0.6)) / 0.6); }
    else { st.afterAppear = clamp((t - seg.play[0]) / 0.7); }
  } else st.appear = clamp((t - seg.intro[0] - 0.35) / 1.0);
  if (seg.reveal && t >= seg.reveal[0]) st.reveal = clamp((t - seg.reveal[0]) / 1.2);
  // Salida: todo se desliza y se desvanece
  ctx.save();
  if (outK > 0) { ctx.globalAlpha = 1 - eIn(outK); ctx.translate(-W * 0.25 * eIn(outK), 0); }
  hud(ctx, L, P, seg, c, t, tl, eOut(inK * 2));
  // Pregunta (con la instrucción debajo en el formato vertical)
  const qk = eBack(clamp(inK * 1.6));
  ctx.save(); ctx.translate(L.q.x, L.q.y); ctx.scale(qk, qk);
  const qSize = L.q.size * u;
  const lines = wrap(ctx, c.question, L.q.maxW * u, qSize);
  lines.forEach((ln, i) => text(ctx, ln, 0, (i - (lines.length - 1) / 2) * qSize * 1.12, qSize, P.text));
  if (seg.memo && t < seg.memo[1]) { const m = c.instructions || "¡Memoriza!"; text(ctx, m.toUpperCase(), 0, qSize * (lines.length * 0.6 + 0.55), qSize * 0.5, P.teal); }
  ctx.restore();
  // Contenido del reto
  const b = contentBox(L, c);
  TPL[TPL_OF[c.mechanic]](ctx, c, b, L, P, st);
  if (hasOptions(c) && (!seg.memo || t >= seg.play[0])) options(ctx, c, L, P, { ...st, appear: seg.memo ? clamp((t - seg.play[0]) / 0.8) : st.appear });
  // Temporizador
  const T = seg.play[1] - seg.play[0];
  if (seg.memo && t < seg.memo[1]) {
    const mk = 1 - clamp((t - seg.memo[0]) / (seg.memo[1] - seg.memo[0] - 0.6));
    const bw = L.v ? W - 140 * u : 520 * u, bx = L.v ? 70 * u : W / 2 - bw / 2 - 30 * u, by = L.v ? L.timer.cy - 12 * u : 190 * u;
    rrect(ctx, bx, by, bw, 18 * u, 9 * u); ctx.fillStyle = alpha(P.text, 0.12); ctx.fill(); rrect(ctx, bx, by, Math.max(18 * u, bw * mk), 18 * u, 9 * u); ctx.fillStyle = P.teal; ctx.fill();
  } else {
    const left = clamp(seg.play[1] - t, 0, T), k = left / T;
    const state = t >= seg.play[1] ? "timeout" : "play";
    const tk = seg.memo ? eBack(clamp((t - seg.play[0]) * 3)) : eBack(clamp(inK * 2));
    ctx.save(); ctx.translate(L.timer.cx, L.timer.cy); ctx.scale(tk, tk); drawTimer(ctx, 0, 0, L.timer.r * u, P, t < seg.play[0] ? 1 : k, t < seg.play[0] ? T : left, cfg.timer_mode, state); ctx.restore();
    // Destello coral en los últimos segundos (más suave en modo concentración)
    if (state === "play" && left <= 3 && left > 0 && cfg.timer_mode !== "focus") { const f = Math.pow(left - Math.floor(left), 4) * (cfg.timer_mode === "extreme" ? 0.35 : 0.18); ctx.save(); ctx.strokeStyle = alpha(P.alert, f); ctx.lineWidth = 40 * u; ctx.strokeRect(0, 0, W, H); ctx.restore(); }
  }
  // ¡Tiempo!
  if (seg.timeout && t >= seg.timeout[0] && t < seg.reveal[0] + 0.4) {
    const k2 = (t - seg.timeout[0]) / 1.0, s = eBack(clamp(k2 * 3)) * (1 - eIn(clamp((k2 - 0.6) * 3)));
    if (s > 0) { ctx.save(); ctx.translate(W / 2, L.v ? H * 0.47 : H * 0.52); ctx.rotate(-0.08); ctx.scale(s, s); pill(ctx, -260 * u, -78 * u, 520 * u, 156 * u, P.alert); text(ctx, "¡TIEMPO!", 0, 6 * u, 92 * u, "#FFFFFF"); ctx.restore(); }
  }
  // Puntos al revelar
  if (st.reveal > 0) pointsBurst(ctx, P, L.v ? L.timer.cx : L.timer.cx - 40 * u, L.timer.cy + (L.v ? 20 : 150) * u, clamp((t - seg.reveal[0] - 0.85) / 1.1), c.points, u, c.points);
  // Explicación
  const ex = seg.explain && t >= seg.explain[0] ? clamp((t - seg.explain[0]) / 0.4) : seg.explain && seg.out && t >= seg.out[0] ? 1 : 0;
  if (ex > 0 && c.explanation) {
    const bw = W - (L.v ? 120 : 400) * u, size = (L.v ? 40 : 38) * u, ls = wrap(ctx, c.explanation, bw - 60 * u, size), bh = ls.length * size * 1.25 + 40 * u, by = L.v ? H - 400 * u - bh : H - 70 * u - bh;
    ctx.save(); ctx.globalAlpha = eOut(ex); rrect(ctx, (W - bw) / 2, by + (1 - eOut(ex)) * 30, bw, bh, 22 * u); ctx.fillStyle = alpha(P.teal, 0.95); ctx.fill();
    ls.forEach((l, i) => text(ctx, l, W / 2, by + 20 * u + size * 0.62 + i * size * 1.25, size, P.bg)); ctx.restore();
  }
  ctx.restore();
}

// ---------- Miniatura (también programática) ----------
export function drawThumbnail(ctx, W, H, project, theme) {
  const P = palette(theme || project.theme), u = H / 1080;
  background(ctx, W, H, P, 3.3, P.timer);
  // Cuadrícula de ejemplo con un número distinto resaltado
  const cols = 6, rows = 5, cell = 120 * u, ox = W - cols * cell - 90 * u, oy = (H - rows * cell) / 2 + 40 * u;
  rrect(ctx, ox - 30 * u, oy - 30 * u, cols * cell + 60 * u, rows * cell + 60 * u, 34 * u); ctx.fillStyle = P.panel; ctx.fill();
  for (let i = 0; i < cols * rows; i++) { const x = ox + cell * ((i % cols) + 0.5), y = oy + cell * (Math.floor(i / cols) + 0.5), odd = i === 17; text(ctx, odd ? "B" : "8", x, y + 4 * u, 78 * u, odd ? P.ok : P.text); if (odd) { ctx.strokeStyle = P.ok; ctx.lineWidth = 10 * u; ctx.beginPath(); ctx.arc(x, y, 56 * u, 0, 7); ctx.stroke(); } }
  drawTimer(ctx, ox + cols * cell - 10 * u, oy - 20 * u, 80 * u, P, 0.3, 3, "normal", "play");
  // Título
  const words = String(project.title || "¿Puedes superar estos retos?").toUpperCase();
  const lines = wrap(ctx, words, W * 0.46, 110 * u);
  const size = lines.length > 3 ? 92 * u : 110 * u;
  wrap(ctx, words, W * 0.46, size).slice(0, 4).forEach((l, i, a) => { const y = H / 2 - ((a.length - 1) * size * 1.08) / 2 + i * size * 1.08; ctx.save(); glow(ctx, "rgba(0,0,0,.5)", 20); text(ctx, l, 80 * u, y, size, /\d/.test(l) ? P.timer : P.text, "left"); noGlow(ctx); ctx.restore(); });
}
export { palette, frameLayout };
