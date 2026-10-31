// Formatos de Shorts dibujados con código (coste 0): «¿Quién ganaría?», «¿Cuánto costaba?», «Piensa un número» y «Piano fácil».
// Mismo módulo en el servidor de render (node-canvas), el worker (validación y datos) y la web.
// Lienzo lógico 720×1280: quien dibuja escala el contexto al tamaño real.
export const FW = 720, FH = 1280;
export const FORMATS = {
  ganaria: { label: "¿Quién ganaría?", ai: true },
  precios: { label: "¿Cuánto costaba?", ai: true },
  numero: { label: "Piensa un número", ai: false },
  piano: { label: "Piano fácil", ai: false },
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const back = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const pop = (t, a, d = 0.35) => back(prog(t, a, a + d));
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const num = (v, d = 0) => { const s = Math.abs(v).toFixed(d).split("."); return (v < 0 ? "-" : "") + miles(s[0]) + (s[1] ? "," + s[1] : ""); };
// Separa un texto en grafemas aproximados para contar emojis (un emoji puede ocupar varios puntos de código)
export const emojiCode = (e) => [...String(e)].map((c) => c.codePointAt(0)).filter((c) => c !== 0xfe0f).map((c) => c.toString(16)).join("_");

const TAIL_EMOJI = /^(.*?)\s*(\p{Extended_Pictographic}\uFE0F?)$/u;
// Emojis que aparecen al final de los textos fijos (se cargan siempre)
const TEXT_EMOJIS = ["👇", "🎹", "😏", "👉"];
function kit(ctx, E) {
  const FONT = { B: (s) => `${Math.round(s)}px Bangers`, M: (s) => `800 ${Math.round(s)}px Montserrat`, N: (s) => `800 ${Math.round(s)}px Nunito` };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const txt = (s, x, y, o = {}) => {
    ctx.save(); ctx.font = FONT[o.font ?? "M"](o.size ?? 60); ctx.textAlign = o.align ?? "center"; ctx.textBaseline = "middle";
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); if (o.scale != null) ctx.scale(Math.max(0.001, o.scale), Math.max(0.001, o.scale));
    // Emoji al final del texto: se pinta como imagen (el lienzo del servidor no pinta emojis de color)
    const m = String(s).match(TAIL_EMOJI); const body = m ? m[1] : String(s), es = m ? (o.size ?? 60) * 1.05 : 0, gap = m ? (o.size ?? 60) * 0.25 : 0;
    const w = ctx.measureText(body).width, total = w + gap + es;
    // Encoge el texto si no cabe en el ancho
    if (o.max && total > o.max) ctx.scale(o.max / total, o.max / total);
    const al = ctx.textAlign, tx = m ? (al === "left" ? 0 : al === "right" ? -(gap + es) : -(gap + es) / 2) : 0;
    ctx.globalAlpha = clamp(o.alpha ?? 1);
    if (o.stroke) { ctx.lineWidth = o.lw ?? 10; ctx.strokeStyle = o.stroke; ctx.lineJoin = "round"; ctx.strokeText(body, tx, 0); }
    ctx.fillStyle = o.color ?? "#fff"; ctx.fillText(body, tx, 0);
    if (m) { const ex = al === "left" ? w + gap + es / 2 : al === "right" ? -es / 2 : total / 2 - es / 2; E.emoji(ctx, m[2], ex, 0, es); }
    ctx.restore();
  };
  const emoji = (e, x, y, size, o = {}) => { if ((o.scale ?? 1) <= 0.001 || (o.alpha ?? 1) <= 0) return; ctx.save(); ctx.globalAlpha = clamp(o.alpha ?? 1); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); const s = o.scale ?? 1; ctx.scale(s, s); E.emoji(ctx, e, 0, 0, size); ctx.restore(); };
  const grad = (c1, c2) => { const g = ctx.createLinearGradient(0, 0, 0, FH); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(0, 0, FW, FH); };
  const rays = (t, color, alpha) => { ctx.save(); ctx.translate(FW / 2, FH * 0.42); ctx.rotate(t * 0.15); ctx.fillStyle = color; ctx.globalAlpha = alpha; for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, -1400); ctx.lineTo(90, -1400); ctx.fill(); } ctx.restore(); };
  const confetti = (t, t0, n = 90) => { if (t < t0) return; const k = t - t0; for (let i = 0; i < n; i++) { const r = Math.sin(i * 91.7) * 0.5 + 0.5, r2 = Math.sin(i * 47.3) * 0.5 + 0.5; const x = FW / 2 + (r - 0.5) * 900 * Math.min(1, k * 2); const y = FH * 0.35 - 500 * r2 * Math.min(1, k * 3) + 520 * k * k; if (y > FH + 20) continue; ctx.save(); ctx.translate(x, y); ctx.rotate(k * 6 + i); ctx.fillStyle = ["#FFD23F", "#EE4266", "#3BCEAC", "#540D6E", "#FFF"][i % 5]; ctx.globalAlpha = clamp(2.5 - k); ctx.fillRect(-7, -4, 14, 8); ctx.restore(); } };
  return { rr, txt, emoji, grad, rays, confetti };
}

