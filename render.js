// Motor de montaje con FFmpeg para Faceless Studio.
// Recibe una especificación de vídeo (escenas con imagen o vídeo, voz, efectos, música)
// y produce un MP4 H.264/AAC listo para YouTube.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile, rm, stat, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const PRESET = process.env.X264_PRESET || "veryfast";

export function run(cmd, args, { onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let tail = "";
    p.stderr.on("data", (d) => {
      const s = d.toString();
      tail = (tail + s).slice(-4000);
      onStderr?.(s);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}: ${tail.slice(-1200)}`))));
  });
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`No se pudo descargar ${url.slice(0, 120)} (${r.status})`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
  return file;
}

async function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(parseFloat(out) || 0));
    p.on("error", () => resolve(0));
  });
}

// ---------- subtítulos ASS palabra a palabra ----------
const TAG = /\[[^\]]*\]/g;
function cleanWords(text) {
  return String(text || "").replace(TAG, " ").split(/\s+/).map((w) => w.trim()).filter(Boolean);
}
// Si no hay tiempos reales, reparte la duración según la longitud de cada palabra
function estimateWords(text, dur) {
  const ws = cleanWords(text);
  const total = ws.reduce((a, w) => a + w.length + 1, 0) || 1;
  let t = 0.05;
  const usable = Math.max(0.5, dur - 0.1);
  return ws.map((w) => {
    const d = ((w.length + 1) / total) * usable;
    const o = { w, s: t, e: t + d };
    t += d;
    return o;
  });
}
const assTime = (t) => {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), cs = Math.floor((t % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};
const assColor = (hex) => {
  const h = hex.replace("#", "");
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};
const assEsc = (s) => s.replace(/\\/g, "").replace(/[{}]/g, "");

export function buildAss(spec, starts) {
  const W = spec.width, H = spec.height;
  const sub = { max_words: W < H ? 3 : 6, y: W < H ? 0.64 : 0.86, size: W < H ? 0.07 : 0.05, color: "#FFFFFF", highlight: "#FFD400", ...(spec.subtitles || {}) };
  const fontSize = Math.round(Math.min(W, H) * sub.size * 1.35);
  const outline = Math.max(3, Math.round(fontSize * 0.11));
  const marginV = Math.round(H * (1 - sub.y));
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Montserrat ExtraBold,${fontSize},${assColor(sub.color)},${assColor(sub.color)},&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},${Math.round(outline * 0.4)},2,${Math.round(W * 0.06)},${Math.round(W * 0.06)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  // Ancho aproximado de una línea en Montserrat ExtraBold mayúsculas (en píxeles)
  const em = fontSize;
  const charW = (c) => (/[IÍ1.,:;'!¡|]/.test(c) ? 0.36 : /[MWÑ]/.test(c) ? 0.98 : /[J]/.test(c) ? 0.6 : /\s/.test(c) ? 0.3 : 0.7);
  const textW = (s) => [...s].reduce((a, c) => a + charW(c), 0) * em + outline * 2;
  // Espacio útil: ancho menos márgenes y el 6 % extra de la palabra resaltada
  const budget = W * 0.88 * 0.93;
  const lines = [];
  spec.scenes.forEach((sc, i) => {
    const words = (sc.words?.length ? sc.words : estimateWords(sc.narration, sc.voice_duration)).filter((w) => !/^\[.*\]$/.test(w.w));
    // Agrupa palabras en líneas que quepan en pantalla, con un máximo de palabras por línea
    const chunks = [];
    let cur = [];
    for (const w of words) {
      const candidate = [...cur, w].map((x) => x.w.toUpperCase()).join(" ");
      if (cur.length && (cur.length >= sub.max_words || textW(candidate) > budget)) { chunks.push(cur); cur = []; }
      cur.push(w);
    }
    if (cur.length) chunks.push(cur);
    chunks.forEach((chunk, ci) => {
      const next = chunks[ci + 1]?.[0];
      const chunkEnd = next ? next.s : chunk[chunk.length - 1].e + 0.25;
      const full = chunk.map((x) => x.w.toUpperCase()).join(" ");
      // Si una sola palabra es demasiado larga, se reduce la línea entera para que quepa
      const fit = Math.min(100, Math.floor((budget / textW(full)) * 100));
      const pre = fit < 100 ? `{\\fscx${fit}\\fscy${fit}}` : "";
      const hi = Math.round(fit * 1.06);
      chunk.forEach((w, j) => {
        const s = starts[i] + w.s;
        const e = starts[i] + (j < chunk.length - 1 ? chunk[j + 1].s : Math.min(chunkEnd, chunk[j].e + 0.6));
        const text = chunk.map((x, n) => (n === j ? `{\\c${assColor(sub.highlight)}\\fscx${hi}\\fscy${hi}}${assEsc(x.w.toUpperCase())}{\\r}${pre}` : assEsc(x.w.toUpperCase()))).join(" ");
        lines.push(`Dialogue: 0,${assTime(s)},${assTime(Math.max(e, s + 0.05))},Cap,,0,0,0,,${pre}${text}`);
      });
    });
  });
  return head + lines.join("\n") + "\n";
}

// ---------- montaje ----------
export async function render(spec, workdir, progress = () => {}) {
  const W = spec.width, H = spec.height, FPS = spec.fps || 30, T = spec.transition ?? 0.5;
  await mkdir(workdir, { recursive: true });
  const scenes = spec.scenes;
  if (!scenes?.length) throw new Error("Sin escenas");

  // 1) Descargas
  progress(2, "Descargando material");
  await Promise.all(scenes.map(async (s, i) => {
    s._media = await download(s.media_url, path.join(workdir, `m${i}${s.media_kind === "video" ? ".mp4" : ".img"}`));
    s._voice = await download(s.audio_url, path.join(workdir, `v${i}.mp3`));
    if (s.sfx_url) s._sfx = await download(s.sfx_url, path.join(workdir, `s${i}.mp3`));
  }));
  let musicFile = null;
  if (spec.music?.url) musicFile = await download(spec.music.url, path.join(workdir, "music.mp3"));

  // Duración real de cada voz y de cada escena
  for (const s of scenes) {
    s.voice_duration = s.voice_duration || (await probeDuration(s._voice)) || 3;
    s.dur = Math.max(1.6, s.voice_duration + 0.6);
  }
  const starts = [];
  let t = 0;
  scenes.forEach((s, i) => { starts.push(t); t += s.dur - (i < scenes.length - 1 ? T : 0); });
  const total = t;

  // 2) Un clip por escena
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const out = path.join(workdir, `c${i}.mp4`);
    const frames = Math.ceil(s.dur * FPS);
    if (s.media_kind === "video") {
      await run("ffmpeg", ["-y", "-v", "error", "-stream_loop", "-1", "-i", s._media, "-t", s.dur.toFixed(3), "-an",
        "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p`,
        "-c:v", "libx264", "-preset", PRESET, "-crf", "18", out]);
    } else {
      // Ken Burns suave: alterna acercar/alejar y la dirección del desplazamiento
      const zin = i % 2 === 0;
      const pan = [["iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"], ["(iw-iw/zoom)*on/" + frames, "ih/2-(ih/zoom/2)"], ["iw/2-(iw/zoom/2)", "(ih-ih/zoom)*(1-on/" + frames + ")"]][i % 3];
      const z = zin ? `1+0.12*on/${frames}` : `1.12-0.12*on/${frames}`;
      await run("ffmpeg", ["-y", "-v", "error", "-i", s._media,
        "-vf", `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='${pan[0]}':y='${pan[1]}':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p`,
        "-frames:v", String(frames), "-c:v", "libx264", "-preset", PRESET, "-crf", "18", out]);
    }
    progress(5 + Math.round(55 * (i + 1) / scenes.length), `Montando escena ${i + 1} de ${scenes.length}`);
  }

  // 3) Unión con fundidos y subtítulos quemados
  progress(62, "Uniendo escenas y subtítulos");
  const assFile = path.join(workdir, "subs.ass");
  await writeFile(assFile, spec.subtitles?.enabled === false ? "" : buildAss(spec, starts));
  const vin = scenes.flatMap((_, i) => ["-i", path.join(workdir, `c${i}.mp4`)]);
  const parts = scenes.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS}[s${i}]`);
  let last = "s0";
  let off = 0;
  for (let i = 1; i < scenes.length; i++) {
    off += scenes[i - 1].dur - T;
    parts.push(`[${last}][s${i}]xfade=transition=fade:duration=${T}:offset=${off.toFixed(3)}[x${i}]`);
    last = `x${i}`;
  }
  const subFilter = spec.subtitles?.enabled === false ? "null" : `subtitles=${assFile.replace(/:/g, "\\:")}`;
  parts.push(`[${last}]${subFilter},format=yuv420p[vout]`);
  const videoOnly = path.join(workdir, "video.mp4");
  const gop = String(Math.round(FPS / 2)); // fotograma clave cada medio segundo (GOP cerrado)
  const maxrate = W * H >= 1920 * 1080 ? "12M" : "8M";
  await run("ffmpeg", ["-y", "-v", "error", ...vin, "-filter_complex", parts.join(";"), "-map", "[vout]", "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", PRESET, "-profile:v", "high", "-level:v", "4.2", "-pix_fmt", "yuv420p",
    "-crf", "18", "-maxrate", maxrate, "-bufsize", String(parseInt(maxrate) * 2) + "M",
    "-g", gop, "-keyint_min", gop, "-sc_threshold", "0", "-bf", "2", "-flags", "+cgop",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-r", String(FPS), videoOnly]);

  // 4) Mezcla de audio: voz + efectos + música con ducking, normalizado a -14 LUFS
  progress(85, "Mezclando audio");
  const ain = [];
  const af = [];
  let idx = 0;
  const voiceLabels = [];
  scenes.forEach((s, i) => {
    ain.push("-i", s._voice);
    const ms = Math.round(starts[i] * 1000);
    af.push(`[${idx}:a]aresample=48000,adelay=${ms}:all=1[v${i}]`);
    voiceLabels.push(`[v${i}]`);
    idx++;
  });
  af.push(`${voiceLabels.join("")}amix=inputs=${voiceLabels.length}:normalize=0:dropout_transition=0,asplit=2[vo][vsc]`);
  const mixIn = ["[vo]"];
  const fxLabels = [];
  scenes.forEach((s, i) => {
    if (!s._sfx) return;
    ain.push("-i", s._sfx);
    const ms = Math.round(Math.max(0, starts[i] - 0.15) * 1000);
    af.push(`[${idx}:a]aresample=48000,volume=${(spec.sfx_volume ?? 55) / 100},adelay=${ms}:all=1[f${i}]`);
    fxLabels.push(`[f${i}]`);
    idx++;
  });
  if (fxLabels.length) { af.push(`${fxLabels.join("")}amix=inputs=${fxLabels.length}:normalize=0[fx]`); mixIn.push("[fx]"); }
  if (musicFile) {
    ain.push("-stream_loop", "-1", "-i", musicFile);
    const vol = (spec.music.volume ?? 12) / 100 * 1.8; // el ducking baja la música bajo la voz, así que parte algo más alta
    const fo = spec.music.fade_out ?? 2.5;
    af.push(`[${idx}:a]aresample=48000,atrim=0:${total.toFixed(3)},volume=${vol.toFixed(3)},afade=t=in:d=${spec.music.fade_in ?? 1},afade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo}[mraw]`);
    af.push(`[mraw][vsc]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=450:makeup=1[mu]`);
    mixIn.push("[mu]");
    idx++;
  } else {
    af.push(`[vsc]anullsink`);
  }
  af.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[aout]`);
  const audio = path.join(workdir, "audio.m4a");
  await run("ffmpeg", ["-y", "-v", "error", ...ain, "-filter_complex", af.join(";"), "-map", "[aout]", "-t", total.toFixed(3), "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "384k", "-ac", "2", "-ar", "48000", audio]);

  // 5) Unión final
  progress(95, "Empaquetando");
  const final = path.join(workdir, "final.mp4");
  await run("ffmpeg", ["-y", "-v", "error", "-i", videoOnly, "-i", audio, "-map", "0:v", "-map", "1:a", "-c", "copy", "-shortest", "-movflags", "+faststart", final]);
  const st = await stat(final);
  return { file: final, duration: total, size: st.size };
}

export async function cleanup(dir) { await rm(dir, { recursive: true, force: true }); }
export { readFile };
