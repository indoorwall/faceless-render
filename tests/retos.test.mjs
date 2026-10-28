// Pruebas del motor de retos: node tests/retos.test.mjs
import * as E from "../web/retos/engine.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("✗", m); } };
const mechs = Object.values(E.CATEGORIES).flatMap((c) => c.mechanics);
// 1) Cada mecánica y dificultad genera retos válidos y distintos
for (const m of mechs) for (const d of E.DIFFS) {
  const sigs = new Set(); let n = 0;
  for (let i = 0; i < 300; i++) {
    const cat = Object.keys(E.CATEGORIES).find((k) => E.CATEGORIES[k].mechanics.includes(m));
    const c = E.makeChallenge({ category: cat, mechanic: m, difficulty: d, seed: `t-${m}-${d}-${i}` });
    const v = E.validateChallenge(c); ok(v.ok, `${m}/${d}#${i}: ${v.errors.join(", ")}`); sigs.add(c.signature); n++;
    ok(c.question && c.question.length > 3, `${m} sin pregunta`);
  }
  ok(sigs.size > n * (m.startsWith("odd_") ? 0.4 : m === "machine" ? (d === "easy" ? 0.1 : 0.3) : 0.6) || ["flags"].includes(m), `${m}/${d}: poca variedad (${sigs.size}/${n})`);
}
// 2) La validación detecta respuestas incorrectas
for (const m of mechs) {
  const cat = Object.keys(E.CATEGORIES).find((k) => E.CATEGORIES[k].mechanics.includes(m));
  const c = E.makeChallenge({ category: cat, mechanic: m, difficulty: "medium", seed: `neg-${m}` });
  const bad = JSON.parse(JSON.stringify(c));
  if ("option" in bad.answer) bad.answer.option = (bad.answer.option + 1) % 4;
  else if ("at" in bad.answer && "at" in bad.data) { bad.data.at = (bad.data.at + 1) % 5; }
  else if ("at" in bad.answer) bad.answer.at = (bad.answer.at + 1) % bad.data.before.length;
  else if ("key" in bad.answer) bad.answer.key = (bad.answer.key + 1) % bad.data.keys.length;
  else if ("diffs" in bad.answer) bad.answer.diffs = bad.answer.diffs.slice(1);
  else if ("entrance" in bad.answer) bad.answer.entrance = (bad.answer.entrance + 1) % 3;
  else if ("bucket" in bad.answer) bad.answer.bucket = (bad.answer.bucket + 1) % (bad.data.levels + 1);
  else if ("object" in bad.answer) { bad.data.items.find((i) => i.kind === "lamp").err = "x"; }
  ok(!E.validateChallenge(bad).ok, `${m}: la validación no detecta una respuesta manipulada`);
}
// 3) Proyecto largo de 25 retos progresivo y Short automático
const p = E.buildProject({ format: "long", count: 25, difficulty: "progressive", category: "mixed", seed: "piloto" });
const tl = E.timeline(p);
ok(p.challenges.length === 25, "el proyecto no tiene 25 retos");
ok(E.validateProject(p).ok, "proyecto no válido");
const cats = new Set(p.challenges.map((c) => c.category)); ok(cats.size >= 6, `poca variedad de categorías: ${[...cats]}`);
console.log("Largo: 25 retos,", Math.round(tl.duration), "s,", tl.events.length, "sonidos,", tl.voice.length, "frases de voz, puntos máx", tl.max_points, "| dificultades:", p.challenges.map((c) => c.difficulty[0]).join(""));
console.log("Rangos:", JSON.stringify(E.ranksFor(tl.max_points, E.DEFAULT_CONFIG.ranks)));
const pa = E.buildProject({ format: "long", difficulty: "progressive", category: "mixed", seed: "auto", minutes: 8 });
console.log("Largo automático para 8 min:", pa.challenges.length, "retos,", Math.round(E.timeline(pa).duration), "s");
const s = E.buildProject({ format: "short", difficulty: "progressive", category: "mixed", seed: "short" });
const ts = E.timeline(s); ok(ts.duration >= 15 && ts.duration <= 40, `Short fuera de 15-35 s: ${ts.duration}`);
console.log("Short:", s.challenges.length, "retos,", ts.duration, "s");
// 4) Sincronía: todos los eventos caen en un fotograma exacto y dentro del vídeo
ok(tl.events.every((e) => Math.abs(e.t * E.FPS - Math.round(e.t * E.FPS)) < 1e-6 && e.t >= 0 && e.t <= tl.duration), "eventos fuera de fotograma");
// Los tics terminan justo cuando acaba el temporizador
for (const sg of tl.segments.filter((x) => x.type === "challenge").slice(0, 5)) { const ticks = tl.events.filter((e) => (e.code === "S03" || e.code === "S04") && e.t >= sg.play[0] - 1e-6 && e.t < sg.play[1]); const last = ticks[ticks.length - 1]; ok(Math.abs(last.t - (sg.play[1] - 1)) < 1e-6, "el último tic no cae a 1 s del final"); ok(tl.events.some((e) => e.code === "S06" && Math.abs(e.t - sg.play[1]) < 1e-6), "falta el tiempo agotado justo al final"); }
// 5) Cambiar posiciones mantiene la solución correcta
for (const m of mechs) { const cat = Object.keys(E.CATEGORIES).find((k) => E.CATEGORIES[k].mechanics.includes(m)); for (let i = 0; i < 40; i++) { const c = E.makeChallenge({ category: cat, mechanic: m, difficulty: E.DIFFS[i % 4], seed: `rs-${m}-${i}` }); const x = E.reshuffle(c, `s${i}`); ok(E.validateChallenge(x).ok, `${m}: tras cambiar posiciones la solución no es válida`); } }
// 6) Diseño: las figuras repartidas caben en su caja y no se tocan
const { gridLayout, frameLayout } = await import("../web/retos/draw.js");
for (const n of [3, 4, 6, 9, 11, 12, 16, 20, 25, 30, 36]) for (const box of [{ x: 36, y: 452, w: 1008, h: 1138 }, { x: 0, y: 0, w: 486, h: 556 }, { x: 56, y: 172, w: 1808, h: 858 }]) for (const seed of ["a", "b", "c"]) {
  const g = gridLayout(n, box, `${n}-${seed}`, 0.41, 0.6);
  ok(g.pos.length === n, `rejilla ${n}: faltan posiciones`);
  ok(g.pos.every((p) => p.x - g.r >= box.x - 0.5 && p.x + g.r <= box.x + box.w + 0.5 && p.y - g.r >= box.y - 0.5 && p.y + g.r <= box.y + box.h + 0.5), `rejilla ${n}: figura fuera de la caja`);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) ok(Math.hypot(g.pos[i].x - g.pos[j].x, g.pos[i].y - g.pos[j].y) >= 2 * g.r, `rejilla ${n}: figuras solapadas`);
}
ok(frameLayout(1080, 1920).box.y + frameLayout(1080, 1920).box.h <= 1920 - 330, "el Short invade la zona de la interfaz de YouTube");
// 7) Dibujo en el servidor (node-canvas): fotogramas seguidos de todos los estilos sin que el lienzo se bloquee
let canvasMod = null; try { canvasMod = await import("canvas"); } catch (_) { console.log("(sin node-canvas: se omite la prueba de dibujo)"); }
if (canvasMod) {
  const { drawFrame } = await import("../web/retos/draw.js");
  for (const style of ["light", "arcade", "dark", "custom"]) for (const format of ["short", "long"]) {
    const challenges = mechs.map((m, i) => E.makeChallenge({ category: Object.keys(E.CATEGORIES).find((k) => E.CATEGORIES[k].mechanics.includes(m)), mechanic: m, difficulty: E.DIFFS[i % 4], seed: `dr-${m}` }));
    const p = { format, challenges, config: {}, theme: { style, base: "dark", overrides: { timer: "#7C5CFF" } } }, t2 = E.timeline(p);
    const [W, H] = format === "short" ? [270, 480] : [480, 270], cv = canvasMod.createCanvas(W, H), ctx = cv.getContext("2d");
    let prev = null, same = 0, n = 0;
    for (let t = 0; t < t2.duration; t += 0.5) { drawFrame(ctx, W, H, p, t2, t); const b = cv.toBuffer("raw"); if (prev && b.equals(prev)) same++; prev = b; n++; }
    ok(same < n * 0.2, `${style}/${format}: ${same} de ${n} fotogramas idénticos (¿lienzo bloqueado?)`);
  }
}
// 7b) Cada diferencia ilustrada tiene dónde marcarse
{ const W0 = await import("../web/retos/world.js"); for (const k of Object.keys(W0.SCENE_DIFFS)) ok(!!W0.DIFF_SPOT[k], `diferencia ${k} sin sitio`);
  if (canvasMod) { const { drawFrame } = await import("../web/retos/draw.js"); for (let i = 0; i < 40; i++) { const c = E.makeChallenge({ category: "wdiff", mechanic: "scene_diff", difficulty: E.DIFFS[i % 4], seed: `sd${i}` }); for (const format of ["short", "long"]) { const p = { game_style: "world", format, challenges: [c], config: {} }, t2 = E.timeline(p), sg = t2.segments.find((x) => x.type === "challenge"); const cv = canvasMod.createCanvas(108, 192); try { drawFrame(cv.getContext("2d"), 108, 192, p, t2, sg.reveal[0] + 3); } catch (e) { ok(false, `diferencias ${c.answer.diffs}: ${e.message}`); } } } } }