// ---------------- ¿Quién ganaría? ----------------
const RIVAL_COLORS = [["#E76F51", "#2A9D8F"], ["#E63946", "#457B9D"], ["#F4A261", "#6A4C93"], ["#EF476F", "#118AB2"]];
function planGanaria(d, o) {
  const A = { ...d.a }, B = { ...d.b };
  const [ca, cb] = RIVAL_COLORS[Math.abs(hash(A.name + B.name)) % RIVAL_COLORS.length]; A.c = ca; B.c = cb;
  const STATS = d.stats.map((s) => ({ ...s, aWins: (s.higher === false) ? s.a < s.b : s.a > s.b }));
  const T0 = 3.2, STEP = 3.2, WIN = T0 + STATS.length * STEP + 0.4;
  const duration = WIN + 6;
  const S = [{ t: 0.15, type: "boom" }, { t: 0.2, type: "whoosh" }, { t: 1.0, type: "pop" }, { t: 1.3, type: "pop", f: 900 }, { t: 1.8, type: "boom" }];
  STATS.forEach((s, i) => { const t = T0 + i * STEP; S.push({ t, type: "whoosh" }, { t: t + 0.3, type: "riser", len: 1.4 }, { t: t + 1.8, type: "ding", f: s.aWins ? 880 : 988 }); });
  S.push({ t: WIN - 0.9, type: "roll", len: 0.9 }, { t: WIN, type: "boom" }, { t: WIN, type: "ding", f: 1318 }, { t: WIN + 3.2, type: "pop" });
  const draw = (ctx, t, E) => {
    const { rr, txt, emoji, grad, rays, confetti } = kit(ctx, E);
    grad("#14213D", "#000814"); rays(t, "#FCA311", 0.06);
    const hy = 250;
    txt(d.title || "¿QUIÉN GANARÍA?", FW / 2, 110, { size: 92, font: "B", color: "#FCA311", stroke: "#000", lw: 12, scale: pop(t, 0.2, 0.5), max: 660 });
    [[A, FW * 0.25, 0.9], [B, FW * 0.75, 1.2]].forEach(([p, x, at]) => {
      const s = pop(t, at, 0.45);
      ctx.save(); ctx.globalAlpha = clamp(s); ctx.beginPath(); ctx.arc(x, hy + 40, Math.max(0, 120 * s), 0, 7); ctx.fillStyle = p.c; ctx.fill(); ctx.restore();
      emoji(p.emoji, x, hy + 45, 150, { scale: s });
      txt(p.name.toUpperCase(), x, hy + 205, { size: 44, font: "B", stroke: "#000", lw: 8, alpha: s, max: 300 });
    });
    txt("VS", FW / 2, hy + 40, { size: 110 * (1 + 0.06 * Math.sin(t * 8)), font: "B", color: "#fff", stroke: "#E63946", lw: 14, scale: pop(t, 1.8, 0.4) });
    let sa = 0, sb = 0;
    STATS.forEach((s, i) => { if (t > T0 + i * STEP + 1.8) { if (s.aWins) sa++; else sb++; } });
    if (t > T0 - 0.3 && t < WIN) { txt(`${sa}`, FW * 0.25, hy + 265, { size: 64, font: "B", color: A.c, stroke: "#000", lw: 8 }); txt(`${sb}`, FW * 0.75, hy + 265, { size: 64, font: "B", color: B.c, stroke: "#000", lw: 8 }); }
    STATS.forEach((s, i) => {
      const t0 = T0 + i * STEP; if (t < t0 || t > t0 + STEP || t > WIN) return;
      const y = 780, ap = easeOut(prog(t, t0, t0 + 0.35)), fill = easeOut(prog(t, t0 + 0.3, t0 + 1.7));
      ctx.save(); ctx.globalAlpha = ap; ctx.translate((1 - ap) * 300, 0);
      rr(50, y - 120, FW - 100, 470, 36); ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fill();
      txt(`RONDA ${i + 1}`, FW / 2, y - 70, { size: 30, font: "N", color: "#FCA311" });
      txt(s.label.toUpperCase(), FW / 2, y - 15, { size: 72, font: "B", stroke: "#000", lw: 8, max: 600 });
      if (s.higher === false) txt("(gana el que menos)", FW / 2, y + 30, { size: 24, font: "N", color: "#bbb" });
      const mx = Math.max(s.a, s.b) || 1;
      [[A, s.a, y + 100, s.aWins], [B, s.b, y + 230, !s.aWins]].forEach(([p, v, by, win]) => {
        const done = t > t0 + 1.8;
        emoji(p.emoji, 110, by, 64);
        rr(160, by - 34, FW - 230, 68, 34); ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fill();
        rr(160, by - 34, Math.max(68, (FW - 230) * (v / mx) * fill), 68, 34); ctx.fillStyle = done && !win ? "#555" : p.c; ctx.fill();
        txt(num(v * fill, s.dec ?? 0) + (s.unit ? " " + s.unit : ""), 190, by + 2, { size: 38, font: "M", align: "left", stroke: "rgba(0,0,0,.5)", lw: 6 });
        if (done && win) emoji("✅", FW - 95, by, 54, { scale: pop(t, t0 + 1.8, 0.3) });
      });
      ctx.restore();
    });
    if (t >= WIN) {
      confetti(t, WIN);
      const p = sa >= sb ? A : B, s = pop(t, WIN, 0.5);
      rr(60, 600, FW - 120, 520, 40); ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fill();
      txt("GANADOR", FW / 2, 680, { size: 90, font: "B", color: "#FCA311", stroke: "#000", lw: 12, scale: s });
      emoji(p.emoji, FW / 2, 850, 230, { scale: s });
      txt(p.name.toUpperCase(), FW / 2, 1000, { size: 80, font: "B", stroke: "#000", lw: 10, scale: s, max: 560 });
      txt(`${Math.max(sa, sb)} a ${Math.min(sa, sb)}`, FW / 2, 1070, { size: 40, font: "N", color: "#ddd", alpha: s });
      if (t > WIN + 3.2) txt("¿Estás de acuerdo? 👇", FW / 2, 1185, { size: 50, font: "M", stroke: "#000", lw: 8, scale: pop(t, WIN + 3.2, 0.4) });
    } else if (d.note) txt(d.note, FW / 2, FH - 90, { size: 22, font: "N", color: "rgba(255,255,255,.45)", max: 660 });
    if (o.brand) txt(o.brand, FW / 2, FH - 46, { size: 26, font: "N", color: "rgba(255,255,255,.7)" });
  };
  return { duration, sounds: S, music: { bpm: 112, chords: [[110, 165, 220], [98, 147, 196], [87, 131, 175], [98, 147, 196]], vol: 1.2 }, draw, emojis: [A.emoji, B.emoji, "✅", "👇"] };
}

