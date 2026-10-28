// Montaje del Motor B (retos): fotogramas dibujados con código (node-canvas) + mezcla de audio exacta + FFmpeg.
// Usa el mismo motor que la web (web/retos/*.js), así la previsualización y el vídeo final son idénticos.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile, stat, open, rename } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { createCanvas, registerFont } from "canvas";
import { timeline, mergeConfig, validateProject, resourcesOf, SOUNDS } from "./web/retos/engine.js";
import { drawFrame, drawThumbnail, setCanvasFactory } from "./web/retos/draw.js";
import { run, fetchRetry } from "./render.js";

const FONT_PATHS = ["/usr/share/fonts/truetype/montserrat/Montserrat-ExtraBold.ttf", path.join(path.dirname(new URL(import.meta.url).pathname), "fonts/Montserrat-ExtraBold.ttf")];
const fontFile = FONT_PATHS.find((p) => existsSync(p));
if (fontFile) registerFont(fontFile, { family: "Montserrat", weight: "800" });
// Nunito: tipografía redondeada que el canal puede elegir en «Estilo visual del juego»
const nunito = [path.join(path.dirname(fontFile || FONT_PATHS[1]), "Nunito-ExtraBold.ttf"), path.join(path.dirname(new URL(import.meta.url).pathname), "fonts/Nunito-ExtraBold.ttf")].find((p) => existsSync(p));
if (nunito) registerFont(nunito, { family: "Nunito", weight: "800" });
setCanvasFactory((w, h) => createCanvas(w, h));

const SR = 44100;
const PRESET = process.env.X264_PRESET || "veryfast";

async function download(url, file) { const r = await fetchRetry(url); await pipeline(Readable.fromWeb(r.body), createWriteStream(file)); return file; }
// Audio a PCM estéreo float32 a 44,1 kHz
function decode(file) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = []; let err = "";
    p.stdout.on("data", (d) => chunks.push(d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => { if (code !== 0) return reject(new Error(`No se pudo leer el audio ${path.basename(file)}: ${err.slice(-300)}`)); const b = Buffer.concat(chunks); resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))); });
  });
}
const pct = (v, def) => Math.max(0, Number(v ?? def)) / 100; // 100 % = 0 dB

