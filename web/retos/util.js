// Azar reproducible compartido por el motor clásico y los juegos de Playable World (sin dependencias)
export function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h >>> 0); }
export function rng(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashStr(String(seed));
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (a2, b) => a2 + Math.floor(r() * (b - a2 + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.shuffle = (arr) => { const x = [...arr]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  return r;
}
