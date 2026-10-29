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

// Wikimedia limita las descargas seguidas (429): sus archivos se piden de uno en uno, con pausa y reintentos
const UA = { "User-Agent": "FacelessStudio/1.0 (https://github.com/indoorwall/faceless-render)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wikiChain = Promise.resolve();
const isWiki = (url) => /(^|\.)wiki(media|pedia)\.org\//.test(url);
export async function fetchRetry(url) {
  const go = async () => {
    let last = "";
    for (let i = 0; i < 6; i++) {
      try {
        const r = await fetch(url, { headers: UA });
        if (r.ok && r.body) return r;
        last = String(r.status);
        if (![429, 500, 502, 503, 504].includes(r.status)) break;
        const ra = Number(r.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1500 * 2 ** i);
      } catch (e) { last = e.message; await sleep(1000 * 2 ** i); }
    }
    throw new Error(`No se pudo descargar ${url.slice(0, 120)} (${last})`);
  };
  if (!isWiki(url)) return go();
  const p = wikiChain.then(async () => { const r = await go(); await sleep(350); return r; });
  wikiChain = p.catch(() => {});
  return p;
}
async function download(url, file) {
  const r = await fetchRetry(url);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
  return file;
}

async function probeSize(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => { const [w, h] = out.trim().split(",").map(Number); resolve([w || 0, h || 0]); });
    p.on("error", () => resolve([0, 0]));
  });
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
// Palabras vacías que nunca se resaltan aunque formen parte de una palabra clave compuesta
const STOP = new Set("de del la las el los lo un una unos unas y e o u a al en con por para que se su sus es fue era the of and a an to in on".split(" "));
const norm = (w) => String(w).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ]/g, "");

