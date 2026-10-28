// Herramientas rápidas: fotogramas para análisis y composición de miniaturas.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { run, fetchRetry } from "./render.js";

const UA = { "User-Agent": "FacelessStudio/1.0 (https://github.com/indoorwall/faceless-render)" };
const FONT = ["/usr/share/fonts/truetype/montserrat/Montserrat-ExtraBold.ttf", path.resolve("fonts/Montserrat-ExtraBold.ttf")].find((f) => existsSync(f));

async function fetchTo(url, file) {
  const r = await fetchRetry(url);
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
  return file;
}
function probe(file) {
  return new Promise(async (resolve) => {
    const { spawn } = await import("node:child_process");
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
    let out = ""; p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(parseFloat(out) || 0)); p.on("error", () => resolve(0));
  });
}

// Fotogramas repartidos por todo el vídeo, con su segundo exacto
export async function frames({ video_url, max_frames = 40, every = 1.5, width = 432 }, dir) {
  await mkdir(dir, { recursive: true });
  const src = await fetchTo(video_url, path.join(dir, "in.mp4"));
  const dur = await probe(src);
  const step = Math.max(every, dur / Math.min(80, max_frames));
  const times = [];
  for (let t = 0.4; t < dur - 0.1; t += step) times.push(Math.round(t * 10) / 10);
  await Promise.all(times.map((t, i) =>
    run("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "5", path.join(dir, `f${String(i).padStart(3, "0")}.jpg`)])));
  const out = [];
  for (const [i, t] of times.entries()) {
    const f = path.join(dir, `f${String(i).padStart(3, "0")}.jpg`);
    if (existsSync(f)) out.push({ t, b64: (await readFile(f)).toString("base64") });
  }
  return { duration: Math.round(dur * 10) / 10, step: Math.round(step * 10) / 10, frames: out };
}

// Reparte el texto en 1-3 líneas equilibradas
function splitLines(text) {
  const words = String(text).toUpperCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.join(" ").length <= 11 || words.length === 1) return [words.join(" ")];
  const n = words.join(" ").length > 26 && words.length >= 3 ? 3 : 2;
  let best = null;
  const tryCut = (cuts) => {
    const ls = []; let a = 0;
    for (const c of [...cuts, words.length]) { ls.push(words.slice(a, c).join(" ")); a = c; }
    const worst = Math.max(...ls.map((l) => l.length));
    if (!best || worst < best.worst) best = { ls, worst };
  };
  for (let i = 1; i < words.length; i++) {
    if (n === 2) tryCut([i]);
    else for (let j = i + 1; j < words.length; j++) tryCut([i, j]);
  }
  return best.ls;
}
const charW = (c) => (/[IÍ1.,:;'!¡|]/.test(c) ? 0.36 : /[MWÑ]/.test(c) ? 0.98 : /[J]/.test(c) ? 0.6 : /\s/.test(c) ? 0.3 : 0.74);

// Miniatura 1280x720 JPG: imagen de fondo + texto grande con contorno, la última línea en amarillo
export async function thumbnail({ image_url, text, upload_url, side = "left", highlight = "#FFD400" }, dir) {
  await mkdir(dir, { recursive: true });
  const W = 1280, H = 720;
  const bg = await fetchTo(image_url, path.join(dir, "bg.img"));
  const lines = text ? splitLines(text) : [];
  const maxW = W * 0.56;
  const longest = Math.max(1, ...lines.map((l) => [...l].reduce((a, c) => a + charW(c), 0)));
  const fs = Math.round(Math.min(lines.length >= 3 ? 118 : 150, maxW / longest));
  const lh = Math.round(fs * 1.04);
  const block = lh * lines.length;
  const y0 = Math.round((H - block) / 2);
  const x = side === "right" ? `w-tw-${Math.round(W * 0.05)}` : String(Math.round(W * 0.05));
  // Degradado oscuro en el lado del texto para que se lea siempre
  const grad = side === "right"
    ? `geq=r=0:g=0:b=0:a='clip(255*(X/W-0.35)*1.6,0,200)'`
    : `geq=r=0:g=0:b=0:a='clip(255*(0.65-X/W)*1.6,0,200)'`;
  const draws = [];
  for (const [i, l] of lines.entries()) {
    const tf = path.join(dir, `t${i}.txt`);
    await writeFile(tf, l);
    const color = i === lines.length - 1 && lines.length > 1 ? highlight : "#FFFFFF";
    draws.push(`drawtext=fontfile='${FONT}':textfile='${tf}':fontsize=${fs}:fontcolor=${color}:borderw=${Math.round(fs * 0.07)}:bordercolor=black:shadowx=0:shadowy=${Math.round(fs * 0.06)}:shadowcolor=black@0.6:x=${x}:y=${y0 + i * lh}`);
  }
  const out = path.join(dir, "thumb.jpg");
  const filter = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=contrast=1.08:saturation=1.15,setsar=1[b]`,
    `color=black:s=${W}x${H},format=rgba,${grad}[g]`,
    `[b][g]overlay=format=auto${lines.length ? "," + draws.join(",") : ""}[o]`,
  ].join(";");
  await run("ffmpeg", ["-y", "-v", "error", "-i", bg, "-filter_complex", filter, "-map", "[o]", "-frames:v", "1", "-q:v", "3", out]);
  const size = (await stat(out)).size;
  if (upload_url) {
    const r = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": "image/jpeg", "x-upsert": "true" }, body: await readFile(out) });
    if (!r.ok) throw new Error(`Subida fallida (${r.status}): ${(await r.text()).slice(0, 200)}`);
  }
  return { ok: true, size, lines, file: out };
}