// ---------------- ¿Cuánto costaba? ----------------
function planPrecios(d, o) {
  const ITEMS = d.items;
  const T0 = 2.6, STEP = 4.2, END = T0 + ITEMS.length * STEP;
  const duration = END + 3.6;
  const S = [{ t: 0.2, type: "whoosh" }, { t: 0.35, type: "pop", f: 500 }, { t: 1.1, type: "cash" }];
  ITEMS.forEach((it, i) => { const t = T0 + i * STEP; S.push({ t, type: "whoosh" }, { t: t + 0.5, type: "riser", len: 0.9 }, { t: t + 1.45, type: "cash" }, { t: t + 2.3, type: "pop", f: 600 }, { t: t + 3.0, type: "boom" }); });
  S.push({ t: END + 0.3, type: "ding", f: 784 });
  const eu = (v) => v < 100 ? num(v, 2) + " €" : num(Math.round(v)) + " €";
  const draw = (ctx, t, E) => {
    const { rr, txt, emoji, grad } = kit(ctx, E);
    grad("#F4E3C1", "#E9C46A");
    ctx.save(); ctx.globalAlpha = 0.18; for (let i = 0; i < 5; i++) { ctx.fillStyle = ["#E76F51", "#F4A261", "#2A9D8F", "#264653", "#E76F51"][i]; ctx.fillRect(0, 1040 + i * 26, FW, 18); } ctx.restore();
    txt("¿CUÁNTO COSTABA", FW / 2, 105, { size: 74, font: "B", color: "#264653", scale: pop(t, 0.3, 0.5) });
    txt(`EN ${d.year}?`, FW / 2, 190, { size: 120, font: "B", color: "#E76F51", stroke: "#264653", lw: 10, scale: pop(t, 0.6, 0.5), rot: -0.04 });
    if (t < T0) { emoji("🪙", FW / 2, 520, 220, { scale: pop(t, 1.1, 0.4), rot: Math.sin(t * 6) * 0.2 }); txt("…y cuánto cuesta hoy", FW / 2, 720, { size: 44, font: "N", color: "#264653", alpha: prog(t, 1.4, 1.8) }); }
    ITEMS.forEach((it, i) => {
      const t0 = T0 + i * STEP; if (t < t0 || t > t0 + STEP || t > END) return;
      const ap = easeOut(prog(t, t0, t0 + 0.35)), out = prog(t, t0 + STEP - 0.25, t0 + STEP);
      ctx.save(); ctx.globalAlpha = ap * (1 - out); ctx.translate((1 - ap) * FW * 0.6 - out * FW * 0.6, 0);
      rr(50, 300, FW - 100, 700, 40); ctx.fillStyle = "#FFF8EC"; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = "#264653"; ctx.stroke();
      emoji(it.emoji, FW / 2, 420, 150);
      txt(it.name, FW / 2, 545, { size: 46, font: "M", color: "#264653", max: 580 });
      const c1 = easeOut(prog(t, t0 + 0.5, t0 + 1.4));
      txt(String(d.year), FW * 0.3, 640, { size: 34, font: "N", color: "#8a6d3b" });
      txt(num(Math.round(it.ptas * c1)) + " pesetas", FW * 0.3, 700, { size: 40, font: "M", color: "#E76F51", max: 300 });
      txt(`(${eu(it.ptas / 166.386)})`, FW * 0.3, 750, { size: 30, font: "N", color: "#8a6d3b", alpha: prog(t, t0 + 1.4, t0 + 1.6) });
      const c2 = pop(t, t0 + 2.3, 0.35);
      txt("HOY", FW * 0.72, 640, { size: 34, font: "N", color: "#2A9D8F", alpha: c2 });
      txt(eu(it.today), FW * 0.72, 702, { size: 54, font: "M", color: "#2A9D8F", scale: c2, max: 280 });
      ctx.fillStyle = "#264653"; ctx.fillRect(FW / 2 - 2, 620, 4, 150);
      const m = it.today / (it.ptas / 166.386);
      if (t > t0 + 3.0) { const s = pop(t, t0 + 3.0, 0.35); ctx.save(); ctx.translate(FW / 2, 880); ctx.rotate(-0.08); ctx.scale(Math.max(0.001, s), Math.max(0.001, s)); rr(-180, -60, 360, 120, 30); ctx.fillStyle = "#E76F51"; ctx.fill(); ctx.restore(); txt(`× ${num(m, m < 10 ? 1 : 0)} ${it.word || "más caro"}`, FW / 2, 880, { size: 44, font: "B", scale: s, rot: -0.08, max: 330 }); }
      ctx.restore();
      for (let j = 0; j < ITEMS.length; j++) { ctx.beginPath(); ctx.arc(FW / 2 + (j - (ITEMS.length - 1) / 2) * 34, 1060, 9, 0, 7); ctx.fillStyle = j <= i ? "#264653" : "rgba(38,70,83,.25)"; ctx.fill(); }
    });
    if (t > END) {
      const s = pop(t, END + 0.2, 0.5);
      txt("¿Qué te sorprende más?", FW / 2, 560, { size: 48, font: "M", color: "#264653", scale: s, max: 660 });
      emoji("👇", FW / 2, 700, 120, { scale: s });
      txt("Cuéntalo en comentarios", FW / 2, 840, { size: 40, font: "N", color: "#264653", alpha: s });
    }
    txt(d.note || "Cifras aproximadas · 1 € = 166,386 pesetas", FW / 2, FH - 90, { size: 22, font: "N", color: "rgba(38,70,83,.6)", max: 660 });
    if (o.brand) txt(o.brand, FW / 2, FH - 46, { size: 26, font: "N", color: "rgba(38,70,83,.75)" });
  };
  return { duration, sounds: S, music: { bpm: 96, chords: [[131, 165, 196], [110, 131, 165], [147, 175, 220], [98, 123, 147]], vol: 1.1 }, draw, emojis: [...ITEMS.map((x) => x.emoji), "🪙", "👇"] };
}