// 8) Playable World: la animación sale de la misma simulación que la respuesta
const W = await import("../web/retos/world.js");
for (let i = 0; i < 60; i++) {
  const d = E.DIFFS[i % 4], f = i % 2 ? "long" : "short";
  const m = E.makeChallenge({ category: "maze", mechanic: "maze", difficulty: d, seed: `wm${i}`, format: f }), ms = W.mazeScript(m), win = ms.s.runs[ms.s.winner];
  ok(ms.s.winner === m.answer.entrance && win.path[0][0] === m.data.entrances[m.answer.entrance] && win.path[0][1] === 0 && win.path.at(-1)[0] === m.data.goal && win.path.at(-1)[1] === m.data.h - 1, "laberinto: la bola no recorre el camino de la respuesta");
  const k = E.makeChallenge({ category: "machine", mechanic: "machine", difficulty: d, seed: `wk${i}` }), ks = W.machineScript(k);
  ok(ks.s.runs.length === k.data.balls && ks.s.runs.every((r) => r.hits.length === k.data.levels) && ks.s.last === k.answer.bucket, "máquina: la simulación no coincide con la respuesta");
  ok(ks.balls.every((b, j) => j === 0 || b.start >= ks.balls[j - 1].landAt), "máquina: las bolas se solapan");
  const pr = { game_style: "world", format: f, challenges: [m, k, E.makeChallenge({ category: "error", mechanic: "room_error", difficulty: d, seed: `wr${i}` })], config: {} }, tw = E.timeline(pr);
  ok(tw.events.every((e) => e.t >= 0 && e.t <= tw.duration), "Playable World: sonido fuera del vídeo");
  ok(tw.segments.filter((x) => x.type === "map").length === 2 && tw.segments[0].type === "intro", "Playable World: faltan la portada o el mapa");
}
console.log(fail ? `\n${fail} FALLOS` : "\nTodo correcto");
process.exit(fail ? 1 : 0);
