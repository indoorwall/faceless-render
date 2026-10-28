// Efectos de Playable World sintetizados por código (coste cero, deterministas).
// Uso: node tools/synth-sfx.mjs [carpeta]  → escribe S14…S22 en MP3 (por defecto web/sfx/)
// Son la versión 1 de la biblioteca; desde «Identidad sonora» se pueden sustituir por otros generados o subidos.
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const SR = 44100;
const out = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), "../web/sfx");
mkdirSync(out, { recursive: true });
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
const buf = (sec) => new Float32Array(Math.round(sec * SR));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
// Filtros sencillos de un polo
function lowpass(x, fc) { const a = 1 - Math.exp((-2 * Math.PI * fc) / SR); let y = 0; return x.map((v) => (y += a * (v - y))); }
function highpass(x, fc) { const lp = lowpass(x, fc); return x.map((v, i) => v - lp[i]); }
function add(dst, src, at = 0, g = 1) { const o = Math.round(at * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; }
// Seno con frecuencia variable f(t)
function sweep(sec, f, amp = (t) => 1, shape = Math.sin) { const b = buf(sec); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; ph += (2 * Math.PI * f(t)) / SR; b[i] = shape(ph) * amp(t); } return b; }
const noise = (sec, amp = () => 1) => { const b = buf(sec); for (let i = 0; i < b.length; i++) b[i] = rnd() * amp(i / SR); return b; };
function click(sec = 0.03, tone = 2400, g = 1) { const b = add2(highpass(noise(sec, (t) => env(t, 0.0005, 0.004)), 1800), sweep(sec, () => tone, (t) => env(t, 0.0005, 0.008) * 0.6)); return b.map((v) => v * g); }
function add2(a, b2) { const r = new Float32Array(Math.max(a.length, b2.length)); add(r, a); add(r, b2); return r; }
function norm(b, peak = 0.8) { let m = 0; for (const v of b) m = Math.max(m, Math.abs(v)); return m ? b.map((v) => (v / m) * peak) : b; }
function fade(b, sec = 0.02) { const n = Math.round(sec * SR); for (let i = 0; i < n && i < b.length; i++) b[b.length - 1 - i] *= i / n; return b; }

const S = {
  // Palanca: dos clics secos (golpe y tope)
  S14() { const b = buf(0.35); add(b, click(0.04, 2600, 1)); add(b, click(0.04, 1700, 0.55), 0.045); add(b, sweep(0.12, (t) => 180 - t * 300, (t) => env(t, 0.001, 0.03) * 0.5), 0.045); return b; },
  // Engranajes: trinquete regular que acelera, con zumbido grave
  S15() { const b = buf(1.2); let t = 0, k = 0; while (t < 1.05) { add(b, click(0.025, 1500 + (k % 3) * 300, 0.7 - t * 0.2), t); t += 0.075 - Math.min(0.035, t * 0.04); k++; } add(b, sweep(1.2, (u) => 70 + u * 40, (u) => Math.min(1, u * 4) * Math.exp(-u * 1.2) * 0.35, (p) => Math.sin(p) + 0.3 * Math.sin(2 * p))); return b; },
  // Puerta o cofre: crujido de madera y golpe suave
  S16() { const b = buf(1.0); const creak = sweep(0.6, (t) => 260 + t * 160 + 25 * Math.sin(t * 2 * Math.PI * 28), (t) => Math.sin(Math.min(1, t / 0.6) * Math.PI) * 0.45, (p) => ((p / Math.PI) % 2) - 1); add(b, lowpass(lowpass(highpass(creak, 200), 1500), 1500)); add(b, sweep(0.3, (t) => 95 - t * 60, (t) => env(t, 0.002, 0.07)), 0.58); add(b, lowpass(noise(0.08, (t) => env(t, 0.001, 0.02)), 900), 0.58, 0.6); return b; },
  // Aparecer: pop brillante con destellos
  S17() { const b = buf(0.6); add(b, sweep(0.09, (t) => 480 + t * 12000, (t) => env(t, 0.002, 0.04))); [2093, 2637, 3136, 3951].forEach((f, i) => add(b, sweep(0.35, () => f, (t) => env(t, 0.002, 0.08) * 0.35), 0.05 + i * 0.045)); return b; },
  // Desaparecer: soplido con barrido hacia abajo
  S18() { const b = buf(0.55); add(b, lowpass(lowpass(lowpass(noise(0.4, (t) => env(t, 0.01, 0.1) * 0.9), 900), 900), 900)); add(b, sweep(0.35, (t) => 900 * Math.pow(0.18, t / 0.35), (t) => env(t, 0.005, 0.12) * 0.6)); return b; },
  // Salto: «boing» ascendente con vibrato
  S19() { return sweep(0.42, (t) => 200 + 700 * (1 - Math.exp(-t * 9)) + 30 * Math.sin(t * 2 * Math.PI * 14) * Math.exp(-t * 4), (t) => env(t, 0.004, 0.14)); },
  // Choque: golpe sordo con un pequeño rebote
  S20() { const b = buf(0.45); add(b, sweep(0.25, (t) => 150 * Math.pow(0.45, t / 0.1), (t) => env(t, 0.001, 0.06))); add(b, lowpass(noise(0.06, (t) => env(t, 0.0005, 0.012)), 2000), 0, 0.7); add(b, sweep(0.12, (t) => 220 - t * 400, (t) => env(t, 0.001, 0.03) * 0.35), 0.11); return b; },
  // Caída en cubo: «plonk» hueco y un traqueteo corto
  S21() { const b = buf(0.6); [[410, 1], [645, 0.6], [930, 0.35]].forEach(([f, g]) => add(b, sweep(0.5, () => f, (t) => env(t, 0.001, 0.09) * g))); [0.07, 0.12, 0.155].forEach((t, i) => add(b, click(0.02, 1900 - i * 200, 0.4 - i * 0.1), t)); return b; },
  // Zoom: soplido ascendente
  S22() { const b = buf(0.6); const n = noise(0.55, (t) => Math.sin((t / 0.55) * Math.PI) * 0.8); let lp = 0; const y = n.map((v, i) => { const fc = 400 + (i / n.length) * 3200, a = 1 - Math.exp((-2 * Math.PI * fc) / SR); return (lp += a * (v - lp)); }); add(b, lowpass(highpass(y, 300), 2500)); add(b, sweep(0.5, (t) => 300 + t * 900, (t) => Math.sin((t / 0.5) * Math.PI) * 0.2)); return b; },
};

for (const [code, fn] of Object.entries(S)) {
  const x = fade(norm(fn(), 0.82));
  const wavFile = path.join(out, `${code}.wav`), mp3 = path.join(out, `${code}.mp3`);
  const dv = Buffer.alloc(44 + x.length * 2);
  dv.write("RIFF", 0); dv.writeUInt32LE(36 + x.length * 2, 4); dv.write("WAVEfmt ", 8); dv.writeUInt32LE(16, 16); dv.writeUInt16LE(1, 20); dv.writeUInt16LE(1, 22); dv.writeUInt32LE(SR, 24); dv.writeUInt32LE(SR * 2, 28); dv.writeUInt16LE(2, 32); dv.writeUInt16LE(16, 34); dv.write("data", 36); dv.writeUInt32LE(x.length * 2, 40);
  x.forEach((v, i) => dv.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  writeFileSync(wavFile, dv);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", wavFile, "-ac", "1", "-b:a", "128k", mp3]);
  unlinkSync(wavFile);
  console.log(code, `${(x.length / SR).toFixed(2)} s`);
}
