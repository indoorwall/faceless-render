// Graba render.html fotograma a fotograma y lo codifica con ffmpeg.
//   node tools/rec.cjs <carpeta_episodio> [fps=30]            → video_only.mp4
//   node tools/rec.cjs <carpeta_episodio> 30 <cada_s> [desde] [hasta]  → solo capturas sueltas en prev/ para revisar
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const dir = path.resolve(process.argv[2]); const F = +(process.argv[3] || 30); const every = +(process.argv[4] || 0);
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json')));
const t0 = +(process.argv[5] || 0), t1 = +(process.argv[6] || plan.total);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(dir, 'render.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
  if (every) {
    fs.mkdirSync(path.join(dir, 'prev'), { recursive: true });
    for (let t = t0; t <= t1; t += every) { await p.evaluate(T => renderAt(T), t); await p.screenshot({ path: path.join(dir, 'prev', `f_${t.toFixed(1)}.jpg`), type: 'jpeg', quality: 80 }); }
    await b.close(); return;
  }
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(F), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', path.join(dir, 'video_only.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((t1 - t0) * F);
  for (let i = 0; i < n; i++) {
    await p.evaluate(T => renderAt(T), t0 + i / F);
    const buf = await p.screenshot({ type: 'jpeg', quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 600 === 0) console.log('fotograma', i, '/', n);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('OK video_only.mp4');
})();