// ---------------- Piensa un número ----------------
// Los trucos se generan con código: el resultado siempre es correcto
const OPS = { mul: "✖️", add: "➕", div: "➗", sub: "➖", think: "🤔", sum: "🔢" };
export function makeNumero(seed = Date.now()) {
  const R = rng(seed); const pick = (a) => a[Math.floor(R() * a.length)];
  const k = 2 + Math.floor(R() * 8);
  const range = pick([[1, 10], [1, 20], [1, 50]]);
  const think = { e: OPS.think, a: "Piensa un número", b: `del ${range[0]} al ${range[1]}` };
  const fam = Math.floor(R() * 4);
  let steps, result;
  if (fam === 0) { steps = [think, { e: OPS.mul, a: "Multiplícalo", b: "por 2" }, { e: OPS.add, a: "Súmale", b: String(2 * k) }, { e: OPS.div, a: "Divídelo", b: "entre 2" }, { e: OPS.sub, a: "Réstale el número", b: "que pensaste" }]; result = k; }
  else if (fam === 1) { steps = [think, { e: OPS.mul, a: "Multiplícalo", b: "por 3" }, { e: OPS.add, a: "Súmale", b: String(3 * k) }, { e: OPS.div, a: "Divídelo", b: "entre 3" }, { e: OPS.sub, a: "Réstale el número", b: "que pensaste" }]; result = k; }
  else if (fam === 2) { steps = [think, { e: OPS.add, a: "Súmale el número", b: "siguiente" }, { e: OPS.add, a: "Súmale", b: String(2 * k - 1) }, { e: OPS.div, a: "Divídelo", b: "entre 2" }, { e: OPS.sub, a: "Réstale el número", b: "que pensaste" }]; result = k; }
  else { const r = 1 + Math.floor(R() * 8); steps = [{ e: OPS.think, a: "Piensa un número", b: "del 1 al 9" }, { e: OPS.mul, a: "Multiplícalo", b: "por 9" }, { e: OPS.sum, a: "Suma sus", b: "dos cifras" }, { e: OPS.sub, a: "Réstale", b: String(r) }]; result = 9 - r; }
  return { steps, result };
}
function planNumero(d, o) {
  const STEPS = d.steps, T0 = 2.4, STEP = 5, REV = T0 + STEPS.length * STEP + 1.6;
  const duration = REV + 5;
  const S = [{ t: 0.2, type: "ding", f: 1568 }, { t: 0.5, type: "whoosh" }];
  STEPS.forEach((s, i) => { const t = T0 + i * STEP; S.push({ t, type: "pop", f: 520 + i * 60 }); for (let k = 1; k <= 4; k++) S.push({ t: t + 0.3 + k * 0.95, type: "tick" }); });
  S.push({ t: REV - 1.6, type: "roll", len: 1.6 }, { t: REV, type: "boom" }, { t: REV, type: "ding", f: 1318 }, { t: REV + 0.1, type: "ding", f: 1975 });
  const stars = Array.from({ length: 70 }, (_, i) => [Math.abs(Math.sin(i * 12.9898)) * FW, Math.abs(Math.sin(i * 78.233)) * FH, 1 + (i % 3)]);
  const draw = (ctx, t, E) => {
    const { txt, emoji, grad, confetti } = kit(ctx, E);
    grad("#2B0A4F", "#0B0420");
    for (const [x, y, r] of stars) { ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + x)); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    const pulse = 1 + 0.04 * Math.sin(t * 3);
    const g = ctx.createRadialGradient(FW / 2, 330, 10, FW / 2, 330, 170 * pulse); g.addColorStop(0, "rgba(199,125,255,.9)"); g.addColorStop(1, "rgba(199,125,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(FW / 2, 330, 170 * pulse, 0, 7); ctx.fill();
    emoji("🔮", FW / 2, 330, 170, { scale: pop(t, 0.2, 0.5) });
    txt("VOY A ADIVINAR", FW / 2, 90, { size: 70, font: "B", color: "#E0AAFF", stroke: "#10002B", lw: 10, scale: pop(t, 0.4, 0.4) });
    txt("TU NÚMERO", FW / 2, 165, { size: 70, font: "B", color: "#FFD60A", stroke: "#10002B", lw: 10, scale: pop(t, 0.7, 0.4) });
    if (t < T0) txt("Haz lo que te diga 👇", FW / 2, 640, { size: 46, font: "M", alpha: prog(t, 1.2, 1.6) });
    STEPS.forEach((s, i) => {
      const t0 = T0 + i * STEP; if (t < t0 || t >= t0 + STEP) return;
      const ap = pop(t, t0, 0.35), out = prog(t, t0 + STEP - 0.2, t0 + STEP);
      ctx.save(); ctx.globalAlpha = 1 - out;
      txt(`PASO ${i + 1} DE ${STEPS.length}`, FW / 2, 590, { size: 30, font: "N", color: "#C77DFF", alpha: 1 - out });
      emoji(s.e, FW / 2, 700, 110, { scale: ap, alpha: 1 - out });
      txt(s.a, FW / 2, 830, { size: 60, font: "M", scale: ap, alpha: 1 - out, max: 640 });
      txt(s.b, FW / 2, 910, { size: 76, font: "B", color: "#FFD60A", stroke: "#10002B", lw: 8, scale: ap, alpha: 1 - out, max: 640 });
      const p = prog(t, t0 + 0.3, t0 + STEP - 0.2);
      ctx.lineWidth = 12; ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.beginPath(); ctx.arc(FW / 2, 1060, 50, 0, 7); ctx.stroke();
      ctx.strokeStyle = "#C77DFF"; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(FW / 2, 1060, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p)); ctx.stroke();
      txt(String(Math.max(1, Math.ceil((1 - p) * 4))), FW / 2, 1062, { size: 44, font: "M", alpha: 1 - out });
      ctx.restore();
    });
    if (t >= REV - 1.6 && t < REV) txt("Tu resultado es…", FW / 2, 760, { size: 62, font: "M", scale: 1 + 0.05 * Math.sin(t * 20) });
    if (t >= REV) {
      confetti(t, REV, 70);
      const s = pop(t, REV, 0.5);
      const g2 = ctx.createRadialGradient(FW / 2, 800, 10, FW / 2, 800, 260); g2.addColorStop(0, "rgba(255,214,10,.55)"); g2.addColorStop(1, "rgba(255,214,10,0)"); ctx.fillStyle = g2; ctx.fillRect(0, 500, FW, 600);
      txt(String(d.result), FW / 2, 800, { size: 330, font: "B", color: "#FFD60A", stroke: "#10002B", lw: 16, scale: s });
      if (t > REV + 1.8) txt("¿Lo he adivinado? 😏", FW / 2, 1040, { size: 54, font: "M", scale: pop(t, REV + 1.8, 0.4) });
      if (t > REV + 2.8) txt("Pruébalo con alguien 👉", FW / 2, 1120, { size: 40, font: "N", color: "#E0AAFF", alpha: prog(t, REV + 2.8, REV + 3.1) });
    }
    if (o.brand) txt(o.brand, FW / 2, FH - 46, { size: 26, font: "N", color: "rgba(255,255,255,.6)" });
  };
  return { duration, sounds: S, music: { bpm: 84, chords: [[110, 131, 165], [98, 123, 147], [87, 110, 131], [82, 104, 123]], vol: 1.3 }, draw, emojis: [...STEPS.map((s) => s.e), "🔮"] };
}

