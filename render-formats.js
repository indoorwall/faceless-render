// Formatos de Shorts dibujados con código («¿Quién ganaría?», «¿Cuánto costaba?», «Piensa un número», «Piano fácil»).
// Mismo dibujo que web/retos/formats.js, sonido sintetizado (sin recursos externos) y emojis de Noto (Google, licencia OFL).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, stat, rename } from "node:fs/promises";
import path from "node:path";
import { createCanvas, registerFont, loadImage } from "canvas";
import { planFormat, validateFormat, emojiCode, FW, FH } from "./web/retos/formats.js";
import { synth } from "./web/retos/synth.js";
import { loudnessFilter, audioCheck } from "./render-retos.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const font = (file, family, weight) => { const p = [path.join("/usr/share/fonts/truetype/montserrat", file), path.join(HERE, "fonts", file)].find((x) => existsSync(x)); if (p) registerFont(p, { family, ...(weight ? { weight } : {}) }); };
font("Bangers-Regular.ttf", "Bangers"); font("Montserrat-ExtraBold.ttf", "Montserrat", "800"); font("Nunito-ExtraBold.ttf", "Nunito", "800");
const SR = 44100, FPS = 30, PRESET = process.env.X264_PRESET || "veryfast";
const EMOJI_DIR = path.join(process.env.EMOJI_CACHE || "/tmp", "noto-emoji");

// Emojis como imágenes PNG de 512 px (node-canvas no pinta bien los emojis de color con fuentes)
async function emojiImages(list) {
  await mkdir(EMOJI_DIR, { recursive: true });
  const out = {};
  for (const e of [...new Set(list.filter(Boolean))]) {
    const code = emojiCode(e), file = path.join(EMOJI_DIR, `${code}.png`);
    try {
      if (!existsSync(file)) {
        let r = await fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.png`);
        if (!r.ok && !code.includes("_")) r = await fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${code}_fe0f/512.png`);
        if (!r.ok) throw new Error(`emoji ${e} ${r.status}`);
        await writeFile(file, Buffer.from(await r.arrayBuffer()));
      }
      out[e] = await loadImage(await readFile(file));
    } catch (_) { /* se pinta como texto */ }
  }
  return out;
}

export async function renderFormat(spec, workdir, onProgress = () => {}) {
  const t0 = Date.now();
  await mkdir(workdir, { recursive: true });
  const val = validateFormat(spec.format, spec.data);
  if (!val.ok) throw new Error(`Datos del formato no válidos: ${val.errors.join(" · ")}`);
  const plan = planFormat(spec);
  const W = spec.width || 1080, H = spec.height || 1920, k = W / FW;
  onProgress(3, "Preparando emojis");
  const imgs = await emojiImages(plan.emojis.concat(spec.extra_emojis ?? []));
  // Los emojis que aparecen dentro de un texto (p. ej. «👇») se quitan del texto y se pintan aparte si hace falta
  const E = { emoji: (ctx, e, x, y, size) => { const im = imgs[e]; if (im) ctx.drawImage(im, x - size / 2, y - size / 2, size, size); else { ctx.font = `${size}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x, y); } } };
  onProgress(5, "Sintetizando el sonido");
  const pcm = synth(plan, SR);
  const wavFile = path.join(workdir, "mix.wav");
  const h = Buffer.alloc(44), data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  await writeFile(wavFile, Buffer.concat([h, data]));
  const loud = await loudnessFilter(wavFile);
  const out = path.join(workdir, "final.mp4");
  const frames = Math.round(plan.duration * FPS);
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-", "-i", wavFile, "-filter:a", loud.af,
    "-c:v", "libx264", "-preset", PRESET, "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-shortest", out], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = ""; ff.stderr.on("data", (d) => (ffErr = (ffErr + d).slice(-3000)));
  const done = new Promise((res, rej) => { ff.on("error", rej); ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`FFmpeg ${c}: ${ffErr.slice(-800)}`)))); });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  for (let f = 0; f < frames; f++) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    plan.draw(ctx, f / FPS, E);
    if (!ff.stdin.write(canvas.toBuffer("raw"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 90 === 0) onProgress(8 + Math.round((f / frames) * 84), `Dibujando y codificando (${Math.round((f / frames) * 100)} %)`);
  }
  ff.stdin.end();
  await done;
  let audio = await audioCheck(out);
  // El códec AAC puede pasarse del techo: si el pico real supera -1 dB se baja solo el audio (el vídeo se copia)
  if (audio.true_peak != null && audio.true_peak > -1) {
    const fixed = path.join(workdir, "final_tp.mp4"), db = (-1.3 - audio.true_peak).toFixed(2);
    await new Promise((res, rej) => { const p = spawn("ffmpeg", ["-y", "-v", "error", "-i", out, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", `volume=${db}dB`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", fixed]); p.on("error", rej); p.on("close", (c) => (c === 0 ? res() : rej(new Error(`FFmpeg ${c}`)))); });
    await rename(fixed, out);
    audio = { ...(await audioCheck(out)), true_peak_fix: Number(db) };
  }
  const size = (await stat(out)).size;
  return { file: out, size, duration: plan.duration, report: { format: spec.format, frames, audio, emojis: Object.keys(imgs).length, render_seconds: Math.round((Date.now() - t0) / 100) / 10 } };
}
