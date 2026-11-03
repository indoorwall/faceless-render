// Recopilaciones: junta Shorts ya publicados del canal en un vídeo horizontal largo.
// Cada Short va centrado sobre un fondo desenfocado de sí mismo; a la izquierda, el número y el título
// de la curiosidad. Fundido suave entre uno y otro.
// spec = { id, kind: "compile", width, height, upload_url, clips: [{ url, label }], volume_norm? }
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { run, fetchRetry } from "./render.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
// En el contenedor las fuentes van a la carpeta del sistema; en local, a ./fonts
const FONT = ["/usr/share/fonts/truetype/montserrat/Montserrat-ExtraBold.ttf", path.join(HERE, "fonts", "Montserrat-ExtraBold.ttf")].find((f) => existsSync(f));
const PRESET = process.env.X264_PRESET || "veryfast";

// Corta el título en líneas de ~maxChars sin partir palabras (máximo 4 líneas)
export function wrapLabel(text, maxChars = 16, maxLines = 4) {
  const words = String(text ?? "").replace(/#\S+/g, "").replace(/[^\p{L}\p{N}\s¿?¡!.,:;'"«»()%€$-]/gu, "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,:;]?$/, "…"); }
  return lines;
}

async function probe(file) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => { try { const j = JSON.parse(out); resolve({ duration: parseFloat(j.format?.duration) || 0, audio: (j.streams ?? []).some((s) => s.codec_type === "audio") }); } catch { resolve({ duration: 0, audio: false }); } });
    p.on("error", () => resolve({ duration: 0, audio: false }));
  });
}

export async function renderCompile(spec, workdir, progress = () => {}) {
  const W = spec.width || 1920, H = spec.height || 1080;
  const clips = (spec.clips ?? []).filter((c) => c?.url);
  if (clips.length < 2) throw new Error("Hacen falta al menos 2 Shorts para una recopilación");
  await mkdir(workdir, { recursive: true });
  const fade = 0.4;
  const segs = [];
  let total = 0;
  for (const [i, c] of clips.entries()) {
    progress(Math.round((i / clips.length) * 90), `Montando ${i + 1} de ${clips.length}`);
    const src = path.join(workdir, `src${i}.mp4`);
    const r = await fetchRetry(c.url);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(src));
    const { duration, audio } = await probe(src);
    if (!duration) throw new Error(`No se pudo leer el Short ${i + 1}`);
    const d = Math.max(1, duration - Number(c.trim_end ?? 0));
    // Texto del lateral: número grande y título en líneas
    const num = path.join(workdir, `num${i}.txt`); const lab = path.join(workdir, `lab${i}.txt`);
    await writeFile(num, `${c.kicker ?? `Nº ${i + 1}`}`);
    await writeFile(lab, wrapLabel(c.label).join("\n"));
    const fgW = Math.round((H * 9) / 16 / 2) * 2; // ancho del Short a altura completa
    const side = Math.round((W - fgW) / 2);
    const fs = Math.round(H * 0.052), fsNum = Math.round(H * 0.038);
    const tx = Math.round(side * 0.1), tw = side - tx * 2;
    const vf = [
      `[0:v]split[a][b]`,
      `[a]scale=${W / 4}:${H / 4}:force_original_aspect_ratio=increase,crop=${W / 4}:${H / 4},boxblur=12:2,scale=${W}:${H},eq=brightness=-0.22:saturation=0.85[bg]`,
      `[b]scale=${fgW}:${H}:force_original_aspect_ratio=decrease,pad=${fgW}:${H}:(ow-iw)/2:(oh-ih)/2[fg]`,
      `[bg][fg]overlay=${side}:0,` +
        `drawbox=x=${tx - 18}:y=${Math.round(H * 0.3)}:w=${tw + 36}:h=${Math.round(H * 0.4)}:color=black@0.35:t=fill,` +
        `drawtext=fontfile=${FONT}:textfile=${num}:fontsize=${fsNum}:fontcolor=0xFFD23F:x=${tx}:y=${Math.round(H * 0.33)},` +
        `drawtext=fontfile=${FONT}:textfile=${lab}:fontsize=${fs}:line_spacing=${Math.round(fs * 0.25)}:fontcolor=white:borderw=3:bordercolor=black@0.6:x=${tx}:y=${Math.round(H * 0.33 + fsNum * 1.6)},` +
        `fade=t=in:st=0:d=${fade},fade=t=out:st=${(d - fade).toFixed(2)}:d=${fade},fps=30,format=yuv420p[v]`,
    ].join(";");
    const af = audio ? [`-filter:a`, `aresample=48000,afade=t=in:st=0:d=0.25,afade=t=out:st=${(d - fade).toFixed(2)}:d=${fade}`] : [];
    const seg = path.join(workdir, `seg${String(i).padStart(3, "0")}.mp4`);
    await run("ffmpeg", ["-y", "-i", src, ...(audio ? [] : ["-f", "lavfi", "-t", String(d), "-i", "anullsrc=r=48000:cl=stereo"]),
      "-t", d.toFixed(3), "-filter_complex", vf, "-map", "[v]", "-map", audio ? "0:a:0" : "1:a:0", ...af,
      "-c:v", "libx264", "-preset", PRESET, "-crf", "20", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", seg]);
    segs.push(seg); total += d;
  }
  progress(93, "Uniendo");
  const list = path.join(workdir, "list.txt");
  await writeFile(list, segs.map((s) => `file '${s}'`).join("\n"));
  const out = path.join(workdir, "final.mp4");
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
  const size = (await stat(out)).size;
  return { file: out, size, duration: total };
}