// ---------------- Piano fácil ----------------
// Melodías de dominio público, solo teclas blancas. Notas: nombre + octava (SOL3, DO4…), duración en pulsos
const NAMES = ["DO", "RE", "MI", "FA", "SOL", "LA", "SI"], SEMI = [0, 2, 4, 5, 7, 9, 11];
const COLORS = ["#EF476F", "#F78C6B", "#FFD166", "#06D6A0", "#118AB2", "#8338EC", "#FF006E"];
const parse = (s) => s.trim().split(/\s+/).map((tok) => { const m = tok.match(/^([A-Z]+)(\d)(?::([\d.]+))?$/); if (!m) throw new Error(`Nota inválida: ${tok}`); return { n: NAMES.indexOf(m[1]), o: Number(m[2]), d: Number(m[3] ?? 1) }; });
export const SONGS = {
  himno: { title: "HIMNO DE LA ALEGRÍA", by: "Beethoven", beat: 0.5, notes: "MI4 MI4 FA4 SOL4 SOL4 FA4 MI4 RE4 DO4 DO4 RE4 MI4 MI4:1.5 RE4:0.5 RE4:2 MI4 MI4 FA4 SOL4 SOL4 FA4 MI4 RE4 DO4 DO4 RE4 MI4 RE4:1.5 DO4:0.5 DO4:2" },
  estrellita: { title: "ESTRELLITA, ¿DÓNDE ESTÁS?", by: "Canción popular", beat: 0.45, notes: "DO4 DO4 SOL4 SOL4 LA4 LA4 SOL4:2 FA4 FA4 MI4 MI4 RE4 RE4 DO4:2 SOL4 SOL4 FA4 FA4 MI4 MI4 RE4:2 SOL4 SOL4 FA4 FA4 MI4 MI4 RE4:2" },
  cascabel: { title: "CASCABEL", by: "Villancico popular", beat: 0.42, notes: "MI4 MI4 MI4:2 MI4 MI4 MI4:2 MI4 SOL4 DO4:1.5 RE4:0.5 MI4:4 FA4 FA4 FA4:1.5 FA4:0.5 FA4 MI4 MI4 MI4:0.5 MI4:0.5 MI4 RE4 RE4 MI4 RE4:2 SOL4:2" },
  martinillo: { title: "MARTINILLO", by: "Canción popular", beat: 0.45, notes: "DO4 RE4 MI4 DO4 DO4 RE4 MI4 DO4 MI4 FA4 SOL4:2 MI4 FA4 SOL4:2 SOL4:0.75 LA4:0.25 SOL4:0.5 FA4:0.5 MI4 DO4 SOL4:0.75 LA4:0.25 SOL4:0.5 FA4:0.5 MI4 DO4 DO4 SOL3 DO4:2 DO4 SOL3 DO4:2" },
  nochedepaz: { title: "NOCHE DE PAZ", by: "Villancico (Gruber)", beat: 0.42, notes: "SOL4:1.5 LA4:0.5 SOL4 MI4:3 SOL4:1.5 LA4:0.5 SOL4 MI4:3 RE5:2 RE5 SI4:3 DO5:2 DO5 SOL4:3 LA4:2 LA4 DO5:1.5 SI4:0.5 LA4 SOL4:1.5 LA4:0.5 SOL4 MI4:3" },
};
export function makePiano(key) { const s = SONGS[key]; if (!s) throw new Error(`Canción desconocida: ${key}`); return { song: key }; }
function planPiano(d, o) {
  const song = SONGS[d.song]; const mel = parse(song.notes);
  const idx = (n) => n.o * 7 + n.n;
  let lo = Math.min(...mel.map(idx)), hi = Math.max(...mel.map(idx));
  while (hi - lo + 1 < 8) { if ((hi - lo) % 2) lo--; else hi++; }
  if (hi - lo + 1 > 11) throw new Error("Canción con demasiado rango para el teclado");
  const keys = []; for (let i = lo; i <= hi; i++) { const n = i % 7, oc = Math.floor(i / 7); keys.push({ name: NAMES[n], f: 261.63 * Math.pow(2, (oc - 4) + SEMI[n] / 12), color: COLORS[n] }); }
  const BEAT = song.beat, START = 3.2, FALL = 2.0;
  let acc = 0; const NOTES = mel.map((m) => { const n = { k: idx(m) - lo, t: START + acc * BEAT, len: m.d * BEAT }; acc += m.d; return n; });
  const END = START + acc * BEAT, duration = END + 3.8;
  const S = [{ t: 0.2, type: "ding", f: 1046 }, ...NOTES.map((n) => ({ t: n.t, type: "piano", f: keys[n.k].f })), { t: END + 0.6, type: "pop" }];
  const KW = FW / keys.length, KY = 1000, KH = 200, TOP = 330;
  const draw = (ctx, t, E) => {
    const { rr, txt, grad } = kit(ctx, E);
    grad("#0D1B2A", "#1B263B");
    txt("PIANO FÁCIL 🎹", FW / 2, 80, { size: 46, font: "M", color: "#90E0EF", scale: pop(t, 0.2, 0.4) });
    txt(song.title, FW / 2, 150, { size: 64, font: "B", color: "#FFD166", stroke: "#000", lw: 8, scale: pop(t, 0.5, 0.4), max: 680 });
    for (let i = 0; i < keys.length; i++) { ctx.fillStyle = i % 2 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)"; ctx.fillRect(i * KW, TOP, KW, KY - TOP); }
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(0, KY - 3, FW, 3);
    const pxs = (KY - TOP) / FALL;
    let active = -1, cur = null;
    for (const n of NOTES) {
      const yb = KY - (n.t - t) * pxs, h = Math.max(30, n.len * pxs - 8);
      if (t >= n.t && t < n.t + n.len) { active = n.k; cur = n; }
      if (yb < TOP || yb - h > KY + 2) continue;
      const top = Math.max(TOP, yb - h), bot = Math.min(KY, yb); if (bot <= top) continue;
      rr(n.k * KW + 6, top, KW - 12, bot - top, 12); ctx.fillStyle = keys[n.k].color; ctx.fill();
      if (bot - top > 40) txt(keys[n.k].name, n.k * KW + KW / 2, bot - 24, { size: 24, font: "M", color: "#000", max: KW - 16 });
    }
    for (let i = 0; i < keys.length; i++) { const on = i === active; rr(i * KW + 3, KY, KW - 6, KH, 10); ctx.fillStyle = on ? keys[i].color : "#F8F9FA"; ctx.fill(); txt(keys[i].name, i * KW + KW / 2, KY + KH - 34, { size: 26, font: "M", color: on ? "#000" : "#777", max: KW - 10 }); }
    // Teclas negras (decorativas) entre DO-RE, RE-MI, FA-SOL, SOL-LA, LA-SI
    for (let i = 0; i < keys.length - 1; i++) { const n = (lo + i) % 7; if ([0, 1, 3, 4, 5].includes(n)) { rr((i + 1) * KW - KW * 0.27, KY, KW * 0.54, KH * 0.58, 6); ctx.fillStyle = "#111"; ctx.fill(); } }
    if (t < 1.2) txt(`${song.by} · ${new Set(mel.map(idx)).size} teclas`, FW / 2, 265, { size: 34, font: "N", color: "#ccc", alpha: prog(t, 0.6, 0.9) });
    else if (t < START) txt("¡Toca conmigo!", FW / 2, 268, { size: 56, font: "M", scale: pop(t, 1.2, 0.4) });
    else if (cur && t < END) txt(keys[cur.k].name, FW / 2, 268, { size: 92, font: "B", color: keys[cur.k].color, stroke: "#000", lw: 8, scale: 0.8 + 0.2 * pop(t, cur.t, 0.15) });
    if (t > END + 0.5) {
      ctx.fillStyle = "rgba(13,27,42,.88)"; ctx.fillRect(0, 210, FW, KY - 210);
      const s = pop(t, END + 0.6, 0.4);
      txt("¿Qué canción", FW / 2, 520, { size: 60, font: "M", scale: s });
      txt("toco mañana? 👇", FW / 2, 600, { size: 60, font: "M", scale: s });
      txt("Escríbela en comentarios", FW / 2, 700, { size: 36, font: "N", color: "#90E0EF", alpha: s });
    }
    if (o.brand) txt(o.brand, FW / 2, FH - 46, { size: 26, font: "N", color: "rgba(255,255,255,.6)" });
  };
  return { duration, sounds: S, music: null, draw, emojis: [] };
}

