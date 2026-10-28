// PIX — la mascota de Reto Imposible: un pequeño robot geométrico con un solo ojo.
// Se define una sola vez como lista de formas simples y se pinta igual en Canvas (vídeo y web) o en SVG.
// No necesita imágenes generadas: cada expresión es código.
export const PIX_EXPRESSIONS = { normal: "Normal", curious: "Curioso", surprised: "Sorprendido", happy: "Contento", thinking: "Pensando", nervous: "Nervioso", victory: "Victoria", error: "Error" };
const C = { body: "#FFC83D", bodyDark: "#E5A91C", head: "#F4F6FA", headDark: "#D5DBE5", screen: "#243041", eye: "#5EE6F0", eyeHot: "#FFFFFF", line: "#1C2330", cheek: "#FF8FA3", ok: "#22C55E", bad: "#F87171", spark: "#FFC83D" };

// Formas en un lienzo de 100×130 unidades con el origen en el centro de los pies.
// rr: rectángulo redondeado · c: círculo · e: elipse · p: polígono · l: línea · a: arco (trazo)
export function pixShapes(expr = "normal", k = 0) {
  const S = [], bob = Math.sin(k * Math.PI * 2) * 1.5;
  const eyeCol = expr === "error" ? C.bad : expr === "victory" || expr === "happy" ? "#7CF5C4" : C.eye;
  // Brazos: grados por encima de la horizontal (hacia fuera); negativo = hacia abajo
  const arms = { victory: [62, 62], happy: [30, 30], surprised: [48, 48], nervous: [-25, -70], thinking: [-55, 75], error: [-78, -78], curious: [-45, 28] }[expr] || [-50, -50];
  const arm = (side, deg) => { const a = (deg * Math.PI) / 180, sx = side * 24, sy = -46 + bob, ex = sx + side * Math.cos(a) * 21, ey = sy - Math.sin(a) * 21; S.push({ t: "l", x1: sx, y1: sy, x2: ex, y2: ey, w: 7, stroke: C.bodyDark }); S.push({ t: "c", x: ex, y: ey, r: 6, fill: C.head, stroke: C.headDark, sw: 1.5 }); };
  // sombra y pies (ruedas)
  S.push({ t: "e", x: 0, y: 0, rx: 30, ry: 6, fill: "rgba(20,24,32,0.18)" });
  S.push({ t: "rr", x: -26, y: -13, w: 20, h: 13, r: 6, fill: C.line }, { t: "rr", x: 6, y: -13, w: 20, h: 13, r: 6, fill: C.line });
  arm(-1, arms[0]); arm(1, arms[1]);
  // cuerpo
  S.push({ t: "rr", x: -26, y: -58 + bob, w: 52, h: 46, r: 14, fill: C.bodyDark });
  S.push({ t: "rr", x: -26, y: -60 + bob, w: 52, h: 42, r: 14, fill: C.body });
  S.push({ t: "rr", x: -12, y: -48 + bob, w: 24, h: 16, r: 5, fill: "rgba(255,255,255,0.45)" });
  S.push({ t: "c", x: -5, y: -40 + bob, r: 2.4, fill: expr === "error" ? C.bad : C.ok }, { t: "c", x: 5, y: -40 + bob, r: 2.4, fill: C.line });
  // cabeza con pantalla
  const hy = -112 + bob + (expr === "surprised" ? -3 : 0);
  S.push({ t: "rr", x: -31, y: hy + 3, w: 62, h: 52, r: 18, fill: C.headDark });
  S.push({ t: "rr", x: -31, y: hy, w: 62, h: 50, r: 18, fill: C.head });
  S.push({ t: "rr", x: -24, y: hy + 7, w: 48, h: 36, r: 12, fill: C.screen });
  // antena
  const tilt = expr === "curious" ? 8 : expr === "thinking" ? -6 : 0;
  S.push({ t: "l", x1: 0, y1: hy, x2: tilt, y2: hy - 13, w: 3.5, stroke: C.line });
  S.push({ t: "c", x: tilt, y: hy - 16, r: 5, fill: expr === "error" ? C.bad : expr === "victory" || expr === "happy" ? C.ok : expr === "nervous" ? "#FF9F43" : C.spark });
  // ojo (la expresión vive en el ojo)
  const ex = expr === "thinking" ? 6 : expr === "curious" ? 3 : 0, ey = hy + 25 + (expr === "thinking" ? -4 : 0);
  if (expr === "happy" || expr === "victory") { S.push({ t: "a", x: ex, y: ey + 5, r: 10, a0: Math.PI * 1.1, a1: Math.PI * 1.9, w: 5, stroke: eyeCol }); if (expr === "victory") S.push({ t: "p", pts: star(ex, ey - 1, 4.5, 2), fill: C.eyeHot }); }
  else if (expr === "error") { S.push({ t: "l", x1: ex - 8, y1: ey - 8, x2: ex + 8, y2: ey + 8, w: 5, stroke: eyeCol }, { t: "l", x1: ex + 8, y1: ey - 8, x2: ex - 8, y2: ey + 8, w: 5, stroke: eyeCol }); }
  else {
    const r = { surprised: 13, curious: 11, nervous: 8, thinking: 9 }[expr] || 10;
    S.push({ t: "c", x: ex, y: ey, r: r + 3, fill: "rgba(94,230,240,0.18)" }, { t: "c", x: ex, y: ey, r, fill: eyeCol });
    const pr = expr === "surprised" ? 3.5 : 4.5, px = expr === "thinking" ? 3 : expr === "nervous" ? -2 : 1, py = expr === "thinking" ? -3 : 0;
    S.push({ t: "c", x: ex + px, y: ey + py, r: pr, fill: C.screen }, { t: "c", x: ex + px + 2.5, y: ey + py - 3, r: 1.6, fill: C.eyeHot });
    if (expr === "curious") S.push({ t: "l", x1: ex - 11, y1: ey - 16, x2: ex + 9, y2: ey - 19, w: 3, stroke: eyeCol });
    if (expr === "nervous") S.push({ t: "l", x1: ex - 10, y1: ey - 14, x2: ex + 10, y2: ey - 11, w: 3, stroke: eyeCol });
  }
  // detalles de cada expresión
  if (expr === "happy" || expr === "victory") S.push({ t: "c", x: -17, y: hy + 36, r: 3.5, fill: C.cheek }, { t: "c", x: 17, y: hy + 36, r: 3.5, fill: C.cheek });
  if (expr === "nervous") S.push({ t: "p", pts: drop(33, hy + 12, 5), fill: "#7FD3F7" });
  if (expr === "surprised") S.push({ t: "rr", x: 38, y: hy - 6, w: 6, h: 16, r: 3, fill: C.bad }, { t: "c", x: 41, y: hy + 15, r: 3.2, fill: C.bad });
  if (expr === "thinking") S.push({ t: "c", x: 38, y: hy - 2, r: 3, fill: C.headDark }, { t: "c", x: 46, y: hy - 12, r: 4.5, fill: C.headDark }, { t: "c", x: 56, y: hy - 26, r: 7, fill: C.headDark });
  if (expr === "curious") S.push({ t: "q", x: 44, y: hy - 4, size: 20, fill: C.line });
  if (expr === "victory") for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; S.push({ t: "p", pts: star(Math.cos(a) * 58, hy + 20 + Math.sin(a) * 58, 6, 2.6), fill: [C.spark, C.ok, "#35B8C5", C.cheek, C.spark][i] }); }
  return S;
}
function star(cx, cy, r, ri) { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : r; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return p; }
function drop(cx, cy, r) { const p = [[cx, cy - r * 1.6]]; for (let i = 0; i <= 8; i++) { const a = -0.2 + (i / 8) * (Math.PI + 0.4); p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }

// Pinta a PIX en Canvas. (x, y) = centro de los pies; size = altura aproximada en píxeles.
export function drawPix(ctx, x, y, size, expr = "normal", k = 0, flip = false) {
  const s = size / 130;
  if (!(s > 0.001)) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
  for (const f of pixShapes(expr, k)) {
    ctx.beginPath();
    if (f.t === "rr") { const r = Math.min(f.r, f.w / 2, f.h / 2); ctx.moveTo(f.x + r, f.y); ctx.arcTo(f.x + f.w, f.y, f.x + f.w, f.y + f.h, r); ctx.arcTo(f.x + f.w, f.y + f.h, f.x, f.y + f.h, r); ctx.arcTo(f.x, f.y + f.h, f.x, f.y, r); ctx.arcTo(f.x, f.y, f.x + f.w, f.y, r); ctx.closePath(); }
    else if (f.t === "c") ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    else if (f.t === "e") ctx.ellipse(f.x, f.y, f.rx, f.ry, 0, 0, Math.PI * 2);
    else if (f.t === "p") { f.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); }
    else if (f.t === "l") { ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); }
    else if (f.t === "a") ctx.arc(f.x, f.y, f.r, f.a0, f.a1);
    else if (f.t === "q") { ctx.save(); if (flip) ctx.scale(-1, 1); ctx.font = `800 ${f.size}px Montserrat, sans-serif`; ctx.fillStyle = f.fill; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", flip ? -f.x : f.x, f.y); ctx.restore(); continue; }
    if (f.fill) { ctx.fillStyle = f.fill; ctx.fill(); }
    if (f.stroke) { ctx.strokeStyle = f.stroke; ctx.lineWidth = f.w || f.sw || 2; ctx.lineCap = "round"; ctx.stroke(); }
  }
  ctx.restore();
}