// Mezcla: efectos en su muestra exacta, música por niveles con fundidos y bajada bajo la voz
export function mixAudio({ duration, events, voice, music }, buffers, vols) {
  const N = Math.ceil(duration * SR), out = new Float32Array(N * 2);
  const add = (buf, t, gain) => { if (!buf || gain <= 0) return; const o = Math.round(t * SR) * 2; const n = Math.min(buf.length, out.length - o); for (let i = 0; i < n; i++) out[o + i] += buf[i] * gain; };
  // Ventanas de voz (para bajar la música)
  const vwin = voice.filter((v) => buffers.voice[v.text]).map((v) => [v.t, v.t + buffers.voice[v.text].length / 2 / SR]);
  // Música: tramos según el nivel, con fundido cruzado de 1,5 s
  const fade = 1.5;
  music.forEach((m, i) => {
    const buf = buffers.music[m.mood]; if (!buf) return;
    const t0 = m.t, t1 = i + 1 < music.length ? music[i + 1].t : duration;
    const s0 = Math.round(t0 * SR), s1 = Math.min(N, Math.round((i + 1 < music.length ? t1 + fade : duration) * SR));
    const len = buf.length / 2, g = vols.music * (buffers.musicVol[m.mood] ?? 1);
    const fin = t0 === 0 ? 0.6 : fade, endFade = i + 1 < music.length ? fade : 2.5;
    for (let s = s0; s < s1; s++) {
      const t = s / SR; let e = Math.min(1, (t - t0) / fin);
      e = Math.min(e, i + 1 < music.length ? 1 - (t - t1) / fade : (duration - t) / endFade);
      if (e <= 0) continue;
      // Bajada bajo la voz: 0,15 s de ataque y 0,4 s de recuperación
      let duck = 1; for (const [a, b] of vwin) { if (t >= a - 0.15 && t <= b + 0.4) { const k = t < a ? (a - t) / 0.15 : t > b ? (t - b) / 0.4 : 0; duck = Math.min(duck, 0.35 + 0.65 * k); } }
      const j = ((s - s0) % len) * 2, gg = g * e * e * duck;
      out[s * 2] += buf[j] * gg; out[s * 2 + 1] += buf[j + 1] * gg;
    }
  });
  // Efectos
  const groupOf = Object.fromEntries(SOUNDS.map((s) => [s.code, s.group]));
  let used = 0;
  for (const e of events) { const b = buffers.sfx[e.code]; if (!b) continue; used++; add(b, e.t, e.gain * (vols[groupOf[e.code]] ?? vols.sfx) * (buffers.sfxVol[e.code] ?? 1)); }
  for (const v of voice) add(buffers.voice[v.text], v.t, vols.voice);
  // Sin saturación: si algún pico pasa de -1 dBFS se baja todo por igual (el loudnorm final iguala el volumen)
  let peak = 0; for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  const lim = 0.89; if (peak > lim) { const k = lim / peak; for (let i = 0; i < out.length; i++) out[i] *= k; }
  return { pcm: out, peak, sfx_events: used };
}
function wav(pcm) {
  const h = Buffer.alloc(44), data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
// Volumen: se mide la mezcla, se aplica ganancia + limitador suave y se vuelve a medir el resultado,
// corrigiendo hasta quedar a -14 LUFS ±0,3 (el limitador se come parte de la ganancia en los vídeos con muchos efectos)
const PRE = "treble=g=-2:f=9000";
const chain = (gain, ceil = 0.74) => `${PRE},volume=${gain.toFixed(2)}dB,alimiter=limit=${ceil.toFixed(3)}:attack=2:release=60:level=false`;
// Mide la sonoridad integrada (EBU R128) de la mezcla tras la cadena de filtros, igual que la comprobación final
function measureI(wavFile, af) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-v", "info", "-nostats", "-i", wavFile, "-af", `${af},aresample=48000,ebur128`, "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; p.stderr.on("data", (d) => (err += d)); p.on("close", () => { const m = err.slice(err.lastIndexOf("Summary")).match(/I:\s+(-?[\d.]+) LUFS/); resolve(m && isFinite(Number(m[1])) ? Number(m[1]) : null); });
  });
}
async function loudnessFilter(wavFile) {
  const i0 = await measureI(wavFile, PRE);
  if (i0 == null) return { af: `${PRE},loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:level=false`, passes: 1 };
  // Secante: el limitador hace que cada dB de ganancia suba menos de 1 dB de sonoridad; se estima esa pendiente con las dos últimas medidas
  const lim = (g) => Math.max(-20, Math.min(24, g));
  let gPrev = 0, iPrev = i0, gain = lim(-14 - i0), passes = 1;
  for (; passes < 6; passes++) {
    const i = await measureI(wavFile, chain(gain));
    if (i == null || Math.abs(i + 14) <= 0.12) break;
    const slope = Math.abs(gain - gPrev) > 0.05 ? Math.min(1.2, Math.max(0.25, (i - iPrev) / (gain - gPrev))) : 1;
    gPrev = gain; iPrev = i; gain = lim(gain + (-14 - i) / slope);
  }
  return { af: chain(gain), passes, gain };
}
// Comprobación final del sonido del vídeo exportado
async function audioCheck(file) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-v", "info", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; p.stderr.on("data", (d) => (err += d));
    p.on("close", () => { const sum = err.slice(err.lastIndexOf("Summary")); const I = sum.match(/I:\s+(-?[\d.]+) LUFS/); const pk = sum.match(/Peak:\s+(-?[\d.]+) dBFS/); resolve({ lufs: I ? Number(I[1]) : null, true_peak: pk ? Number(pk[1]) : null }); });
  });
}

