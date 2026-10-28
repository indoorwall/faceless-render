// Playable World — escenas ilustradas por código (Canvas, igual en la web y en el servidor).
// Cada escena se anima con el guion de world.js (mazeScript, machineScript, roomScript), que sale de la
// misma simulación que valida la respuesta: lo que se ve siempre coincide con la solución.
import { WORLD, LETTERS, mazeScript, machineScript, roomScript, ROOM_ERRORS } from "./world.js";
import { hashStr } from "./util.js";
import { drawPix } from "./pix.js";

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const eOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
const eInOut = (k) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const eBack = (k) => { k = clamp(k); const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const zs = (ctx, a, b = a) => ctx.scale(Math.abs(a) < 1e-3 ? 1e-3 : a, Math.abs(b) < 1e-3 ? 1e-3 : b);
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, k) { const x = rgb(a), y = rgb(b); return "#" + x.map((v, i) => Math.round(lerp(v, y[i], k)).toString(16).padStart(2, "0")).join(""); }
const shade = (hex, k) => (k < 0 ? mix(hex, "#000000", -k) : mix(hex, "#FFFFFF", k));
function alpha(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function rrect(ctx, x, y, w, h, r) { w = Math.max(0, w); h = Math.max(0, h); r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
let FONT = "Montserrat, 'Arial Black', sans-serif";
function text(ctx, s, x, y, size, color, align = "center") { ctx.font = `800 ${Math.round(size)}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
function shadowE(ctx, x, y, rx, ry, a = 0.18) { ctx.fillStyle = `rgba(20,24,32,${a})`; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.fill(); }
// Bola brillante con volumen; rot hace girar la franja para que se vea rodar
function ball(ctx, x, y, r, color, rot = 0, a = 1) {
  if (r < 0.5) return;
  ctx.save(); ctx.globalAlpha *= a;
  shadowE(ctx, x + r * 0.15, y + r * 0.95, r * 0.85, r * 0.28, 0.22);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.28));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); ctx.strokeStyle = alpha("#FFFFFF", 0.35); ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r * 0.35, rot, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function badge(ctx, x, y, r, label, ring, fill = "#FFFFFF", ink = "#20242B") {
  shadowE(ctx, x, y + r * 0.95, r * 0.8, r * 0.22, 0.15);
  ctx.fillStyle = shade(ring, -0.2); ctx.beginPath(); ctx.arc(x, y + r * 0.12, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = r * 0.16; ctx.strokeStyle = ring; ctx.stroke();
  text(ctx, label, x, y + r * 0.06, r * 1.1, ink);
}
function check(ctx, x, y, r, color = "#FFFFFF") { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = r * 0.32; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x - r * 0.12, y + r * 0.4); ctx.lineTo(x + r * 0.55, y - r * 0.38); ctx.stroke(); ctx.restore(); }
function cross(ctx, x, y, r, color = "#FFFFFF") { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = r * 0.3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x - r * 0.42, y - r * 0.42); ctx.lineTo(x + r * 0.42, y + r * 0.42); ctx.moveTo(x + r * 0.42, y - r * 0.42); ctx.lineTo(x - r * 0.42, y + r * 0.42); ctx.stroke(); ctx.restore(); }
function okBadge(ctx, x, y, r, k, good = true) { if (k <= 0) return; const s = eBack(k); ctx.save(); ctx.translate(x, y); zs(ctx, s); ctx.fillStyle = good ? "#22C55E" : "#F87171"; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = r * 0.14; ctx.strokeStyle = "#FFFFFF"; ctx.stroke(); (good ? check : cross)(ctx, 0, 0, r * 0.9); ctx.restore(); }
function sparkles(ctx, x, y, R, k, seed = 1, cols = ["#FFC83D", "#FFFFFF", "#22C55E", "#35B8C5"]) {
  if (k <= 0 || k >= 1) return;
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + seed, d = eOut(k) * R * (0.6 + ((i * 7) % 5) / 9); ctx.globalAlpha = clamp(1.3 - k * 1.2); const s = R * 0.09 * (1 - k * 0.5); ctx.fillStyle = cols[i % cols.length]; ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d - k * R * 0.2); ctx.rotate(k * 4 + i); ctx.fillRect(-s / 2, -s / 2, s, s * 0.6); ctx.restore(); }
  ctx.globalAlpha = 1;
}
function gear(ctx, x, y, r, teeth, rot, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); for (let i = 0; i < teeth * 2; i++) { const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.82 : r; ctx.arc(0, 0, rr, a0, a1); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = shade(color, -0.18); ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(color, 0.35); ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Panel de la escena: «pantalla de juego» con esquinas redondeadas que ocupa casi todo el fotograma
function panel(ctx, b, top, bottom, fn) {
  ctx.save();
  ctx.fillStyle = "rgba(20,24,32,0.10)"; rrect(ctx, b.x - 2, b.y + 6, b.w + 4, b.h + 6, 40); ctx.fill();
  rrect(ctx, b.x, b.y, b.w, b.h, 36); ctx.clip();
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  fn();
  ctx.restore();
  ctx.save(); rrect(ctx, b.x, b.y, b.w, b.h, 36); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke(); ctx.restore();
}
const pixAt = (w) => (w.rt == null ? (w.timeout ? "surprised" : w.play > 0.75 ? "nervous" : "thinking") : null);

// ======================= A. LABERINTO =======================
const MAZE_THEMES = [
  { name: "jardín", top: "#C9EDB0", bottom: "#A9DD8E", floor: "#F6EBCF", floor2: "#EFDFB8", wall: "#4FBF86", side: "#2F8F5E", dots: "#9BD47D" },
  { name: "hielo", top: "#DDF3FF", bottom: "#BFE5FA", floor: "#F4FBFF", floor2: "#E3F3FC", wall: "#7FC8F0", side: "#4A97C4", dots: "#CBEAFB" },
  { name: "caramelo", top: "#FFE6EE", bottom: "#FFD2E0", floor: "#FFF7EE", floor2: "#FCEBDC", wall: "#FF8FB1", side: "#D9628A", dots: "#FFC6D8" },
];
const BALL_COLS = ["#FFC83D", "#FF7A6B", "#35B8C5", "#9B7BFF", "#22C55E"];
const _cache = new Map();
const cached = (key, fn) => { if (!_cache.has(key)) { if (_cache.size > 200) _cache.clear(); _cache.set(key, fn()); } return _cache.get(key); };
function mazeWalls(m) {
  const segs = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (x < m.w - 1 && m.right[y][x]) segs.push([x + 1, y, x + 1, y + 1]);
    if (y < m.h - 1 && m.down[y][x]) segs.push([x, y + 1, x + 1, y + 1]);
  }
  for (let y = 0; y < m.h; y++) { segs.push([0, y, 0, y + 1]); segs.push([m.w, y, m.w, y + 1]); }
  for (let x = 0; x < m.w; x++) { if (!m.entrances.includes(x)) segs.push([x, 0, x + 1, 0]); if (x !== m.goal) segs.push([x, m.h, x + 1, m.h]); }
  return segs;
}
function chest(ctx, x, y, s, open, glow) {
  // (x, y) = centro de la base; s = ancho
  shadowE(ctx, x, y, s * 0.55, s * 0.12, 0.22);
  const w = s, h = s * 0.55, top = y - h;
  if (glow > 0) { ctx.save(); ctx.globalAlpha = glow; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i - 4.5) * 0.22; ctx.fillStyle = i % 2 ? "rgba(255,214,90,0.35)" : "rgba(255,240,170,0.45)"; poly(ctx, [[x, top], [x + Math.cos(a - 0.08) * s * 1.6, top + Math.sin(a - 0.08) * s * 1.6], [x + Math.cos(a + 0.08) * s * 1.6, top + Math.sin(a + 0.08) * s * 1.6]]); ctx.fill(); } ctx.restore(); }
  ctx.fillStyle = "#A8642A"; rrect(ctx, x - w / 2, top, w, h, s * 0.08); ctx.fill();
  ctx.fillStyle = "#C97E3C"; rrect(ctx, x - w / 2, top, w, h * 0.8, s * 0.08); ctx.fill();
  ctx.fillStyle = "#FFC83D"; ctx.fillRect(x - w / 2 + w * 0.12, top, w * 0.09, h); ctx.fillRect(x + w / 2 - w * 0.21, top, w * 0.09, h);
  if (open > 0) { ctx.fillStyle = "#5A3214"; rrect(ctx, x - w / 2 + 4, top - 2, w - 8, h * 0.25, 6); ctx.fill(); ctx.fillStyle = "#FFD95A"; ctx.beginPath(); ctx.ellipse(x, top + 2, w * 0.36, h * 0.12, 0, Math.PI, 0); ctx.fill(); }
  // tapa: gira hacia atrás al abrirse
  ctx.save(); ctx.translate(x, top); zs(ctx, 1, 1 - 1.85 * eBack(open));
  ctx.fillStyle = "#B66C2C"; rrect(ctx, -w / 2 - 3, -h * 0.5, w + 6, h * 0.5, s * 0.12); ctx.fill();
  ctx.fillStyle = "#D98E48"; rrect(ctx, -w / 2 - 3, -h * 0.5, w + 6, h * 0.32, s * 0.12); ctx.fill();
  ctx.fillStyle = "#FFC83D"; ctx.fillRect(-w / 2 + w * 0.12, -h * 0.5, w * 0.09, h * 0.5); ctx.fillRect(w / 2 - w * 0.21, -h * 0.5, w * 0.09, h * 0.5);
  ctx.restore();
  if (open < 0.2) { ctx.fillStyle = "#FFC83D"; rrect(ctx, x - s * 0.08, top - s * 0.06, s * 0.16, s * 0.2, s * 0.03); ctx.fill(); ctx.fillStyle = "#6B3A12"; ctx.beginPath(); ctx.arc(x, top + s * 0.03, s * 0.025, 0, Math.PI * 2); ctx.fill(); }
}
function pathPoint(pts, p) { // p en «casillas recorridas»
  const n = pts.length - 1; if (p <= 0) return { x: pts[0][0], y: pts[0][1], i: 0 }; if (p >= n) return { x: pts[n][0], y: pts[n][1], i: n };
  const i = Math.floor(p), f = p - i; return { x: lerp(pts[i][0], pts[i + 1][0], f), y: lerp(pts[i][1], pts[i + 1][1], f), i };
}
function drawMaze(ctx, c, b, L, P, w) {
  const m = c.data, k = cached(`ms|${c.id}|${c.signature}`, () => mazeScript(c)), T = MAZE_THEMES[hashStr(String(c.id)) % MAZE_THEMES.length];
  panel(ctx, b, T.top, T.bottom, () => {
    // Textura suave del suelo de la escena
    ctx.fillStyle = alpha(T.dots, 0.5); for (let i = 0; i < 40; i++) { const h = hashStr(`${c.id}d${i}`); ctx.beginPath(); ctx.ellipse(b.x + (h % 1000) / 1000 * b.w, b.y + ((h >> 10) % 1000) / 1000 * b.h, 14 + (h % 9), 6 + (h % 5), 0, 0, Math.PI * 2); ctx.fill(); }
    const side = !L.v ? 2.6 : 0, rows = m.h + 2.7;
    const cell = Math.min((b.w - 60) / (m.w + side * 2), (b.h - 40) / rows);
    const ox = b.x + (b.w - cell * m.w) / 2, oy = b.y + (b.h - cell * rows) / 2 + cell * 1.25;
    const cx = (x) => ox + (x + 0.5) * cell, cy = (y) => oy + (y + 0.5) * cell;
    const th = Math.max(6, cell * 0.2), dep = th * 0.7;
    // Plataforma
    ctx.fillStyle = "rgba(20,24,32,0.16)"; rrect(ctx, ox - th, oy - th + dep * 2.2, m.w * cell + th * 2, m.h * cell + th * 2, th * 1.5); ctx.fill();
    ctx.fillStyle = T.floor; rrect(ctx, ox - th / 2, oy - th / 2, m.w * cell + th, m.h * cell + th, th); ctx.fill();
    ctx.fillStyle = T.floor2; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if ((x + y) % 2) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    // Rastro de la bola ganadora (antes que las paredes)
    const rt = w.rt;
    const winRun = k.s.runs[k.s.winner];
    const winPts = [[cx(m.entrances[k.s.winner]), oy - cell * 0.42], ...winRun.path.map(([x, y]) => [cx(x), cy(y)]), [cx(m.goal), oy + m.h * cell + cell * 0.55]];
    const mp = rt == null ? -1 : clamp((rt - k.mStart) / k.mDur) * (winPts.length - 1);
    if (mp > 0) {
      const head = pathPoint(winPts, eInOut(mp / (winPts.length - 1)) * (winPts.length - 1));
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = alpha("#FFC83D", 0.85); ctx.lineWidth = cell * 0.28;
      ctx.beginPath(); ctx.moveTo(winPts[0][0], winPts[0][1]); for (let i = 1; i <= head.i; i++) ctx.lineTo(winPts[i][0], winPts[i][1]); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.strokeStyle = alpha("#FFFFFF", 0.6); ctx.lineWidth = cell * 0.08; ctx.stroke(); ctx.restore();
    }
    // Paredes con volumen: primero los laterales, luego las caras superiores
    const segs = cached(`mw|${c.id}|${c.signature}`, () => mazeWalls(m));
    const segRect = ([x1, y1, x2, y2], dy) => { const X1 = ox + x1 * cell, Y1 = oy + y1 * cell, X2 = ox + x2 * cell, Y2 = oy + y2 * cell; rrect(ctx, Math.min(X1, X2) - th / 2, Math.min(Y1, Y2) - th / 2 + dy, Math.abs(X2 - X1) + th, Math.abs(Y2 - Y1) + th, th / 2); };
    ctx.fillStyle = T.side; for (const sg of segs) { segRect(sg, dep); ctx.fill(); }
    ctx.fillStyle = T.wall; for (const sg of segs) { segRect(sg, 0); ctx.fill(); }
    ctx.fillStyle = alpha("#FFFFFF", 0.28); for (const sg of segs) { const [x1, y1, x2, y2] = sg; if (y1 === y2) { ctx.fillRect(ox + x1 * cell, oy + y1 * cell - th * 0.32, (x2 - x1) * cell, th * 0.18); } }
    // Meta: cofre bajo la salida
    const gx = cx(m.goal), gy = oy + m.h * cell + cell * 1.25, openK = rt == null ? 0 : clamp((rt - k.open) / 0.45);
    chest(ctx, gx, gy, cell * 1.05, openK, openK);
    if (openK > 0) { sparkles(ctx, gx, gy - cell * 0.8, cell * 1.6, clamp((rt - k.open) / 1.1), 2); const sk = eBack(clamp((rt - k.open - 0.1) / 0.5)); ctx.save(); ctx.translate(gx, gy - cell * (0.9 + 0.5 * sk)); zs(ctx, sk); ctx.fillStyle = "#FFC83D"; poly(ctx, Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? cell * 0.16 : cell * 0.36; return [Math.cos(a) * r, Math.sin(a) * r]; })); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#E39B12"; ctx.stroke(); ctx.restore(); }
    // Bolas: las equivocadas avanzan hasta su pared; la buena recorre el camino hasta el cofre
    const br = cell * 0.3, bob = (i) => (rt == null ? Math.sin(w.t * 3 + i * 1.7) * cell * 0.04 : 0);
    k.s.runs.forEach((run, i) => {
      const ex = cx(m.entrances[i]), ey = oy - cell * 0.42, col = BALL_COLS[i];
      // Letra de la entrada
      const done = rt != null && rt >= k.open + 0.15;
      badge(ctx, ex, oy - cell * 1.05, Math.max(22, cell * 0.3), LETTERS[i], done && run.reaches ? "#22C55E" : col, done && run.reaches ? "#22C55E" : "#FFFFFF", done && run.reaches ? "#FFFFFF" : "#20242B");
      if (run.reaches) {
        if (mp > 0) { const p = eInOut(mp / (winPts.length - 1)) * (winPts.length - 1), hp = pathPoint(winPts, p); if (openK < 1) ball(ctx, hp.x, hp.y, br * (1 - 0.6 * openK), col, p * 2.2); }
        else { const pulse = rt != null && rt > k.mStart - 0.4 ? 1 + 0.12 * Math.sin((rt - k.mStart) * 18) : 1; ball(ctx, ex, ey + bob(i), br * pulse, col); }
      } else {
        const pts = [[ex, ey], ...run.path.map(([x, y]) => [cx(x), cy(y)])], n = pts.length - 1;
        const gp = rt == null ? 0 : clamp((rt - k.gStart) * 8 / n) * n, hp = pathPoint(pts, gp), arrived = rt != null && gp >= n;
        const since = arrived ? rt - (k.gStart + n / 8) : 0, shake = arrived && since < 0.3 ? Math.sin(since * 60) * cell * 0.06 * (1 - since / 0.3) : 0;
        if (gp > 0) { ctx.save(); ctx.setLineDash([cell * 0.12, cell * 0.14]); ctx.lineCap = "round"; ctx.strokeStyle = alpha(col, 0.55); ctx.lineWidth = cell * 0.09; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let j = 1; j <= hp.i; j++) ctx.lineTo(pts[j][0], pts[j][1]); ctx.lineTo(hp.x, hp.y); ctx.stroke(); ctx.restore(); }
        ball(ctx, hp.x + shake, hp.y + bob(i), br, arrived ? mix(col, "#9AA3B2", clamp(since * 3) * 0.6) : col, gp * 2.2, arrived ? 1 - 0.25 * clamp(since * 3) : 1);
        if (arrived) okBadge(ctx, hp.x + br * 0.8, hp.y - br * 0.8, Math.max(14, br * 0.6), clamp(since * 3), false);
      }
    });
    // PIX junto a la meta
    const expr = pixAt(w) || (openK > 0 ? "victory" : rt < k.mStart ? "nervous" : "curious");
    const pixS = L.v ? cell * 1.7 : cell * 2.6, px = L.v ? (gx + cell * 1.7 < ox + m.w * cell ? gx + cell * 1.6 : gx - cell * 1.6) : ox + m.w * cell + cell * 1.9, py = L.v ? gy + cell * 0.05 : oy + m.h * cell;
    drawPix(ctx, px, py - (expr === "victory" ? Math.abs(Math.sin((rt - k.open) * 6)) * cell * 0.25 : 0), pixS, expr, w.t * 0.5, px < gx);
  });
}

// ======================= B. MÁQUINA DE BOLAS Y PALANCAS =======================
const BUCKET_COLS = ["#35B8C5", "#FFC83D", "#FF7A6B", "#9B7BFF", "#22C55E"];
const MBALL = ["#FFC83D", "#35B8C5", "#FF7A6B", "#22C55E"];
function machineGeom(c, b, L) {
  const Lv = c.data.levels, nb = Lv + 1;
  const hopH = b.h * (L.v ? 0.17 : 0.2), buckH = b.h * (L.v ? 0.17 : 0.2);
  const y0 = b.y + hopH + b.h * 0.05, y1 = b.y + b.h - buckH - b.h * 0.04;
  const dy = (y1 - y0) / Lv, dx = Math.min((b.w * 0.86) / nb, dy * (L.v ? 1.45 : 1.9));
  const cx = b.x + b.w / 2;
  return { Lv, nb, dx, dy, cx, y0, hopH, buckH, lever: (k, i) => ({ x: cx + (i - k / 2) * dx, y: y0 + (k + 0.5) * dy }), bucket: (j) => ({ x: cx + (j - Lv / 2) * dx, y: b.y + b.h - buckH * 0.15 }), outlet: { x: cx, y: b.y + hopH } };
}
function drawMachine(ctx, c, b, L, P, w) {
  const k = cached(`mc|${c.id}|${c.signature}`, () => machineScript(c)), G = machineGeom(c, b, L), rt = w.rt;
  const { state, levels } = c.data;
  panel(ctx, b, "#E9F0F8", "#D3DEEC", () => {
    // Pared del taller: tablones y agujeros
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 3; for (let x = b.x + 90; x < b.x + b.w; x += 120) { ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); ctx.stroke(); }
    ctx.fillStyle = "rgba(60,80,110,0.08)"; for (let y = b.y + 40; y < b.y + b.h - G.buckH; y += 46) for (let x = b.x + 40; x < b.x + b.w; x += 46) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    // Suelo de madera
    ctx.fillStyle = "#D9A774"; ctx.fillRect(b.x, b.y + b.h - G.buckH * 0.32, b.w, G.buckH); ctx.fillStyle = "#C48F5C"; ctx.fillRect(b.x, b.y + b.h - G.buckH * 0.32, b.w, 8);
    // Engranajes decorativos: giran cuando la máquina se activa
    const spin = rt == null ? 0 : Math.max(0, rt) * 2.2;
    const gr = Math.min(G.dx * 0.5, b.w * 0.09);
    gear(ctx, b.x + gr * 1.4, b.y + gr * 1.5, gr, 10, spin, "#9AA9BD");
    gear(ctx, b.x + b.w - gr * 1.4, b.y + gr * 1.5, gr, 10, -spin, "#9AA9BD"); gear(ctx, b.x + b.w - gr * 2.95, b.y + gr * 2.35, gr * 0.62, 8, spin * 1.6 + 0.2, "#FFC83D");
    // Raíles: cada palanca lleva a las dos de debajo
    ctx.lineCap = "round";
    for (let kk = 0; kk < levels; kk++) for (let i = 0; i <= kk; i++) { const a = G.lever(kk, i); for (const d of [0, 1]) { const nb = kk + 1 < levels ? G.lever(kk + 1, i + d) : { x: G.bucket(i + d).x, y: G.bucket(i + d).y - G.buckH * 0.75 }; ctx.strokeStyle = "rgba(90,110,140,0.22)"; ctx.lineWidth = G.dx * 0.1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(nb.x, nb.y); ctx.stroke(); } }
    // Estado de las palancas en este instante (sale de la simulación)
    const lv = state.map((row) => row.map((v) => ({ v, from: v, k: 1 })));
    if (rt != null) k.balls.forEach((bb, bi) => k.s.runs[bi].hits.forEach((h, hi) => { const at = bb.hitAt[hi]; if (rt >= at) { const cell = lv[h.k][h.pos]; cell.from = cell.v; cell.v = 1 - cell.v; cell.k = clamp((rt - at) / 0.18); } }));
    // Cubos
    for (let j = 0; j < G.nb; j++) {
      const p = G.bucket(j), bw = G.dx * 0.72, bh = G.buckH * 0.7, col = BUCKET_COLS[j % BUCKET_COLS.length];
      const win = rt != null && rt >= k.end + 0.05 && j === k.s.last;
      shadowE(ctx, p.x, p.y, bw * 0.55, bh * 0.1, 0.25);
      if (win) { ctx.fillStyle = alpha("#22C55E", 0.25 + 0.1 * Math.sin(rt * 8)); ctx.beginPath(); ctx.ellipse(p.x, p.y - bh * 0.5, bw * 0.85, bh * 0.85, 0, 0, Math.PI * 2); ctx.fill(); }
      poly(ctx, [[p.x - bw / 2, p.y - bh], [p.x + bw / 2, p.y - bh], [p.x + bw * 0.38, p.y], [p.x - bw * 0.38, p.y]]); ctx.fillStyle = shade(col, -0.12); ctx.fill();
      poly(ctx, [[p.x - bw / 2, p.y - bh], [p.x + bw / 2, p.y - bh], [p.x + bw * 0.42, p.y - bh * 0.25], [p.x - bw * 0.42, p.y - bh * 0.25]]); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = shade(col, -0.35); ctx.beginPath(); ctx.ellipse(p.x, p.y - bh, bw / 2, bh * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      text(ctx, LETTERS[j], p.x, p.y - bh * 0.52, Math.min(bh * 0.5, bw * 0.45), "#FFFFFF");
      if (win) okBadge(ctx, p.x + bw * 0.45, p.y - bh * 1.05, Math.max(18, bw * 0.17), clamp((rt - k.end - 0.05) * 3));
    }
    // Palancas
    for (let kk = 0; kk < levels; kk++) for (let i = 0; i <= kk; i++) {
      const p = G.lever(kk, i), s = lv[kk][i], ang = (v) => (v ? 0.5 : -0.5), a = lerp(ang(s.from), ang(s.v), eBack(s.k));
      const len = G.dx * 0.62, thk = Math.max(10, G.dx * 0.13);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.fillStyle = "#C46A1E"; rrect(ctx, -len / 2, -thk / 2 + thk * 0.35, len, thk, thk / 2); ctx.fill();
      ctx.fillStyle = "#FF9F43"; rrect(ctx, -len / 2, -thk / 2, len, thk, thk / 2); ctx.fill();
      // Flecha: hacia dónde manda la bola
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = thk * 0.22; ctx.lineCap = "round"; ctx.lineJoin = "round";
      // Flecha grande sobre la palanca: indica el lado al que manda la bola
      { const dir = Math.sign(a) || 1, x0 = -dir * len * 0.3, x1 = dir * len * 0.36; ctx.lineWidth = thk * 0.24; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.moveTo(x1 - dir * thk * 0.55, -thk * 0.32); ctx.lineTo(x1, 0); ctx.lineTo(x1 - dir * thk * 0.55, thk * 0.32); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = "#5B6B82"; ctx.beginPath(); ctx.arc(p.x, p.y, thk * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#C7D2E0"; ctx.beginPath(); ctx.arc(p.x, p.y, thk * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    // Tolva con las bolas que esperan
    const o = G.outlet, hw = G.dx * 1.3, hh = G.hopH * 0.8, br = Math.max(12, G.dx * 0.19);
    poly(ctx, [[o.x - hw / 2, o.y - hh], [o.x + hw / 2, o.y - hh], [o.x + br * 1.3, o.y], [o.x - br * 1.3, o.y]]); ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#8EA0B8"; ctx.stroke();
    const n = c.data.balls;
    for (let bi = n - 1; bi >= 0; bi--) {
      const bb = k.balls[bi], run = k.s.runs[bi], col = MBALL[bi % MBALL.length];
      const waitP = { x: o.x + (bi - (n - 1) / 2) * br * 2.3 * (n > 1 ? 1 : 0), y: o.y - hh * 0.35 - (bi % 2) * br * 0.4 };
      let pos = waitP, rot = 0, inBucket = false;
      if (rt != null && rt >= bb.start) {
        const tt = rt;
        const pts = [{ x: o.x, y: o.y - br }, ...run.hits.map((h) => { const p = G.lever(h.k, h.pos); return { x: p.x, y: p.y - Math.max(10, G.dx * 0.13) * 0.5 - br }; }), (() => { const p = G.bucket(run.bucket); return { x: p.x, y: p.y - G.buckH * 0.7 * 0.6 }; })()];
        const times = [bb.start + 0.15, ...bb.hitAt, bb.landAt];
        if (tt < times[0]) { const u = eOut((tt - bb.start) / 0.15); pos = { x: lerp(waitP.x, pts[0].x, u), y: lerp(waitP.y, pts[0].y, u) }; }
        else if (tt >= times[times.length - 1]) { inBucket = true; const p = G.bucket(run.bucket), stack = k.s.runs.slice(0, bi).filter((r) => r.bucket === run.bucket).length; pos = { x: p.x + (stack % 2 ? br * 0.9 : -br * 0.3 * stack), y: p.y - G.buckH * 0.7 * 0.55 - stack * br * 0.6 }; }
        else { let j = 0; while (j < times.length - 2 && tt >= times[j + 1]) j++; const u = clamp((tt - times[j]) / (times[j + 1] - times[j])); const A = pts[j], B = pts[j + 1]; pos = { x: lerp(A.x, B.x, eInOut(u)), y: lerp(A.y, B.y, u * u * 0.6 + u * 0.4) - Math.sin(u * Math.PI) * G.dy * 0.12 }; rot = (tt - bb.start) * 9 * (B.x >= A.x ? 1 : -1); }
      }
      if (!inBucket || true) ball(ctx, pos.x, pos.y, br, col, rot);
      if (n > 1) text(ctx, String(bi + 1), pos.x, pos.y + 1, br * 1.05, "#20242B");
    }
    if (n > 1 && rt == null) { const tx = o.x + hw / 2 + br * 2.2; ctx.fillStyle = "#FFFFFF"; rrect(ctx, tx - br * 1.6, o.y - hh * 0.6 - br, br * 3.2, br * 2, br); ctx.fill(); text(ctx, `×${n}`, tx, o.y - hh * 0.6, br * 1.15, "#20242B"); }
    // PIX observa desde un lado de la tolva
    const done = rt != null && rt >= k.end + 0.05, expr = pixAt(w) || (done ? "happy" : "surprised");
    const ps = Math.min(G.hopH * 1.25, b.h * 0.2), px = L.v ? o.x - hw / 2 - ps * 0.55 : b.x + b.w * 0.16, py = L.v ? o.y + ps * 0.15 : b.y + b.h - G.buckH * 0.32;
    drawPix(ctx, px, py, L.v ? ps * 0.9 : ps * 1.6, expr, w.t * 0.5, false);
  });
}

// ======================= C. HABITACIÓN CON UN ERROR =======================
const ROOM_PAL = [
  { wall: "#F6E7D7", wall2: "#ECD6C0", sofa: "#5DA9E9", rug: "#FF9F8E", trim: "#FFFFFF" },
  { wall: "#DDEBF7", wall2: "#C9DCEE", sofa: "#FF8FA3", rug: "#FFD166", trim: "#FFFFFF" },
  { wall: "#E6F2DE", wall2: "#D2E6C6", sofa: "#F4A259", rug: "#8ECAE6", trim: "#FFFFFF" },
  { wall: "#F7E1E6", wall2: "#ECCBD3", sofa: "#43AA8B", rug: "#B8A1E3", trim: "#FFFFFF" },
];
// Posiciones (fracciones del panel) y tamaños (en unidades u = lado menor / 10) para vertical y horizontal
const ROOM_LAYOUT = {
  v: { floor: 0.64, window: [0.27, 0.2, 2.8], clock: [0.62, 0.11, 0.8], calendar: [0.87, 0.13, 1], picture: [0.62, 0.36, 1], shelf: [0.33, 0.5, 1], door: [0.86, 0.64, 1], lamp: [0.08, 0.64, 1], sofa: [0.42, 0.67, 1], table: [0.6, 0.92, 1], pix: [0.12, 0.97] },
  h: { floor: 0.66, window: [0.29, 0.3, 3.0], clock: [0.46, 0.17, 0.75], calendar: [0.72, 0.2, 0.95], picture: [0.6, 0.36, 0.95], shelf: [0.87, 0.36, 0.95], door: [0.09, 0.66, 1.05], lamp: [0.2, 0.66, 0.95], sofa: [0.42, 0.69, 1.05], table: [0.68, 0.93, 1.05], pix: [0.9, 0.97] },
};
function roomPlaces(b, L) {
  const Lr = L.v ? ROOM_LAYOUT.v : ROOM_LAYOUT.h, u = Math.min(b.w, b.h) / 10, X = (f) => b.x + b.w * f, Y = (f) => b.y + b.h * f;
  const at = (k) => ({ x: X(Lr[k][0]), y: Y(Lr[k][1]), s: Lr[k][2] ?? 1 });
  const t = at("table");
  const places = {
    window: { ...at("window"), box: [2.8, 2.8] }, clock: { ...at("clock"), box: [1.7, 1.7] }, calendar: { ...at("calendar"), box: [1.4, 1.8] }, picture: { ...at("picture"), box: [2.5, 2] },
    shelf: { ...at("shelf"), box: [3.4, 1.8] }, door: { ...at("door"), box: [2.2, 5], bottom: true }, lamp: { ...at("lamp"), box: [1.2, 4], bottom: true }, sofa: { ...at("sofa"), box: [4.6, 2], bottom: true },
    table: { ...t, box: [3.6, 1.6], bottom: true },
    cup: { x: t.x - u * 1.0 * t.s, y: t.y - u * 1.3 * t.s, s: t.s, box: [1.1, 1.4], bottom: true },
    candle: { x: t.x + u * 0.05 * t.s, y: t.y - u * 1.3 * t.s, s: t.s, box: [0.8, 1.8], bottom: true },
    plant: { x: t.x + u * 1.05 * t.s, y: t.y - u * 1.3 * t.s, s: t.s, box: [1.3, 1.9], bottom: true },
  };
  for (const p of Object.values(places)) { const bw = p.box[0] * u * p.s, bh = p.box[1] * u * p.s; p.cx = p.x; p.cy = p.bottom ? p.y - bh / 2 : p.y; p.r = Math.max(bw, bh) * 0.62; }
  return { u, places, floorY: Y(Lr.floor), pix: { x: X(Lr.pix[0]), y: Y(Lr.pix[1]) } };
}
const ROOM_DRAW = {
  window(ctx, p, u) { const s = u * p.s, w = s * 1, h = s * 1, x = p.x - w / 2, y = p.y - h / 2;
    ctx.fillStyle = "#FF8FA3"; rrect(ctx, x - w * 0.22, y - h * 0.06, w * 0.2, h * 1.12, w * 0.06); ctx.fill(); rrect(ctx, x + w * 1.02, y - h * 0.06, w * 0.2, h * 1.12, w * 0.06); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; rrect(ctx, x - w * 0.05, y - h * 0.05, w * 1.1, h * 1.1, w * 0.06); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#8FD3FF"); g.addColorStop(1, "#D8F1FF"); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#FFD166"; ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.28, w * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; for (const [cx, cy, r] of [[0.3, 0.42, 0.09], [0.4, 0.38, 0.11], [0.5, 0.43, 0.08]]) { ctx.beginPath(); ctx.arc(x + w * cx, y + h * cy, w * r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#7BC67E"; ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 1.02, w * 0.7, h * 0.25, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x + w * 0.48, y, w * 0.04, h); ctx.fillRect(x, y + h * 0.48, w, h * 0.04);
    ctx.fillStyle = "#E9EEF5"; rrect(ctx, x - w * 0.1, y + h * 1.02, w * 1.2, h * 0.08, 4); ctx.fill(); },
  clock(ctx, p, u, d, err) { const r = u * p.s, x = p.x, y = p.y;
    shadowE(ctx, x + r * 0.08, y + r * 0.12, r * 1.02, r * 1.02, 0.12);
    ctx.fillStyle = "#3A4356"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillStyle = "#9AA3B2"; ctx.beginPath(); ctx.arc(x + Math.sin(a) * r * 0.74, y - Math.cos(a) * r * 0.74, r * 0.035, 0, Math.PI * 2); ctx.fill(); }
    const nums = err ? ["6", "9", "12", "3"] : ["12", "3", "6", "9"]; [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) => text(ctx, nums[i], x + dx * r * 0.58, y + dy * r * 0.58 + r * 0.02, r * 0.3, "#20242B"));
    const ha = ((d.clock.h % 12) + d.clock.m / 60) / 12 * Math.PI * 2, ma = (d.clock.m / 60) * Math.PI * 2;
    ctx.lineCap = "round"; ctx.strokeStyle = "#20242B"; ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(ha) * r * 0.38, y - Math.cos(ha) * r * 0.38); ctx.stroke();
    ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(ma) * r * 0.58, y - Math.cos(ma) * r * 0.58); ctx.stroke();
    ctx.fillStyle = "#FF7A6B"; ctx.beginPath(); ctx.arc(x, y, r * 0.07, 0, Math.PI * 2); ctx.fill(); },
  calendar(ctx, p, u, d, err) { const s = u * p.s, w = s * 1.25, h = s * 1.5, x = p.x - w / 2, y = p.y - h / 2;
    ctx.strokeStyle = "#5B6B82"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x - w * 0.25, y); ctx.lineTo(p.x, y - h * 0.18); ctx.lineTo(p.x + w * 0.25, y); ctx.stroke();
    ctx.fillStyle = "rgba(20,24,32,0.12)"; rrect(ctx, x + 4, y + 6, w, h, 8); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; rrect(ctx, x, y, w, h, 8); ctx.fill(); ctx.fillStyle = "#FF6B6B"; rrect(ctx, x, y, w, h * 0.32, 8); ctx.fill(); ctx.fillRect(x, y + h * 0.2, w, h * 0.12);
    text(ctx, err ? "FEB" : d.calendar.month, p.x, y + h * 0.17, h * 0.17, "#FFFFFF"); text(ctx, String(err ? 30 : d.calendar.day), p.x, y + h * 0.66, h * 0.4, "#20242B"); },
  picture(ctx, p, u, d, err) { const s = u * p.s, w = s * 2.2, h = s * 1.6, x = p.x - w / 2, y = p.y - h / 2;
    ctx.fillStyle = "rgba(20,24,32,0.14)"; ctx.fillRect(x + 5, y + 7, w, h);
    ctx.fillStyle = "#B9783F"; ctx.fillRect(x, y, w, h); ctx.fillStyle = "#D99A5B"; ctx.fillRect(x + s * 0.08, y + s * 0.08, w - s * 0.16, h - s * 0.16);
    const ix = x + s * 0.16, iy = y + s * 0.16, iw = w - s * 0.32, ih = h - s * 0.32;
    ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip(); ctx.translate(ix + iw / 2, iy + ih / 2); if (err) ctx.rotate(Math.PI); ctx.translate(-iw / 2, -ih / 2);
    ctx.fillStyle = "#BFE6FF"; ctx.fillRect(0, 0, iw, ih); ctx.fillStyle = "#FFD166"; ctx.beginPath(); ctx.arc(iw * 0.78, ih * 0.25, ih * 0.13, 0, Math.PI * 2); ctx.fill();
    if (d.picture === "boat") { ctx.fillStyle = "#4C9BE8"; ctx.fillRect(0, ih * 0.62, iw, ih * 0.38); ctx.fillStyle = "#C0392B"; poly(ctx, [[iw * 0.3, ih * 0.62], [iw * 0.62, ih * 0.62], [iw * 0.56, ih * 0.74], [iw * 0.36, ih * 0.74]]); ctx.fill(); ctx.fillStyle = "#FFFFFF"; poly(ctx, [[iw * 0.46, ih * 0.6], [iw * 0.46, ih * 0.2], [iw * 0.6, ih * 0.58]]); ctx.fill(); }
    else if (d.picture === "house") { ctx.fillStyle = "#7BC67E"; ctx.fillRect(0, ih * 0.7, iw, ih * 0.3); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(iw * 0.3, ih * 0.42, iw * 0.34, ih * 0.3); ctx.fillStyle = "#E4572E"; poly(ctx, [[iw * 0.26, ih * 0.44], [iw * 0.47, ih * 0.2], [iw * 0.68, ih * 0.44]]); ctx.fill(); ctx.fillStyle = "#6B4226"; ctx.fillRect(iw * 0.43, ih * 0.55, iw * 0.08, ih * 0.17); }
    else { ctx.fillStyle = "#7A8CA8"; poly(ctx, [[0, ih], [iw * 0.35, ih * 0.3], [iw * 0.7, ih]]); ctx.fill(); ctx.fillStyle = "#94A6C2"; poly(ctx, [[iw * 0.35, ih], [iw * 0.68, ih * 0.42], [iw, ih]]); ctx.fill(); ctx.fillStyle = "#FFFFFF"; poly(ctx, [[iw * 0.27, ih * 0.44], [iw * 0.35, ih * 0.3], [iw * 0.43, ih * 0.44]]); ctx.fill(); ctx.fillStyle = "#7BC67E"; ctx.fillRect(0, ih * 0.86, iw, ih * 0.14); }
    ctx.restore(); },
  shelf(ctx, p, u, d, err) { const s = u * p.s, w = s * 3.2, x = p.x - w / 2, y = p.y;
    ctx.fillStyle = "rgba(20,24,32,0.12)"; ctx.fillRect(x + 4, y + 6, w, s * 0.16);
    ctx.fillStyle = "#A8642A"; ctx.fillRect(x, y, w, s * 0.16); ctx.fillStyle = "#8A5222"; ctx.fillRect(x + w * 0.12, y + s * 0.16, s * 0.1, s * 0.3); ctx.fillRect(x + w * 0.85, y + s * 0.16, s * 0.1, s * 0.3);
    const books = [["#FF7A6B", 0.28, 1.05], ["#35B8C5", 0.24, 0.9], ["#FFC83D", 0.3, 1.15], ["#9B7BFF", 0.22, 0.95], ["#22C55E", 0.26, 1.0]];
    let bx = x + w * 0.08;
    books.forEach(([col, bw, bh], i) => { const lift = err && i === 3 ? s * 0.55 : 0; const ww = bw * s, hh = bh * s; if (lift) { shadowE(ctx, bx + ww / 2, y, ww * 0.6, s * 0.05, 0.18); } ctx.fillStyle = shade(col, -0.15); ctx.fillRect(bx, y - hh - lift, ww, hh); ctx.fillStyle = col; ctx.fillRect(bx, y - hh - lift, ww * 0.78, hh); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(bx + ww * 0.15, y - hh * 0.75 - lift, ww * 0.48, hh * 0.08); bx += ww + s * 0.04; });
    ctx.fillStyle = "#35B8C5"; ctx.beginPath(); ctx.ellipse(x + w * 0.8, y - s * 0.35, s * 0.22, s * 0.35, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#2A97A3"; ctx.fillRect(x + w * 0.8 - s * 0.08, y - s * 0.78, s * 0.16, s * 0.12); },
  door(ctx, p, u, d, err) { const s = u * p.s, w = s * 2, h = s * 4.6, x = p.x - w / 2, y = p.y - h;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x - s * 0.15, y - s * 0.15, w + s * 0.3, h + s * 0.15);
    ctx.fillStyle = "#C97E3C"; ctx.fillRect(x, y, w, h); ctx.fillStyle = "#B66C2C"; for (const [px, py] of [[0.14, 0.07], [0.14, 0.52]]) ctx.fillRect(x + w * px, y + h * py, w * 0.72, h * 0.38); ctx.fillStyle = "#D98E48"; for (const [px, py] of [[0.18, 0.09], [0.18, 0.54]]) ctx.fillRect(x + w * px, y + h * py, w * 0.64, h * 0.34);
    ctx.fillStyle = "#5B6B82"; ctx.fillRect(x - s * 0.04, y + h * 0.12, s * 0.12, s * 0.35); ctx.fillRect(x - s * 0.04, y + h * 0.78, s * 0.12, s * 0.35);
    const hx = err ? x + w * 0.12 : x + w * 0.86; ctx.fillStyle = "#FFC83D"; ctx.beginPath(); ctx.arc(hx, y + h * 0.52, s * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#E39B12"; ctx.beginPath(); ctx.arc(hx, y + h * 0.52, s * 0.06, 0, Math.PI * 2); ctx.fill(); },
  lamp(ctx, p, u) { const s = u * p.s, x = p.x, y = p.y;
    shadowE(ctx, x, y, s * 0.5, s * 0.1, 0.2); ctx.fillStyle = "#3A4356"; ctx.beginPath(); ctx.ellipse(x, y - s * 0.05, s * 0.42, s * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - s * 0.05, y - s * 3.1, s * 0.1, s * 3.05);
    ctx.fillStyle = "rgba(255,230,140,0.35)"; poly(ctx, [[x - s * 0.4, y - s * 2.75], [x + s * 0.4, y - s * 2.75], [x + s * 1.0, y - s * 0.6], [x - s * 1.0, y - s * 0.6]]); ctx.fill();
    ctx.fillStyle = "#FFD166"; poly(ctx, [[x - s * 0.35, y - s * 3.7], [x + s * 0.35, y - s * 3.7], [x + s * 0.62, y - s * 2.75], [x - s * 0.62, y - s * 2.75]]); ctx.fill(); ctx.fillStyle = "#F0B840"; ctx.fillRect(x - s * 0.62, y - s * 2.82, s * 1.24, s * 0.08); },
  sofa(ctx, p, u, d, err, pal) { const s = u * p.s, w = s * 4.4, h = s * 1.7, x = p.x - w / 2, y = p.y - h;
    shadowE(ctx, p.x, p.y, w * 0.55, s * 0.18, 0.2); const c0 = pal.sofa;
    ctx.fillStyle = "#6B4226"; ctx.fillRect(x + w * 0.08, p.y - s * 0.22, s * 0.16, s * 0.22); ctx.fillRect(x + w * 0.88, p.y - s * 0.22, s * 0.16, s * 0.22);
    ctx.fillStyle = shade(c0, -0.15); rrect(ctx, x + w * 0.06, y, w * 0.88, h * 0.62, s * 0.25); ctx.fill();
    ctx.fillStyle = c0; rrect(ctx, x + w * 0.12, y + h * 0.1, w * 0.37, h * 0.48, s * 0.2); ctx.fill(); rrect(ctx, x + w * 0.51, y + h * 0.1, w * 0.37, h * 0.48, s * 0.2); ctx.fill();
    ctx.fillStyle = shade(c0, -0.05); rrect(ctx, x + w * 0.06, y + h * 0.5, w * 0.88, h * 0.38, s * 0.15); ctx.fill();
    ctx.fillStyle = shade(c0, -0.22); rrect(ctx, x, y + h * 0.3, w * 0.12, h * 0.58, s * 0.2); ctx.fill(); rrect(ctx, x + w * 0.88, y + h * 0.3, w * 0.12, h * 0.58, s * 0.2); ctx.fill();
    ctx.fillStyle = "#FFD166"; rrect(ctx, x + w * 0.18, y + h * 0.22, w * 0.16, h * 0.3, s * 0.12); ctx.fill(); },
  table(ctx, p, u, d, err) { const s = u * p.s, w = s * 3.4, x = p.x - w / 2, top = p.y - s * 1.3;
    shadowE(ctx, p.x, p.y, w * 0.5, s * 0.14, 0.2);
    ctx.fillStyle = "#8A5222"; const legs = err ? [0.06] : [0.06, 0.88]; for (const lx of legs) ctx.fillRect(x + w * lx, top + s * 0.15, s * 0.2, s * 1.15);
    ctx.fillStyle = "#A8642A"; rrect(ctx, x - s * 0.1, top + s * 0.08, w + s * 0.2, s * 0.14, 4); ctx.fill(); ctx.fillStyle = "#C97E3C"; rrect(ctx, x - s * 0.1, top - s * 0.04, w + s * 0.2, s * 0.16, 5); ctx.fill(); },
  cup(ctx, p, u, d, err, pal, t) { const s = u * p.s, x = p.x, y = p.y, w = s * 0.62, h = s * 0.62;
    // vapor (siempre sube)
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = s * 0.07; ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) { const ox = x + (i - 1) * w * 0.25, ph = (t * 1.5 + i * 0.33) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.moveTo(ox, y - h - s * 0.1 - ph * s * 0.3); ctx.quadraticCurveTo(ox + s * 0.12, y - h - s * 0.35 - ph * s * 0.3, ox, y - h - s * 0.6 - ph * s * 0.3); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.arc(x + w * 0.55, y - h * 0.5, h * 0.24, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    if (err) { poly(ctx, [[x - w * 0.42, y], [x + w * 0.42, y], [x + w * 0.5, y - h], [x - w * 0.5, y - h]]); ctx.fill(); ctx.fillStyle = "#E3E8EF"; ctx.beginPath(); ctx.ellipse(x, y - h, w * 0.5, h * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
    else { poly(ctx, [[x - w * 0.5, y - h], [x + w * 0.5, y - h], [x + w * 0.42, y], [x - w * 0.42, y]]); ctx.fill(); ctx.fillStyle = "#6B4226"; ctx.beginPath(); ctx.ellipse(x, y - h, w * 0.5, h * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#FF7A6B"; ctx.fillRect(x - w * 0.44, y - h * 0.55, w * 0.88, h * 0.12); },
  candle(ctx, p, u, d, err, pal, t) { const s = u * p.s, x = p.x, y = p.y, w = s * 0.32, h = s * 0.95;
    ctx.fillStyle = "#FFFFFF"; rrect(ctx, x - w / 2, y - h, w, h, w * 0.2); ctx.fill(); ctx.fillStyle = "#EEF1F6"; ctx.fillRect(x + w * 0.15, y - h, w * 0.35, h);
    ctx.fillStyle = "#FFD166"; ctx.beginPath(); ctx.ellipse(x, y - s * 0.03, w * 0.95, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#20242B"; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x, y - h - s * 0.1); ctx.stroke();
    const fl = 1 + Math.sin(t * 14) * 0.06, fy = y - h - s * 0.1, fr = s * 0.16 * fl;
    ctx.save(); ctx.translate(x, fy); if (err) { ctx.translate(0, -fr * 2.6); ctx.scale(1, -1); }
    ctx.fillStyle = "rgba(255,200,80,0.35)"; ctx.beginPath(); ctx.arc(0, -fr, fr * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FF9F43"; ctx.beginPath(); ctx.moveTo(0, -fr * 3.1); ctx.quadraticCurveTo(fr * 1.3, -fr, 0, 0); ctx.quadraticCurveTo(-fr * 1.3, -fr, 0, -fr * 3.1); ctx.fill();
    ctx.fillStyle = "#FFE08A"; ctx.beginPath(); ctx.moveTo(0, -fr * 2); ctx.quadraticCurveTo(fr * 0.6, -fr * 0.6, 0, 0); ctx.quadraticCurveTo(-fr * 0.6, -fr * 0.6, 0, -fr * 2); ctx.fill();
    ctx.restore(); },
  plant(ctx, p, u) { const s = u * p.s, x = p.x, y = p.y;
    ctx.fillStyle = "#43AA8B"; for (const [a, l] of [[-0.6, 1.0], [-0.2, 1.25], [0.25, 1.15], [0.65, 0.9]]) { ctx.save(); ctx.translate(x, y - s * 0.55); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -s * l * 0.5, s * 0.16, s * l * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = "#E4572E"; poly(ctx, [[x - s * 0.38, y - s * 0.6], [x + s * 0.38, y - s * 0.6], [x + s * 0.28, y], [x - s * 0.28, y]]); ctx.fill(); ctx.fillStyle = "#C2461F"; ctx.fillRect(x - s * 0.42, y - s * 0.66, s * 0.84, s * 0.14); },
};
function drawRoom(ctx, c, b, L, P, w) {
  const d = c.data, pal = ROOM_PAL[d.palette % ROOM_PAL.length], R = roomPlaces(b, L), u = R.u, k = roomScript(), rt = w.rt;
  const target = d.items.find((i) => i.err), tp = R.places[target.kind];
  // Cámara: acercamiento al error y vuelta
  const zMax = L.v ? 2.0 : 1.9, zk = rt == null ? 0 : rt < k.zoomIn ? 0 : rt < k.mark ? eInOut((rt - k.zoomIn) / (k.mark - k.zoomIn)) : rt < k.zoomOut ? 1 : 1 - eInOut((rt - k.zoomOut) / (k.end - k.zoomOut));
  const z = 1 + (zMax - 1) * zk;
  const fx = clamp(lerp(b.x + b.w / 2, tp.cx, zk), b.x + b.w / (2 * z), b.x + b.w - b.w / (2 * z)), fy = clamp(lerp(b.y + b.h / 2, tp.cy, zk), b.y + b.h / (2 * z), b.y + b.h - b.h / (2 * z));
  panel(ctx, b, pal.wall, pal.wall, () => {
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); zs(ctx, z); ctx.translate(-fx, -fy);
    // Pared, zócalo, suelo de madera y alfombra
    ctx.fillStyle = pal.wall2; for (let x = b.x + 30; x < b.x + b.w; x += 70) ctx.fillRect(x, b.y, 18, R.floorY - b.y);
    ctx.fillStyle = pal.trim; ctx.fillRect(b.x, R.floorY - u * 0.25, b.w, u * 0.25);
    ctx.fillStyle = "#D9A774"; ctx.fillRect(b.x, R.floorY, b.w, b.y + b.h - R.floorY); ctx.strokeStyle = "#C48F5C"; ctx.lineWidth = 3; for (let y = R.floorY + u * 0.5; y < b.y + b.h; y += u * 0.6) { ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); ctx.stroke(); }
    const tpl = R.places.table; ctx.fillStyle = pal.rug; ctx.beginPath(); ctx.ellipse(tpl.x, tpl.y - u * 0.05, u * 2.8 * tpl.s, u * 0.55 * tpl.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = shade(pal.rug, 0.4); ctx.lineWidth = 5; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.ellipse(tpl.x, tpl.y - u * 0.05, u * 2.5 * tpl.s, u * 0.42 * tpl.s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // Objetos (el del error se transforma en el correcto tras señalarlo)
    const fixK = rt == null ? 0 : clamp((rt - k.fix) / 0.45);
    for (const kind of ["window", "clock", "calendar", "picture", "shelf", "door", "lamp", "sofa", "table", "cup", "candle", "plant"]) {
      const it = d.items.find((i) => i.kind === kind); if (!it) continue;
      const p = R.places[kind];
      if (it.err && fixK > 0) {
        ctx.save(); ctx.globalAlpha = 1 - fixK; ROOM_DRAW[kind](ctx, p, u, d, true, pal, w.t); ctx.restore();
        const s = 1 + 0.12 * Math.sin(fixK * Math.PI); ctx.save(); ctx.globalAlpha = fixK; ctx.translate(p.cx, p.cy); zs(ctx, s); ctx.translate(-p.cx, -p.cy); ROOM_DRAW[kind](ctx, p, u, d, false, pal, w.t); ctx.restore();
      } else ROOM_DRAW[kind](ctx, p, u, d, !!it.err, pal, w.t);
    }
    // Marca sobre el error
    if (rt != null && rt >= k.mark - 0.1) {
      const mk = clamp((rt - (k.mark - 0.1)) / 0.35), good = fixK > 0.5, col = good ? "#22C55E" : "#F87171", r = tp.r * (1.05 + 0.04 * Math.sin(rt * 8));
      ctx.save(); ctx.lineWidth = Math.max(5, u * 0.09); ctx.strokeStyle = col; ctx.setLineDash([u * 0.28, u * 0.16]); ctx.lineDashOffset = -rt * 40; ctx.beginPath(); ctx.arc(tp.cx, tp.cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * eOut(mk)); ctx.stroke(); ctx.restore();
      okBadge(ctx, tp.cx + r * 0.72, tp.cy - r * 0.72, Math.max(16, u * 0.32), mk, good);
      if (fixK > 0) sparkles(ctx, tp.cx, tp.cy, tp.r * 1.4, clamp((rt - k.fix) / 0.9), 3);
    }
    // PIX en la habitación
    const expr = pixAt(w) || (fixK > 0.5 ? "happy" : "surprised");
    drawPix(ctx, R.pix.x, R.pix.y, u * 2.1, expr, w.t * 0.5, R.pix.x > b.x + b.w / 2);
    ctx.restore();
  });
}

// ---------- Entrada única desde draw.js ----------
const SCENES = { maze: drawMaze, machine: drawMachine, room_error: drawRoom };
export function drawWorldScene(ctx, c, b, L, P, w) {
  FONT = `${P.font === "Nunito" ? "Nunito" : "Montserrat"}, Montserrat, 'Arial Black', sans-serif`;
  SCENES[c.mechanic](ctx, c, b, L, P, w);
}
export const isWorldMechanic = (m) => !!SCENES[m];
export { ROOM_ERRORS };