// La misma figura en SVG (para la web, miniaturas o redes)
export function pixSVG(expr = "normal", size = 130) {
  const el = pixShapes(expr).map((f) => {
    const st = `${f.fill ? `fill="${f.fill}"` : 'fill="none"'}${f.stroke ? ` stroke="${f.stroke}" stroke-width="${f.w || f.sw || 2}" stroke-linecap="round"` : ""}`;
    if (f.t === "rr") return `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${f.r}" ${st}/>`;
    if (f.t === "c") return `<circle cx="${f.x}" cy="${f.y}" r="${f.r}" ${st}/>`;
    if (f.t === "e") return `<ellipse cx="${f.x}" cy="${f.y}" rx="${f.rx}" ry="${f.ry}" ${st}/>`;
    if (f.t === "p") return `<polygon points="${f.pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" ${st}/>`;
    if (f.t === "l") return `<line x1="${f.x1}" y1="${f.y1}" x2="${f.x2}" y2="${f.y2}" ${st}/>`;
    if (f.t === "a") { const p0 = [f.x + f.r * Math.cos(f.a0), f.y + f.r * Math.sin(f.a0)], p1 = [f.x + f.r * Math.cos(f.a1), f.y + f.r * Math.sin(f.a1)]; return `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${f.r} ${f.r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" ${st}/>`; }
    if (f.t === "q") return `<text x="${f.x}" y="${f.y + f.size * 0.35}" font-family="Montserrat, sans-serif" font-weight="800" font-size="${f.size}" text-anchor="middle" fill="${f.fill}">?</text>`;
    return "";
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.25}" viewBox="-65 -165 130 172">${el}</svg>`;
}