export async function renderRetos(spec, workdir, onProgress = () => {}) {
  const t0 = Date.now();
  await mkdir(workdir, { recursive: true });
  const W = spec.width, H = spec.height, FPS = spec.fps || 30;
  const project = spec.project;
  const v = validateProject(project);
  if (!v.ok) throw new Error(`Hay retos sin validar: ${v.errors.slice(0, 3).join(" · ")}`);
  const cfg = mergeConfig(project.config);
  const tl = timeline(project);
  onProgress(2, "Preparando sonidos");
  // Recursos de audio del canal (reutilizados: no se genera nada aquí)
  const buffers = { sfx: {}, sfxVol: {}, music: {}, musicVol: {}, voice: {} };
  let i = 0;
  for (const [code, s] of Object.entries(spec.sounds || {})) { if (!s?.url) continue; buffers.sfx[code] = await decode(await download(s.url, path.join(workdir, `sfx_${code}`))); buffers.sfxVol[code] = pct(s.volume, 100); }
  for (const [mood, m] of Object.entries(spec.music || {})) { if (!m?.url) continue; buffers.music[mood] = await decode(await download(m.url, path.join(workdir, `music_${mood}`))); buffers.musicVol[mood] = pct(m.volume, 100); }
  for (const vc of spec.voice || []) { if (!vc?.url || buffers.voice[vc.text]) continue; buffers.voice[vc.text] = await decode(await download(vc.url, path.join(workdir, `voice_${i++}`))); }
  const V = cfg.volumes;
  const vols = { music: pct(V.music), voice: pct(V.voice), sfx: pct(V.sfx), clock: pct(V.clock), transition: pct(V.transition), reward: pct(V.reward) };
  onProgress(5, "Mezclando audio");
  const mix = mixAudio(tl, buffers, vols);
  const wavFile = path.join(workdir, "mix.wav");
  await writeFile(wavFile, wav(mix.pcm));
  // Vídeo: cada fotograma se dibuja y se pasa a FFmpeg sin comprimir
  const out = path.join(workdir, "final.mp4");
  const frames = Math.round(tl.duration * FPS);
  const loud = await loudnessFilter(wavFile), af = loud.af;
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-", "-i", wavFile,
    "-filter:a", af,
    "-c:v", "libx264", "-preset", PRESET, "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest", out], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = ""; ff.stderr.on("data", (d) => (ffErr = (ffErr + d).slice(-3000)));
  const done = new Promise((res, rej) => { ff.on("error", rej); ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`FFmpeg ${c}: ${ffErr.slice(-800)}`)))); });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  const tr = Date.now();
  for (let f = 0; f < frames; f++) {
    drawFrame(ctx, W, H, project, tl, f / FPS);
    if (!ff.stdin.write(canvas.toBuffer("raw"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 90 === 0) onProgress(8 + Math.round((f / frames) * 82), `Dibujando y codificando (${Math.round((f / frames) * 100)} %)`);
  }
  ff.stdin.end();
  await done;
  const renderSec = (Date.now() - tr) / 1000;
  onProgress(92, "Comprobando el sonido");
  let check = await audioCheck(out);
  // Pico real: el codificador AAC puede pasarse por encima del limitador (depende de la versión de FFmpeg).
  // Si supera -1 dB, se recodifica solo el audio con un techo más bajo (el vídeo se copia tal cual).
  let ceil = 0.74, tpFix = 0; const TP_MAX = Number(process.env.RETOS_TP_MAX ?? -1);
  while (loud.gain != null && check.true_peak != null && check.true_peak > TP_MAX && tpFix < 3) {
    tpFix++; ceil *= Math.pow(10, (TP_MAX - 0.3 - check.true_peak) / 20);
    const fixed = path.join(workdir, "final_tp.mp4");
    await run("ffmpeg", ["-y", "-v", "error", "-i", out, "-i", wavFile, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", chain(loud.gain ?? 0, ceil), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest", fixed]);
    await rename(fixed, out);
    check = await audioCheck(out);
  }
  if (tpFix) check = { ...check, true_peak_fixes: tpFix };
  // Miniatura programática (vídeos largos)
  let thumb = null;
  if (spec.thumb_upload_url) {
    const tc = createCanvas(1280, 720); drawThumbnail(tc.getContext("2d"), 1280, 720, project);
    const jpg = tc.toBuffer("image/jpeg", { quality: 0.9 });
    const r = await fetch(spec.thumb_upload_url, { method: "PUT", headers: { "Content-Type": "image/jpeg", "x-upsert": "true" }, body: jpg });
    thumb = r.ok;
  }
  const size = (await stat(out)).size;
  const res = resourcesOf(project, tl);
  return {
    file: out, size, duration: tl.duration,
    report: { ...res, sfx_files: Object.keys(buffers.sfx).length, music_files: Object.keys(buffers.music).length, voice_files: Object.keys(buffers.voice).length, sfx_events_mixed: mix.sfx_events, mix_peak: Math.round(mix.peak * 1000) / 1000, audio: { ...check, loudness_passes: loud.passes, gain_db: loud.gain != null ? Math.round(loud.gain * 100) / 100 : null }, frames, render_seconds: Math.round(renderSec), total_seconds: Math.round((Date.now() - t0) / 1000), thumbnail: thumb, engine: "retos" },
  };
}
