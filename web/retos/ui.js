// Motor B — interfaz dentro de la plataforma: generador de retos (en «Revisar»), editor con previsualización,
// e identidad visual y sonora del canal. Usa los mismos datos y estilos que el resto de la web.
// Globales de index.html: sb, S, $, esc, toast, run, kick, load, ch, sheetShell, closeSheet, openVideo, render
import * as E from "./engine.js";
import { drawFrame, drawThumbnail, palette } from "./draw.js";

// Fuente de los retos para el canvas del navegador
// (Montserrat y Nunito: cuando cargan se redibujan las previsualizaciones)
for (const [fam, file] of [["Montserrat", "Montserrat-ExtraBold.ttf"], ["Nunito", "Nunito-ExtraBold.ttf"]]) {
  try { const f = new FontFace(fam, `url(fonts/${file})`, { weight: "800" }); f.load().then((x) => { document.fonts.add(x); try { previewTheme(); RS.player?.draw(); } catch (_) { /* aún no hay nada que redibujar */ } }); } catch (_) { /* sin FontFace: se usa la fuente de reserva */ }
}

const RS = { lib: {}, edit: null, player: null, gen: { style: "classic", format: "long", category: "mixed", minutes: 8, seconds: 30, difficulty: "progressive", count: "", channel: "" }, polling: null };
const isRetos = (c) => c && c.production_type === "challenges";
const retosChannels = () => S.channels.filter(isRetos);
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// Categorías según el estilo de juego (clásico o Playable World)
const CAT_OPTS = (style = RS.gen?.style) => [["mixed", "🎲 Mixto"], ...(E.GAME_STYLES[style] || E.GAME_STYLES.classic).cats.map((k) => [k, `${E.CATEGORIES[k].emoji} ${E.CATEGORIES[k].label}`])];
const ALL_CATS = () => [...E.CATEGORY_ORDER, ...E.WORLD_ORDER].map((k) => [k, `${E.CATEGORIES[k].emoji} ${E.CATEGORIES[k].label}`]);
const DIFF_OPTS = [["progressive", "Progresiva"], ["easy", "Fácil"], ["medium", "Intermedia"], ["hard", "Difícil"], ["extreme", "Extrema"]];
const sel = (id, opts, val, attrs = "") => `<select id="${id}" ${attrs}>${opts.map(([k, l]) => `<option value="${k}" ${String(val) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

// ---------- Biblioteca de audio del canal ----------
async function loadLib(chId, force) {
  if (!chId) return [];
  if (!force && RS.lib[chId]) return RS.lib[chId];
  const { data } = await sb.from("channel_audio").select("*").eq("channel_id", chId);
  RS.lib[chId] = data || [];
  return RS.lib[chId];
}
const libGet = (chId, kind, code) => (RS.lib[chId] || []).find((x) => x.kind === kind && x.code === code);
const voiceKey = (voiceId, text) => `v_${E.hashStr(`${voiceId}|${text}`).toString(36)}`;

// ---------- Audio del navegador (previsualización) ----------
let AC = null; const decoded = new Map();
// En iPhone el interruptor de silencio apaga el audio de las páginas web. Para que la previsualización suene
// como un reproductor (igual que un vídeo), se declara la sesión como «reproducción» y, en iOS antiguos,
// se mantiene un <audio> silencioso sonando mientras se reproduce.
let SILENT = null;
function silentWav() { const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, t) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0))); w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true); b.fill(128, 44); let s = ""; b.forEach((x) => (s += String.fromCharCode(x))); return "data:audio/wav;base64," + btoa(s); }
function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (_) { /* navegador sin audioSession */ }
  try { if (!SILENT) { SILENT = new Audio(silentWav()); SILENT.loop = true; SILENT.setAttribute("playsinline", ""); } SILENT.play().catch(() => {}); } catch (_) { /* sin <audio> */ }
}
function ac() { unlockAudio(); if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
async function buffer(url) {
  if (!url) return null;
  if (decoded.has(url)) return decoded.get(url);
  const p = fetch(url).then((r) => r.arrayBuffer()).then((b) => ac().decodeAudioData(b)).catch(() => null);
  decoded.set(url, p); return p;
}
const GROUP = Object.fromEntries(E.SOUNDS.map((s) => [s.code, s.group]));

// Reproductor: dibuja con el mismo motor que el vídeo final y programa los sonidos con precisión de muestra
class Player {
  constructor(canvas, project, chId, opts = {}) { this.cv = canvas; this.ctx = canvas.getContext("2d"); this.chId = chId; this.t = 0; this.playing = false; this.srcs = []; this.stopAt = opts.stopAt; this.onTick = opts.onTick || (() => {}); this.setProject(project); this.draw(); }
  setProject(p) {
    this.project = p; try { this.tl = E.timeline(p); } catch (e) { this.tl = null; }
    // Al abrir se muestra ya el primer reto (no un fotograma vacío)
    if (this.t === 0 && this.tl?.segments[0]?.play) this.t = this.tl.segments[0].play[0] + 0.4;
    if (this.t > (this.tl?.duration || 0)) this.t = 0; if (!this.playing) this.draw();
  }
  draw() { if (!this.tl) return; const { width: W, height: H } = this.cv; drawFrame(this.ctx, W, H, this.project, this.tl, Math.min(this.t, this.tl.duration - 0.001)); this.onTick(this.t, this.tl.duration); }
  async play() {
    if (!this.tl) return; if (this.t >= (this.stopAt ?? this.tl.duration) - 0.05) this.t = 0;
    const A = ac(); await A.resume();
    const lib = RS.lib[this.chId] || [], cfg = E.mergeConfig(this.project.config), V = cfg.volumes;
    const vol = (g) => (V[g] ?? V.sfx) / 100;
    const start = A.currentTime + 0.08, base = this.t, end = this.stopAt ?? this.tl.duration;
    this.base = base; this.startAt = start; this.playing = true;
    const play = async (url, at, gain, opt = {}) => { const b = await buffer(url); if (!b || !this.playing) return; const s = A.createBufferSource(); s.buffer = b; const g = A.createGain(); g.gain.value = gain; s.connect(g).connect(A.destination); if (opt.loop) s.loop = true; const when = start + Math.max(0, at - base); s.start(when, Math.max(0, base - at) % (opt.loop ? b.duration : 1e9)); if (opt.until) s.stop(start + opt.until - base); if (opt.fadeIn) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + opt.fadeIn); } if (opt.until && opt.fadeOut) { g.gain.setValueAtTime(gain, start + opt.until - base - opt.fadeOut); g.gain.linearRampToValueAtTime(0, start + opt.until - base); } this.srcs.push(s); };
    for (const e of this.tl.events) { if (e.t < base - 0.02 || e.t > end) continue; const row = (lib.find((x) => x.kind === "sfx" && x.code === e.code)); if (row?.url) play(row.url, e.t, e.gain * vol(GROUP[e.code]) * (row.volume ?? 100) / 100); }
    const voiceId = (S.channels.find((c) => c.id === this.chId) || {}).voice_id || "JBFqnCBsd6RMkjVDRZzb";
    for (const v of this.tl.voice) { if (v.t < base - 0.02 || v.t > end) continue; const row = lib.find((x) => x.kind === "voice" && x.code === voiceKey(voiceId, v.text)); if (row?.url) play(row.url, v.t, V.voice / 100); }
    if (cfg.music_mode !== "none") this.tl.music.forEach((m, i) => { const t1 = i + 1 < this.tl.music.length ? this.tl.music[i + 1].t : this.tl.duration; if (t1 < base || m.t > end) return; const def = E.MUSIC.find((x) => x.mood === m.mood); const row = lib.find((x) => x.kind === "music" && x.code === def.code); if (row?.url) play(row.url, m.t, (V.music / 100) * (row.volume ?? 100) / 100 * 0.9, { loop: true, until: Math.min(t1 + 1.2, end), fadeIn: 1, fadeOut: 1.2 }); });
    const loop = () => { if (!this.playing) return; this.t = base + (A.currentTime - start); if (this.t >= end) { this.t = end; this.pause(); this.draw(); return; } this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  pause() { this.playing = false; cancelAnimationFrame(this.raf); try { SILENT?.pause(); } catch (_) { /* nada */ } for (const s of this.srcs) { try { s.stop(); } catch (_) { /* ya parado */ } } this.srcs = []; this.onTick(this.t, this.tl?.duration || 0); }
  seek(t) { const was = this.playing; this.pause(); this.t = Math.max(0, Math.min(t, (this.tl?.duration || 0) - 0.01)); this.draw(); if (was) this.play(); }
  destroy() { this.pause(); }
}

// ================= Generador (en «Revisar») =================
function producerSection() {
  const chs = retosChannels();
  if (!chs.length) return `<section><div class="sec-h"><h2>Producir retos</h2></div><div class="card"><div class="spread"><div><b>Motor de retos visuales</b><div class="why">Vídeos de acertijos dibujados con código: sin imágenes de IA, con temporizadores, sonidos y puntuaciones. Crea un canal de tipo «Retos» para empezar.</div></div><button class="btn pri" onclick="RetosUI.newChannel()">Crear canal de retos</button></div></div></section>`;
  const g = RS.gen; if (!g.channel || !chs.some((c) => c.id === g.channel)) g.channel = chs[0].id;
  const c = chs.find((x) => x.id === g.channel), cfg = E.mergeConfig(c.retos_config);
  return `<section><div class="sec-h"><h2>Producir retos</h2><span class="chip">Motor de retos</span></div><div class="card">
    <div class="fgrid">
      <label class="f">Canal${sel("rg-ch", chs.map((x) => [x.id, x.name]), g.channel, 'onchange="RetosUI.setGen(\'channel\',this.value)"')}</label>
      <label class="f">Tipo de contenido${sel("rg-fmt", [["long", "Vídeo largo (16:9)"], ["short", "Short (9:16)"], ["both", "Generar ambos"]], g.format, 'onchange="RetosUI.setGen(\'format\',this.value)"')}</label>
      <label class="f">Estilo de juego${sel("rg-style", Object.entries(E.GAME_STYLES).map(([k, x]) => [k, x.label]), g.style, 'onchange="RetosUI.setGen(\'style\',this.value);RetosUI.setGen(\'category\',\'mixed\')"')}</label>
      <label class="f">Categoría${sel("rg-cat", CAT_OPTS(), g.category, 'onchange="RetosUI.setGen(\'category\',this.value)"')}</label>
      <label class="f">Dificultad${sel("rg-diff", DIFF_OPTS, g.difficulty, 'onchange="RetosUI.setGen(\'difficulty\',this.value)"')}</label>
      ${g.format !== "short" ? `<label class="f">Duración del largo (min)<input type="number" id="rg-min" min="2" max="20" step="0.5" value="${g.minutes || cfg.long_minutes}" onchange="RetosUI.setGen('minutes',+this.value)"></label>` : ""}
      ${g.format !== "long" ? `<label class="f">Duración del Short (s)<input type="number" id="rg-sec" min="15" max="35" value="${g.seconds}" onchange="RetosUI.setGen('seconds',+this.value)"></label>` : ""}
      <label class="f">Número de retos <small>Vacío = automático según la duración</small><input type="number" id="rg-n" min="1" max="60" placeholder="Auto" value="${g.count}" onchange="RetosUI.setGen('count',this.value)"></label>
      <div class="f"><span class="label">Sonido</span><div id="rg-sound" class="why">Perfil sonoro del canal: cargando…</div></div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn pri" onclick="RetosUI.generate()">GENERAR VÍDEO</button></div>
    <div class="why" style="margin-top:6px">Antes de montar podrás revisar y editar cada pregunta y su respuesta.</div>
  </div></section>`;
}
async function refreshSoundStatus() {
  const el = document.getElementById("rg-sound"); if (!el) return;
  const id = RS.gen.channel; const lib = await loadLib(id);
  const sfx = E.SOUNDS.filter((s) => libGet(id, "sfx", s.code)?.url).length, mus = E.MUSIC.filter((m) => libGet(id, "music", m.code)?.url).length;
  el.innerHTML = `Perfil sonoro del canal: <b>${sfx}/${E.SOUNDS.length}</b> efectos · <b>${mus}/3</b> músicas guardados${sfx < E.SOUNDS.length || mus < 3 ? " · lo que falte se genera una sola vez al montar" : ""}. <a href="#" onclick="openChannel('${id}');return false">Editar</a>`;
}
// Se redibuja después del evento: si se hace dentro de un «change» que llega con el «blur», el navegador protesta
function setGen(k, v) { RS.gen[k] = v; setTimeout(render, 0); }
async function history(chId) {
  const { data } = await sb.from("challenge_history").select("signature").eq("channel_id", chId).order("created_at", { ascending: false }).limit(1500);
  const { data: vids } = await sb.from("videos").select("retos").eq("channel_id", chId).eq("engine", "challenges").neq("status", "idea_rejected").limit(200);
  return [...(data || []).map((x) => x.signature), ...(vids || []).flatMap((v) => (v.retos?.challenges || []).map((c) => c.signature))];
}
async function generate() {
  const g = RS.gen, c = ch(g.channel); if (!isRetos(c)) return toast("Elige un canal de retos");
  await run(async () => {
    const hist = await history(c.id);
    const formats = g.format === "both" ? ["long", "short"] : [g.format];
    const rows = formats.map((f) => {
      const p = E.buildProject({ game_style: g.style, format: f, category: g.category, difficulty: g.difficulty, count: Number(g.count) || 0, minutes: Number(g.minutes) || 8, seconds: Number(g.seconds) || 30, history: hist, config: c.retos_config, seed: `${c.id}-${Date.now()}-${f}` });
      p.challenges.forEach((x) => hist.push(x.signature));
      return { channel_id: c.id, engine: "challenges", status: "script_review", format: f, title: p.title, idea_title: p.title, retos: p, usage: {}, target_minutes: f === "long" ? Number(g.minutes) || 8 : null };
    });
    const { data, error } = await sb.from("videos").insert(rows).select("id");
    if (error) throw error;
    await load(); await openVideo(data[0].id);
  }, g.format === "both" ? "Vídeo largo y Short generados: revísalos" : "Retos generados: revísalos antes de montar");
}

// ================= Editor de un vídeo de retos =================
function renderEditor(first) {
  const v = S.open.v, c = ch(v.channel_id);
  if (!RS.edit || RS.edit.id !== v.id) RS.edit = { id: v.id, title: v.title || v.retos?.title || "", project: JSON.parse(JSON.stringify(v.retos || { challenges: [] })), dirty: false };
  if (!first && document.getElementById("rt-canvas")) return;
  const short = v.format === "short", P = RS.edit.project;
  const body = `
    <div class="card" style="gap:10px">
      <canvas id="rt-canvas" width="${short ? 540 : 960}" height="${short ? 960 : 540}" style="width:100%;max-width:${short ? "340px" : "100%"};align-self:center;border-radius:12px;background:#000"></canvas>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn sm" id="rt-play" onclick="RetosUI.toggle()">▶ Reproducir</button>
        <button class="btn sm ghost" onclick="RetosUI.step(-1)">◀ Reto</button><button class="btn sm ghost" onclick="RetosUI.step(1)">Reto ▶</button>
        <input type="range" id="rt-seek" min="0" max="1000" value="0" style="flex:1;min-width:120px" oninput="RetosUI.seekPct(this.value)">
        <span class="mono muted" id="rt-time">0:00</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="why">Estilo</span>${sel("rt-ed-style", STYLE_OPTS.slice(0, 3).map(([k, l]) => [k, l]).concat(c.theme?.style === "custom" ? [["custom", "Personalizado"]] : []), E.mergeTheme(P.theme || c.theme).style, `onchange="RetosUI.edStyle(this.value)"`)}<button class="btn sm ghost" id="rt-ed-use" style="display:${P.theme ? "" : "none"}" onclick="RetosUI.useStyle()">Usar como estilo del canal</button></div>
      <div class="why" id="rt-audio-note"></div>
    </div>
    <label class="f full">Título del vídeo<input type="text" id="rt-title" value="${esc(RS.edit.title)}" oninput="RetosUI.setTitle(this.value)"></label>
    <div id="rt-sum"></div>
    <div id="rt-list" class="list"></div>
    <div class="card"><div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-end">
      <label class="f" style="margin:0">Categoría${sel("rt-add-cat", ALL_CATS(), P.game_style === "world" ? "maze" : "odd")}</label>
      <label class="f" style="margin:0">Dificultad${sel("rt-add-diff", DIFF_OPTS.slice(1), "medium")}</label>
      <button class="btn sm" onclick="RetosUI.add()">＋ Añadir reto</button>
    </div></div>`;
  const foot = `<button class="btn ghost danger" onclick="discardVideo()">Descartar</button><button class="btn" onclick="RetosUI.save(true)">Guardar</button><button class="btn pri" id="rt-approve" onclick="RetosUI.approve()">Aprobar y montar</button>`;
  sheetShell(RS.edit.title || "Retos", `${chTag(v.channel_id)}<span class="chip">${short ? "Short 9:16" : "Largo 16:9"}</span><span class="chip">Retos</span>`, body, foot);
  $("#scrim").classList.add("on"); $("#sheet").classList.add("on"); $("#sheet").setAttribute("aria-hidden", "false");
  RS.player?.destroy();
  RS.player = new Player(document.getElementById("rt-canvas"), withChannel(P, c, short), c.id, { onTick: (t, d) => { const s = document.getElementById("rt-seek"), tm = document.getElementById("rt-time"); if (s) s.value = d ? Math.round((t / d) * 1000) : 0; if (tm) tm.textContent = `${fmtT(t)} / ${fmtT(d)}`; const b = document.getElementById("rt-play"); if (b) b.textContent = RS.player?.playing ? "❚❚ Pausa" : "▶ Reproducir"; } });
  renderList();
  loadLib(c.id, true).then(() => { const lib = RS.lib[c.id] || []; const sfx = E.SOUNDS.filter((s) => lib.some((x) => x.kind === "sfx" && x.code === s.code && x.url)).length; const n = document.getElementById("rt-audio-note"); if (n) n.innerHTML = sfx < E.SOUNDS.length ? `La previsualización suena con los ${sfx} efectos que ya tiene el canal. Los que faltan se generan una vez al montar, o antes en <a href="#" onclick="openChannel('${c.id}');return false">Identidad sonora</a>.` : "Se oye con la identidad sonora guardada del canal. ¿No oyes nada? Sube el volumen del dispositivo."; });
}
const withChannel = (p, c, short) => ({ ...p, format: short ? "short" : "long", config: E.mergeConfig(c.retos_config), theme: p.theme || c.theme || {} });
function summary() {
  const v = S.open.v, c = ch(v.channel_id), p = withChannel(RS.edit.project, c, v.format === "short");
  const val = E.validateProject(p); let tl = null; try { tl = E.timeline(p); } catch (_) { /* proyecto vacío */ }
  const res = tl ? E.resourcesOf(p, tl) : null;
  const ap = document.getElementById("rt-approve"); if (ap) ap.disabled = !val.ok;
  return `<div class="card"><div class="row" style="flex-wrap:wrap;gap:8px">
    <span class="chip">${p.challenges.length} retos</span>${tl ? `<span class="chip">${fmtT(tl.duration)} de vídeo</span><span class="chip">${tl.max_points} puntos máximos</span>` : ""}
    <span class="chip ${val.ok ? "st-ok" : "st-bad"}">${val.ok ? "✓ Todas las soluciones comprobadas" : `✗ ${val.results.filter((x) => !x.ok).length} retos con errores`}</span></div>
    ${res ? `<div class="muted mono" style="font-size:11.5px;margin-top:6px">Recursos: ${res.ai_images} imágenes IA · ${res.sounds_used.length} sonidos del canal reutilizados (${res.sound_events} momentos) · música: ${res.music_moods.map((m) => E.MUSIC.find((x) => x.mood === m)?.name.toLowerCase() || m).join(", ") || "ninguna"} · voz: ${res.voice_lines} frases (${res.voice_chars} caracteres)</div>` : ""}
    ${p.target_seconds && tl ? `<div class="why" style="margin-top:4px">Duración objetivo ${fmtT(p.target_seconds)}: la real sale del tiempo de juego, sin rellenos.</div>` : ""}</div>`;
}
function renderList() {
  const el = document.getElementById("rt-list"); if (!el) return;
  const cs = RS.edit.project.challenges;
  let round = null;
  el.innerHTML = cs.map((c, i) => {
    const val = E.validateChallenge(c), cat = E.CATEGORIES[c.category] || {};
    const head = c.difficulty !== round ? ((round = c.difficulty), `<div class="label" style="margin-top:6px">${E.DIFF_LABEL[c.difficulty]} · ${c.points} ${c.points === 1 ? "punto" : "puntos"} por acierto</div>`) : "";
    const answer = c.answer?.label || (c.answer && "option" in c.answer ? `Opción ${"ABCD"[c.answer.option]}` : "");
    return `${head}<div class="card" style="gap:8px">
      <div class="spread"><div class="row" style="gap:6px;flex-wrap:wrap"><b class="mono">${i + 1}</b><span class="chip">${cat.emoji || ""} ${esc(cat.label || c.category)}</span><span class="chip ${val.ok ? "st-ok" : "st-bad"}">${val.ok ? "✓ Solución comprobada" : "✗ Revisar"}</span></div>
        <div class="row" style="gap:4px"><button class="btn sm ghost" title="Ver en la previsualización" onclick="RetosUI.jump(${i})">▶</button><button class="btn sm ghost" title="Subir" onclick="RetosUI.move(${i},-1)" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn sm ghost" title="Bajar" onclick="RetosUI.move(${i},1)" ${i === cs.length - 1 ? "disabled" : ""}>↓</button><button class="btn sm ghost danger" title="Eliminar" onclick="RetosUI.remove(${i})">✕</button></div></div>
      <div class="fgrid">
        <label class="f full">Pregunta<input type="text" value="${esc(c.question)}" onchange="RetosUI.set(${i},'question',this.value)"></label>
        <label class="f">Dificultad${sel(`rt-d${i}`, DIFF_OPTS.slice(1), c.difficulty, `onchange="RetosUI.setDiff(${i},this.value)"`)}</label>
        <label class="f">Tiempo (s)<input type="number" min="3" max="30" value="${c.time}" onchange="RetosUI.set(${i},'time',+this.value)"></label>
        <label class="f full">Explicación <small>Se muestra tras la solución${c.explanation ? "" : " (opcional)"}</small><textarea rows="2" onchange="RetosUI.set(${i},'explanation',this.value)">${esc(c.explanation || "")}</textarea></label>
      </div>
      <div class="spread" style="flex-wrap:wrap;gap:6px"><div class="why">Respuesta: <b>${esc(answer)}</b>${val.ok ? "" : `<br><span style="color:var(--bad)">${esc(val.errors.join(" · "))}</span>`}</div>
        <div class="row" style="gap:6px"><button class="btn sm" onclick="RetosUI.reshuffle(${i})">🔀 Cambiar posiciones</button><button class="btn sm" onclick="RetosUI.regen(${i})">🔄 Regenerar</button></div></div>
    </div>`;
  }).join("");
  const s = document.getElementById("rt-sum"); if (s) s.innerHTML = summary();
}
function changed() {
  const v = S.open.v, c = ch(v.channel_id);
  RS.edit.dirty = true; setTimeout(renderList, 0);
  RS.player?.setProject(withChannel(RS.edit.project, c, v.format === "short"));
  clearTimeout(RS.saveT); RS.saveT = setTimeout(() => save(false), 900);
}
async function save(showToast) {
  if (!RS.edit) return;
  const { error } = await sb.from("videos").update({ retos: RS.edit.project, title: RS.edit.title || null, idea_title: RS.edit.title || null }).eq("id", RS.edit.id);
  if (error) return toast(error.message);
  RS.edit.dirty = false; if (showToast) toast("Guardado");
}
const cfgOf = () => E.mergeConfig(ch(S.open.v.channel_id).retos_config);
const ops = {
  set(i, k, val) { const c = RS.edit.project.challenges[i]; c[k] = val; changed(); },
  setDiff(i, d) { const c = RS.edit.project.challenges[i]; RS.edit.project.challenges[i] = { ...E.makeChallenge({ category: c.category, mechanic: c.mechanic, difficulty: d, config: cfgOf(), format: S.open?.v?.format }), id: c.id }; changed(); },
  regen(i) { const c = RS.edit.project.challenges[i]; RS.edit.project.challenges[i] = { ...E.makeChallenge({ category: c.category, difficulty: c.difficulty, config: cfgOf(), format: S.open?.v?.format }), id: c.id }; changed(); toast("Reto regenerado: el resto no cambia"); },
  reshuffle(i) { RS.edit.project.challenges[i] = E.reshuffle(RS.edit.project.challenges[i]); changed(); },
  move(i, d) { const a = RS.edit.project.challenges, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; changed(); },
  remove(i) { RS.edit.project.challenges.splice(i, 1); changed(); },
  add() { const c = E.makeChallenge({ category: $("#rt-add-cat").value, difficulty: $("#rt-add-diff").value, config: cfgOf(), format: S.open?.v?.format }); const a = RS.edit.project.challenges; const k = E.DIFFS.indexOf(c.difficulty); // Detrás del último reto de su dificultad o de una menor
    let at = 0; a.forEach((x, j) => { if (E.DIFFS.indexOf(x.difficulty) <= k) at = j + 1; }); a.splice(at, 0, c); changed(); toast(`Añadido en la posición ${at + 1}`); },
};
function jump(i) { const tl = RS.player?.tl; const s = tl?.segments.find((x) => x.type === "challenge" && x.index === i); if (s) RS.player.seek(s.start + 0.01); document.getElementById("rt-canvas")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
function step(d) { const tl = RS.player?.tl; if (!tl) return; const segs = tl.segments.filter((x) => x.type === "challenge"); const cur = segs.findIndex((s) => RS.player.t >= s.start && RS.player.t < s.end); const i = Math.max(0, Math.min(segs.length - 1, (cur < 0 ? 0 : cur) + d)); RS.player.seek(segs[i].start + 0.01); }
async function approve() {
  const v = S.open.v, c = ch(v.channel_id), p = withChannel(RS.edit.project, c, v.format === "short");
  const val = E.validateProject(p); if (!val.ok) return toast("Hay retos sin una solución comprobada");
  await save(false);
  RS.player?.destroy();
  await run(async () => { const { error } = await sb.from("videos").update({ status: "producing", stage: "En cola de montaje", progress: 2, error: null }).eq("id", v.id); if (error) throw error; await kick(); closeSheet(); await load(); }, "Montando el vídeo: sin imágenes de IA, con la identidad sonora del canal");
}

// ================= Panel del canal: identidad visual y sonora =================
// Estilo visual del juego: tres estilos listos (Light por defecto) o uno personalizado a partir de ellos
const STYLE_OPTS = [["light", "Light Game", "Claro y limpio (recomendado)"], ["arcade", "Soft Arcade", "Más color y tarjetas con relieve"], ["dark", "Soft Dark", "Fondo oscuro suave"], ["custom", "Personalizado", "Tus colores y acabados"]];
const COLOR_FIELDS = [["bg", "Fondo general"], ["card", "Tarjetas"], ["ink", "Textos"], ["timer", "Color principal / temporizador"], ["ok", "Respuestas correctas"], ["alert", "Alertas y fin de tiempo"], ["teal", "Secundario"]];
const BG_FIELDS = [["observation", "Fondo · observación"], ["memory", "Fondo · memoria"], ["logic", "Fondo · lógica"], ["extreme", "Fondo · extremo"]];
const SAMPLE_OPTS = [["differences", "Diferencias"], ["odd_symbol", "Encuentra el diferente"], ["sequence_number", "Serie con opciones"], ["hidden_object", "Objeto escondido"]];
const VOL_FIELDS = [["music", "Música"], ["voice", "Voz"], ["sfx", "Efectos generales"], ["clock", "Reloj"], ["transition", "Transiciones"], ["reward", "Recompensas"]];
function channelPanel(c) {
  const cfg = E.mergeConfig(c.retos_config), th = E.mergeTheme(c.theme);
  return `<div class="full" id="retos-panel" style="display:flex;flex-direction:column;gap:14px">
    <div class="label" style="margin-top:6px">Estilo visual del juego</div>
    <div class="card" style="gap:12px">
      <input type="hidden" id="rt-style" value="${th.style}">
      <div id="rt-style-cards" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">${styleCards(th.style)}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <label class="f" style="margin:0">Comparar con${sel("rt-sample", SAMPLE_OPTS, RS.sample || "differences", `onchange="RetosUI.setSample(this.value)"`)}</label>
        <div class="row" style="gap:4px">${[["short", "9:16 Short"], ["long", "16:9 Largo"]].map(([k, l]) => `<button type="button" class="btn sm ${(RS.styleFmt || "short") === k ? "pri" : "ghost"}" onclick="RetosUI.setStyleFmt('${k}')">${l}</button>`).join("")}</div>
        <label class="f" style="margin:0">Animaciones${sel("rt-anim", [["low", "Suaves"], ["normal", "Normales"], ["high", "Más vivas"]], th.anim, `onchange="RetosUI.previewTheme()"`)}</label>
      </div>
      <div id="rt-compare" class="grid" style="gap:10px"></div>
      <div class="why">Mismo reto en los tres estilos, en el momento de la solución. Toca uno para elegirlo; se guarda como estilo del canal al pulsar «Guardar».</div>
      <details id="rt-custom" ${th.style === "custom" ? "open" : ""}><summary class="label" style="cursor:pointer">Personalizar colores y acabados</summary>
        <div class="fgrid" style="margin-top:8px">
          <label class="f">Partir de${sel("rt-base", STYLE_OPTS.slice(0, 3).map(([k, l]) => [k, l]), (c.theme && c.theme.base) || "light", `onchange="RetosUI.customBase(this.value)"`)}</label>
          <label class="f">Tipografía${sel("rt-font", Object.entries(E.FONTS), th.font, `onchange="RetosUI.touchCustom()"`)}</label>
          <label class="f">Bordes${sel("rt-radius", [["small", "Poco redondeados"], ["medium", "Redondeados"], ["large", "Muy redondeados"]], th.radius, `onchange="RetosUI.touchCustom()"`)}</label>
          <label class="f">Sombras${sel("rt-shadow", [["none", "Sin sombra"], ["soft", "Suaves"], ["medium", "Marcadas"]], th.shadowLevel, `onchange="RetosUI.touchCustom()"`)}</label>
          ${[...COLOR_FIELDS, ...BG_FIELDS].map(([k, l]) => `<label class="f">${l}<input type="color" id="rt-th-${k}" value="${BG_FIELDS.some(([x]) => x === k) ? th.bgs[k] : th[k]}" oninput="RetosUI.touchCustom()"></label>`).join("")}
        </div>
        <div class="why">Al cambiar cualquier valor el estilo pasa a «Personalizado». Los fondos por tipo de juego ayudan a distinguir observación, memoria y lógica sin distraer.</div>
      </details>
    </div>
    <div class="label">Temporizador y narración</div>
    <div class="card"><div class="fgrid">
      <label class="f">Modo del reloj${sel("rt-timer", [["normal", "Normal · un tic discreto por segundo"], ["focus", "Concentración · solo los últimos 3 s"], ["extreme", "Extremo · más intenso al final"]], cfg.timer_mode)}</label>
      <label class="check"><input type="checkbox" id="rt-tsound" ${cfg.timer_sounds ? "checked" : ""}> Sonidos del reloj</label>
      <label class="f">Nivel de narración${sel("rt-narr", [["none", "Sin voz"], ["minimal", "Voz mínima (recomendado)"], ["moderate", "Voz moderada · lee las explicaciones"], ["full", "Narración completa"]], cfg.narration)}</label>
      <label class="f">Música del canal${sel("rt-mmode", [["library", "Biblioteca del canal (reutilizada)"], ["video", "Generar música para cada vídeo"], ["none", "Sin música"]], cfg.music_mode)}</label>
    </div></div>
    <div class="label">Volúmenes</div>
    <div class="card"><div class="fgrid">${VOL_FIELDS.map(([k, l]) => `<label class="f">${l} <small id="rt-vl-${k}">${cfg.volumes[k]} %</small><input type="range" id="rt-v-${k}" min="0" max="${k === "voice" ? 150 : 100}" value="${cfg.volumes[k]}" oninput="document.getElementById('rt-vl-${k}').textContent=this.value+' %'"></label>`).join("")}</div>
      <div class="why">El mezclador baja la música bajo la voz, evita la saturación y deja todos los vídeos a -14 LUFS.</div></div>
    <div class="spread"><div class="label">Identidad sonora</div><div class="row" style="gap:6px"><button type="button" class="btn sm" onclick="RetosUI.genMissing('${c.id}')">Generar los que faltan</button><button type="button" class="btn sm pri" onclick="RetosUI.demo('${c.id}')">PROBAR EXPERIENCIA SONORA</button></div></div>
    <div class="why">Cada sonido se genera o se sube una sola vez y se reutiliza en todos los vídeos del canal. Puedes recuperar la versión anterior si un cambio no te convence.</div>
    <div id="rt-sounds" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px">Cargando…</div>
    <div class="label">Música del canal</div>
    <div id="rt-music" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px">Cargando…</div>
    <details><summary class="label" style="cursor:pointer">Avanzado: puntos, tiempos y rangos</summary><div class="card" style="margin-top:8px"><div class="fgrid">
      ${E.DIFFS.map((d) => `<label class="f">Puntos · ${E.DIFF_LABEL[d]}<input type="number" min="1" max="20" id="rt-p-${d}" value="${cfg.points[d]}"></label>`).join("")}
      ${E.DIFFS.map((d) => `<label class="f">Segundos · ${E.DIFF_LABEL[d]}<input type="number" min="3" max="30" id="rt-s-${d}" value="${cfg.times[d]}"></label>`).join("")}
      <label class="f">Duración del largo (min)<input type="number" min="2" max="20" step="0.5" id="rt-lmin" value="${cfg.long_minutes}"></label>
      <label class="f full">Rangos del resultado final <small>De menos a más, separados por comas</small><input type="text" id="rt-ranks" value="${esc(cfg.ranks.join(", "))}"></label>
    </div></div></details>
  </div>`;
}
function collect() {
  const v = (id) => document.getElementById(id);
  if (!v("retos-panel")) return null;
  const theme = readTheme();
  const retos_config = {
    timer_mode: v("rt-timer").value, timer_sounds: v("rt-tsound").checked, narration: v("rt-narr").value, music_mode: v("rt-mmode").value,
    volumes: Object.fromEntries(VOL_FIELDS.map(([k]) => [k, Number(v(`rt-v-${k}`).value)])),
    points: Object.fromEntries(E.DIFFS.map((d) => [d, Math.max(1, Number(v(`rt-p-${d}`).value) || 1)])),
    times: Object.fromEntries(E.DIFFS.map((d) => [d, Math.min(30, Math.max(3, Number(v(`rt-s-${d}`).value) || 6))])),
    long_minutes: Number(v("rt-lmin").value) || 8,
    ranks: v("rt-ranks").value.split(",").map((x) => x.trim()).filter(Boolean),
  };
  return { theme, retos_config };
}
function readTheme() {
  const v = (id) => document.getElementById(id);
  const style = v("rt-style")?.value || "light", anim = v("rt-anim")?.value || "normal";
  if (style !== "custom") return { style, anim };
  return { style, base: v("rt-base").value, font: v("rt-font").value, radius: v("rt-radius").value, shadow: v("rt-shadow").value, anim,
    overrides: Object.fromEntries([...COLOR_FIELDS, ...BG_FIELDS].map(([k]) => [k, v(`rt-th-${k}`).value])) };
}
function styleCards(cur) {
  return STYLE_OPTS.map(([k, l, d]) => { const P = k === "custom" ? null : E.STYLES[k]; return `<button type="button" class="card" onclick="RetosUI.pickStyle('${k}')" style="gap:6px;text-align:left;cursor:pointer;padding:10px;${cur === k ? "outline:3px solid var(--acc, #FFC83D);outline-offset:-1px" : ""}">
    <div class="row" style="gap:4px">${(P ? [P.bg, P.card, P.timer, P.ok, P.alert] : ["#ccc", "#fff", "#999", "#666", "#333"]).map((x) => `<span style="width:16px;height:16px;border-radius:50%;background:${x};border:1px solid rgba(0,0,0,.15)"></span>`).join("")}</div>
    <b>${l}${k === "light" ? " · predeterminado" : ""}</b><span class="why">${d}</span></button>`; }).join("");
}
// Mismo reto, en el instante de la solución, para comparar estilos sin montar nada
function sampleProject(fmt) {
  const mech = RS.sample || "differences", cat = Object.entries(E.CATEGORIES).find(([, c]) => c.mechanics.includes(mech))[0];
  const c = E.makeChallenge({ category: cat, mechanic: mech, difficulty: "medium", seed: `estilo-${mech}` });
  return { format: fmt, challenges: [c], config: {} };
}
function sampleTime(tl) { const s = tl.segments.find((x) => x.type === "challenge"); return s.reveal[0] + 1.6; }
function previewTheme() {
  const box = document.getElementById("rt-compare"); if (!box) return;
  const fmt = RS.styleFmt || "short", short = fmt === "short", W = short ? 360 : 640, H = short ? 640 : 360;
  const cur = readTheme(), list = cur.style === "custom" ? ["light", "arcade", "dark", "custom"] : ["light", "arcade", "dark"];
  box.style.gridTemplateColumns = short ? `repeat(${list.length},minmax(0,1fr))` : "repeat(auto-fill,minmax(260px,1fr))";
  box.innerHTML = list.map((k) => `<button type="button" onclick="RetosUI.pickStyle('${k}')" style="all:unset;cursor:pointer;display:flex;flex-direction:column;gap:4px;align-items:center"><canvas data-k="${k}" width="${W}" height="${H}" style="width:100%;border-radius:10px;${cur.style === k ? "outline:3px solid #FFC83D;outline-offset:2px" : "outline:1px solid rgba(0,0,0,.12)"}"></canvas><span class="why">${STYLE_OPTS.find((x) => x[0] === k)[1]}</span></button>`).join("");
  const base = sampleProject(fmt);
  box.querySelectorAll("canvas").forEach((cv) => { const k = cv.dataset.k, p = { ...base, theme: k === "custom" ? cur : { style: k, anim: cur.anim } }; const tl = E.timeline(p); drawFrame(cv.getContext("2d"), W, H, p, tl, sampleTime(tl)); });
}
function pickStyle(k) {
  const v = document.getElementById("rt-style"); if (!v) return; v.value = k;
  const cards = document.getElementById("rt-style-cards"); if (cards) cards.innerHTML = styleCards(k);
  if (k === "custom") document.getElementById("rt-custom").open = true;
  previewTheme();
}
// Rellena los controles personalizados con los valores del estilo de partida
function customBase(k) {
  const T = E.mergeTheme({ style: k }), set = (id, x) => { const el = document.getElementById(id); if (el) el.value = x; };
  COLOR_FIELDS.forEach(([f]) => set(`rt-th-${f}`, T[f])); BG_FIELDS.forEach(([f]) => set(`rt-th-${f}`, T.bgs[f]));
  set("rt-font", T.font); set("rt-radius", T.radius); set("rt-shadow", T.shadowLevel);
  touchCustom();
}
function touchCustom() { const v = document.getElementById("rt-style"), d = document.getElementById("rt-custom"); if (d) d.open = true; if (v && v.value !== "custom") { v.value = "custom"; const cards = document.getElementById("rt-style-cards"); if (cards) cards.innerHTML = styleCards("custom"); } clearTimeout(RS.thT); RS.thT = setTimeout(previewTheme, 60); }
function soundCard(c, kind, def) {
  const row = libGet(c.id, kind, def.code) || {}, st = row.status === "generating" ? ["Generando…", "st-warn"] : row.status === "failed" ? ["Error", "st-bad"] : row.url ? ["Guardado", "st-ok"] : ["Falta", ""];
  const prev = (row.history || [])[0];
  return `<div class="card" style="gap:8px">
    <div class="spread"><b>${def.emoji} ${esc(def.name).toUpperCase()}</b><span class="mono muted">${def.code}</span></div>
    <div class="why">${esc(def.event || (kind === "music" ? "Música de fondo" : ""))}${row.version ? ` · versión ${row.version}${row.source === "upload" ? " (archivo propio)" : ""}` : ""}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap">
      <button type="button" class="btn sm" onclick="RetosUI.listen('${c.id}','${kind}','${def.code}')" ${row.url ? "" : "disabled"}>▶ Escuchar</button>
      <button type="button" class="btn sm" onclick="RetosUI.regenAudio('${c.id}','${kind}','${def.code}')" ${row.status === "generating" ? "disabled" : ""}>🔄 ${row.url ? "Regenerar" : "Generar"}</button>
      <label class="btn sm" style="cursor:pointer">📁 Subir<input type="file" accept="audio/*" hidden onchange="RetosUI.uploadAudio('${c.id}','${kind}','${def.code}',this.files[0])"></label>
      ${prev ? `<button type="button" class="btn sm ghost" title="Volver a la versión ${prev.version}" onclick="RetosUI.restore('${c.id}','${kind}','${def.code}')">↩ Anterior</button>` : ""}
    </div>
    <label class="f" style="margin:0">Volumen <small id="rt-sv-${kind}${def.code}">${row.volume ?? 100} %</small><input type="range" min="0" max="200" value="${row.volume ?? 100}" ${row.url ? "" : "disabled"} oninput="document.getElementById('rt-sv-${kind}${def.code}').textContent=this.value+' %'" onchange="RetosUI.setVolume('${c.id}','${kind}','${def.code}',+this.value)"></label>
    <div class="spread"><span class="chip ${st[1]}">${st[0]}</span>${row.error ? `<span class="why" style="color:var(--bad)">${esc(row.error.slice(0, 90))}</span>` : ""}</div>
    <details><summary class="why" style="cursor:pointer">Descripción para generarlo${row.license ? " · licencia" : ""}</summary><textarea rows="3" id="rt-pr-${kind}${def.code}" style="width:100%;margin-top:6px">${esc(row.prompt && row.source !== "upload" ? row.prompt : def.prompt)}</textarea>${row.license ? `<div class="why">Licencia: ${esc(row.license)}</div>` : ""}</details>
  </div>`;
}
async function mountChannel(c) {
  if (!document.getElementById("retos-panel") || !c.id) { const s = document.getElementById("rt-sounds"); if (s) s.innerHTML = `<div class="why">Guarda el canal para crear su identidad sonora.</div>`; const m = document.getElementById("rt-music"); if (m) m.innerHTML = ""; previewTheme(); return; }
  previewTheme();
  await loadLib(c.id, true);
  paintAudio(c);
  // Mientras haya sonidos generándose, se refresca solo
  clearInterval(RS.polling);
  RS.polling = setInterval(async () => { if (!document.getElementById("retos-panel")) return clearInterval(RS.polling); const lib = RS.lib[c.id] || []; if (!lib.some((x) => x.status === "generating") && !RS.waiting) return; RS.waiting = false; await loadLib(c.id, true); paintAudio(c); }, 4000);
}
function paintAudio(c) { const s = document.getElementById("rt-sounds"), m = document.getElementById("rt-music"); if (s) s.innerHTML = E.SOUNDS.map((d) => soundCard(c, "sfx", d)).join(""); if (m) m.innerHTML = E.MUSIC.map((d) => soundCard(c, "music", d)).join(""); }
const defOf = (kind, code) => (kind === "music" ? E.MUSIC : E.SOUNDS).find((x) => x.code === code);
async function listen(chId, kind, code) { const r = libGet(chId, kind, code); if (!r?.url) return; const A = ac(); await A.resume(); const b = await buffer(r.url); if (!b) return toast("No se pudo cargar"); RS.listenSrc?.stop?.(); const s = A.createBufferSource(); s.buffer = b; const g = A.createGain(); g.gain.value = (r.volume ?? 100) / 100; s.connect(g).connect(A.destination); s.start(); if (kind === "music") setTimeout(() => { try { s.stop(); } catch (_) { /* parado */ } }, 15000); RS.listenSrc = s; }
async function regenAudio(chId, kind, code) {
  const prompt = document.getElementById(`rt-pr-${kind}${code}`)?.value?.trim();
  await run(async () => {
    const { error } = await sb.from("jobs").insert({ step: "audio_asset", channel_id: chId, payload: { kind, code, prompt } }); if (error) throw error;
    const rows = RS.lib[chId] || []; const r = rows.find((x) => x.kind === kind && x.code === code); if (r) r.status = "generating"; else rows.push({ kind, code, status: "generating" }); RS.lib[chId] = rows; RS.waiting = true;
    await kick(); paintAudio(ch(chId));
  }, kind === "music" ? "Componiendo la música (tarda un minuto)" : "Generando el sonido…");
}
async function genMissing(chId) {
  await loadLib(chId, true);
  const miss = [...E.SOUNDS.map((d) => ["sfx", d]), ...E.MUSIC.map((d) => ["music", d])].filter(([k, d]) => !libGet(chId, k, d.code)?.url && libGet(chId, k, d.code)?.status !== "generating");
  if (!miss.length) return toast("La identidad sonora ya está completa");
  await run(async () => { const { error } = await sb.from("jobs").insert(miss.map(([kind, d]) => ({ step: "audio_asset", channel_id: chId, payload: { kind, code: d.code } }))); if (error) throw error; for (const [kind, d] of miss) { (RS.lib[chId] = RS.lib[chId] || []).push({ kind, code: d.code, status: "generating" }); } RS.waiting = true; await kick(); paintAudio(ch(chId)); }, `Generando ${miss.length} recursos (una sola vez)`);
}
async function uploadAudio(chId, kind, code, file) {
  if (!file) return; if (file.size > 15e6) return toast("El archivo pesa más de 15 MB");
  const license = prompt("Licencia o procedencia del archivo (por ejemplo: propio, Pixabay, comprado en…):", "Propio") ?? "Propio";
  await run(async () => {
    const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `channels/${chId}/audio/${kind}/${code}_up_${Date.now()}.${ext}`;
    const up = await sb.storage.from("media").upload(path, file, { contentType: file.type || "audio/mpeg" }); if (up.error) throw up.error;
    const url = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    const cur = libGet(chId, kind, code) || {};
    const hist = cur.url ? [{ url: cur.url, path: cur.path, version: cur.version, source: cur.source, prompt: cur.prompt, volume: cur.volume, at: cur.updated_at }, ...(cur.history || [])].slice(0, 10) : (cur.history || []);
    const row = { channel_id: chId, kind, code, name: defOf(kind, code).name, url, path, version: (cur.version || 0) + (cur.url ? 1 : 1), source: "upload", prompt: file.name, license, status: "ready", error: null, history: hist, volume: cur.volume ?? 100 };
    const { error } = await sb.from("channel_audio").upsert(row, { onConflict: "channel_id,kind,code" }); if (error) throw error;
    await loadLib(chId, true); paintAudio(ch(chId));
  }, "Archivo guardado en la biblioteca del canal");
}
async function setVolume(chId, kind, code, vol) { const { error } = await sb.from("channel_audio").update({ volume: vol }).eq("channel_id", chId).eq("kind", kind).eq("code", code); if (error) return toast(error.message); const r = libGet(chId, kind, code); if (r) r.volume = vol; toast("Volumen guardado"); }
async function restore(chId, kind, code) {
  const cur = libGet(chId, kind, code); const [prev, ...rest] = cur?.history || []; if (!prev) return;
  await run(async () => {
    const hist = [{ url: cur.url, path: cur.path, version: cur.version, source: cur.source, prompt: cur.prompt, volume: cur.volume, at: cur.updated_at }, ...rest].slice(0, 10);
    const { error } = await sb.from("channel_audio").update({ url: prev.url, path: prev.path, version: prev.version, source: prev.source, prompt: prev.prompt, volume: prev.volume ?? cur.volume, history: hist, status: "ready", error: null }).eq("id", cur.id); if (error) throw error;
    await loadLib(chId, true); paintAudio(ch(chId));
  }, `Recuperada la versión ${prev.version}`);
}
// Demostración de ~15 s: nueva pregunta, temporizador con cinco tics, tiempo agotado, solución y cambio de nivel
// Editor: probar otro estilo en la previsualización y, si convence, guardarlo en el canal
function edStyle(k) {
  const v = S.open?.v, c = v && ch(v.channel_id); if (!c || !RS.player) return;
  const theme = k === E.mergeTheme(c.theme).style ? c.theme || {} : { ...(c.theme?.anim ? { anim: c.theme.anim } : {}), style: k };
  // El estilo queda guardado en este vídeo (el montaje usa el mismo que se ve aquí)
  RS.edit.theme = theme; if (k === E.mergeTheme(c.theme).style) delete RS.edit.project.theme; else RS.edit.project.theme = theme;
  RS.player.setProject({ ...RS.player.project, theme }); RS.player.draw(); changed();
  const b = document.getElementById("rt-ed-use"); if (b) b.style.display = k === E.mergeTheme(c.theme).style ? "none" : "";
}
async function useStyle() {
  const v = S.open?.v, c = v && ch(v.channel_id), theme = RS.edit?.theme; if (!c || !theme) return;
  const { error } = await sb.from("channels").update({ theme }).eq("id", c.id); if (error) return toast(error.message);
  c.theme = theme; toast(`Estilo del canal: ${E.STYLES[theme.style]?.name || "Personalizado"}`);
  const b = document.getElementById("rt-ed-use"); if (b) b.style.display = "none";
  if (RS.edit?.project.theme) { delete RS.edit.project.theme; changed(); } // ya es el del canal
}
async function demo(chId) {
  const c = ch(chId), form = collect();
  const cfg = E.mergeConfig({ ...(c.retos_config || {}), ...(form?.retos_config || {}), narration: "none" });
  const a = E.makeChallenge({ category: "odd", mechanic: "odd_symbol", difficulty: "easy", seed: "demo-a", config: cfg }); a.time = 5;
  const b = E.makeChallenge({ category: "odd", mechanic: "odd_color", difficulty: "medium", seed: "demo-b", config: cfg });
  const p = { format: "long", challenges: [a, b], config: cfg, theme: form?.theme || c.theme };
  const tl = E.timeline(p), stop = tl.segments.find((s) => s.type === "round")?.end ?? 15;
  await loadLib(chId, true);
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.75);display:grid;place-items:center;padding:16px";
  wrap.innerHTML = `<div style="width:min(960px,100%);display:flex;flex-direction:column;gap:10px"><canvas width="960" height="540" style="width:100%;border-radius:12px;background:#000"></canvas><div class="row" style="justify-content:space-between"><span class="why" style="color:#fff">Experiencia sonora del canal · ${fmtT(stop)}</span><button class="btn">Cerrar</button></div></div>`;
  document.body.appendChild(wrap);
  const pl = new Player(wrap.querySelector("canvas"), p, chId, { stopAt: stop });
  const close = () => { pl.destroy(); wrap.remove(); };
  wrap.querySelector("button").onclick = close; wrap.onclick = (e) => { if (e.target === wrap) close(); };
  pl.play();
}
function newChannel() { openChannel(null, { name: "Reto Imposible", niche: "Retos visuales y acertijos", production_type: "challenges", format: "long", formats: ["long", "short"], long_minutes: 8, auto_ideas: false, music_mode: "off", sfx_enabled: false, ideas_per_run: 5 }); }
// Informe de recursos de un vídeo de retos ya montado
function reportLine(v) {
  const r = v.retos?.report; if (!r) return "";
  return `<div class="muted mono" style="font-size:11.5px">Recursos: ${r.ai_images ?? 0} imágenes IA · ${r.sfx_files ?? 0} efectos y ${r.music_files ?? 0} músicas reutilizados · ${r.voice_files ?? 0} frases de voz · ${r.sound_events ?? 0} sonidos sincronizados · dibujo y montaje ${Math.round((r.render_seconds ?? 0) / 6) / 10} min · sonido ${r.audio?.lufs ?? "?"} LUFS (pico ${r.audio?.true_peak ?? "?"} dB)</div>`;
}

window.RetosUI = {
  isRetos, producerSection, refreshSoundStatus, setGen, generate, renderEditor, channelPanel, collect, mountChannel, previewTheme, reportLine, newChannel,
  pickStyle, customBase, touchCustom, edStyle, useStyle,
  forChannel: (id) => { RS.gen.channel = id; }, // la vista de un canal fija el canal del generador sin redibujar
  setSample: (k) => { RS.sample = k; previewTheme(); }, setStyleFmt: (k) => { RS.styleFmt = k; const p = document.getElementById("retos-panel"); p?.querySelectorAll("[onclick^=\"RetosUI.setStyleFmt\"]").forEach((b) => { b.classList.toggle("pri", b.getAttribute("onclick").includes(`'${k}'`)); b.classList.toggle("ghost", !b.getAttribute("onclick").includes(`'${k}'`)); }); previewTheme(); },
  listen, regenAudio, genMissing, uploadAudio, setVolume, restore, demo,
  toggle: () => (RS.player?.playing ? RS.player.pause() : RS.player?.play()), step, jump, seekPct: (v) => RS.player?.seek((v / 1000) * (RS.player.tl?.duration || 0)),
  setTitle: (t) => { RS.edit.title = t; clearTimeout(RS.saveT); RS.saveT = setTimeout(() => save(false), 900); },
  save, approve, add: ops.add, set: ops.set, setDiff: ops.setDiff, regen: ops.regen, reshuffle: ops.reshuffle, move: ops.move, remove: ops.remove,
  closeEditor: () => { RS.player?.destroy(); RS.player = null; if (RS.edit?.dirty) save(false); RS.edit = null; },
};
// La página principal ya puede usar el motor de retos
if (typeof S !== "undefined" && S.session) render();