function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) | 0; return h; }
function rng(seed) { let s = (Math.abs(Number(seed)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const PLAN = { ganaria: planGanaria, precios: planPrecios, numero: planNumero, piano: planPiano };
export function planFormat(spec) {
  const f = PLAN[spec?.format]; if (!f) throw new Error(`Formato desconocido: ${spec?.format}`);
  const p = f(spec.data, { brand: spec.brand ?? "" });
  return { ...p, emojis: [...new Set([...p.emojis, ...TEXT_EMOJIS])] };
}

// Validación de los datos (los de la IA nunca se montan sin pasar por aquí)
export function validateFormat(format, d) {
  const e = [];
  const isNum = (x) => typeof x === "number" && isFinite(x) && x >= 0;
  const em = (x) => typeof x === "string" && x.length > 0 && x.length <= 16;
  if (format === "ganaria") {
    for (const k of ["a", "b"]) if (!d?.[k] || !em(d[k].emoji) || !d[k].name || String(d[k].name).length > 22) e.push(`Rival ${k} incompleto`);
    if (!Array.isArray(d?.stats) || d.stats.length !== 5) e.push("Tienen que ser 5 rondas");
    for (const s of d?.stats ?? []) { if (!s.label || String(s.label).length > 18) e.push("Ronda sin nombre o demasiado larga"); if (!isNum(s.a) || !isNum(s.b) || s.a === s.b) e.push(`Valores inválidos en «${s.label}»`); }
  } else if (format === "precios") {
    if (!(d?.year >= 1960 && d.year <= 2001)) e.push("Año fuera de la época de la peseta");
    if (!Array.isArray(d?.items) || d.items.length !== 5) e.push("Tienen que ser 5 productos");
    for (const it of d?.items ?? []) { if (!em(it.emoji) || !it.name || String(it.name).length > 26) e.push("Producto incompleto"); if (!isNum(it.ptas) || !isNum(it.today) || it.ptas <= 0 || it.today <= 0) e.push(`Precio inválido en «${it.name}»`); }
  } else if (format === "numero") {
    if (!Array.isArray(d?.steps) || d.steps.length < 3 || !Number.isInteger(d.result)) e.push("Truco incompleto");
  } else if (format === "piano") {
    if (!SONGS[d?.song]) e.push("Canción desconocida"); else try { parse(SONGS[d.song].notes); } catch (x) { e.push(x.message); }
  } else e.push("Formato desconocido");
  return { ok: !e.length, errors: e };
}
