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
  ok(sigs.size > n * (m.startsWith("odd_") ? 0.4 : 0.6) || ["flags"].includes(m), `${m}/${d}: poca variedad (${sigs.size}/${n})`);
}
// 2) La validación detecta respuestas incorrectas
for (const m of mechs) {
  const cat = Object.keys(E.CATEGORIES).find((k) => E.CATEGORIES[k].mechanics.includes(m));
  const c = E.makeChallenge({ category: cat, mechanic: m, difficulty: "medium", seed: `neg-${m}` });
  const bad = JSON.parse(JSON.stringify(c));
  if ("option" in bad.answer) bad.answer.option = (bad.answer.option + 1) % 4;
  else if ("at" in bad.answer) { bad.data.at = (bad.data.at + 1) % 5; }
  else if ("diffs" in bad.answer) bad.answer.diffs = bad.answer.diffs.slice(1);
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
console.log(fail ? `\n${fail} FALLOS` : "\nTodo correcto");
process.exit(fail ? 1 : 0);
