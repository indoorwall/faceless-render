// Sonido sintetizado para los formatos dibujados con código (sin recursos externos): efectos, piano y música de fondo
export function synth({ duration, sounds = [], music = null }, SR = 44100) {
  const N = Math.ceil(duration * SR), buf = new Float32Array(N);
  const add = (t0, len, f) => { const s = Math.floor(t0 * SR); const n = Math.min(Math.ceil(len * SR), N - s); for (let i = Math.max(0, -s); i < n; i++) buf[s + i] += f(i / SR); };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const SYN = {
    pop: (e) => add(e.t, 0.12, (x) => Math.sin(2 * Math.PI * (e.f ?? 700) * x * (1 + 2 * x)) * Math.exp(-x * 40) * 0.5),
    tick: (e) => add(e.t, 0.05, (x) => Math.sin(2 * Math.PI * 1800 * x) * Math.exp(-x * 120) * 0.35),
    ding: (e) => add(e.t, 1.2, (x) => [1, 2.76, 5.4].reduce((a, h, k) => a + Math.sin(2 * Math.PI * (e.f ?? 1046) * h * x) * Math.exp(-x * (3 + k * 3)) / (k + 1.5), 0) * 0.45),
    boom: (e) => add(e.t, 0.9, (x) => Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-x * 8)) * x) * Math.exp(-x * 4) * 0.9),
    whoosh: (e) => add(e.t, 0.5, (x) => (rnd() * 2 - 1) * Math.sin(Math.PI * x / 0.5) * 0.25),
    riser: (e) => { const L = e.len ?? 1.5; add(e.t, L, (x) => Math.sin(2 * Math.PI * (300 + 500 * x / L) * x) * (x / L) * 0.15); },
    roll: (e) => { const L = e.len ?? 1.5; add(e.t, L, (x) => (rnd() * 2 - 1) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 22 * x)) * (0.1 + 0.25 * x / L)); },
    cash: (e) => { SYN.ding({ t: e.t, f: 2093 }); SYN.ding({ t: e.t + 0.07, f: 2637 }); },
    piano: (e) => add(e.t, 1.6, (x) => [1, 2, 3, 4].reduce((a, h, k) => a + Math.sin(2 * Math.PI * e.f * h * x) * Math.exp(-x * (2.2 + k * 1.8)) / (1 + k * 1.6), 0) * Math.min(1, x * 200) * 0.38),
  };
  for (const e of sounds) SYN[e.type]?.(e);
  if (music) {
    const beat = 60 / music.bpm, v = music.vol ?? 1;
    for (let b = 0, t = 0; t < duration; b++, t += beat) {
      const c = music.chords[Math.floor(b / 4) % music.chords.length];
      for (const f of c) add(t, beat * 1.05, (x) => Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 2.5) * 0.05 * v);
      add(t, 0.08, (x) => Math.sin(2 * Math.PI * c[0] / 2 * x) * Math.exp(-x * 30) * 0.18 * v);
      if (b % 2 === 1) add(t, 0.05, (x) => (rnd() * 2 - 1) * Math.exp(-x * 80) * 0.08 * v);
    }
  }
  let peak = 0; for (const x of buf) peak = Math.max(peak, Math.abs(x)); if (peak > 0.9) { const g = 0.9 / peak; for (let i = 0; i < N; i++) buf[i] *= g; }
  return buf;
}