export function buildAss(spec, starts) {
  const W = spec.width, H = spec.height;
  const sub = { max_words: W < H ? 3 : 6, y: W < H ? 0.64 : 0.86, size: W < H ? 0.07 : 0.05, color: "#FFFFFF", highlight: "#FFD400", font: "Montserrat ExtraBold", style: "classic", ...(spec.subtitles || {}) };
  // Estilo «box»: la palabra que suena va dentro de una caja de color (texto negro), como los Shorts virales
  const box = sub.style === "box";
  // Bangers (cómic) es más estrecha que Montserrat
  const narrow = /bangers/i.test(sub.font) ? 0.62 : 1;
  const fontSize = Math.round(Math.min(W, H) * sub.size * 1.35);
  const outline = Math.max(3, Math.round(fontSize * 0.11));
  const marginV = Math.round(H * (1 - sub.y));
  const fontName = String(sub.font).replace(/,/g, "");
  const boxPad = Math.max(4, Math.round(fontSize * 0.07));
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${fontName},${fontSize},${assColor(sub.color)},${assColor(sub.color)},&H00000000,&H64000000,0,0,0,0,100,100,${box ? 2 : 0},0,1,${outline},${Math.round(outline * 0.4)},2,${Math.round(W * 0.06)},${Math.round(W * 0.06)},${marginV},1
Style: Box,${fontName},${fontSize},&H00000000,&H00000000,${assColor(sub.highlight)},&H00000000,0,0,0,0,100,100,${box ? 2 : 0},0,3,${boxPad},0,2,${Math.round(W * 0.06)},${Math.round(W * 0.06)},${marginV},1
${titleStyles(spec)}${chapterStyles(spec)}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  // Ancho aproximado de una línea en Montserrat ExtraBold mayúsculas (en píxeles)
  const em = fontSize;
  const charW = (c) => (/[IÍ1.,:;'!¡|]/.test(c) ? 0.36 : /[MWÑ]/.test(c) ? 0.98 : /[J]/.test(c) ? 0.6 : /\s/.test(c) ? 0.3 : 0.7);
  const textW = (s) => [...s].reduce((a, c) => a + charW(c), 0) * em * narrow + outline * 2;
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
    // Palabras clave de la escena: van siempre en amarillo. Sin lista (vídeos antiguos), se resalta la palabra que suena
    const keys = new Set((sc.keywords || []).flatMap((k) => cleanWords(k)).map(norm).filter((w) => w && !STOP.has(w)));
    const keyMode = keys.size > 0;
    chunks.forEach((chunk, ci) => {
      const next = chunks[ci + 1]?.[0];
      const chunkEnd = next ? next.s : chunk[chunk.length - 1].e + 0.25;
      const full = chunk.map((x) => x.w.toUpperCase()).join(" ");
      // Si una sola palabra es demasiado larga, se reduce la línea entera para que quepa
      const fit = Math.min(100, Math.floor((budget / textW(full)) * 100));
      const pre = fit < 100 ? `{\\fscx${fit}\\fscy${fit}}` : "";
      const hi = box ? fit : Math.round(fit * (keyMode ? 1.08 : 1.06));
      const yellow = `{\\c${assColor(sub.highlight)}}`;
      chunk.forEach((w, j) => {
        const s = starts[i] + w.s;
        const e = starts[i] + (j < chunk.length - 1 ? chunk[j + 1].s : Math.min(chunkEnd, chunk[j].e + 0.6));
        const text = chunk.map((x, n) => {
          const word = assEsc(x.w.toUpperCase());
          const isKey = keyMode && keys.has(norm(x.w));
          if (!keyMode) return n === j ? `{\\c${assColor(sub.highlight)}\\fscx${hi}\\fscy${hi}}${word}{\\r}${pre}` : word;
          const pop = n === j ? `{\\fscx${hi}\\fscy${hi}}` : "";
          if (isKey) return `${yellow}${pop}${word}{\\r}${pre}`;
          return n === j ? `${pop}${word}{\\r}${pre}` : word;
        }).join(" ");
        if (box) {
          // Capa 0: la línea en blanco; capa 1: la misma línea con solo la palabra que suena visible, en su caja
          // Espacio extra entre palabras para que la caja no las pegue
          const plain = chunk.map((x) => assEsc(x.w.toUpperCase())).join(" \\h");
          const hid = chunk.map((x, n) => (n === j ? `{\\alpha&H00&}${assEsc(x.w.toUpperCase())}{\\alpha&HFF&}` : assEsc(x.w.toUpperCase()))).join(" \\h");
          lines.push(`Dialogue: 0,${assTime(s)},${assTime(Math.max(e, s + 0.05))},Cap,,0,0,0,,${pre}${plain}`);
          lines.push(`Dialogue: 1,${assTime(s)},${assTime(Math.max(e, s + 0.05))},Box,,0,0,0,,${pre}{\\alpha&HFF&}${hid}`);
          return;
        }
        lines.push(`Dialogue: 0,${assTime(s)},${assTime(Math.max(e, s + 0.05))},Cap,,0,0,0,,${pre}${text}`);
      });
    });
  });
  return head + titleEvents(spec, starts) + chapterEvents(spec, starts) + lines.join("\n") + "\n";
}
// Título de cada curiosidad («1 · RECONOCEN SU NOMBRE»), estilo TikTok: aparece con un pequeño salto al empezar cada una
function chapterSize(spec) { return Math.round(Math.min(spec.width, spec.height) * (spec.chapter_style?.size ?? 0.066)); }
function chapterStyles(spec) {
  if (!spec.chapters?.length) return "";
  const fs = chapterSize(spec), cs = spec.chapter_style ?? {};
  return `Style: Chap,Montserrat ExtraBold,${fs},&H00FFFFFF,&H00FFFFFF,${assColor(cs.bg ?? "#111111")},&H00000000,0,0,0,0,100,100,0,0,3,${Math.round(fs * 0.28)},0,8,0,0,0,1
Style: ChapBig,Montserrat ExtraBold,${fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${Math.max(4, Math.round(fs * 0.13))},${Math.round(fs * 0.08)},5,0,0,0,1
`;
}
// Momento en que entra una curiosidad (si la escena empieza con la pregunta del gancho, al acabar la pregunta)
function chapterStart(spec, starts, c) {
  const sc = spec.scenes[c.scene]; if (!sc || starts[c.scene] == null) return null;
  let off = 0;
  if (c.after_question) {
    const ws = sc.words?.length ? sc.words : [];
    const q = ws.findIndex((w) => /\?$/.test(String(w.w)));
    if (q >= 0 && q < ws.length - 1) off = ws[q + 1].s;
  }
  return starts[c.scene] + off;
}
function chapterEvents(spec, starts) {
  const ch = spec.chapters; if (!ch?.length) return "";
  const W = spec.width, H = spec.height, fs = chapterSize(spec);
  const cw = (c) => (/[IÍ1.,:;'!¡|]/.test(c) ? 0.36 : /[MWÑ]/.test(c) ? 0.98 : /\s/.test(c) ? 0.3 : 0.72);
  const out = [];
  ch.forEach((c, i) => {
    const s = chapterStart(spec, starts, c); if (s == null) return;
    const next = ch[i + 1];
    const e = next && starts[next.scene] != null ? starts[next.scene] : 32400;
    const title = assEsc(String(c.title ?? "").toUpperCase());
    // 1) Entrada «wow»: enorme en el centro, en varias líneas, con un salto. 2) Se encoge hacia arriba y se queda en una línea
    const acc = assColor(spec.chapter_style?.accent ?? "#FFD400");
    const est1 = ([...title].reduce((a, ch2) => a + cw(ch2), 0) + 3.4) * fs * 0.72;
    const k = Math.min(100, Math.floor(((W * 0.88) / est1) * 100));
    const kTop = Math.min(125, Math.floor(((W * 0.9) / est1) * 100));
    const bigK = 210, maxW = W * 0.9;
    const lineW = (t) => [...t].reduce((a, ch2) => a + cw(ch2), 0) * fs * 0.72 * (bigK / 100);
    const rows = []; let cur = "";
    for (const w of title.split(/\s+/)) { const cand = cur ? `${cur} ${w}` : w; if (cur && lineW(cand) > maxW) { rows.push(cur); cur = w; } else cur = cand; }
    if (cur) rows.push(cur);
    const fitBig = Math.min(bigK, Math.floor(bigK * Math.min(1, maxW / Math.max(...rows.map(lineW)))));
    const hold = 1250, shrink = 1650;
    // Arriba se queda el mismo rótulo, en varias líneas, a algo más de la mitad del tamaño de entrada
    const topK = Math.round(fitBig * 0.68);
    const lineH = fs * 1.25 * (topK / 100);
    const yTop = Math.round(Math.max(H * 0.05 + (lineH * (rows.length + 1)) / 2, H * (spec.chapter_style?.y ?? 0.1))), yMid = Math.round(H * 0.4);
    const pop = `\\fscx${Math.round(fitBig * 0.35)}\\fscy${Math.round(fitBig * 0.35)}\\t(0,170,\\fscx${Math.round(fitBig * 1.1)}\\fscy${Math.round(fitBig * 1.1)})\\t(170,290,\\fscx${fitBig}\\fscy${fitBig})\\t(${hold},${shrink},0.7,\\fscx${topK}\\fscy${topK}\\frz3)`;
    const text = `{\\1c${acc}}${c.n}/${c.of ?? ch.length}{\\1c&H00FFFFFF&}\\N${rows.join("\\N")}`;
    out.push(`Dialogue: 3,${assTime(s)},${assTime(e)},ChapBig,,0,0,0,,{\\an5\\move(${Math.round(W / 2)},${yMid},${Math.round(W / 2)},${yTop},${hold},${shrink})${pop}}${text}`);
  });
  return out.length ? out.join("\n") + "\n" : "";
}
// Título fijo en pantalla durante todo el vídeo (p. ej. «CURIOSIDADES / DE / GATOS»), con una palabra en caja de color
function titleSize(spec) { const t = spec.title_overlay; return Math.round(Math.min(spec.width, spec.height) * (t?.size ?? 0.115)); }
function titleStyles(spec) {
  const t = spec.title_overlay; if (!t?.lines?.length) return "";
  const fs = titleSize(spec);
  return `Style: Title,Montserrat ExtraBold,${fs},${assColor(t.color ?? "#FFFFFF")},${assColor(t.color ?? "#FFFFFF")},&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,0,${Math.round(fs * 0.04)},8,0,0,0,1
Style: TitleBox,Montserrat ExtraBold,${fs},&H00FFFFFF,&H00FFFFFF,${assColor(t.accent_bg ?? "#E83030")},&H00000000,0,0,0,0,100,100,0,0,3,${Math.round(fs * 0.09)},0,8,0,0,0,1
`;
}
function titleEvents(spec, starts = []) {
  const t = spec.title_overlay; if (!t?.lines?.length) return "";
  // El título fijo se va cuando entra la primera curiosidad (o a los t.seconds segundos); si no, dura todo el vídeo
  const c0 = spec.chapters?.length ? chapterStart(spec, starts, spec.chapters[0]) : null;
  const until = t.seconds ?? (c0 != null ? Math.max(2, c0) : null);
  const endT = until != null ? assTime(until) : "9:00:00.00";
  const fade = until != null ? "\\fad(0,250)" : "";
  const W = spec.width, H = spec.height, fs = titleSize(spec), rot = t.rotate ?? 5;
  const cw = (c) => (/[IÍ1.,:;'!¡|]/.test(c) ? 0.36 : /[MWÑ]/.test(c) ? 0.98 : /\s/.test(c) ? 0.3 : 0.72);
  let y = Math.round(H * (t.y ?? 0.07));
  return t.lines.map((raw, i) => {
    const line = assEsc(String(raw).toUpperCase());
    const w = [...line].reduce((a, c) => a + cw(c), 0) * fs;
    const k = Math.min(100, Math.floor(((W * 0.86) / Math.max(1, w)) * 100));
    const acc = i === t.accent;
    const ev = `Dialogue: ${acc ? 1 : 0},0:00:00.00,${endT},${acc ? "TitleBox" : "Title"},,0,0,0,,{\\an8\\pos(${Math.round(W * (t.x ?? 0.46))},${y})\\frz${rot}\\fscx${k}\\fscy${k}${fade}}${line}`;
    y += Math.round(fs * (acc ? 1.12 : 1.0) * k / 100);
    return ev;
  }).join("\n") + "\n";
}

// ---------- montaje ----------
export async function render(spec, workdir, progress = () => {}) {
  const W = spec.width, H = spec.height, FPS = spec.fps || 30, T = spec.transition ?? 0.5;
  await mkdir(workdir, { recursive: true });
  const scenes = spec.scenes;
  if (!scenes?.length) throw new Error("Sin escenas");

  // Cada escena tiene uno o varios planos. Los vídeos antiguos tienen un solo plano por escena
  for (const sc of scenes) {
    if (!Array.isArray(sc.shots) || !sc.shots.length || sc.shots.some((x) => !x.media_url)) {
      sc.shots = [{ media_url: sc.media_url, media_kind: sc.media_kind, fit: "cover", line: sc.narration }];
    }
  }

  // 1) Descargas (cada archivo una sola vez, aunque lo usen varios planos)
  progress(2, "Descargando material");
  const files = new Map();
  const fetchOnce = (url, ext) => {
    if (!files.has(url)) files.set(url, download(url, path.join(workdir, `f${files.size}${ext}`)));
    return files.get(url);
  };
  await Promise.all(scenes.map(async (sc, i) => {
    for (const sh of sc.shots) sh._file = await fetchOnce(sh.media_url, sh.media_kind === "video" ? ".mp4" : ".img");
    sc._voice = await download(sc.audio_url, path.join(workdir, `v${i}.mp3`));
    if (sc.sfx_url) sc._sfx = await download(sc.sfx_url, path.join(workdir, `s${i}.mp3`));
  }));
  let musicFile = null;
  if (spec.music?.url) musicFile = await download(spec.music.url, path.join(workdir, "music.mp3"));

  // Duración real de cada voz y de cada escena
  for (const sc of scenes) {
    sc.voice_duration = sc.voice_duration || (await probeDuration(sc._voice)) || 3;
    sc.dur = Math.max(1.6, sc.voice_duration + 0.6);
  }
  const starts = [];
  let t = 0;
  scenes.forEach((sc, i) => { starts.push(t); t += sc.dur - (i < scenes.length - 1 ? T : 0); });
  const total = t;

  // 2) Imágenes preparadas a doble resolución (para movimientos y reencuadres nítidos).
  //    Las fotos que no encajan en el formato (p. ej. de archivo apaisadas en vertical) van enteras sobre su versión difuminada
  const stills = new Map();
  const W2 = W * 2, H2 = H * 2;
  const stillFor = async (sh) => {
    const key = `${sh._file}|${sh.fit || "cover"}`;
    if (stills.has(key)) return stills.get(key);
    const job = (async () => {
      const out = path.join(workdir, `still${stills.size}.png`);
      let contain = sh.fit === "contain";
      if (contain) {
        const [iw, ih] = await probeSize(sh._file);
        if (iw && ih && Math.abs(iw / ih - W / H) / (W / H) < 0.15) contain = false; // casi el mismo formato: basta con recortar
      }
      const vf = contain
        ? `[0:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},boxblur=40:3,eq=brightness=-0.12:saturation=0.85[bg];[0:v]scale=${W2}:${H2}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=rgb24`
        : `[0:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W2}:${H2},format=rgb24`;
      await run("ffmpeg", ["-y", "-v", "error", "-i", sh._file, "-filter_complex", vf, "-frames:v", "1", out]);
      return out;
    })();
    stills.set(key, job);
    return job;
  };

  // 3) Planos: cada uno empieza justo antes de la primera palabra de su frase
  const enc = ["-c:v", "libx264", "-preset", PRESET, "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS)];
  let shotNo = 0;
  const totalShots = scenes.reduce((a, sc) => a + sc.shots.length, 0);
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const words = (sc.words?.length ? sc.words : estimateWords(sc.narration, sc.voice_duration)).filter((w) => !/^\[.*\]$/.test(w.w));
    const counts = sc.shots.map((sh) => cleanWords(sh.line).length);
    const sum = counts.reduce((a, b) => a + b, 0) || 1;
    const cuts = [0];
    let cum = 0;
    for (let k = 1; k < sc.shots.length; k++) {
      cum += counts[k - 1];
      const idx = Math.min(words.length - 1, Math.round((cum / sum) * words.length));
      const at = words.length ? words[Math.max(0, idx)].s - 0.08 : (sc.dur * cum) / sum;
      cuts.push(Math.max(cuts[k - 1] + 0.7, Math.min(sc.dur - 0.7, at)));
    }
    cuts.push(sc.dur);
    const list = [];
    for (let k = 0; k < sc.shots.length; k++) {
      const sh = sc.shots[k];
      const d = Math.max(0.3, cuts[k + 1] - cuts[k]);
      const frames = Math.max(2, Math.round(d * FPS));
      const out = path.join(workdir, `p${i}_${k}.mp4`);
      const rf = sh.reframe;
      const fx = Math.min(0.85, Math.max(0.15, Number(rf?.x ?? 0.5)));
      const fy = Math.min(0.85, Math.max(0.15, Number(rf?.y ?? 0.5)));
      if (sh.media_kind === "video") {
        const Z = rf ? Math.min(2, Math.max(1.2, Number(rf.zoom ?? 1.4))) : 1;
        const zw = Math.round(W * Z / 2) * 2, zh = Math.round(H * Z / 2) * 2;
        await run("ffmpeg", ["-y", "-v", "error", "-stream_loop", "-1", "-i", sh._file, "-an", "-frames:v", String(frames),
          "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},scale=${zw}:${zh},crop=${W}:${H}:${Math.round((zw - W) * fx)}:${Math.round((zh - H) * fy)},fps=${FPS},setsar=1`,
          ...enc, out]);
      } else {
        const still = await stillFor(sh);
        let z, x, y;
        if (rf) {
          // Reencuadre: acercamiento a una zona de la imagen con una leve deriva
          const Z = Math.min(2.2, Math.max(1.25, Number(rf.zoom ?? 1.5)));
          z = `${Z}+0.06*on/${frames}`;
          x = `max(0,min(iw-iw/zoom,${fx}*iw-iw/zoom/2))`;
          y = `max(0,min(ih-ih/zoom,${fy}*ih-ih/zoom/2))`;
        } else {
          // Movimiento suave: alterna acercar/alejar y la dirección del desplazamiento
          const zin = shotNo % 2 === 0;
          z = zin ? `1+0.1*on/${frames}` : `1.1-0.1*on/${frames}`;
          [x, y] = [["iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"], [`(iw-iw/zoom)*on/${frames}`, "ih/2-(ih/zoom/2)"], ["iw/2-(iw/zoom/2)", `(ih-ih/zoom)*(1-on/${frames})`]][shotNo % 3];
        }
        await run("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-framerate", String(FPS), "-i", still, "-frames:v", String(frames),
          "-vf", `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${W}x${H}:fps=${FPS},setsar=1`, ...enc, out]);
      }
      list.push(`file '${out}'`);
      shotNo++;
      progress(5 + Math.round(55 * shotNo / totalShots), `Montando plano ${shotNo} de ${totalShots}`);
    }
    const listFile = path.join(workdir, `l${i}.txt`);
    await writeFile(listFile, list.join("\n") + "\n");
    await run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listFile, ...enc, "-t", sc.dur.toFixed(3), path.join(workdir, `c${i}.mp4`)]);
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
