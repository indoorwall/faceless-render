// Faceless Studio — worker del pipeline
// Autenticación propia: cabecera x-cron-secret (pg_cron) o JWT de un miembro (web).
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonrepair } from "npm:jsonrepair@3.13.1";
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SELF_URL = `${SB_URL}/functions/v1/worker`;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MODEL_SCRIPT = "claude-opus-5-5";
const MODEL_FAST = "claude-sonnet-5-5";
const MODEL_CHEAP = "claude-haiku-5-5";
const MUSIC_MODEL = "music_v2_5";
const SFX_MODEL = "eleven_text_to_sound_v3";
const MUSIC_LIBRARY = 4;
// Efectos de sonido: un catálogo fijo que se genera una sola vez por canal y se reutiliza siempre
const SFX_LIB: Record<string, string> = {
  whoosh: "deep cinematic whoosh transition",
  boom: "low cinematic impact boom with long reverb tail",
  riser: "short tense cinematic riser building suspense",
  hit: "sharp dramatic orchestral hit stinger",
  paper: "old paper document unfolding",
  typewriter: "vintage typewriter keys clacking",
  radio: "old military radio static and beeps",
  heartbeat: "slow deep heartbeat pulse",
  crowd: "distant crowd murmur",
  explosion: "distant muffled explosion rumble",
};
const sfxKey = (p: string) => { const t = String(p ?? "").toLowerCase(); return Object.keys(SFX_LIB).find((k) => t.includes(k)) ?? (/impact|thud|slam/.test(t) ? "boom" : /tension|suspense|rise/.test(t) ? "riser" : /map|letter|document/.test(t) ? "paper" : /static|morse|signal/.test(t) ? "radio" : "whoosh"); };
let KEYS: Record<string, string> = {};
let CRON_SECRET = "";

class UserError extends Error {}
// La petición va por la API de lotes (mitad de precio) y aún no tiene respuesta: el trabajo vuelve a la cola
class Pending extends Error {}
// Presupuesto diario (app_config.daily_cap_eur) agotado: el trabajo espera a mañana
class OverBudget extends Error {}
async function reserve(k: string, n: number) {
  if (!n) return;
  const { data, error } = await sb.rpc("reserve_spend", { p_key: k, p_n: n });
  if (error) throw new Error(`Presupuesto: ${error.message}`);
  if (data !== true) throw new OverBudget(k);
}
// Claude: antes de llamar se comprueba que queda margen; al recibir la respuesta se apunta lo gastado
async function claudeGuard(model: string) {
  const { data, error } = await sb.rpc("budget_left");
  if (error) throw new Error(`Presupuesto: ${error.message}`);
  if (Number(data ?? 0) < (model.includes("opus") ? 0.3 : 0.05)) throw new OverBudget("claude");
}
// deno-lint-ignore no-explicit-any
async function claudeSpent(model: string, d: any, batch = false) {
  const tier = model.includes("opus") ? "opus" : model.includes("haiku") ? "haiku" : "sonnet";
  const f = batch ? 0.5 : 1;
  await sb.rpc("record_spend", { p_key: `${tier}_in`, p_n: (d?.usage?.input_tokens ?? 0) * f });
  await sb.rpc("record_spend", { p_key: `${tier}_out`, p_n: (d?.usage?.output_tokens ?? 0) * f });
  const ws = d?.usage?.server_tool_use?.web_search_requests ?? 0;
  if (ws) await sb.rpc("record_spend", { p_key: "web_searches", p_n: ws });
}
// Mañana a las 00:05, hora de Madrid
function nextMadridDay() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const sec = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return new Date(Date.now() + (86400 - sec + 300) * 1000).toISOString();
}
function key(name: string) {
  const v = KEYS[name];
  if (!v) throw new UserError(`Falta la clave ${name}. Añádela en Ajustes.`);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { data: cfg } = await sb.from("app_config").select("value").eq("key", "cron_secret").single();
  CRON_SECRET = cfg?.value ?? "";
  let ok = false;
  const cs = req.headers.get("x-cron-secret");
  if (cs) ok = cs === CRON_SECRET && CRON_SECRET.length > 0;
  else {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await sb.auth.getUser(token);
      if (data?.user) {
        const { data: m } = await sb.from("members").select("user_id").eq("user_id", data.user.id).maybeSingle();
        ok = !!m;
      }
    }
  }
  if (!ok) return json({ error: "unauthorized" }, 401);
  EdgeRuntime.waitUntil(runLoop());
  return json({ ok: true }, 202);
});

async function runLoop() {
  const t0 = Date.now();
  const { data: k } = await sb.rpc("get_api_keys");
  KEYS = (k ?? {}) as Record<string, string>;
  let processed = 0; let budgetLogged = false;
  while (Date.now() - t0 < 60_000) {
    const { data: job } = await sb.rpc("claim_job");
    if (!job || !job.id) break;
    processed++;
    try {
      await runStep(job);
      await sb.from("jobs").update({ status: "done", error: null }).eq("id", job.id);
    } catch (e) {
      if (e instanceof OverBudget) {
        await sb.from("jobs").update({ status: "queued", attempts: Math.max(0, job.attempts - 1), payload: job.payload, run_after: nextMadridDay() }).eq("id", job.id);
        if (job.video_id) await sb.from("videos").update({ stage: "Esperando al presupuesto de mañana" }).eq("id", job.video_id);
        if (!budgetLogged) { budgetLogged = true; await log(job, `Presupuesto diario agotado (${e.message}): ${job.step} y lo que venga detrás siguen mañana`, "warn"); }
        continue;
      }
      if (e instanceof Pending) {
        await sb.from("jobs").update({ status: "queued", attempts: Math.max(0, job.attempts - 1), payload: job.payload, run_after: new Date(Date.now() + 90_000).toISOString() }).eq("id", job.id);
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error(job.step, msg);
      const final = e instanceof UserError || job.attempts >= 3;
      if (final) {
        await sb.from("jobs").update({ status: "failed", error: msg }).eq("id", job.id);
        // El análisis y las miniaturas son opcionales: si fallan, el vídeo sigue su curso
        if (job.step === "analyze" && job.video_id) await sb.from("videos").update({ analysis: { status: "failed", error: msg } }).eq("id", job.video_id);
        else if (job.video_id && !["thumbs", "learn", "compare"].includes(job.step)) await sb.from("videos").update({ status: "failed", error: `${job.step}: ${msg}` }).eq("id", job.video_id);
        await log(job, `Error en ${job.step}: ${msg}`, "error");
      } else {
        await sb.from("jobs").update({ status: "queued", error: msg, payload: { ...(job.payload ?? {}), batches: null }, run_after: new Date(Date.now() + 90_000 * job.attempts).toISOString() }).eq("id", job.id);
      }
    }
  }
  if (processed > 0) {
    const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lte("run_after", new Date().toISOString());
    if ((count ?? 0) > 0) await fetch(SELF_URL, { method: "POST", headers: { "x-cron-secret": CRON_SECRET, "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }
}

// deno-lint-ignore no-explicit-any
type Job = any;
async function runStep(job: Job) {
  switch (job.step) {
    case "ideas": return stepIdeas(job);
    case "proposals": return stepProposals(job);
    case "guide": return stepGuide(job);
    case "script": return stepScript(job);
    case "revise": return stepRevise(job);
    case "voice": return stepVoice(job);
    case "audio": return stepAudio(job);
    case "visuals": return stepVisuals(job);
    case "fix_visuals": return stepFixVisuals(job);
    case "render": return stepRender(job);
    case "render_check": return stepRenderCheck(job);
    case "publish": return stepPublish(job);
    case "direct": return stepDirect(job);
    case "analyze": return stepAnalyze(job);
    case "thumbs": return stepThumbs(job);
    case "refill_ideas": return stepRefillIdeas(job);
    case "learn": return stepLearn(job);
    case "metrics": return stepMetrics(job);
    case "compare": return stepCompare(job);
    default: throw new UserError(`Paso desconocido: ${job.step}`);
  }
}

// ---------- utilidades ----------
async function log(job: Job, message: string, level = "info") {
  await sb.from("activity").insert({ video_id: job.video_id ?? null, channel_id: job.channel_id ?? null, message, level });
}
async function enqueue(step: string, o: { video_id?: string; channel_id?: string; payload?: unknown; delaySec?: number }) {
  await sb.from("jobs").insert({ step, video_id: o.video_id ?? null, channel_id: o.channel_id ?? null, payload: o.payload ?? {}, run_after: new Date(Date.now() + (o.delaySec ?? 0) * 1000).toISOString() });
}
async function getVideo(id: string) {
  const { data, error } = await sb.from("videos").select("*, channel:channels(*)").eq("id", id).single();
  if (error || !data) throw new UserError("Vídeo no encontrado");
  // Cada vídeo puede tener su propio formato (Short o largo) dentro del mismo canal
  const fmt = data.format ?? data.channel?.format ?? "long";
  data.channel = { ...data.channel, format: fmt, target_minutes: Number(data.target_minutes ?? (fmt === "long" ? (data.channel?.format === "long" ? data.channel?.target_minutes : data.channel?.long_minutes ?? 8) : data.channel?.target_minutes ?? 1)) };
  return data;
}
async function upload(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await sb.storage.from("media").upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage: ${error.message}`);
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
}
// Decodificación rápida: la versión anterior agotaba el tiempo de CPU de la función con las imágenes grandes
const B64 = new Uint8Array(128); for (let i = 0; i < 64; i++) B64["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charCodeAt(i)] = i;
function b64ToBytes(b64: string) {
  const n = b64.length, pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((n * 3) / 4 - pad);
  let o = 0;
  for (let i = 0; i < n; i += 4) {
    const x = (B64[b64.charCodeAt(i)] << 18) | (B64[b64.charCodeAt(i + 1)] << 12) | (B64[b64.charCodeAt(i + 2)] << 6) | B64[b64.charCodeAt(i + 3)];
    out[o++] = x >> 16; if (o < out.length) out[o++] = (x >> 8) & 255; if (o < out.length) out[o++] = x & 255;
  }
  return out;
}
// deno-lint-ignore no-explicit-any
function parseJson<T = any>(text: string): T {
  const tag = text.match(/<json>([\s\S]*?)<\/json>/);
  let s = tag ? tag[1] : text;
  s = s.replace(/```json|```/g, "");
  const a = Math.min(...[s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0));
  const b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (!isFinite(a) || b < a) throw new Error("La IA no devolvió JSON válido");
  const raw = s.slice(a, b + 1);
  // A veces el modelo deja una comilla sin escapar o una coma de más: se repara antes de rendirse
  try { return JSON.parse(raw); } catch (_) { return JSON.parse(jsonrepair(raw)); }
}
function addUsage(u: Record<string, number>, k: string, n: number) { u[k] = (u[k] ?? 0) + n; return u; }
async function bumpUsage(videoId: string, patch: Record<string, number>, extra: Record<string, unknown> = {}) {
  const { data: fresh } = await sb.from("videos").select("usage").eq("id", videoId).single();
  const u = { ...(fresh?.usage ?? {}) };
  for (const [k, n] of Object.entries(patch)) addUsage(u, k, n);
  await sb.from("videos").update({ usage: u, ...extra }).eq("id", videoId);
}

// ---------- API de lotes de Claude: misma respuesta, mitad de precio, tarda minutos ----------
const AH = () => ({ "x-api-key": key("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" });
// deno-lint-ignore no-explicit-any
async function batched(job: Job, tag: string, body: any): Promise<any> {
  job.payload = job.payload ?? {};
  const st = job.payload.batches?.[tag];
  if (st?.message) return st.message;
  if (!st) {
    await claudeGuard(String(body.model));
    const r = await fetch("https://api.anthropic.com/v1/messages/batches", { method: "POST", headers: AH(), body: JSON.stringify({ requests: [{ custom_id: tag.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60), params: body }] }) });
    if (!r.ok) throw new Error(`Claude lotes ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    job.payload.batches = { ...(job.payload.batches ?? {}), [tag]: { id: d.id, at: Date.now() } };
    await sb.from("jobs").update({ payload: job.payload }).eq("id", job.id);
    throw new Pending();
  }
  const r = await fetch(`https://api.anthropic.com/v1/messages/batches/${st.id}`, { headers: AH() });
  if (!r.ok) throw new Error(`Claude lotes ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  if (d.processing_status !== "ended" || !d.results_url) throw new Pending();
  const rr = await fetch(d.results_url, { headers: AH() });
  if (!rr.ok) throw new Error(`Claude lotes resultados ${rr.status}`);
  const line = (await rr.text()).split("\n").map((l) => l.trim()).filter(Boolean)[0];
  const res = line ? JSON.parse(line).result : null;
  // Si el lote falla o caduca, se olvida para volver a pedirlo en el siguiente intento; si va bien, se guarda la respuesta
  if (res?.type !== "succeeded") {
    delete job.payload.batches[tag];
    await sb.from("jobs").update({ payload: job.payload }).eq("id", job.id);
    throw new Error(`Claude lotes: ${res?.type ?? "sin resultado"} ${JSON.stringify(res?.error ?? "").slice(0, 200)}`);
  }
  await claudeSpent(String(body.model), res.message, true);
  job.payload.batches[tag] = { ...st, message: res.message };
  await sb.from("jobs").update({ payload: job.payload }).eq("id", job.id);
  return res.message;
}

async function claude(model: string, system: string, user: string, opts: { search?: number; maxTokens?: number; batch?: { job: Job; tag: string }; stop?: string[] } = {}) {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: user }];
  // deno-lint-ignore no-explicit-any
  const body: any = { model, max_tokens: opts.maxTokens ?? 8000, system, messages, ...(opts.stop ? { stop_sequences: opts.stop } : {}) };
  if (opts.search) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: opts.search }];
  let text = ""; let inTok = 0; let outTok = 0; let searches = 0; let stop = "";
  for (let i = 0; i < 4; i++) {
    // deno-lint-ignore no-explicit-any
    let d: any;
    if (opts.batch) d = await batched(opts.batch.job, `${opts.batch.tag}_${i}`, body);
    else {
      await claudeGuard(model);
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: AH(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
      d = await r.json();
      await claudeSpent(model, d);
    }
    inTok += d.usage?.input_tokens ?? 0; outTok += d.usage?.output_tokens ?? 0; searches += d.usage?.server_tool_use?.web_search_requests ?? 0;
    // deno-lint-ignore no-explicit-any
    text += (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    stop = d.stop_reason ?? "";
    if (d.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: d.content }); continue; }
    break;
  }
  return { text, inTok, outTok, searches, model, stop, batch: !!opts.batch };
}
// deno-lint-ignore no-explicit-any
const scriptWords = (sc: any) => (sc?.scenes ?? []).reduce((a: number, x: any) => a + String(x.narration ?? (x.shots ?? []).map((y: any) => y.line).join(" ")).split(/\s+/).filter(Boolean).length, 0);
// Consumo por modelo para calcular el coste real de cada vídeo
function usageOf(r: { inTok: number; outTok: number; searches?: number; model: string; batch?: boolean }) {
  const tier = r.model.includes("opus") ? "opus" : r.model.includes("haiku") ? "haiku" : "sonnet";
  // Los tokens por lotes se apuntan aparte porque cuestan la mitad
  const b = r.batch ? "_batch" : "";
  return { claude_in: r.inTok, claude_out: r.outTok, [`${tier}${b}_in`]: r.inTok, [`${tier}${b}_out`]: r.outTok, web_searches: r.searches ?? 0 };
}

// ---------- YouTube: investigación ----------
async function yt(path: string, params: Record<string, string>) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", KEYS["YOUTUBE_API_KEY"]);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`YouTube ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
// Descarta vídeos en otro idioma: YouTube no filtra por idioma, solo da preferencia
// deno-lint-ignore no-explicit-any
function langOk(sn: any, lang: string) {
  const l = String(sn?.defaultAudioLanguage || sn?.defaultLanguage || "").toLowerCase();
  if (l) return l.startsWith(lang);
  const t = ` ${String(sn?.title ?? "").toLowerCase()} `;
  const count = (re: RegExp) => (t.match(re) ?? []).length;
  const es = count(/[ñ¿¡]|\b(el|los|las|del|que|por|qué|cómo|cuánto|para|una|esto|así|y)\b/g);
  const pt = count(/[ãõ]|ção\b|ções\b|\b(você|não|são|isso|então|muito|cidade|aluguel|golpe|verdade|sobre o|do|da)\b/g);
  const en = count(/\b(the|and|of|is|why|how|what|most|ever|you|your|this|with)\b/g);
  if (lang === "es") return pt === 0 && !(en >= 2 && es === 0);
  if (lang === "en") return es < 2 && pt === 0;
  return true;
}
async function youtubeResearch(query: string, opts: { language?: string; short?: boolean; refChannels?: string[] } = {}) {
  if (!KEYS["YOUTUBE_API_KEY"]) return [];
  const after = new Date(Date.now() - 75 * 864e5).toISOString();
  const ids = new Set<string>();
  const s = await yt("search", { part: "id", q: query, type: "video", order: "viewCount", publishedAfter: after, maxResults: "25", relevanceLanguage: opts.language ?? "es", videoDuration: opts.short ? "short" : "medium" });
  // deno-lint-ignore no-explicit-any
  s.items?.forEach((i: any) => i.id?.videoId && ids.add(i.id.videoId));
  for (const ch of (opts.refChannels ?? []).filter((c) => c.startsWith("UC")).slice(0, 4)) {
    const r = await yt("search", { part: "id", channelId: ch, type: "video", order: "date", maxResults: "10" });
    // deno-lint-ignore no-explicit-any
    r.items?.forEach((i: any) => i.id?.videoId && ids.add(i.id.videoId));
  }
  if (!ids.size) return [];
  const v = await yt("videos", { part: "snippet,statistics,contentDetails", id: [...ids].slice(0, 50).join(",") });
  // deno-lint-ignore no-explicit-any
  const chIds = [...new Set(v.items.map((i: any) => i.snippet.channelId))] as string[];
  const c = await yt("channels", { part: "statistics,snippet", id: chIds.slice(0, 50).join(",") });
  // deno-lint-ignore no-explicit-any
  const subs = new Map(c.items.map((i: any) => [i.id, Number(i.statistics.subscriberCount ?? 0)]));
  // deno-lint-ignore no-explicit-any
  return v.items.filter((i: any) => langOk(i.snippet, opts.language ?? "es")).map((i: any) => {
    const views = Number(i.statistics.viewCount ?? 0);
    const sc = Number(subs.get(i.snippet.channelId) ?? 0);
    return { id: i.id, title: i.snippet.title, channel: i.snippet.channelTitle, channel_id: i.snippet.channelId, url: `https://youtu.be/${i.id}`, thumb: `https://i.ytimg.com/vi/${i.id}/mqdefault.jpg`, views, subscribers: sc, published: i.snippet.publishedAt.slice(0, 10), duration: i.contentDetails.duration, score: Math.round((views / Math.max(sc, 1000)) * 10) / 10 };
  }).sort((a: { score: number }, b: { score: number }) => b.score - a.score).slice(0, 20);
}

// ---------- Paso: ideas de vídeo ----------
async function stepIdeas(job: Job) {
  const { data: ch } = await sb.from("channels").select("*").eq("id", job.channel_id).single();
  if (!ch) throw new UserError("Canal no encontrado");
  const research = await youtubeResearch(ch.niche, { language: ch.language, short: ch.format === "short", refChannels: ch.reference_channels ?? [] });
  const { data: prev } = await sb.from("videos").select("idea_title,status").eq("channel_id", ch.id).order("created_at", { ascending: false }).limit(80);
  const n = job.payload?.count ?? ch.ideas_per_run ?? 5;
  const system = `Eres el estratega de contenidos de un canal de YouTube faceless. Tu objetivo es que los vídeos se hagan virales: propones premisas que se entienden en una frase, provocan sorpresa o emoción inmediata, dan ganas de compartirlas y tienen un ángulo propio (nada genérico ni repetido). Te apoyas en los outliers del nicho: qué tienen en común los vídeos que multiplican las visitas de su canal. Responde SOLO con JSON dentro de <json></json>.`;
  const user = `Canal: ${ch.name}\nNicho: ${ch.niche}\nIdioma: ${ch.language}\nFormato: ${ch.format === "short" ? "Shorts verticales de 45-60 s" : `vídeos largos de ~${ch.target_minutes} min`}\nAudiencia: ${ch.audience ?? "-"}\nTono: ${ch.tone ?? "-"}\n${ch.style_guide ? `\nGuía del canal (respétala al elegir temas y ángulos):\n${String(ch.style_guide).slice(0, 4000)}\n` : ""}\nVídeos que están funcionando ahora en el nicho (score = visualizaciones / suscriptores del canal; >3 es un outlier):\n${research.length ? JSON.stringify(research, null, 1) : "(sin datos de YouTube API: usa la búsqueda web para detectar temas en tendencia)"}\n\nIdeas ya usadas o rechazadas (no repetir ni parafrasear):\n${(prev ?? []).map((p) => `- ${p.idea_title} [${p.status}]`).join("\n") || "-"}\n${job.payload?.hint ? `\nIndicación del autor: ${job.payload.hint}` : ""}\n\nPropón ${n} ideas. Para cada una: un título final atractivo (sin clickbait falso), el ángulo diferencial que aporta el canal, por qué funcionará (apóyate en los datos) y las referencias que lo justifican.\nFormato: <json>[{"title":"","angle":"","reason":"","evidence":[{"title":"","url":"","views":0,"score":0}]}]</json>`;
  const r = await claude(MODEL_CHEAP, system, user, { search: research.length ? 0 : 2, maxTokens: 5000 });
  const ideas = parseJson<Array<{ title: string; angle: string; reason: string; evidence: unknown[] }>>(r.text);
  const rows = ideas.slice(0, n).map((i) => ({ channel_id: ch.id, status: "idea_review", idea_title: i.title, idea_angle: i.angle, idea_reason: i.reason, idea_evidence: i.evidence ?? [], usage: {} }));
  // El coste de la tanda se apunta solo en la primera idea, para no contarlo cinco veces
  if (rows.length) rows[0].usage = usageOf(r);
  if (rows.length) await sb.from("videos").insert(rows);
  await log(job, `${rows.length} ideas nuevas para ${ch.name}`);
}

// ---------- Paso: propuestas de canales nuevos ----------
const clean = (s: unknown) => String(s ?? "").replace(/<\/?cite[^>]*>/g, "").replace(/\s+/g, " ").trim();
const PROPOSAL_TOOL = {
  name: "guardar_propuestas",
  description: "Guarda las propuestas de canal finales. Llámala una sola vez, al terminar la investigación.",
  input_schema: {
    type: "object",
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array", minItems: 3, maxItems: 6,
        items: {
          type: "object",
          required: ["name", "tagline", "niche", "description", "format", "audience", "why_now", "rpm_low", "rpm_high", "rpm_currency", "competition", "production", "sample_titles", "youtube_queries"],
          properties: {
            name: { type: "string", description: "Nombre del canal, 1-4 palabras, memorable" },
            tagline: { type: "string", description: "Promesa del canal en una frase de máximo 90 caracteres" },
            niche: { type: "string", description: "Nicho en máximo 10 palabras" },
            description: { type: "string", description: "Qué hace cada vídeo y qué lo diferencia, máximo 260 caracteres" },
            format: { type: "string", enum: ["long", "short"] },
            audience: { type: "string", description: "Público objetivo, máximo 110 caracteres" },
            why_now: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3, description: "Razones concretas con datos, cada una de máximo 120 caracteres" },
            risks: { type: "array", items: { type: "string" }, maxItems: 2, description: "Riesgos reales, máximo 110 caracteres cada uno" },
            rpm_low: { type: "number" }, rpm_high: { type: "number" },
            rpm_currency: { type: "string", enum: ["EUR", "USD"] },
            rpm_note: { type: "string", description: "Contexto del RPM, máximo 90 caracteres" },
            rpm_source: { type: "string", description: "URL de la fuente del RPM" },
            competition: { type: "string", enum: ["baja", "media", "alta"] },
            competition_note: { type: "string", description: "Máximo 110 caracteres" },
            production: { type: "string", enum: ["facil", "media", "dificil"], description: "Dificultad de producir con IA y stock" },
            production_note: { type: "string", description: "Máximo 110 caracteres" },
            sample_titles: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 5 },
            youtube_queries: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3, description: "Búsquedas cortas (2-5 palabras) que haría el público en YouTube, en su idioma" },
            sources: { type: "array", maxItems: 4, items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title", "url"] } },
          },
        },
      },
    },
  },
};
async function claudeWithTool(model: string, system: string, user: string, tool: typeof PROPOSAL_TOOL, search: number) {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: user }];
  let inTok = 0; let outTok = 0;
  for (let i = 0; i < 4; i++) {
    await claudeGuard(model);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 12000, system, messages, tools: search > 0 ? [{ type: "web_search_20250305", name: "web_search", max_uses: search }, tool] : [tool] }),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    await claudeSpent(model, d);
    inTok += d.usage?.input_tokens ?? 0; outTok += d.usage?.output_tokens ?? 0;
    // deno-lint-ignore no-explicit-any
    const call = (d.content ?? []).find((b: any) => b.type === "tool_use" && b.name === tool.name);
    if (call) return { input: call.input, inTok, outTok };
    messages.push({ role: "assistant", content: d.content });
    if (d.stop_reason !== "pause_turn") messages.push({ role: "user", content: `Ahora llama a ${tool.name} con las propuestas finales.` });
  }
  throw new Error("La IA no entregó las propuestas");
}
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
async function stepProposals(job: Job) {
  const lang = job.payload?.language === "en" ? "en" : "es";
  const focus = job.payload?.focus ? clean(job.payload.focus) : "";
  const { data: chs } = await sb.from("channels").select("name,niche").neq("status", "archived");
  const { data: prev } = await sb.from("channel_proposals").select("name,niche,status").order("created_at", { ascending: false }).limit(60);
  const system = `Eres analista de mercado de YouTube especializado en canales faceless rentables. Usas tu conocimiento del mercado (demanda, RPM por nicho y país, competencia); la demanda real se comprobará después con la API de YouTube. Solo propones nichos donde un canal con guion propio y criterio editorial aporta valor, porque YouTube desmonetiza el contenido masivo y repetitivo. Propuestas variadas entre sí: no repitas la misma temática con distinto nombre. Escribe en español, frases cortas y concretas, sin marcas de cita ni HTML. Llama directamente a guardar_propuestas.`;
  const user = `Mercado: ${lang === "en" ? "angloparlante (EE. UU., Reino Unido, Canadá, Australia)" : "hispanohablante (España y LATAM)"}\n${focus ? `Enfoque pedido por el autor: ${focus}\n` : "Sin enfoque concreto: busca las mejores oportunidades en temáticas distintas.\n"}Canales que ya tengo (no los dupliques): ${(chs ?? []).map((c) => `${c.name} (${c.niche})`).join("; ") || "ninguno"}\nPropuestas anteriores (no repetir): ${(prev ?? []).map((p) => p.name).join("; ") || "-"}\n\nPropón 5 canales faceless nuevos, producibles con voz IA, imágenes IA o stock y montaje automático.`;
  // Sin búsqueda web: cada búsqueda metía decenas de miles de tokens. La demanda real la mide la API de YouTube (gratis).
  // Y sin reintentos automáticos: si falla, se vuelve a pedir a mano.
  // deno-lint-ignore no-explicit-any
  let r: any;
  try { r = await claudeWithTool(MODEL_FAST, system, user, PROPOSAL_TOOL, 0); } catch (e) { throw new UserError((e as Error).message); }
  // deno-lint-ignore no-explicit-any
  const props: any[] = r.input?.proposals ?? [];
  if (!props.length) throw new UserError("Sin propuestas");
  const rows = [];
  for (const p of props) {
    const short = p.format === "short";
    // Demanda real en YouTube con las búsquedas del público
    // deno-lint-ignore no-explicit-any
    const seen = new Map<string, any>();
    for (const q of (p.youtube_queries ?? []).slice(0, 2)) {
      try { for (const v of await youtubeResearch(clean(q), { language: lang, short })) seen.set(v.id, v); } catch (_) { /* cuota o error puntual */ }
    }
    const vids = [...seen.values()];
    const views = vids.map((v) => v.views);
    const outliers = vids.filter((v) => v.score >= 3);
    const smallWins = vids.filter((v) => v.subscribers < 100_000 && v.views >= 100_000);
    const metrics = vids.length ? {
      sample: vids.length, median_views: Math.round(median(views)), outliers: outliers.length, small_channel_hits: smallWins.length,
      channels: new Set(vids.map((v) => v.channel_id)).size, window_days: 75,
    } : {};
    // Puntuación 0-100: demanda, huecos para canales pequeños, rentabilidad y competencia
    const lg = (x: number) => Math.log10(Math.max(1, x));
    const demand = vids.length ? Math.min(1, Math.max(0, (lg(metrics.median_views as number) - 3.5) / 2.5)) : 0.35;
    const gap = vids.length ? Math.min(1, outliers.length / 8) * 0.6 + Math.min(1, smallWins.length / 4) * 0.4 : 0.3;
    const rpm = Math.min(1, Math.max(0, Number(p.rpm_high ?? 0) / 8)) * (short ? 0.5 : 1);
    const comp = p.competition === "alta" ? 0.3 : p.competition === "media" ? 0.65 : 1;
    const prod = p.production === "dificil" ? 0.6 : p.production === "media" ? 0.85 : 1;
    const score = Math.round(100 * (0.35 * demand + 0.25 * gap + 0.2 * rpm + 0.2 * comp) * (0.85 + 0.15 * prod));
    const top = [...vids].sort((a, b) => b.score - a.score).slice(0, 4).map((v) => ({ id: v.id, title: v.title, url: v.url, thumb: v.thumb, views: v.views, subscribers: v.subscribers, score: v.score, channel: v.channel }));
    rows.push({
      name: clean(p.name), tagline: clean(p.tagline), niche: clean(p.niche), description: clean(p.description), format: short ? "short" : "long",
      language: lang, audience: clean(p.audience), why_now: (p.why_now ?? []).map(clean), risks: (p.risks ?? []).map(clean),
      rpm_low: p.rpm_low ?? null, rpm_high: p.rpm_high ?? null, rpm_currency: p.rpm_currency ?? "EUR", rpm_note: clean(p.rpm_note), rpm_source: clean(p.rpm_source) || null,
      competition: p.competition, competition_note: clean(p.competition_note), production: p.production, production_note: clean(p.production_note),
      sample_titles: (p.sample_titles ?? []).map(clean), metrics, videos: top,
      // deno-lint-ignore no-explicit-any
      sources: (p.sources ?? []).filter((s: any) => /^https?:\/\//.test(s?.url ?? "")).map((s: any) => ({ title: clean(s.title), url: s.url })),
      score, focus: focus || null,
      rationale: (p.why_now ?? []).map(clean).join(" "), rpm_estimate: p.rpm_low != null ? `${p.rpm_low}–${p.rpm_high} ${p.rpm_currency ?? ""}` : null,
    });
  }
  await sb.from("channel_proposals").insert(rows);
  await log(job, `${rows.length} propuestas de canal nuevas`);
}

// ---------- Paso: guía del canal a partir de un análisis o feedback ----------
async function stepGuide(job: Job) {
  const { data: ch } = await sb.from("channels").select("*").eq("id", job.channel_id).single();
  if (!ch) throw new UserError("Canal no encontrado");
  const feedback = String(job.payload?.feedback ?? "").slice(0, 30000);
  if (!feedback.trim()) throw new UserError("No hay texto que analizar");
  const system = `Eres director de contenidos de canales de YouTube faceless. Mantienes la "guía del canal": el documento que siguen el guionista y el equipo de producción en cada vídeo. Conviertes análisis y feedback en reglas claras, accionables y generalizables a todos los vídeos del canal (no solo al vídeo analizado; usa ese vídeo solo como ejemplo breve si ayuda). Escribe en español, en frases cortas e imperativas.`;
  const user = `Canal: ${ch.name}\nNicho: ${ch.niche}\nFormato: ${ch.format === "short" ? "Shorts verticales" : `vídeos largos de ~${ch.target_minutes} min`}\n\nGUÍA ACTUAL:\n${ch.style_guide || "(vacía)"}\n\nANÁLISIS O FEEDBACK NUEVO:\n${feedback}\n\nReescribe la guía completa integrando lo aprendido. Conserva lo que ya había salvo que el feedback lo contradiga (entonces manda lo nuevo). Descarta lo anecdótico o lo que no se pueda aplicar a otros vídeos. Incluye cifras concretas cuando el feedback las dé (segundos, número de planos, palabras por subtítulo, porcentajes de tipos de imagen). Máximo unas 700 palabras. Usa exactamente estos apartados con "## ", en este orden, y omite los que queden vacíos: Identidad y promesa, Público, Tono y voz, Estructura del guion, Gancho, Ritmo y planos, Imágenes, Subtítulos y texto en pantalla, Cierre, Prohibido. Devuelve SOLO la guía dentro de <guia></guia>.`;
  const r = await claude(MODEL_SCRIPT, system, user, { maxTokens: 5000 });
  const m = r.text.match(/<guia>([\s\S]*?)<\/guia>/);
  const guide = (m ? m[1] : r.text).trim();
  if (guide.length < 80) throw new Error("La guía generada está vacía");
  await sb.from("channels").update({ style_guide: guide, guide_updated_at: new Date().toISOString() }).eq("id", ch.id);
  await log(job, `Guía de ${ch.name} actualizada con el análisis`);
}

// Escena con planos coherente: la narración es la unión de las frases de sus planos
const VTYPES = ["ai", "archive", "stock_photo", "stock_video", "reframe"];
// deno-lint-ignore no-explicit-any
function normalizeScene(sc: any) {
  // deno-lint-ignore no-explicit-any
  let shots: any[] = Array.isArray(sc.shots) ? sc.shots.filter((x: any) => String(x?.line ?? "").trim()) : [];
  if (!shots.length) shots = [{ line: sc.narration ?? "", visual_type: sc.visual_type ?? "ai", visual_prompt: sc.visual_prompt ?? "", stock_query: sc.stock_query ?? "" }];
  // deno-lint-ignore no-explicit-any
  shots = shots.map((x: any, k: number) => {
    let type = VTYPES.includes(x.visual_type) ? x.visual_type : "ai";
    if (type === "reframe" && k === 0 && !sc.n) type = "ai";
    const rf = type === "reframe" ? { x: Number(x.reframe?.x ?? 0.5), y: Number(x.reframe?.y ?? 0.4), zoom: Number(x.reframe?.zoom ?? 1.5) } : null;
    return { line: String(x.line).trim(), visual_type: type, visual_prompt: x.visual_prompt ?? "", stock_query: x.stock_query ?? "", archive_query: x.archive_query ?? "", reframe: rf };
  });
  const keywords = (Array.isArray(sc.keywords) ? sc.keywords : []).map((k: unknown) => String(k).trim()).filter(Boolean).slice(0, 4);
  // deno-lint-ignore no-explicit-any
  return { ...sc, shots, keywords, narration: shots.map((x: any) => x.line).join(" "), visual_type: shots[0].visual_type, visual_prompt: shots[0].visual_prompt };
}

// Descripción SEO y etiquetas a partir del guion ya escrito (Haiku)
// deno-lint-ignore no-explicit-any
async function seoText(ch: any, s: any) {
  // deno-lint-ignore no-explicit-any
  const narr = (s.scenes ?? []).map((x: any) => x.narration ?? (x.shots ?? []).map((y: any) => y.line).join(" ")).join(" ").replace(/\[[^\]]*\]/g, "").slice(0, 6000);
  // deno-lint-ignore no-explicit-any
  const src = (s.sources ?? []).map((x: any) => `${x.title}: ${x.url}`).join("\n");
  const r = await claudeTool(MODEL_CHEAP, `Escribes descripciones de YouTube optimizadas para búsqueda, en ${ch.language === "es" ? "español" : ch.language}, sin inventar nada que no diga el guion.`, `Canal: ${ch.name} (${ch.niche})\nTítulo: ${s.title}\nGuion: ${narr}\nFuentes:\n${src || "-"}\n\nEscribe una descripción de 3 párrafos cortos (el primero engancha y resume sin destripar el final) y termina con "Fuentes:" y la lista de fuentes con sus enlaces. Añade 8-12 etiquetas. Llama a guardar_seo.`, { name: "guardar_seo", description: "Guarda la descripción y etiquetas", input_schema: { type: "object", required: ["description", "tags"], properties: { description: { type: "string" }, tags: { type: "array", items: { type: "string" }, maxItems: 15 } } } }, 1500);
  return { description: String(r.input.description ?? ""), tags: (r.input.tags ?? []).map((t: unknown) => String(t)).slice(0, 15) };
}

// Documentación gratuita de Wikipedia (es + en) para que el guion se apoye en hechos verificables sin pagar búsquedas web
async function wikiArticle(lang: string, query: string, max: number) {
  const base = `https://${lang}.wikipedia.org/w/api.php`;
  const H = { "User-Agent": "FacelessStudio/1.0 (https://github.com/indoorwall/faceless-render)" };
  const s = await fetch(`${base}?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(query)}`, { headers: H }).then((r) => r.json()).catch(() => null);
  const title = s?.query?.search?.[0]?.title;
  if (!title) return null;
  const d = await fetch(`${base}?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`, { headers: H }).then((r) => r.json()).catch(() => null);
  // deno-lint-ignore no-explicit-any
  const pg: any = Object.values(d?.query?.pages ?? {})[0];
  const text = String(pg?.extract ?? "").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 200) return null;
  return { title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, text: text.slice(0, max) };
}
// deno-lint-ignore no-explicit-any
async function researchPack(v: any) {
  const topics: string[] = v.idea_kind === "compilation" && (v.idea_stories ?? []).length ? (v.idea_stories ?? []).map((x: { title: string }) => x.title) : [v.idea_evidence?.[0]?.title || v.idea_title];
  const per = topics.length > 1 ? 3500 : 9000;
  const docs: { title: string; url: string; text: string }[] = [];
  for (const t of topics.slice(0, 6)) {
    for (const lang of ["es", "en"]) {
      try { const a = await wikiArticle(lang, t, per); if (a && !docs.some((x) => x.url === a.url)) docs.push(a); } catch (_) { /* sin artículo */ }
    }
  }
  return docs;
}

// ---------- Paso: guion ----------
async function stepScript(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel;
  const short = ch.format === "short";
  const words = short ? 140 : Math.round(ch.target_minutes * 150);
  const scenes = short ? "4-7" : `${Math.round(ch.target_minutes * 3)}-${Math.round(ch.target_minutes * 4)}`;
  const allowed = ch.image_source === "ai" ? `"ai" y "reframe"` : ch.image_source === "stock" ? `"archive", "stock_photo", "stock_video" y "reframe"` : `"ai", "archive", "stock_photo", "stock_video" y "reframe"`;
  const visualRule = `PLANOS: cada escena es un bloque de locución y se divide en planos (shots). Cada plano es un fragmento literal de la narración (line) con su visual; la unión de las line de una escena es su narración completa, sin cambiar ni una palabra. Duración de cada plano: ${short ? "1,5-3,5 s (4-9 palabras)" : "3-6 s (8-15 palabras)"}. Los cambios de plano acompañan lo que se cuenta, nunca cortes sin sentido. Tipos de visual permitidos en este canal: ${allowed}.
- "ai": recreación generada para lo que no se puede fotografiar. visual_prompt en inglés, UNA sola línea de 25 palabras como máximo, con el sujeto principal claro y dónde está (izquierda, centro, arriba...) para poder reencuadrarla. Como máximo ${short ? 4 : 12} planos "ai" en todo el vídeo: reserva la IA para los momentos clave y usa archive, stock y reframe para el resto.
- "archive": foto histórica real de personas, lugares, objetos o documentos reales. archive_query en inglés, 2-5 palabras, como se titularía en Wikimedia Commons (ej. "Wojtek bear Polish army").
- "stock_photo" / "stock_video": material real genérico (paisajes, ciudades, objetos). stock_query en inglés, 2-4 palabras.
- "reframe": reutiliza la imagen del plano anterior con un acercamiento a un detalle (cara, manos, objeto): reframe {"x":0-1,"y":0-1,"zoom":1.3-2}, donde x,y es la posición del detalle en esa imagen. Da ritmo sin coste extra.
Mezcla orientativa salvo que la guía diga otra cosa: en temas reales e históricos ~25% archive, ~35% ai, ~25% reframe y el resto stock. Nunca generes con IA documentos, fotos de época o titulares haciéndolos pasar por auténticos.
keywords: 1-3 palabras o cifras de la escena que se resaltan en amarillo en los subtítulos; solo lo realmente importante.`;
  const sfxRule = ch.sfx_enabled ? `sfx: efecto de sonido para el arranque de la escena, elegido SOLO de este catálogo: ${Object.keys(SFX_LIB).join(", ")}. Úsalo con criterio profesional: en el gancho, en revelaciones y en cambios de bloque, como máximo en 1 de cada 3 escenas; en el resto deja "".` : `sfx: deja siempre "".`;
  const musicRule = ch.music_mode === "video" ? `music_prompt: prompt en inglés para una banda sonora instrumental de fondo hecha a medida de este vídeo (género, mood, tempo en BPM, instrumentos, evolución), discreta para no tapar la voz${ch.music_style ? `, coherente con el sello sonoro del canal: ${ch.music_style}` : ""}.` : `music_prompt: deja "".`;
  // Guionista y director en uno: escribe, se revisa con ojo de director y entrega solo la versión final (una sola llamada a Opus)
  const system = `Eres a la vez el guionista senior y el director de contenidos de un canal de YouTube faceless que se hace viral. Escribes con voz propia, datos verificados y estructura variada (no uses siempre la misma plantilla). Prioridad absoluta: retención, rebote y compartidos. La afirmación más sorprendente va en la primera frase, sin contexto previo; bucles de curiosidad abiertos y cerrados a lo largo del vídeo; cada frase se gana su sitio; cierre con emoción o giro final. Básate en la DOCUMENTACIÓN que se te da (artículos de Wikipedia) y en hechos que conozcas con seguridad; cita como fuentes solo esos artículos. Si un dato no está documentado o es dudoso, cuéntalo como testimonio o no lo uses. Nunca inventes cifras. Antes de entregar, repasa tu propio guion con ojo de director implacable contra los criterios de viralidad, la guía y los aprendizajes del canal, y corrige todo lo que falle, pero haz esa revisión en silencio: no escribas borradores, notas ni explicaciones; tu respuesta empieza directamente por <json> y contiene solo la versión final, lista para producir. Si el canal tiene guía, es obligatoria y prevalece sobre cualquier regla general de este mensaje (duración de escenas, estructura, gancho, cierre, estilo visual). Responde SOLO con JSON dentro de <json></json>.`;
  const user = `${ch.style_guide ? `GUÍA DEL CANAL (obligatoria):\n${String(ch.style_guide).slice(0, 8000)}\n\n` : ""}${playbookBlock(ch)}Canal: ${ch.name} — ${ch.niche}\nIdioma de la narración: ${ch.language}\nTono: ${ch.tone ?? "divulgativo, cercano, con criterio"}\nAudiencia: ${ch.audience ?? "-"}\nFormato: ${short ? "Short vertical 45-60 s" : `vídeo largo de ~${ch.target_minutes} min`} (~${words} palabras de narración en total, ${scenes} escenas)\n\nIdea aprobada: ${v.idea_title}\nÁngulo: ${v.idea_angle ?? "-"}\n${v.idea_hook ? `Gancho propuesto (úsalo o mejóralo): ${v.idea_hook}\n` : ""}${v.idea_kind === "compilation" && (v.idea_stories ?? []).length ? `VÍDEO RECOPILATORIO: cuenta estas ${(v.idea_stories ?? []).length} historias, de menos a más impactante, unidas por el hilo del título. El gancho anuncia el hilo y promete la más fuerte sin destriparla. Cada historia arranca con su propio mini-gancho, transiciones rápidas sin relleno, y la mejor al final.\n${(v.idea_stories ?? []).map((x: { title: string; hook: string }, k: number) => `${k + 1}. ${x.title}: ${x.hook}`).join("\n")}\n` : ""}${v.script_notes ? `Indicaciones del autor (obligatorias): ${v.script_notes}\n` : ""}${v.review_feedback && v.script ? `\nVersión anterior rechazada. Corrige según este feedback: ${v.review_feedback}\nGuion anterior: ${JSON.stringify(v.script).slice(0, 12000)}\n` : ""}\n${VIRAL_RULES(short)}\n\nReglas de escenas: cada escena dura 6-15 s de locución. ${visualRule}\nEstilo visual del canal para las imágenes IA: ${ch.style_prompt ?? "cinematic documentary, realistic lighting"}. ${sfxRule} Para ElevenLabs v3 puedes usar etiquetas de emoción puntuales como [pause] o [excited] dentro de narration, con moderación.\n${musicRule}\n\n${short ? `Los Shorts no llevan miniatura: deja thumbnail_concepts, thumbnail_texts y thumbnail_prompt vacíos.` : `Miniaturas: 3 conceptos distintos (escena en inglés, sin texto, sujeto claro con emoción fuerte, alto contraste, el sujeto en la mitad derecha y la izquierda despejada para el texto) y 3 textos de 2-4 palabras que complementan el título sin repetirlo.`}\nDeja stock_query, archive_query o visual_prompt vacíos cuando no correspondan al tipo de plano, y reframe en null salvo en los planos reframe.\nself_score: tu nota honesta de 0 a 10 del potencial viral del guion final. self_check: 2-4 frases cortas con lo que has corregido al revisarlo.\n\nDevuelve:\n<json>{"title":"título final <55 caracteres","title_options":["",""],"thumbnail_text":"","thumbnail_concepts":["","",""],"thumbnail_texts":["","",""],"thumbnail_prompt":"","self_score":0,"self_check":[""],"music_prompt":"","sources":[{"title":"","url":""}],"scenes":[{"n":1,"sfx":"","keywords":[""],"shots":[{"line":"","visual_type":"ai","visual_prompt":"","stock_query":"","archive_query":"","reframe":null}]}]}</json>`;
  // Opus por la API de lotes (mitad de precio) y con la documentación de Wikipedia en vez de búsquedas web de pago
  const redo = !!(v.review_feedback && v.script);
  let docs: { title: string; url: string; text: string }[] = [];
  if (!job.payload?.batches?.script_0) { docs = await researchPack(v); await sb.from("videos").update({ stage: "Escribiendo el guion (por lotes, a mitad de precio)" }).eq("id", v.id); }
  const docBlock = docs.length ? `\n\nDOCUMENTACIÓN (Wikipedia):\n${docs.map((d, k) => `[${k + 1}] ${d.title} — ${d.url}\n${d.text}`).join("\n\n")}` : "";
  const r = await claude(MODEL_SCRIPT, system, user + docBlock, { maxTokens: short ? 16000 : 32000, batch: { job, tag: "script" }, stop: ["</json>"] });
  if (r.stop === "max_tokens") throw new Error("El guion salió cortado; se reintenta");
  // deno-lint-ignore no-explicit-any
  const s = parseJson<any>(r.text);
  if (!Array.isArray(s.scenes) || !s.scenes.length) throw new Error("Guion sin escenas");
  if (scriptWords(s) < words * 0.55) throw new Error(`Guion demasiado corto (${scriptWords(s)} palabras de ~${words}); se reintenta`);
  // deno-lint-ignore no-explicit-any
  s.scenes = s.scenes.map((sc: any, i: number) => normalizeScene({ ...sc, n: i + 1, sfx: ch.sfx_enabled ? (sc.sfx ?? "") : "" }));
  if (!s.thumbnail_prompt && (s.thumbnail_concepts ?? []).length) s.thumbnail_prompt = s.thumbnail_concepts[0];
  if (!(s.sources ?? []).length && docs.length) s.sources = docs.map((d) => ({ title: d.title, url: d.url }));
  // Descripción y etiquetas con Haiku (casi gratis) en vez de con Opus
  if (!s.description) {
    try { Object.assign(s, await seoText(ch, s)); } catch (_) { s.description = s.description ?? ""; s.tags = s.tags ?? []; }
  }
  if (!s.thumbnail_text && (s.thumbnail_texts ?? []).length) s.thumbnail_text = s.thumbnail_texts[0];
  const score = Number(s.self_score ?? 0) || null;
  s.director = { merged: true, score_before: score, score_after: score, changes: s.self_check ?? [], title_options: s.title_options ?? [], at: new Date().toISOString() };
  const usage = { ...(v.usage ?? {}) };
  for (const [k, n] of Object.entries(usageOf(r))) addUsage(usage, k, n);
  await sb.from("videos").update({ script: s, title: s.title, description: s.description, tags: s.tags ?? [], sources: s.sources ?? [], status: "script_review", stage: null, progress: 0, error: null, usage }).eq("id", v.id);
  if (redo && v.review_feedback) await enqueue("learn", { channel_id: ch.id, video_id: v.id, payload: { source: "feedback", material: `El autor rechazó el guion de «${v.title ?? v.idea_title}» y pidió: ${String(v.review_feedback).slice(0, 3000)}` } });
  await log(job, `Guion listo para revisar: ${s.title}${score ? ` (${score}/10)` : ""}`);
}

// ---------- Paso: corregir el guion con el feedback (solo lo necesario, con Sonnet) ----------
const SHOT_PROPS = { line: { type: "string" }, visual_type: { type: "string", enum: VTYPES }, visual_prompt: { type: "string", description: "En inglés, una línea" }, archive_query: { type: "string" }, stock_query: { type: "string" } };
const REVISE_TOOL = {
  name: "aplicar_cambios",
  description: "Guarda los cambios mínimos al guion.",
  input_schema: {
    type: "object", required: ["full_rewrite", "changes", "summary"],
    properties: {
      full_rewrite: { type: "boolean", description: "true SOLO si el feedback pide otra historia, otro enfoque completo o reescribir todo; entonces deja changes vacío" },
      title: { type: "string", description: "Título nuevo solo si hay que cambiarlo" },
      thumbnail_text: { type: "string", description: "Texto de miniatura nuevo solo si hay que cambiarlo" },
      summary: { type: "array", items: { type: "string" }, maxItems: 5, description: "Qué has cambiado, frases cortas" },
      changes: {
        type: "array", maxItems: 40,
        items: {
          type: "object", required: ["op", "scene"],
          properties: {
            op: { type: "string", enum: ["replace_shot", "delete_shot", "insert_shot", "delete_scene", "insert_scene", "set_keywords"] },
            scene: { type: "integer", description: "Número de escena del guion ACTUAL (E1 = 1). En insert_scene la nueva va después de esta (0 = al principio)" },
            shot: { type: "integer", description: "Número de plano del guion ACTUAL (P1 = 1). En insert_shot el nuevo va después de este (0 = al principio de la escena)" },
            ...SHOT_PROPS,
            keywords: { type: "array", items: { type: "string" }, maxItems: 3 },
            shots: { type: "array", description: "Solo insert_scene: los planos de la escena nueva", items: { type: "object", required: ["line", "visual_type"], properties: SHOT_PROPS } },
          },
        },
      },
    },
  },
};
// deno-lint-ignore no-explicit-any
function applyChanges(script: any, changes: any[]) {
  // deno-lint-ignore no-explicit-any
  const S: any[] = (script.scenes ?? []).map((sc: any) => ({ sc: { ...sc }, del: false, head: [] as any[], shots: (sc.shots ?? []).map((x: any) => ({ x: { ...x }, del: false, after: [] as any[] })), afterScenes: [] as any[] }));
  // deno-lint-ignore no-explicit-any
  const headScenes: any[] = [];
  // deno-lint-ignore no-explicit-any
  const mk = (c: any) => ({ line: String(c.line ?? "").trim(), visual_type: VTYPES.includes(c.visual_type) ? c.visual_type : "ai", visual_prompt: c.visual_prompt ?? "", archive_query: c.archive_query ?? "", stock_query: c.stock_query ?? "", reframe: null });
  for (const c of changes ?? []) {
    const si = Number(c.scene) - 1; const E = S[si];
    if (c.op === "insert_scene") {
      const shots = (c.shots ?? []).map(mk).filter((x: { line: string }) => x.line);
      if (!shots.length) continue;
      const ns = { n: 0, sfx: "", keywords: c.keywords ?? [], shots };
      if (si < 0) headScenes.push(ns); else if (E) E.afterScenes.push(ns);
      continue;
    }
    if (!E) continue;
    if (c.op === "delete_scene") { E.del = true; continue; }
    if (c.op === "set_keywords") { E.sc.keywords = c.keywords ?? []; continue; }
    const pi = Number(c.shot ?? 0) - 1;
    if (c.op === "insert_shot") { const x = mk(c); if (!x.line) continue; if (pi < 0) E.head.push(x); else if (E.shots[pi]) E.shots[pi].after.push(x); continue; }
    const P = E.shots[pi]; if (!P) continue;
    if (c.op === "delete_shot") { P.del = true; continue; }
    if (c.op === "replace_shot") {
      const changedVisual = c.visual_type || c.visual_prompt || c.archive_query || c.stock_query;
      P.x = { ...P.x, ...(c.line ? { line: String(c.line).trim() } : {}), ...(changedVisual ? { visual_type: VTYPES.includes(c.visual_type) ? c.visual_type : P.x.visual_type, visual_prompt: c.visual_prompt ?? P.x.visual_prompt, archive_query: c.archive_query ?? P.x.archive_query, stock_query: c.stock_query ?? P.x.stock_query, reframe: c.visual_type === "reframe" ? { x: 0.5, y: 0.4, zoom: 1.5 } : P.x.reframe } : {}) };
    }
  }
  // deno-lint-ignore no-explicit-any
  const out: any[] = [...headScenes];
  for (const E of S) {
    if (!E.del) {
      // deno-lint-ignore no-explicit-any
      const shots: any[] = [...E.head];
      for (const P of E.shots) { if (!P.del) shots.push(P.x); shots.push(...P.after); }
      if (shots.length) out.push({ ...E.sc, shots });
    }
    out.push(...E.afterScenes);
  }
  return out;
}
async function stepRevise(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel; const short = ch.format === "short";
  const cur = v.script;
  const fb = String(v.review_feedback ?? "").trim();
  if (!cur?.scenes?.length || !fb) { await enqueue("script", { video_id: v.id }); return; }
  await sb.from("videos").update({ stage: "Aplicando tus cambios", error: null }).eq("id", v.id);
  // deno-lint-ignore no-explicit-any
  const listing = cur.scenes.map((sc: any, i: number) => `E${i + 1}${sc.keywords?.length ? ` (amarillo: ${sc.keywords.join(", ")})` : ""}\n${(sc.shots ?? []).map((x: any, k: number) => `  P${k + 1} [${x.visual_type}] ${x.line}${x.visual_type === "ai" ? ` || ${String(x.visual_prompt ?? "").slice(0, 160)}` : x.archive_query || x.stock_query ? ` || ${x.archive_query || x.stock_query}` : ""}`).join("\n")}`).join("\n");
  const system = `Eres el editor de guiones de un canal de YouTube faceless. Aplicas el feedback del autor con cambios MÍNIMOS y quirúrgicos: tocas solo las frases y planos que el feedback pide (o que hay que retocar para que el texto siga fluyendo) y dejas todo lo demás exactamente igual, porque cada plano intacto ahorra voz e imágenes ya producidas. Mantienes el idioma, el tono, la guía del canal y el rigor: no inventes datos. Llama a aplicar_cambios.`;
  const user = `${ch.style_guide ? `GUÍA DEL CANAL:\n${String(ch.style_guide).slice(0, 3000)}\n\n` : ""}${playbookBlock(ch)}${VIRAL_RULES(short)}\n\nTítulo actual: ${cur.title}\nTexto de miniatura: ${cur.thumbnail_text ?? "-"}\n\nGUION ACTUAL (E = escena, P = plano; [tipo] frase || visual):\n${listing}\n\nFEEDBACK DEL AUTOR (obligatorio):\n${fb.slice(0, 5000)}\n\nCada plano dura ${short ? "1,5-3,5 s (4-9 palabras)" : "3-6 s (8-15 palabras)"}. Los tipos de visual permitidos son: ${ch.image_source === "ai" ? "ai, reframe" : ch.image_source === "stock" ? "archive, stock_photo, stock_video, reframe" : VTYPES.join(", ")}. Si cambias solo la frase de un plano y su imagen sigue valiendo, no toques el visual.`;
  const r = await claudeTool(MODEL_FAST, system, user, REVISE_TOOL, 6000, { job, tag: "revise" });
  await bumpUsage(v.id, usageOf(r));
  if (r.input.full_rewrite) { await log(job, "El feedback pide reescribir el guion entero: se rehace desde cero."); await enqueue("script", { video_id: v.id }); return; }
  const scenes = applyChanges(cur, r.input.changes ?? []);
  if (!scenes.length) throw new UserError("Los cambios dejaron el guion vacío");
  // deno-lint-ignore no-explicit-any
  const s: any = { ...cur, scenes: scenes.map((sc: any, i: number) => normalizeScene({ ...sc, n: i + 1, sfx: ch.sfx_enabled ? (sc.sfx ?? "") : "" })) };
  if (r.input.title) s.title = clean(r.input.title);
  if (r.input.thumbnail_text) s.thumbnail_text = clean(r.input.thumbnail_text);
  s.director = { merged: true, revised: true, score_before: cur.director?.score_after ?? null, score_after: cur.director?.score_after ?? null, changes: r.input.summary ?? [], title_options: cur.director?.title_options ?? [], at: new Date().toISOString() };
  await sb.from("videos").update({ script: s, title: s.title, status: "script_review", stage: null, progress: 0, error: null }).eq("id", v.id);
  await enqueue("learn", { channel_id: ch.id, video_id: v.id, payload: { source: "feedback", material: `El autor pidió cambios en el guion de «${cur.title ?? v.idea_title}»: ${fb.slice(0, 3000)}` } });
  await log(job, `Cambios aplicados al guion (${(r.input.changes ?? []).length} retoques): ${s.title}`);
}

// Palabras con sus tiempos a partir del alineamiento por caracteres de ElevenLabs (sin etiquetas [pause] etc.)
// deno-lint-ignore no-explicit-any
function wordsFromAlignment(al: any) {
  const ch: string[] = al?.characters ?? [];
  const st: number[] = al?.character_start_times_seconds ?? [];
  const en: number[] = al?.character_end_times_seconds ?? [];
  const out: { w: string; s: number; e: number }[] = [];
  let cur = ""; let s0 = 0; let e0 = 0; let inTag = false;
  const flush = () => { if (cur.trim()) out.push({ w: cur.trim(), s: Math.round(s0 * 1000) / 1000, e: Math.round(e0 * 1000) / 1000 }); cur = ""; };
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (c === "[") { flush(); inTag = true; continue; }
    if (inTag) { if (c === "]") inTag = false; continue; }
    if (/\s/.test(c)) { flush(); continue; }
    if (!cur) s0 = st[i] ?? 0;
    cur += c; e0 = en[i] ?? e0;
  }
  flush();
  return out.length ? out : null;
}

async function forcedAlign(audioUrl: string, narration: string) {
  const audio = await fetch(audioUrl);
  if (!audio.ok) throw new Error(`audio ${audio.status}`);
  const fd = new FormData();
  fd.append("file", new Blob([await audio.arrayBuffer()], { type: "audio/mpeg" }), "voice.mp3");
  fd.append("text", String(narration).replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim());
  const r = await fetch("https://api.elevenlabs.io/v1/forced-alignment", { method: "POST", headers: { "xi-api-key": key("ELEVENLABS_API_KEY") }, body: fd });
  if (!r.ok) throw new Error(`ElevenLabs alineado ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const words = (d.words ?? []).filter((w: any) => String(w.text ?? "").trim()).map((w: any) => ({ w: String(w.text).trim(), s: Number(w.start), e: Number(w.end) }));
  return words.length ? words : null;
}

// ---------- Paso: voz (por lotes) ----------
async function stepVoice(job: Job) {
  const v = await getVideo(job.video_id);
  if (!job.payload?.cont) {
    // Se reaprovecha la voz, los efectos y las imágenes de lo que no ha cambiado desde el último montaje
    const { data: old } = await sb.from("scenes").select("narration,audio_url,audio_duration,words,sfx_prompt,sfx_url,shots").eq("video_id", v.id);
    const norm = (t: unknown) => String(t ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    // deno-lint-ignore no-explicit-any
    const oldVoice = new Map<string, any>(); const byLine = new Map<string, any>(); const byVisual = new Map<string, any>();
    for (const o of old ?? []) {
      if (o.audio_url) oldVoice.set(norm(o.narration), o);
      for (const sh of o.shots ?? []) {
        if (!sh.media_url || sh.visual_type === "reframe") continue;
        byLine.set(`${sh.visual_type}|${norm(sh.line)}`, sh);
        const vk = norm(sh.visual_prompt || sh.archive_query || sh.stock_query);
        if (vk) byVisual.set(`${sh.visual_type}|${vk}`, sh);
      }
    }
    let reusedVoice = 0, reusedShots = 0;
    // deno-lint-ignore no-explicit-any
    const rows = (v.script?.scenes ?? []).map((raw: any, i: number) => {
      const s = normalizeScene({ ...raw, n: i + 1 });
      const sfx = v.channel.sfx_enabled && s.sfx && String(s.sfx).trim() ? String(s.sfx).trim() : null;
      // deno-lint-ignore no-explicit-any
      const shots = s.shots.map((sh: any) => {
        if (sh.visual_type === "reframe") return sh;
        const m = byLine.get(`${sh.visual_type}|${norm(sh.line)}`) ?? byVisual.get(`${sh.visual_type}|${norm(sh.visual_prompt || sh.archive_query || sh.stock_query)}`);
        if (!m) return sh;
        reusedShots++;
        return { ...sh, media_url: m.media_url, media_kind: m.media_kind, fit: m.fit ?? "cover", reframe: m.reframe ?? null, credit: m.credit ?? null, gen: m.gen ?? null };
      });
      // deno-lint-ignore no-explicit-any
      const allMedia = shots.every((x: any) => x.media_url);
      const pv = oldVoice.get(norm(s.narration));
      if (pv) reusedVoice++;
      return { video_id: v.id, n: i + 1, narration: s.narration, visual_prompt: s.visual_prompt, visual_type: ["ai", "stock_photo", "stock_video"].includes(s.visual_type) ? s.visual_type : "ai", stock_query: s.shots[0].stock_query, shots, keywords: s.keywords, sfx_prompt: sfx,
        ...(pv ? { audio_url: pv.audio_url, audio_duration: pv.audio_duration, words: pv.words } : {}),
        ...(pv && sfx && pv.sfx_prompt === sfx && pv.sfx_url ? { sfx_url: pv.sfx_url } : {}),
        ...(allMedia ? { media_url: shots[0].media_url, media_kind: shots[0].media_kind } : {}) };
    });
    if (!rows.length) throw new UserError("El guion no tiene escenas");
    await sb.from("scenes").delete().eq("video_id", v.id);
    await sb.from("scenes").insert(rows);
    await sb.from("videos").update({ stage: "Generando voz", progress: 2, error: null, credits: [], analysis: null }).eq("id", v.id);
    if (reusedVoice || reusedShots) await log(job, `Se reaprovechan ${reusedVoice} escenas de voz y ${reusedShots} imágenes del montaje anterior`);
  }
  const voice = v.channel.voice_id || "JBFqnCBsd6RMkjVDRZzb";
  const ch = v.channel;
  const fish = ch.voice_provider === "fish";
  if (fish && !ch.fish_voice_id) throw new UserError("El canal usa Fish Audio pero no tiene voz elegida. Pon el ID de la voz en el canal.");
  const { data: pending } = await sb.from("scenes").select("*").eq("video_id", v.id).is("audio_url", null).order("n").limit(fish ? 4 : 8);
  let chars = 0; let fishBytes = 0; let sttSec = 0;
  for (const s of pending ?? []) {
    if (fish) {
      // Fish Audio: voz por escena y tiempos por palabra con la transcripción de OpenAI (si falla, el montaje los estima)
      const text = plain(s.narration);
      const bytes = await fishTts(text, ch.fish_voice_id, FISH_MODEL);
      const url = await upload(`${v.id}/a_${String(s.n).padStart(3, "0")}_${Date.now()}.mp3`, bytes, "audio/mpeg");
      // deno-lint-ignore no-explicit-any
      let t: any = null;
      if (KEYS["OPENAI_API_KEY"]) {
        try { t = await whisperWords(bytes, text, ch.language); sttSec += t.duration; } catch (e) { await log(job, `Escena ${s.n}: sin tiempos por palabra (${(e as Error).message || (e as Error).constructor.name}); se estiman`, "warn"); }
      }
      await sb.from("scenes").update({ audio_url: url, audio_duration: t?.duration ?? bytes.length / 16000, words: t?.words ?? null }).eq("id", s.id);
      fishBytes += new TextEncoder().encode(text).length;
      continue;
    }
    await reserve("tts_chars", s.narration.length);
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ text: s.narration, model_id: "eleven_v3", language_code: v.channel.language }),
    });
    if (!r.ok) await elevenFail(r, "voz");
    const d = await r.json();
    const ends: number[] = d.alignment?.character_end_times_seconds ?? [];
    const url = await upload(`${v.id}/a_${String(s.n).padStart(3, "0")}_${Date.now()}.mp3`, b64ToBytes(d.audio_base64), "audio/mpeg");
    await sb.from("scenes").update({ audio_url: url, audio_duration: ends.length ? ends[ends.length - 1] : null, words: wordsFromAlignment(d.alignment) }).eq("id", s.id);
    chars += s.narration.length;
  }
  const { count: total } = await sb.from("scenes").select("id", { count: "exact", head: true }).eq("video_id", v.id);
  const { count: left } = await sb.from("scenes").select("id", { count: "exact", head: true }).eq("video_id", v.id).is("audio_url", null);
  await bumpUsage(v.id, { tts_chars: chars, ...(fishBytes ? { fish_bytes: fishBytes } : {}), ...(sttSec ? { stt_sec: Math.round(sttSec) } : {}) }, { progress: Math.round(2 + 33 * (1 - (left ?? 0) / Math.max(total ?? 1, 1))) });
  if ((left ?? 0) > 0) await enqueue("voice", { video_id: v.id, payload: { cont: true } });
  else { await enqueue("audio", { video_id: v.id }); await log(job, "Voz terminada"); }
}

// ---------- Paso: música y efectos de sonido (ElevenLabs) ----------
async function elevenFail(r: Response, what: string): Promise<never> {
  const t = (await r.text()).slice(0, 200);
  if (r.status === 401 && /quota|credits|limit/i.test(t) || /quota_exceeded/i.test(t)) throw new UserError("ElevenLabs se ha quedado sin créditos. Recárgalos y vuelve a lanzar el vídeo.");
  throw new Error(`ElevenLabs ${what} ${r.status}: ${t}`);
}
async function elevenMusic(prompt: string, seconds: number) {
  await reserve("music_sec", seconds);
  const r = await fetch(`https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: Math.round(Math.min(600, Math.max(10, seconds)) * 1000), model_id: MUSIC_MODEL, force_instrumental: true }),
  });
  if (!r.ok) await elevenFail(r, "música");
  return new Uint8Array(await r.arrayBuffer());
}
async function elevenSfx(text: string) {
  await reserve("sfx", 1);
  const r = await fetch(`https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: SFX_MODEL, duration_seconds: 2.5, prompt_influence: 0.5 }),
  });
  if (!r.ok) await elevenFail(r, "efecto");
  return new Uint8Array(await r.arrayBuffer());
}
async function stepAudio(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel; const short = ch.format === "short";
  // 1) Banda sonora
  if (!job.payload?.music_done) {
    await sb.from("videos").update({ stage: "Componiendo música", progress: 36 }).eq("id", v.id);
    const { data: sc } = await sb.from("scenes").select("audio_duration").eq("video_id", v.id);
    const voiceSec = (sc ?? []).reduce((a, s) => a + Number(s.audio_duration ?? 4) + 0.35, 0);
    let musicSec = 0;
    if (ch.music_mode === "video") {
      const prompt = v.script?.music_prompt || ch.music_style || `subtle instrumental background score for a ${ch.niche} documentary, unobtrusive under narration`;
      // La pista anterior vale si es la misma música y dura lo suficiente (se ahorra volver a componerla)
      const meta = v.script?.music_meta;
      const need = short ? voiceSec + 0.5 : Math.min(voiceSec, 170);
      // Biblioteca musical del canal: se componen como mucho MUSIC_LIBRARY pistas por canal y después se van rotando (componer es lo más caro de ElevenLabs)
      const { data: lib } = await sb.from("videos").select("music_url").eq("channel_id", ch.id).neq("id", v.id).not("music_url", "is", null).order("created_at", { ascending: false }).limit(60);
      const tracks = [...new Set((lib ?? []).map((x) => String(x.music_url)))];
      if (v.music_url && meta?.prompt === prompt && Number(meta?.sec) >= need) {
        await log(job, "Se reaprovecha la música del montaje anterior");
      } else if (tracks.length >= MUSIC_LIBRARY) {
        const { count: nv } = await sb.from("videos").select("id", { count: "exact", head: true }).eq("channel_id", ch.id).not("music_url", "is", null);
        const pick = tracks[(nv ?? 0) % tracks.length];
        await sb.from("videos").update({ music_url: pick, script: { ...v.script, music_meta: { prompt, sec: 180, library: true } } }).eq("id", v.id);
        await log(job, "Música de la biblioteca del canal (sin coste)");
      } else {
        // Pistas de 3 min: sirven para Shorts (se recortan) y para largos (se repiten con fundidos)
        musicSec = 180;
        const bytes = await elevenMusic(`${prompt}. Instrumental only, no vocals, mix leaves space for a voiceover.`, musicSec);
        const url = await upload(`${v.id}/music_${Date.now()}.mp3`, bytes, "audio/mpeg");
        await sb.from("videos").update({ music_url: url, script: { ...v.script, music_meta: { prompt, sec: musicSec } } }).eq("id", v.id);
      }
    } else if (ch.music_mode === "channel" && !ch.generated_music_url) {
      const prompt = ch.music_style || `signature instrumental background theme for a YouTube channel about ${ch.niche}, unobtrusive under narration`;
      musicSec = 180;
      const bytes = await elevenMusic(`${prompt}. Instrumental only, no vocals, loopable, mix leaves space for a voiceover.`, musicSec);
      const url = await upload(`channels/${ch.id}/theme.mp3`, bytes, "audio/mpeg");
      await sb.from("channels").update({ generated_music_url: url }).eq("id", ch.id);
    }
    if (musicSec) await bumpUsage(v.id, { music_sec: Math.round(musicSec) });
    await enqueue("audio", { video_id: v.id, payload: { music_done: true } });
    return;
  }
  // 2) Efectos de sonido, por lotes
  await sb.from("videos").update({ stage: "Diseño de sonido", progress: 40 }).eq("id", v.id);
  const { data: pending } = await sb.from("scenes").select("id,n,sfx_prompt").eq("video_id", v.id).not("sfx_prompt", "is", null).is("sfx_url", null).order("n").limit(6);
  let newSfx = 0;
  for (const s of pending ?? []) {
    const k = sfxKey(s.sfx_prompt);
    const path = `channels/${ch.id}/sfx/${k}.mp3`;
    const { data: ex } = await sb.storage.from("media").list(`channels/${ch.id}/sfx`, { search: `${k}.mp3` });
    let url = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    if (!(ex ?? []).some((f) => f.name === `${k}.mp3`)) { url = await upload(path, await elevenSfx(SFX_LIB[k]), "audio/mpeg"); newSfx++; }
    await sb.from("scenes").update({ sfx_url: url }).eq("id", s.id);
  }
  if (newSfx) await bumpUsage(v.id, { sfx: newSfx });
  const { count: left } = await sb.from("scenes").select("id", { count: "exact", head: true }).eq("video_id", v.id).not("sfx_prompt", "is", null).is("sfx_url", null);
  if ((left ?? 0) > 0) await enqueue("audio", { video_id: v.id, payload: { music_done: true } });
  else { await enqueue("visuals", { video_id: v.id }); await log(job, "Música y efectos terminados"); }
}

// ---------- Paso: imágenes y vídeo de stock (por lotes) ----------
async function aiImage(prompt: string, short: boolean, quality = "medium") {
  await reserve(quality === "low" ? "ai_images_low" : "ai_images", 1);
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-2", prompt, size: short ? "1024x1536" : "1536x1024", quality, n: 1, output_format: "jpeg", output_compression: 90 }),
  });
  if (!r.ok) { const t = (await r.text()).slice(0, 200); if (/insufficient_quota|billing|exceeded your current quota/i.test(t)) throw new UserError("OpenAI se ha quedado sin crédito. Recárgalo y vuelve a lanzar el vídeo."); throw new Error(`OpenAI ${r.status}: ${t}`); }
  const d = await r.json();
  return b64ToBytes(d.data[0].b64_json);
}
// Si el filtro de OpenAI rechaza el prompt, se reintenta una vez con una versión suavizada
const SOFTEN = /\b(half-starved|starv\w*|gaunt|emaciated|wounded|injur\w*|blood\w*|corpse\w*|dead|dying|kill\w*|gun\w*|rifle\w*|weapon\w*|ammunition|ammo|artillery|shell\w*|bomb\w*|explosi\w*|battle\w*|combat|smoking ridge|war-torn|warfare|trooper\w*|military)\b/gi;
// Escenas en calidad baja (casi igual en el móvil, unas 3 veces más barata); las miniaturas siguen en media
const SCENE_QUALITY = "low";
async function safeImage(prompt: string, short: boolean, quality = "medium"): Promise<Uint8Array | null> {
  try { return await aiImage(prompt, short, quality); } catch (e) {
    if (!/safety|rejected|content_policy|moderation/i.test(String((e as Error).message))) throw e;
  }
  const soft = prompt.replace(SOFTEN, "").replace(/\s{2,}/g, " ") + " Family-friendly, peaceful, non-violent scene: no weapons, no injuries, no suffering.";
  try { return await aiImage(soft, short, quality); } catch (e) {
    if (!/safety|rejected|content_policy|moderation/i.test(String((e as Error).message))) throw e;
    return null;
  }
}
async function pexels(kind: "photo" | "video", query: string, short: boolean, used: Set<string>) {
  const orientation = short ? "portrait" : "landscape";
  const u = kind === "photo" ? `https://api.pexels.com/v1/search?per_page=15&orientation=${orientation}&query=${encodeURIComponent(query)}` : `https://api.pexels.com/videos/search?per_page=15&orientation=${orientation}&query=${encodeURIComponent(query)}`;
  const r = await fetch(u, { headers: { Authorization: key("PEXELS_API_KEY") } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const d = await r.json();
  if (kind === "photo") {
    // deno-lint-ignore no-explicit-any
    const p = (d.photos ?? []).map((x: any) => x.src?.large2x).find((x: string) => x && !used.has(x));
    return p ? { url: p, kind: "image" } : null;
  }
  // deno-lint-ignore no-explicit-any
  for (const vid of d.videos ?? []) {
    // deno-lint-ignore no-explicit-any
    const files = (vid.video_files ?? []).filter((f: any) => f.file_type === "video/mp4" && f.width && f.height).sort((a: any, b: any) => Math.abs((short ? a.height : a.width) - 1920) - Math.abs((short ? b.height : b.width) - 1920));
    if (files[0] && !used.has(files[0].link)) return { url: files[0].link, kind: "video" };
  }
  return null;
}
// Fotos históricas de Wikimedia Commons con licencia libre (dominio público, CC0, CC BY, CC BY-SA)
const stripHtml = (h: unknown) => String(h ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
// Palabras que no sirven para saber si una foto es la buena
const STOP = new Set("the of and in on at to a an with for from by photo photograph photography picture image archive archival footage film original public domain close up closeup portrait historic historical old vintage black white view scene".split(" "));
// Une identificadores como «U-995», «U 995» o «U-boat» en una sola palabra («u995», «uboat») para poder compararlos
const normTxt = (q: string) => String(q ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b([a-z]{1,3})[- ]?(\d{1,4}|boat)\b/g, "$1$2");
const keyWords = (q: string) => normTxt(q).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
// Proporción de palabras clave de la búsqueda que aparecen en el título y la descripción de la foto
function matchScore(query: string, text: string) {
  const k = keyWords(query); if (!k.length) return 0;
  const t = " " + normTxt(text).replace(/[^a-z0-9]+/g, " ") + " ";
  const named = k.filter((w) => !/^\d+s?$/.test(w));
  const has = (w: string) => t.includes(" " + w) || t.includes(w + " ");
  const hits = named.filter(has).length;
  // Un identificador exacto (U-995, HMS Hood 51...) basta para dar la foto por buena
  if (named.some((w) => /[a-z]/.test(w) && /\d/.test(w) && has(w))) return Math.max(0.75, named.length ? hits / named.length : 0);
  return named.length ? hits / named.length : 0;
}
async function commons(query: string, used: Set<string>) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "15", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "2000" }).toString();
  const r = await fetch(u, { headers: { "User-Agent": "FacelessStudio/1.0 (https://github.com/indoorwall/faceless-render)" } });
  if (!r.ok) throw new Error(`Wikimedia ${r.status}`);
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const pages: any[] = Object.values(d?.query?.pages ?? {}).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
  // Solo se acepta una foto si su título o descripción encaja de verdad con lo que se busca (nada de fotos al azar)
  // deno-lint-ignore no-explicit-any
  let best: any = null; let bestScore = 0;
  for (const p of pages) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const md = ii.extmetadata ?? {};
    const lic = stripHtml(md.LicenseShortName?.value);
    if (!/^(public domain|pd|cc0|cc by)/i.test(lic) || /nc|nd/i.test(lic)) continue;
    if (!/image\/(jpeg|png)/.test(ii.mime ?? "") || (ii.width ?? 0) < 700) continue;
    const url = ii.thumburl || ii.url;
    if (!url || used.has(url)) continue;
    const text = `${p.title} ${stripHtml(md.ObjectName?.value)} ${stripHtml(md.ImageDescription?.value).slice(0, 600)} ${stripHtml(md.Categories?.value)}`;
    const sc = matchScore(query, text);
    if (sc > bestScore) {
      bestScore = sc;
      const artist = stripHtml(md.Artist?.value).slice(0, 80) || "Autor desconocido";
      best = { url, kind: "image", fit: "contain", match: sc, credit: { title: stripHtml(md.ObjectName?.value || p.title?.replace(/^File:/, "")).slice(0, 90), author: artist, license: lic, source: ii.descriptionurl } };
    }
  }
  const need = keyWords(query).filter((w) => !/^\d+s?$/.test(w)).length <= 2 ? 1 : 0.5;
  return best && bestScore >= need ? best : null;
}
// Prompt de imagen siempre con contexto: nunca se genera a partir de la frase suelta (salían imágenes sin relación)
// deno-lint-ignore no-explicit-any
function ctxPrompt(sh: any, v: any, ch: any) {
  const base = String(sh.visual_prompt || [sh.archive_query, sh.stock_query].filter(Boolean).join(", ")).trim();
  const story = v.script?.title || v.title || v.idea_title;
  const hist = sh.visual_type === "archive" ? " Period-accurate historical recreation in a painterly documentary illustration style (clearly an illustration, not a fake photograph)." : "";
  return `${base ? base + ". " : ""}This image illustrates the moment narrated as: "${sh.line}", in the true story "${story}"${v.idea_angle ? ` (${String(v.idea_angle).slice(0, 200)})` : ""}. Show only what fits this story, its place and its era; nothing modern or unrelated.${hist} Style: ${ch.style_prompt ?? "cinematic documentary still, realistic lighting"}. No text, no watermarks, no logos.`;
}
async function stepVisuals(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel; const short = ch.format === "short";
  // FLUX (fal.ai) para los planos IA; OpenAI solo para el primero del vídeo (el gancho)
  const fluxOn = ch.image_provider === "flux" && !!KEYS["FAL_KEY"];
  await sb.from("videos").update({ stage: "Generando imágenes" }).eq("id", v.id);
  const { data: allScenes } = await sb.from("scenes").select("*").eq("video_id", v.id).order("n");
  const used = new Set<string>();
  for (const sc of allScenes ?? []) for (const sh of sc.shots ?? []) if (sh.media_url) used.add(sh.media_url);
  // Tope de imágenes IA por vídeo: el resto, archivo, stock gratis o acercamientos
  const aiCap = fluxOn ? (short ? 10 : 40) : (short ? 4 : 12);
  // deno-lint-ignore no-explicit-any
  let aiUsed = (allScenes ?? []).flatMap((sc: any) => sc.shots ?? []).filter((x: any) => x.gen === "ai" && x.media_url).length;
  let aiBudget = fluxOn ? 5 : 2; let images = 0; let fluxN = 0;
  // deno-lint-ignore no-explicit-any
  let prev: any = null;
  for (const sc of allScenes ?? []) {
    // deno-lint-ignore no-explicit-any
    const shots: any[] = Array.isArray(sc.shots) && sc.shots.length ? sc.shots : [{ line: sc.narration, visual_type: sc.visual_type, visual_prompt: sc.visual_prompt, stock_query: sc.stock_query }];
    if (sc.media_url) { prev = shots[shots.length - 1]?.media_url ? shots[shots.length - 1] : { media_url: sc.media_url, media_kind: sc.media_kind, fit: "cover" }; continue; }
    if (aiBudget <= 0) break;
    for (const sh of shots) {
      if (sh.media_url) { prev = sh; continue; }
      let type = sh.visual_type as string;
      if (type === "reframe" && !prev) type = "ai";
      if (ch.image_source === "ai" && !["ai", "reframe"].includes(type)) type = "ai";
      if (ch.image_source === "stock" && type === "ai") type = "stock_photo";
      if (type === "ai" && !KEYS["OPENAI_API_KEY"] && !fluxOn) type = "stock_photo";
      if (type === "reframe") { Object.assign(sh, { media_url: prev.media_url, media_kind: prev.media_kind, fit: prev.fit ?? "cover", reframe: sh.reframe ?? { x: 0.5, y: 0.4, zoom: 1.5 } }); prev = sh; continue; }
      // deno-lint-ignore no-explicit-any
      let media: any = null;
      if (type === "archive") {
        try { media = await commons(sh.archive_query || sh.stock_query || sh.visual_prompt?.split(",")[0] || ch.niche, used); } catch (_) { /* sin resultado: se busca alternativa */ }
        // Las fotos de stock son modernas: para una foto de archivo no sirven
        if (!media && ch.image_source === "stock" && KEYS["PEXELS_API_KEY"]) media = await pexels("photo", sh.archive_query || sh.stock_query || ch.niche, short, used);
      } else if ((type === "stock_photo" || type === "stock_video") && KEYS["PEXELS_API_KEY"]) {
        media = await pexels(type === "stock_video" ? "video" : "photo", sh.stock_query || sh.visual_prompt?.split(",")[0] || v.idea_title, short, used);
        if (!media && type === "stock_video") media = await pexels("photo", sh.stock_query || v.idea_title, short, used);
      }
      // Con el tope de IA alcanzado: foto de archivo, stock o acercamiento al plano anterior
      if (!media && aiUsed >= aiCap) {
        const q = sh.archive_query || String(sh.visual_prompt ?? "").split(/[,.]/)[0].split(/\s+/).slice(0, 6).join(" ");
        if (ch.image_source !== "ai") {
          try { media = await commons(q, used); } catch (_) { /* sigue */ }
          if (!media && type !== "archive" && KEYS["PEXELS_API_KEY"]) { try { media = await pexels("photo", sh.stock_query || q, short, used); } catch (_) { /* sigue */ } }
        }
        if (!media && prev?.media_url) media = { url: prev.media_url, kind: prev.media_kind, fit: prev.fit ?? "cover", reframe: { x: 0.35 + Math.random() * 0.3, y: 0.35, zoom: 1.4 + Math.random() * 0.3 } };
      }
      if (!media && ch.image_source !== "stock" && (KEYS["OPENAI_API_KEY"] || fluxOn)) {
        if (aiBudget <= 0) break;
        const viaFlux = fluxOn && !(sc.n === 1 && shots.indexOf(sh) === 0 && KEYS["OPENAI_API_KEY"]);
        let bytes: Uint8Array | null;
        try { bytes = viaFlux ? await fluxImage(ctxPrompt(sh, v, ch), short) : await safeImage(ctxPrompt(sh, v, ch), short, SCENE_QUALITY); } catch (e) {
          // Sin presupuesto a mitad de escena: se guarda lo ya generado para no pagarlo otra vez
          if (e instanceof OverBudget) { await sb.from("scenes").update({ shots }).eq("id", sc.id); await bumpUsage(v.id, { ai_images_low: images, flux_images: fluxN }); }
          throw e;
        }
        if (bytes) {
          media = { url: await upload(`${v.id}/i_${String(sc.n).padStart(3, "0")}_${shots.indexOf(sh)}_${Date.now()}.jpg`, bytes, "image/jpeg"), kind: "image", fit: "cover", gen: "ai", provider: viaFlux ? "flux" : "openai" };
          if (viaFlux) fluxN++; else images++;
          aiBudget--; aiUsed++;
        } else {
          // OpenAI no quiere generarla: foto de archivo del tema o, si no hay, un acercamiento al plano anterior
          try { media = await commons(sh.archive_query || v.idea_title, used); } catch (_) { /* sigue */ }
          if (!media && prev?.media_url) media = { url: prev.media_url, kind: prev.media_kind, fit: prev.fit ?? "cover", reframe: { x: 0.5, y: 0.4, zoom: 1.4 } };
          await log(job, `${viaFlux ? "FLUX" : "OpenAI"} rechazó una imagen del plano «${String(sh.line).slice(0, 50)}»; se usa ${media ? "una alternativa" : "nada"}.`, "warn");
        }
      }
      if (!media) throw new UserError(`No se encontró imagen para el plano «${String(sh.line).slice(0, 60)}». Revisa las claves de Pexels u OpenAI.`);
      Object.assign(sh, { media_url: media.url, media_kind: media.kind, fit: media.fit ?? "cover", reframe: media.reframe ?? null, credit: media.credit ?? null, gen: media.gen ?? null, provider: media.provider ?? null });
      used.add(media.url); prev = sh;
    }
    const done = shots.every((x) => x.media_url);
    await sb.from("scenes").update({ shots, ...(done ? { media_url: shots[0].media_url, media_kind: shots[0].media_kind } : {}) }).eq("id", sc.id);
    if (!done) break;
  }
  const { count: total } = await sb.from("scenes").select("id", { count: "exact", head: true }).eq("video_id", v.id);
  const { count: left } = await sb.from("scenes").select("id", { count: "exact", head: true }).eq("video_id", v.id).is("media_url", null);
  await bumpUsage(v.id, { ai_images_low: images, ...(fluxN ? { flux_images: fluxN } : {}) }, { progress: Math.round(45 + 35 * (1 - (left ?? 0) / Math.max(total ?? 1, 1))) });
  if ((left ?? 0) > 0) await enqueue("visuals", { video_id: v.id });
  else {
    // Créditos a partir de las fotos de archivo realmente usadas (también las reaprovechadas)
    const { data: fin } = await sb.from("scenes").select("shots").eq("video_id", v.id);
    // deno-lint-ignore no-explicit-any
    const credits = (fin ?? []).flatMap((sc: any) => (sc.shots ?? []).map((x: any) => x.credit)).filter(Boolean);
    await sb.from("videos").update({ credits }).eq("id", v.id);
    // Créditos de las fotos de archivo al final de la descripción
    if (credits.length) {
      const seenC = new Set<string>();
      const lines = credits.filter((c) => !seenC.has(c.source) && seenC.add(c.source)).map((c) => `· ${c.title} — ${c.author} (${c.license}) ${c.source}`);
      const baseDesc = String(v.description ?? "").split("\n\nImágenes de archivo:")[0];
      await sb.from("videos").update({ description: `${baseDesc}\n\nImágenes de archivo:\n${lines.join("\n")}`.trim() }).eq("id", v.id);
    }
    await enqueue("render", { video_id: v.id }); await log(job, "Visuales terminados");
  }
}

// ---------- Paso: montaje en Creatomate ----------
// deno-lint-ignore no-explicit-any
function buildSource(v: any, scenes: any[]) {
  const ch = v.channel; const short = ch.format === "short";
  const W = short ? 1080 : 1920; const H = short ? 1920 : 1080;
  const T = 0.5;
  let total = 0;
  const comps = scenes.map((s, i) => {
    const dur = Math.max(1.5, Number(s.audio_duration ?? 4) + 0.35);
    total += dur - (i > 0 ? T : 0);
    const zoomIn = i % 2 === 0;
    const media = s.media_kind === "video"
      ? { type: "video", track: 1, source: s.media_url, loop: true, volume: "0%", fit: "cover" }
      : { type: "image", track: 1, source: s.media_url, fit: "cover", animations: [{ type: "scale", easing: "linear", scope: "element", start_scale: zoomIn ? "100%" : "114%", end_scale: zoomIn ? "114%" : "100%", fade: false }] };
    // deno-lint-ignore no-explicit-any
    const els: any[] = [
      media,
      { type: "audio", track: 2, name: `a${s.n}`, source: s.audio_url, duration: null },
      { type: "text", track: 3, transcript_source: `a${s.n}`, transcript_effect: "highlight", transcript_maximum_length: short ? 16 : 32, transcript_color: "#FFD400", x: "50%", y: short ? "64%" : "85%", width: "88%", height: short ? "22%" : "18%", x_alignment: "50%", y_alignment: "50%", font_family: "Montserrat", font_weight: "800", font_size: short ? "7 vmin" : "5 vmin", fill_color: "#FFFFFF", stroke_color: "#000000", stroke_width: "1.1 vmin" },
    ];
    if (s.sfx_url) els.push({ type: "audio", track: 4, time: 0, source: s.sfx_url, duration: null, volume: `${ch.sfx_volume ?? 55}%` });
    return { type: "composition", track: 1, duration: dur, animations: i > 0 ? [{ time: "start", duration: T, transition: true, type: "fade" }] : [], elements: els };
  });
  // deno-lint-ignore no-explicit-any
  const elements: any[] = [...comps];
  const music = ch.music_mode === "video" ? v.music_url : ch.music_mode === "channel" ? ch.generated_music_url : ch.music_mode === "url" ? ch.music_url : null;
  if (music) elements.push({ type: "audio", track: 5, time: 0, duration: total, source: music, loop: true, volume: `${ch.music_volume ?? 12}%`, audio_fade_in: 1, audio_fade_out: 2.5 });
  return { source: { output_format: "mp4", width: W, height: H, frame_rate: 30, elements }, total };
}
async function stepRender(job: Job) {
  const v = await getVideo(job.video_id);
  const short = v.channel.format === "short";
  await sb.from("videos").update({ stage: "Montando vídeo", progress: 82 }).eq("id", v.id);
  // Las miniaturas se generan en paralelo, sin retrasar el montaje
  if (!short && !(v.thumbnails ?? []).length && KEYS["OPENAI_API_KEY"] && !job.payload?.no_thumbs) await enqueue("thumbs", { video_id: v.id });
  const { data: scenes } = await sb.from("scenes").select("*").eq("video_id", v.id).order("n");
  // Montaje propio (FFmpeg) si está configurado; si no, Creatomate
  if (KEYS["RENDER_URL"] && KEYS["RENDER_SECRET"]) {
    const ch = v.channel; const sh = ch.format === "short";
    // Escenas sin tiempos por palabra: alineado forzado con ElevenLabs sobre el audio ya generado
    for (const s of scenes ?? []) {
      if (Array.isArray(s.words) && s.words.length) continue;
      try {
        s.words = await forcedAlign(s.audio_url, s.narration);
        if (s.words) await sb.from("scenes").update({ words: s.words }).eq("id", s.id);
      } catch (e) { await log(job, `Alineado de subtítulos no disponible en la escena ${s.n}: ${(e as Error).message}`, "warn"); }
    }
    const music = ch.music_mode === "video" ? v.music_url : ch.music_mode === "channel" ? ch.generated_music_url : ch.music_mode === "url" ? ch.music_url : null;
    const outPath = `${v.id}/final.mp4`;
    const { data: signed, error: se } = await sb.storage.from("media").createSignedUploadUrl(outPath, { upsert: true });
    if (se || !signed) throw new Error(`No se pudo preparar la subida: ${se?.message}`);
    const spec = {
      id: v.id, width: sh ? 1080 : 1920, height: sh ? 1920 : 1080, fps: 30, transition: 0.5,
      upload_url: signed.signedUrl,
      // deno-lint-ignore no-explicit-any
      scenes: (scenes ?? []).map((s) => ({ media_url: s.media_url, media_kind: s.media_kind, audio_url: s.audio_url, sfx_url: s.sfx_url, narration: s.narration, voice_duration: s.audio_duration, words: s.words, keywords: s.keywords ?? [], shots: (s.shots ?? []).map((x: any) => ({ media_url: x.media_url, media_kind: x.media_kind, fit: x.fit ?? "cover", reframe: x.reframe ?? null, line: x.line })) })),
      music: music ? { url: music, volume: ch.music_volume ?? 12, fade_in: 1, fade_out: 2.5 } : null,
      sfx_volume: ch.sfx_volume ?? 55,
      subtitles: sh ? { max_words: 3, y: 0.64, size: 0.07 } : { max_words: 6, y: 0.86, size: 0.05 },
    };
    const base = KEYS["RENDER_URL"].replace(/\/+$/, "");
    const r = await fetch(`${base}/jobs`, { method: "POST", headers: { Authorization: `Bearer ${KEYS["RENDER_SECRET"]}`, "Content-Type": "application/json" }, body: JSON.stringify(spec) });
    if (!r.ok && r.status !== 409) throw new Error(`Servidor de render ${r.status}: ${(await r.text()).slice(0, 300)}`);
    await sb.from("videos").update({ render_id: `own:${v.id}`, stage: "Renderizando vídeo", progress: 85 }).eq("id", v.id);
    await enqueue("render_check", { video_id: v.id, delaySec: 20 });
    return;
  }
  const { source, total } = buildSource(v, scenes ?? []);
  const r = await fetch("https://api.creatomate.com/v2/renders", {
    method: "POST",
    headers: { Authorization: `Bearer ${key("CREATOMATE_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...source, metadata: v.id }),
  });
  if (!r.ok) throw new Error(`Creatomate ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const render = Array.isArray(d) ? d[0] : d;
  await sb.from("videos").update({ render_id: render.id, duration_sec: Math.round(total), stage: "Renderizando vídeo", progress: 85 }).eq("id", v.id);
  await enqueue("render_check", { video_id: v.id, delaySec: 40 });
}
async function stepRenderCheck(job: Job) {
  const v = await getVideo(job.video_id);
  if (String(v.render_id ?? "").startsWith("own:")) {
    const base = key("RENDER_URL").replace(/\/+$/, "");
    const r = await fetch(`${base}/jobs/${v.id}`, { headers: { Authorization: `Bearer ${key("RENDER_SECRET")}` } });
    if (r.status === 404) { await enqueue("render", { video_id: v.id }); return; } // el servidor se reinició: volver a encargarlo
    if (!r.ok) throw new Error(`Servidor de render ${r.status}`);
    const d = await r.json();
    if (d.status === "succeeded") {
      const url = sb.storage.from("media").getPublicUrl(`${v.id}/final.mp4`).data.publicUrl + `?v=${Date.now()}`;
      await sb.from("videos").update({ video_url: url, status: "final_review", stage: null, progress: 100, duration_sec: Math.round((d.duration ?? 0) * 10) / 10 }).eq("id", v.id);
      await log(job, `Vídeo listo para revisión: ${v.title}`);
    } else if (d.status === "failed") {
      throw new UserError(`Render fallido: ${d.error ?? "sin detalle"}`);
    } else {
      await sb.from("videos").update({ stage: d.stage ?? "Renderizando vídeo", progress: Math.max(85, Math.min(99, 85 + Math.round((d.progress ?? 0) * 0.14))) }).eq("id", v.id);
      await enqueue("render_check", { video_id: v.id, delaySec: 15 });
    }
    return;
  }
  const r = await fetch(`https://api.creatomate.com/v2/renders/${v.render_id}`, { headers: { Authorization: `Bearer ${key("CREATOMATE_API_KEY")}` } });
  if (!r.ok) throw new Error(`Creatomate ${r.status}`);
  const d = await r.json();
  if (d.status === "succeeded") {
    await sb.from("videos").update({ video_url: d.url, status: "final_review", stage: null, progress: 100, duration_sec: d.duration ?? v.duration_sec }).eq("id", v.id);
    await log(job, `Vídeo listo para revisión: ${v.title}`);
  } else if (d.status === "failed") {
    throw new UserError(`Render fallido: ${d.error_message ?? "sin detalle"}`);
  } else {
    await sb.from("videos").update({ progress: Math.min(99, (v.progress ?? 85) + 2) }).eq("id", v.id);
    await enqueue("render_check", { video_id: v.id, delaySec: 30 });
  }
}

// ---------- Paso: publicar en YouTube ----------
async function stepPublish(job: Job) {
  const v = await getVideo(job.video_id);
  const { data: tok } = await sb.from("youtube_tokens").select("refresh_token").eq("channel_id", v.channel_id).maybeSingle();
  if (!tok) throw new UserError("Conecta el canal de YouTube en la ficha del canal antes de publicar.");
  if (!v.video_url) throw new UserError("No hay vídeo renderizado");
  const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: key("GOOGLE_CLIENT_ID"), client_secret: key("GOOGLE_CLIENT_SECRET"), refresh_token: tok.refresh_token, grant_type: "refresh_token" }) });
  if (!t.ok) throw new UserError(`No se pudo renovar el acceso a YouTube (${t.status}). Vuelve a conectar el canal.`);
  const { access_token } = await t.json();
  const future = v.publish_at && new Date(v.publish_at) > new Date();
  const meta = {
    snippet: { title: (v.title ?? v.idea_title).slice(0, 100), description: v.description ?? "", tags: v.tags ?? [], defaultLanguage: v.channel.language, defaultAudioLanguage: v.channel.language, categoryId: "27" },
    status: { privacyStatus: future ? "private" : v.channel.publish_privacy, publishAt: future ? new Date(v.publish_at).toISOString() : undefined, selfDeclaredMadeForKids: false, containsSyntheticMedia: v.ai_disclosure },
  };
  const head = await fetch(v.video_url, { method: "HEAD" });
  const size = head.headers.get("content-length");
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", ...(size ? { "X-Upload-Content-Length": size } : {}) },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error(`YouTube init ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const loc = init.headers.get("Location")!;
  const src = await fetch(v.video_url);
  const up = await fetch(loc, { method: "PUT", headers: { "Content-Type": "video/mp4", ...(size ? { "Content-Length": size } : {}) }, body: src.body });
  if (!up.ok) throw new Error(`YouTube upload ${up.status}: ${(await up.text()).slice(0, 300)}`);
  const res = await up.json();
  if (v.thumbnail_url) {
    try {
      const img = await fetch(v.thumbnail_url).then((r) => r.arrayBuffer());
      await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${res.id}`, { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": /\.jpe?g(\?|$)/i.test(v.thumbnail_url) ? "image/jpeg" : "image/png" }, body: img });
    } catch (_) { /* la miniatura personalizada requiere canal verificado */ }
  }
  await sb.from("videos").update({ youtube_video_id: res.id, status: future ? "scheduled" : "published", stage: null, published_at: future ? new Date(v.publish_at).toISOString() : new Date().toISOString() }).eq("id", v.id);
  await log(job, `Publicado en YouTube: https://youtu.be/${res.id}`);
}

// ================= Viralidad: director, análisis del vídeo y miniaturas =================
const VIRAL_RULES = (short: boolean) => `CRITERIOS DE VIRALIDAD (${short ? "Shorts" : "vídeo largo"}):
- Gancho: ${short ? "en el segundo 0-3" : "en los primeros 15-30 s"} va la afirmación más sorprendente o la imagen más potente, sin año, lugar ni contexto previo. Abre una pregunta que el espectador necesite resolver. Nunca anuncies una sorpresa que la imagen ya ha desvelado.
- Bucles de curiosidad: ${short ? "cada 8-10 s" : "cada 60-90 s"} algo nuevo (giro, cifra, conflicto, revelación) que justifique seguir mirando. Escala la intensidad hacia el clímax.
- Cero relleno: elimina toda frase que no sorprenda, no emocione o no haga avanzar la historia. Mejor 45 s apretados que 60 s flojos.
- Ritmo visual: cambio de plano cada ${short ? "1,5-3,5 s" : "3-6 s"}, siempre ligado a lo que se dice; alterna recreación, foto real y reencuadre. Una foto real tras una recreación provoca el "¿esto pasó de verdad?".
- Cierre: ${short ? "frase final memorable que conecte con la primera para invitar al rebote (bucle), o un giro emocional" : "remate emocional y un avance que invite a ver otro vídeo del canal"}. Sin "suscríbete" ni preguntas sobre nombres que el público no conoce.
- Compartible: la premisa se puede contar en una frase a un amigo ("¿sabías que...?").
- Empaquetado: título de menos de 55 caracteres, concreto y con curiosidad, sin clickbait falso; texto de miniatura de 2-4 palabras que complementa al título, no lo repite.
- Rigor: lo dudoso se cuenta como testimonio ("cuentan que", "según testigos"), nunca como hecho. Nada inventado.`;

// deno-lint-ignore no-explicit-any
async function claudeTool(model: string, system: string, content: any, tool: any, maxTokens = 12000, batch?: { job: Job; tag: string }) {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content }];
  let inTok = 0; let outTok = 0;
  for (let i = 0; i < 2; i++) {
    const body = { model, max_tokens: maxTokens, system, messages, tools: [tool] };
    // deno-lint-ignore no-explicit-any
    let d: any;
    if (batch) d = await batched(batch.job, `${batch.tag}_${i}`, body);
    else {
      await claudeGuard(model);
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: AH(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
      d = await r.json();
      await claudeSpent(model, d);
    }
    inTok += d.usage?.input_tokens ?? 0; outTok += d.usage?.output_tokens ?? 0;
    // deno-lint-ignore no-explicit-any
    const call = (d.content ?? []).find((b: any) => b.type === "tool_use" && b.name === tool.name);
    if (call) return { input: call.input, inTok, outTok, model, stop: d.stop_reason as string, batch: !!batch };
    messages.push({ role: "assistant", content: d.content }, { role: "user", content: `Llama ahora a ${tool.name} con el resultado.` });
  }
  throw new Error("La IA no devolvió el resultado");
}

// ---------- Paso: director (revisa el guion para que sea viral y lo reescribe) ----------
async function stepDirect(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel; const short = ch.format === "short";
  const original = v.script;
  const finish = async (script: unknown, extra: Record<string, unknown> = {}) => {
    // deno-lint-ignore no-explicit-any
    const sc = script as any;
    await sb.from("videos").update({ script: sc, title: sc.title, description: sc.description, tags: sc.tags ?? [], sources: sc.sources ?? [], status: "script_review", stage: null, progress: 0, ...extra }).eq("id", v.id);
  };
  if (!original?.scenes?.length) throw new UserError("No hay guion que revisar");
  if (job.attempts >= 2) { await finish(original); await log(job, "El director tardó demasiado. Queda el borrador del guionista.", "warn"); return; }
  // Filtro barato: si el borrador ya cumple lo aprendido, el director (Opus) no interviene
  let weak: string[] = [];
  try {
    const g = await claudeTool(MODEL_CHEAP, `Evalúas borradores de guion para YouTube con los criterios del canal. Eres exigente: solo das 8 o más si el guion está listo para hacerse viral sin cambios.`, `${ch.style_guide ? `GUÍA DEL CANAL:\n${String(ch.style_guide).slice(0, 5000)}\n\n` : ""}${playbookBlock(ch)}${VIRAL_RULES(short)}\n\nBORRADOR:\n${JSON.stringify({ title: original.title, scenes: (original.scenes ?? []).map((x: { shots?: { line: string; visual_type: string }[]; keywords?: string[] }) => ({ shots: (x.shots ?? []).map((y) => `${y.visual_type}: ${y.line}`), keywords: x.keywords })) })}\n\nPuntúalo y llama a evaluar.`, { name: "evaluar", description: "Nota del borrador", input_schema: { type: "object", required: ["score", "weak_points"], properties: { score: { type: "number" }, weak_points: { type: "array", items: { type: "string" }, maxItems: 5 } } } }, 1200);
    await bumpUsage(v.id, usageOf(g));
    const score = Number(g.input.score ?? 0);
    weak = g.input.weak_points ?? [];
    if (score >= Number(ch.director_threshold ?? 8)) {
      await finish({ ...original, director: { skipped: true, score_before: score, score_after: score, changes: [], weak_points: weak, at: new Date().toISOString() } });
      await log(job, `El director no ha tenido que intervenir: el borrador ya saca ${score}/10`);
      return;
    }
  } catch (_) { /* si el filtro falla, revisa el director */ }
  const system = `Eres el director de contenidos de canales de YouTube que se hacen virales. Revisas el borrador del guionista con ojo implacable y lo reescribes para maximizar retención, rebote y compartidos, sin perder rigor. Respetas la guía del canal (es obligatoria). Mantienes el formato JSON exacto del borrador. Responde SOLO con JSON dentro de <json></json>.`;
  const user = `${ch.style_guide ? `GUÍA DEL CANAL (obligatoria):\n${String(ch.style_guide).slice(0, 8000)}\n\n` : ""}${playbookBlock(ch)}${VIRAL_RULES(short)}\n${weak.length ? `\nPuntos débiles detectados en una primera lectura: ${weak.join(" · ")}\n` : ""}\nCanal: ${ch.name} — ${ch.niche}. Idioma: ${ch.language}. Formato: ${short ? "Short vertical" : `vídeo largo de ~${ch.target_minutes} min`}.\nTipos de plano permitidos: ${ch.image_source === "ai" ? "ai y reframe" : ch.image_source === "stock" ? "archive, stock_photo, stock_video y reframe" : "ai, archive, stock_photo, stock_video y reframe"}.\n${v.review_feedback ? `Feedback del autor que el guion debe cumplir: ${v.review_feedback}\n` : ""}\nBORRADOR DEL GUIONISTA:\n${JSON.stringify(original)}\n\nTareas:\n1. Puntúa el borrador de 0 a 10 en potencial viral.\n2. Reescribe lo necesario (gancho, orden, frases sobrantes, planos, keywords, cierre, título, texto de miniatura). No inventes datos nuevos: usa solo los hechos del borrador y sus fuentes.\n3. Propón 3 conceptos de miniatura distintos (escena en inglés, sin texto, sujeto claro con emoción fuerte, alto contraste, el sujeto en la mitad derecha y la izquierda despejada para el texto) y 3 textos de miniatura alternativos.\nDevuelve: <json>{"review":{"score_before":0,"score_after":0,"changes":["qué has cambiado y por qué, frases cortas"],"title_options":["","",""]},"script":{...mismo formato del borrador, completo...,"thumbnail_concepts":["","",""],"thumbnail_texts":["","",""]}}</json>`;
  try {
    const r = await claude(MODEL_SCRIPT, system, user, { maxTokens: 20000 });
    await bumpUsage(v.id, usageOf(r));
    // Nunca aceptar una versión cortada o mucho más corta que el borrador
    if (r.stop === "max_tokens") throw new Error("la respuesta salió cortada");
    // deno-lint-ignore no-explicit-any
    const out = parseJson<any>(r.text);
    const s = out.script;
    if (!Array.isArray(s?.scenes) || !s.scenes.length) throw new Error("sin escenas");
    const before = scriptWords(original), after = scriptWords(s);
    if (after < before * 0.65 || s.scenes.length < Math.ceil((original.scenes?.length ?? 1) * 0.6)) throw new Error(`la versión del director es demasiado corta (${after} palabras frente a ${before})`);
    // deno-lint-ignore no-explicit-any
    s.scenes = s.scenes.map((sc: any, i: number) => normalizeScene({ ...sc, n: i + 1, sfx: ch.sfx_enabled ? (sc.sfx ?? "") : "" }));
    for (const k of ["sources", "description", "tags", "music_prompt"]) if (!s[k] || (Array.isArray(s[k]) && !s[k].length)) s[k] = original[k];
    s.director = { ...(out.review ?? {}), at: new Date().toISOString() };
    await finish(s);
    await log(job, `Director: guion ${out.review?.score_before ?? "?"} → ${out.review?.score_after ?? "?"}/10`);
    // Lo que ha tenido que corregir el director se convierte en aprendizaje para el guionista
    if ((out.review?.changes ?? []).length) await enqueue("learn", { channel_id: ch.id, video_id: v.id, payload: { source: "director", material: `El director corrigió el guion de «${s.title}» (${out.review?.score_before}→${out.review?.score_after}/10):\n- ${out.review.changes.join("\n- ")}` } });
  } catch (e) {
    // Si el director falla, el borrador sigue siendo válido
    await finish(original);
    await log(job, `El director no pudo revisar el guion (${(e as Error).message}). Queda el borrador.`, "warn");
  }
}

// ---------- Paso: análisis del vídeo montado ----------
const ANALYSIS_TOOL = {
  name: "guardar_analisis",
  description: "Guarda el análisis del vídeo.",
  input_schema: {
    type: "object",
    required: ["score", "viral_potential", "verdict", "scores", "strengths", "issues", "hook_options", "title_options", "thumbnail_texts", "script_feedback", "guide_rules"],
    properties: {
      score: { type: "number", description: "Nota global 0-10, exigente: 8+ solo si de verdad puede hacerse viral" },
      viral_potential: { type: "string", enum: ["bajo", "medio", "alto"] },
      verdict: { type: "string", description: "Diagnóstico en 1-2 frases: qué frena la viralidad" },
      scores: {
        type: "object",
        required: ["gancho", "ritmo", "estructura", "visuales", "subtitulos", "cierre", "empaquetado"],
        properties: Object.fromEntries(["gancho", "ritmo", "estructura", "visuales", "subtitulos", "cierre", "empaquetado"].map((k) => [k, { type: "number" }])),
      },
      strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
      issues: {
        type: "array", maxItems: 8,
        items: {
          type: "object", required: ["severity", "area", "problem", "fix"],
          properties: {
            t: { type: "number", description: "Segundo del vídeo donde ocurre, si aplica" },
            severity: { type: "string", enum: ["alta", "media", "baja"] },
            area: { type: "string", enum: ["gancho", "ritmo", "estructura", "visuales", "subtitulos", "cierre", "empaquetado", "rigor"] },
            problem: { type: "string", description: "Qué pasa, concreto, máximo 200 caracteres" },
            fix: { type: "string", description: "Cómo arreglarlo, concreto, máximo 200 caracteres" },
          },
        },
      },
      hook_options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3, description: "Primeras frases alternativas, listas para narrar" },
      title_options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
      thumbnail_texts: { type: "array", items: { type: "string" }, maxItems: 3 },
      script_feedback: { type: "string", description: "Instrucciones para reescribir el guion de este vídeo, en imperativo" },
      guide_rules: { type: "array", items: { type: "string" }, maxItems: 6, description: "Reglas generales para todos los vídeos del canal que se deducen de este análisis" },
    },
  },
};
async function stepAnalyze(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel; const short = ch.format === "short";
  if (!v.video_url) throw new UserError("No hay vídeo montado que analizar");
  // Un mismo montaje solo se analiza una vez
  if (v.analysis?.status === "done" && v.analysis?.video_url === v.video_url && !job.payload?.force) return;
  const base = key("RENDER_URL").replace(/\/+$/, "");
  const system = `Eres un analista de retención de YouTube que ha estudiado miles de vídeos virales. Das diagnósticos honestos y accionables, nunca complacientes. Escribe en español, frases cortas.`;
  // Ya encargado por lotes: no hace falta volver a sacar los fotogramas
  if (job.payload?.batches?.analysis_0) {
    const r0 = await claudeTool(MODEL_FAST, system, [], ANALYSIS_TOOL, 6000, { job, tag: "analysis" });
    return finishAnalysis(job, v, ch, r0, job.payload.an_meta ?? {});
  }
  await sb.from("videos").update({ analysis: { status: "running", started_at: new Date().toISOString() } }).eq("id", v.id);
  const fr = await fetch(`${base}/frames`, { method: "POST", headers: { Authorization: `Bearer ${key("RENDER_SECRET")}`, "Content-Type": "application/json" }, body: JSON.stringify({ video_url: v.video_url, max_frames: short ? 20 : 28, every: short ? 2.5 : 8, width: short ? 320 : 480 }) });
  if (!fr.ok) throw new Error(`Fotogramas ${fr.status}: ${(await fr.text()).slice(0, 200)}`);
  const F = await fr.json();
  // Línea de tiempo igual que el montaje: escena = voz + 0,6 s, fundido de 0,5 s
  const { data: scenes } = await sb.from("scenes").select("n,narration,audio_duration,words,shots,keywords").eq("video_id", v.id).order("n");
  let t = 0; const lines: string[] = [];
  for (const [i, sc] of (scenes ?? []).entries()) {
    const dur = Math.max(1.6, Number(sc.audio_duration ?? 3) + 0.6);
    // deno-lint-ignore no-explicit-any
    const shots: any[] = sc.shots?.length ? sc.shots : [{ line: sc.narration, visual_type: "?" }];
    // deno-lint-ignore no-explicit-any
    const words: any[] = sc.words ?? [];
    let wi = 0;
    for (const sh of shots) {
      const n = String(sh.line ?? "").split(/\s+/).filter(Boolean).length;
      const st = words[wi]?.s ?? 0; wi += n;
      lines.push(`[${(t + st).toFixed(1)}s] (${sh.visual_type ?? "?"}${sh.media_kind === "video" ? ", vídeo" : ""}) ${sh.line}`);
    }
    if (sc.keywords?.length) lines.push(`   palabras en amarillo: ${sc.keywords.join(", ")}`);
    t += dur - (i < (scenes ?? []).length - 1 ? 0.5 : 0);
  }
  // deno-lint-ignore no-explicit-any
  const content: any[] = [{ type: "text", text: `${ch.style_guide ? `GUÍA DEL CANAL:\n${String(ch.style_guide).slice(0, 6000)}\n\n` : ""}${VIRAL_RULES(short)}\n\nVídeo de ${ch.name} (${short ? "Short vertical" : "vídeo largo"}), duración ${F.duration} s.\nTítulo: ${v.title}\nTexto de miniatura previsto: ${v.script?.thumbnail_text ?? "-"}\n\nNARRACIÓN CON TIEMPOS Y TIPO DE PLANO:\n${lines.join("\n")}\n\nA continuación, ${F.frames.length} fotogramas del vídeo final (uno cada ${F.step} s), con los subtítulos tal y como se ven:` }];
  // deno-lint-ignore no-explicit-any
  for (const f of F.frames as any[]) {
    content.push({ type: "text", text: `t=${f.t}s` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.b64 } });
  }
  if (v.thumbnail_url && !short) content.push({ type: "text", text: "Miniatura elegida:" }, { type: "image", source: { type: "url", url: v.thumbnail_url } });
  content.push({ type: "text", text: "Analiza el vídeo como lo vería un espectador que hace scroll: ¿se queda en el segundo 1? ¿llega al final? ¿lo comparte? Sé exigente y concreto, con segundos. Comprueba también que la imagen no destripa lo que la voz aún no ha revelado, que los subtítulos no se corten ni tapen lo importante y que las fotos reales y recreaciones estén bien usadas. Llama a guardar_analisis." });
  job.payload = { ...(job.payload ?? {}), an_meta: { frames: F.frames.length, duration: F.duration } };
  const r = await claudeTool(MODEL_FAST, system, content, ANALYSIS_TOOL, 6000, { job, tag: "analysis" });
  return finishAnalysis(job, v, ch, r, job.payload.an_meta);
}
// deno-lint-ignore no-explicit-any
async function finishAnalysis(job: Job, v: any, ch: any, r: any, meta: { frames?: number; duration?: number }) {
  await bumpUsage(v.id, { ...usageOf(r), analyses: 1 }, { analysis: { ...r.input, status: "done", video_url: v.video_url, frames: meta.frames ?? null, duration: meta.duration ?? null, analyzed_at: new Date().toISOString() } });
  await log(job, `Análisis de «${v.title}»: ${r.input.score}/10, potencial ${r.input.viral_potential}`);
  // deno-lint-ignore no-explicit-any
  await enqueue("learn", { channel_id: ch.id, video_id: v.id, payload: { source: "analysis", material: `Análisis del vídeo montado «${v.title}» (${r.input.score}/10): ${r.input.verdict}\nProblemas:\n${(r.input.issues ?? []).map((i: any) => `- ${i.area}: ${i.problem} → ${i.fix}`).join("\n")}\nFunciona: ${(r.input.strengths ?? []).join("; ")}` } });
}

// ---------- Paso: miniaturas (3 fondos IA sin texto + texto compuesto en el servidor) ----------
async function composeThumb(v: Job, bgUrl: string, text: string, idx: string) {
  const path = `${v.id}/thumb_${idx}.jpg`;
  const { data: signed, error } = await sb.storage.from("media").createSignedUploadUrl(path, { upsert: true });
  if (error || !signed) throw new Error(`No se pudo preparar la subida: ${error?.message}`);
  const base = key("RENDER_URL").replace(/\/+$/, "");
  const r = await fetch(`${base}/thumbnail`, { method: "POST", headers: { Authorization: `Bearer ${key("RENDER_SECRET")}`, "Content-Type": "application/json" }, body: JSON.stringify({ image_url: bgUrl, text, upload_url: signed.signedUrl, side: "left" }) });
  if (!r.ok) throw new Error(`Miniatura ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
}
async function stepThumbs(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel;
  // deno-lint-ignore no-explicit-any
  let thumbs: any[] = [...(v.thumbnails ?? [])];
  const text = String(job.payload?.text ?? v.script?.thumbnail_text ?? "").trim();
  // Solo cambiar el texto: se recomponen los fondos existentes
  if (job.payload?.recompose) {
    for (const [i, th] of thumbs.entries()) thumbs[i] = { ...th, text, url: await composeThumb(v, th.bg_url, text, `${th.id}_${Date.now() % 100000}`) };
    const sel = thumbs.find((x) => x.selected) ?? thumbs[0];
    await sb.from("videos").update({ thumbnails: thumbs, thumbnail_url: sel?.url ?? null, script: { ...v.script, thumbnail_text: text } }).eq("id", v.id);
    return;
  }
  // deno-lint-ignore no-explicit-any
  const concepts: string[] = (v.script?.thumbnail_concepts ?? []).filter((x: any) => String(x ?? "").trim());
  if (!concepts.length) concepts.push(v.script?.thumbnail_prompt || v.title);
  const batch = Number(job.payload?.batch ?? 0);
  const done = thumbs.filter((x) => (x.batch ?? 0) === batch).length;
  if (done >= 2) return;
  const concept = batch === 0 ? concepts[done % concepts.length] : `${concepts[done % concepts.length]}. Fresh composition and camera angle, different from previous versions (variation ${batch}-${done})`;
  const prompt = `YouTube thumbnail background, 16:9. ${concept}. One clear subject with a strong emotional expression, placed in the right half; the left 45% is simple and uncluttered so large text can go there. Bold contrast, vivid but natural colors, sharp focus, dramatic lighting. Style: ${ch.style_prompt ?? "cinematic"}. Absolutely no text, letters, logos or watermarks.`;
  const bytes = await safeImage(prompt, false);
  if (!bytes) throw new UserError("OpenAI rechazó la imagen de la miniatura. Prueba «Otras 3».");
  const id = `${batch}_${done}`;
  const bg = await upload(`${v.id}/thumbbg_${id}.jpg`, bytes, "image/jpeg");
  const url = KEYS["RENDER_URL"] ? await composeThumb(v, bg, text, id) : bg;
  thumbs.push({ id, batch, concept, bg_url: bg, url, text, selected: false });
  if (!thumbs.some((x) => x.selected)) thumbs[0].selected = true;
  const sel = thumbs.find((x) => x.selected)!;
  await bumpUsage(v.id, { ai_images: 1 }, { thumbnails: thumbs, thumbnail_url: sel.url });
  if (done + 1 < 2) await enqueue("thumbs", { video_id: v.id, payload: { batch } });
  else await log(job, `Miniaturas listas para «${v.title}»`);
}

// ================= IA que aprende: banco de ideas, manual del canal y métricas =================
// deno-lint-ignore no-explicit-any
function playbookBlock(ch: any) {
  return ch.playbook ? `APRENDIZAJES DEL CANAL (lo que ya sabemos que funciona y lo que no; aplícalo siempre):\n${String(ch.playbook).slice(0, 4000)}\n\n` : "";
}

// ---------- Paso: generar ideas para el banco del canal (el corazón del canal) ----------
const IDEAS_TOOL = {
  name: "guardar_ideas",
  description: "Guarda las ideas finales, ya filtradas.",
  input_schema: {
    type: "object", required: ["ideas"],
    properties: {
      ideas: {
        type: "array", minItems: 5, maxItems: 22,
        items: {
          type: "object", required: ["kind", "title", "hook", "angle", "fit", "source_hint"],
          properties: {
            format: { type: "string", enum: ["short", "long"], description: "short = Short vertical de 45-60 s; long = vídeo largo horizontal" },
            kind: { type: "string", enum: ["single", "compilation"], description: "single = una historia; compilation = varias historias con un hilo común" },
            title: { type: "string", description: "Título final del vídeo, concreto y con curiosidad, menos de 60 caracteres" },
            hook: { type: "string", description: "La primera frase tal y como se narraría: el dato más sorprendente, sin contexto previo" },
            angle: { type: "string", description: "Qué lo hace increíble y por qué casi nadie lo conoce, 1-2 frases" },
            reason: { type: "string", description: "Por qué se compartiría, 1 frase" },
            stories: { type: "array", maxItems: 6, description: "Solo en recopilatorios: las historias, de menos a más impactante", items: { type: "object", required: ["title", "hook"], properties: { title: { type: "string" }, hook: { type: "string", description: "El dato sorprendente de esa historia, 1 frase" } } } },
            source_hint: { type: "string", description: "Título exacto del artículo de Wikipedia (en español si existe) que lo documenta" },
            fit: { type: "number", description: "0-10: cuánto encaja con la guía y los temas del canal. Sé honesto: menos de 8 si se sale del tema." },
          },
        },
      },
    },
  },
};
async function stepRefillIdeas(job: Job) {
  const { data: ch } = await sb.from("channels").select("*").eq("id", job.channel_id).single();
  if (!ch) throw new UserError("Canal no encontrado");
  const focus = clean(job.payload?.focus ?? "");
  const want = job.payload?.kind === "compilation" ? "compilation" : job.payload?.kind === "single" ? "single" : "mix";
  const { data: vids } = await sb.from("videos").select("idea_title,status").eq("channel_id", ch.id).order("created_at", { ascending: false }).limit(300);
  const { data: bank } = await sb.from("idea_bank").select("title,focus").eq("channel_id", ch.id).order("created_at", { ascending: false }).limit(300);
  const approved = (vids ?? []).filter((x) => !["idea_review", "idea_rejected"].includes(x.status)).map((x) => x.idea_title).slice(0, 20);
  const rejected = (vids ?? []).filter((x) => x.status === "idea_rejected").map((x) => x.idea_title).slice(0, 30);
  const used = [...new Set([...(vids ?? []).map((x) => x.idea_title), ...(bank ?? []).filter((b) => !String(b.focus ?? "").startsWith("retirada")).map((x) => x.title)])].filter(Boolean);
  const allowedF: string[] = (ch.formats?.length ? ch.formats : [ch.format]).filter((f: string) => ["short", "long"].includes(f));
  const wantF = ["short", "long"].includes(job.payload?.format) && allowedF.includes(job.payload.format) ? job.payload.format : allowedF.length === 1 ? allowedF[0] : "mix";
  const longMin = ch.format === "long" ? ch.target_minutes : (ch.long_minutes ?? 8);
  const fmtLine = wantF === "short" ? "Shorts verticales de 45-60 s (un recopilatorio en Short tiene 3 historias como máximo). Todas las ideas con format: short." : wantF === "long" ? `vídeos largos de ~${longMin} min (un recopilatorio largo tiene 4-6 historias). Todas las ideas con format: long.` : `el canal publica Shorts (45-60 s, recopilatorio de 3 historias como máximo) Y vídeos largos de ~${longMin} min (historias con más profundidad, o recopilatorios de 4-6 historias). Mezcla: unas 3 de cada 5 en Short y 2 de cada 5 en largo; indica el formato de cada idea.`;
  const system = `Eres el editor jefe de un canal de YouTube faceless y tu trabajo más importante es decidir qué historias se cuentan. Conoces a fondo la historia y eliges solo hechos REALES y documentados (nada de leyendas presentadas como hechos ni datos que no puedas respaldar con un artículo de Wikipedia). Cada idea tiene que encajar de lleno con la identidad y los temas del canal: si una historia es buena pero no es del canal, la descartas. Buscas lo poco conocido: nada de lo que sale en todos los documentales. Escribe en ${ch.language === "es" ? "español" : ch.language}.`;
  const user = `CANAL: ${ch.name}
Nicho: ${ch.niche}
TEMAS DEL CANAL (obligatorio, solo de aquí): ${ch.topics || ch.niche}
Formato: ${fmtLine}
${ch.style_guide ? `\nGUÍA DEL CANAL:\n${String(ch.style_guide).slice(0, 5000)}\n` : ""}${playbookBlock(ch)}${focus ? `\nENFOQUE PEDIDO AHORA POR EL AUTOR (todas las ideas deben ir de esto): ${focus}\n` : ""}
${approved.length ? `Ideas que el autor APROBÓ (busca más de este estilo, sin repetirlas):\n${approved.map((t) => `- ${t}`).join("\n")}\n` : ""}${rejected.length ? `\nIdeas que el autor RECHAZÓ (evita ese tipo de tema o enfoque):\n${rejected.map((t) => `- ${t}`).join("\n")}\n` : ""}
Ya usadas o en cola (no repetir ni parafrasear la misma historia):
${used.slice(0, 220).map((t) => `- ${t}`).join("\n") || "-"}

TAREA: piensa unas 30 candidatas y quédate solo con las 20 mejores, que cumplan TODO:
1. Encajan con los temas del canal (fit 8 o más).
2. Son hechos reales y documentados, con un artículo de Wikipedia que los respalde.
3. Se entienden en una frase y provocan "¿en serio pasó esto?".
4. El gancho (hook) es la frase con la que arrancaría el vídeo: el dato más fuerte primero.
${want === "compilation" ? "5. TODAS deben ser recopilatorios (kind: compilation): un hilo común potente (\"Los 3 animales que...\", \"4 errores que...\") y cada historia con su dato sorprendente." : want === "single" ? "5. Todas deben ser de una sola historia (kind: single)." : "5. Mezcla: unas 2 de cada 3 de una sola historia y 1 de cada 3 recopilatorios con un hilo común potente (\"Los 3 animales que...\", \"4 errores que...\")."}
Varía épocas, países y tipos de historia. Llama a guardar_ideas.`;
  const r = await claudeTool(MODEL_FAST, system, user, IDEAS_TOOL, 20000, { job, tag: "ideas" });
  // A veces el modelo entrega la lista como texto JSON en vez de como array
  // deno-lint-ignore no-explicit-any
  let ideas: any = r.input?.ideas ?? [];
  if (typeof ideas === "string") { try { ideas = parseJson(ideas); } catch (_) { ideas = []; } }
  if (!Array.isArray(ideas)) ideas = [];
  if (!ideas.length) throw new Error(`El generador no devolvió ideas (${r.stop}; claves: ${Object.keys(r.input ?? {}).join(",")})`);
  const seen = new Set(used.map((t) => String(t).toLowerCase()));
  const rows = ideas
    .filter((i) => i?.title && Number(i.fit ?? 0) >= 7.5 && !seen.has(String(i.title).toLowerCase()))
    // deno-lint-ignore no-explicit-any
    .map((i: any) => ({ ...i, format: wantF === "mix" ? (allowedF.includes(i.format) ? i.format : allowedF[0]) : wantF }))
    // deno-lint-ignore no-explicit-any
    .map((i: any) => ({
      channel_id: ch.id, format: i.format, title: clean(i.title), angle: clean(i.angle), reason: clean(i.reason), hook: clean(i.hook),
      kind: i.kind === "compilation" && Array.isArray(i.stories) && i.stories.length >= 2 ? "compilation" : "single",
      // deno-lint-ignore no-explicit-any
      stories: i.kind === "compilation" && Array.isArray(i.stories) ? i.stories.slice(0, i.format === "short" ? 3 : 6).map((x: any) => ({ title: clean(x.title), hook: clean(x.hook) })) : [],
      source_hint: clean(i.source_hint) || null, fit: Number(i.fit ?? 0), focus: focus || null,
    }));
  // deno-lint-ignore no-explicit-any
  let inserted: any[] = [];
  if (rows.length) { const { data } = await sb.from("idea_bank").insert(rows).select("id"); inserted = data ?? []; }
  await log(job, `Ideas nuevas para ${ch.name}: ${rows.length} de ${ideas.length} candidatas pasan el filtro de la guía${focus ? ` (enfoque: ${focus})` : ""}`);
  const n = Number(job.payload?.then_draw ?? 0);
  if (n > 0 && (focus || want !== "mix" || job.payload?.format)) {
    // Ideas pedidas con un enfoque: van directas a Revisar
    const ids = inserted.slice(0, n).map((x) => x.id);
    if (ids.length) {
      const { data: picked } = await sb.from("idea_bank").update({ used: true }).in("id", ids).select("*");
      if (picked?.length) await sb.from("videos").insert(picked.map((b) => ({ channel_id: b.channel_id, format: b.format, status: "idea_review", idea_title: b.title, idea_angle: b.angle, idea_reason: b.reason, idea_hook: b.hook, idea_kind: b.kind, idea_stories: b.stories, idea_evidence: b.source_hint ? [{ title: b.source_hint, url: `https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(b.source_hint)}` }] : [], usage: {} })));
    }
  } else if (n > 0) await sb.rpc("draw_ideas_internal", { p_channel: ch.id, p_n: n });
}

// ---------- Paso: aprender (actualiza el manual del canal con lo que ha pasado) ----------
async function stepLearn(job: Job) {
  const { data: ch } = await sb.from("channels").select("id,name,niche,format,playbook").eq("id", job.channel_id).single();
  if (!ch) return;
  const material = String(job.payload?.material ?? "").slice(0, 6000);
  if (!material.trim()) return;
  const system = `Mantienes el "manual aprendido" de un canal de YouTube: reglas cortas y concretas que el guionista aplica en cada vídeo para no repetir errores y repetir lo que funciona. Generalizas: conviertes cada corrección o dato en una regla aplicable a vídeos futuros, no en una nota sobre un vídeo concreto. Escribe en español.`;
  const user = `Canal: ${ch.name} (${ch.niche}, ${ch.format === "short" ? "Shorts" : "vídeos largos"})\n\nMANUAL ACTUAL:\n${ch.playbook || "(vacío)"}\n\nLO QUE ACABA DE PASAR (${job.payload?.source}):\n${material}\n\nActualiza el manual: añade lo nuevo, refuerza lo que se repite, corrige lo que contradiga datos reales (las métricas de YouTube mandan sobre las opiniones) y elimina lo redundante. Máximo 25 reglas en viñetas, agrupadas por: Gancho, Guion, Planos e imágenes, Subtítulos, Cierre, Títulos y temas. Llama a guardar.`;
  const r = await claudeTool(MODEL_CHEAP, system, user, { name: "guardar", description: "Guarda el manual actualizado", input_schema: { type: "object", required: ["playbook", "new_lessons"], properties: { playbook: { type: "string" }, new_lessons: { type: "array", items: { type: "string" }, maxItems: 3, description: "Lo nuevo aprendido ahora, 1 frase cada una" } } } }, 3000);
  const pb = String(r.input.playbook ?? "").trim();
  if (pb.length > 40) await sb.from("channels").update({ playbook: pb.slice(0, 6000), playbook_updated_at: new Date().toISOString() }).eq("id", ch.id);
  const ls = (r.input.new_lessons ?? []).map((l: string) => ({ channel_id: ch.id, video_id: job.video_id ?? null, source: String(job.payload?.source ?? "otro"), lesson: clean(l).slice(0, 300) })).filter((x: { lesson: string }) => x.lesson);
  if (ls.length) await sb.from("lessons").insert(ls);
  if (job.video_id) await bumpUsage(job.video_id, usageOf(r));
}

// ---------- Paso: métricas de YouTube (API gratuita) y aprendizaje semanal ----------
async function stepMetrics(job: Job) {
  if (!KEYS["YOUTUBE_API_KEY"]) return;
  const { data: vids } = await sb.from("videos").select("id,channel_id,youtube_video_id,title,published_at,stats,duration_sec,script").not("youtube_video_id", "is", null).in("status", ["published", "scheduled"]).order("created_at", { ascending: false }).limit(200);
  const list = vids ?? [];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const d = await yt("videos", { part: "statistics,snippet", id: chunk.map((x) => x.youtube_video_id).join(",") });
    // deno-lint-ignore no-explicit-any
    const by = new Map((d.items ?? []).map((it: any) => [it.id, it]));
    for (const v of chunk) {
      // deno-lint-ignore no-explicit-any
      const it: any = by.get(v.youtube_video_id); if (!it) continue;
      const st = { views: Number(it.statistics.viewCount ?? 0), likes: Number(it.statistics.likeCount ?? 0), comments: Number(it.statistics.commentCount ?? 0) };
      const hist = [...((v.stats?.history ?? []) as unknown[]), { d: new Date().toISOString().slice(0, 10), ...st }].slice(-60);
      const published = v.published_at ?? it.snippet?.publishedAt ?? null;
      await sb.from("videos").update({ stats: { ...st, history: hist }, stats_at: new Date().toISOString(), published_at: published }).eq("id", v.id);
      Object.assign(v, { stats: { ...st }, published_at: published });
    }
  }
  // Una vez por semana y canal, la IA aprende de qué vídeos funcionan mejor
  const byCh = new Map<string, typeof list>();
  for (const v of list) { if (!byCh.has(v.channel_id)) byCh.set(v.channel_id, []); byCh.get(v.channel_id)!.push(v); }
  for (const [chId, vs] of byCh) {
    const mature = vs.filter((v) => v.published_at && Date.now() - new Date(v.published_at).getTime() > 2 * 864e5);
    if (mature.length < 2) continue;
    const { data: last } = await sb.from("lessons").select("created_at").eq("channel_id", chId).eq("source", "metricas").order("created_at", { ascending: false }).limit(1);
    if (last?.[0] && Date.now() - new Date(last[0].created_at).getTime() < 7 * 864e5) continue;
    const rows = mature.map((v) => {
      const days = Math.max(1, (Date.now() - new Date(v.published_at!).getTime()) / 864e5);
      const first = v.script?.scenes?.[0]?.shots?.[0]?.line ?? v.script?.scenes?.[0]?.narration ?? "";
      return `- «${v.title}» | ${v.stats?.views ?? 0} visitas (${Math.round((v.stats?.views ?? 0) / days)}/día), ${v.stats?.likes ?? 0} likes, ${v.stats?.comments ?? 0} comentarios, ${v.duration_sec ?? "?"} s | gancho: «${String(first).slice(0, 140)}»`;
    }).join("\n");
    await enqueue("learn", { channel_id: chId, payload: { source: "metricas", material: `Rendimiento real en YouTube de los vídeos del canal (compara los mejores con los peores y deduce qué temas, ganchos, títulos y duraciones funcionan):\n${rows}` } });
  }
}

// ---------- Paso: revisar las imágenes de un vídeo ya montado (sin gastar tokens de Claude) ----------
// Quita las imágenes que no encajan (IA generada desde la frase suelta o foto de archivo que no corresponde) y las vuelve a buscar
async function stepFixVisuals(job: Job) {
  const v = await getVideo(job.video_id);
  const { data: scenes } = await sb.from("scenes").select("id,n,shots").eq("video_id", v.id).order("n");
  let bad = 0; const notes: string[] = [];
  for (const sc of scenes ?? []) {
    let changed = false;
    // deno-lint-ignore no-explicit-any
    const shots = (sc.shots ?? []).map((sh: any) => {
      const url = String(sh.media_url ?? "");
      if (!url || sh.visual_type === "reframe") return sh;
      const aiFile = /\/i_\d+_\d+(_\d+)?\.(png|jpg)/.test(url);
      const lineOnlyAi = aiFile && sh.visual_type !== "ai" && !sh.gen;
      // En las miniaturas de Commons el nombre real va en el penúltimo tramo de la ruta (el último es «3840px-thumbnail.jpg»)
      const parts = url.split("?")[0].split("/");
      const file = decodeURIComponent((/thumbnail\.\w+$/.test(parts[parts.length - 1]) ? parts[parts.length - 2] : parts[parts.length - 1]) ?? "").replace(/^\d+px-/, "");
      // Lo que se buscaba: la búsqueda de archivo o, si la foto vino de un plan B, el principio del prompt visual
      const want = sh.archive_query || sh.stock_query || String(sh.visual_prompt ?? "").split(/[,.]/)[0].split(/\s+/).slice(0, 6).join(" ");
      const wrongArchive = /wiki(media|pedia)\.org/.test(url) && (sh.credit || sh.archive_query) && want && matchScore(want, `${file} ${sh.credit?.title ?? ""}`) < 0.5;
      if (!lineOnlyAi && !wrongArchive) return sh;
      bad++; changed = true;
      if (notes.length < 6) notes.push(`«${String(sh.line).slice(0, 40)}» (${lineOnlyAi ? "imagen IA sin contexto" : "foto de archivo que no corresponde"})`);
      return { ...sh, media_url: null, media_kind: null, credit: null, gen: null, reframe: sh.visual_type === "reframe" ? sh.reframe : null };
    });
    // Los acercamientos que dependían de una imagen quitada se recalculan
    // deno-lint-ignore no-explicit-any
    for (let i = 0; i < shots.length; i++) if (shots[i].visual_type === "reframe" && i > 0 && !shots[i - 1].media_url) { shots[i] = { ...shots[i], media_url: null }; changed = true; }
    if (changed && !job.payload?.dry) await sb.from("scenes").update({ shots, media_url: null, media_kind: null }).eq("id", sc.id);
  }
  if (!bad) { await log(job, `Revisión de imágenes de «${v.title}»: todo encaja`); return; }
  await log(job, `Revisión de imágenes de «${v.title}»: ${bad} imágenes no encajaban y se rehacen. ${notes.join("; ")}`, "warn");
  if (job.payload?.dry) return;
  await sb.from("videos").update({ status: "producing", stage: "Volviendo a montar", progress: 45, error: null, analysis: null }).eq("id", v.id);
  await enqueue("visuals", { video_id: v.id });
}

// ---------- Proveedores baratos: Fish Audio (voz), transcripción de OpenAI (tiempos por palabra) y FLUX en fal.ai (imágenes) ----------
const FISH_MODEL = "s2-pro";
const FLUX_MODEL = "fal-ai/flux/schnell";
const plain = (t: unknown) => String(t ?? "").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
async function fishTts(text: string, voiceId: string | undefined, model = FISH_MODEL) {
  await reserve("fish_bytes", new TextEncoder().encode(text).length);
  const r = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${key("FISH_AUDIO_API_KEY")}`, "Content-Type": "application/json", model },
    body: JSON.stringify({ text, ...(voiceId ? { reference_id: voiceId } : {}), format: "mp3", mp3_bitrate: 128, normalize: true, latency: "normal" }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    if (r.status === 401 || r.status === 402 || /balance|credit|payment/i.test(t)) throw new UserError(`Fish Audio: sin crédito o clave no válida (${r.status}): ${t}`);
    throw new Error(`Fish Audio ${r.status}: ${t}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}
// Voces de la biblioteca de Fish en un idioma, de más a menos valoradas
async function fishVoices(lang: string, n: number) {
  const r = await fetch(`https://api.fish.audio/model?page_size=${n}&page_number=1&sort_by=score&language=${encodeURIComponent(lang)}`, { headers: { Authorization: `Bearer ${key("FISH_AUDIO_API_KEY")}` } });
  if (!r.ok) throw new Error(`Fish Audio voces ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  return (d.items ?? []).map((x: any) => ({ id: String(x._id ?? x.id), title: String(x.title ?? "") })).filter((x: { id: string }) => x.id && x.id !== "undefined");
}
const normW = (w: string) => String(w).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]/g, "");
// Los subtítulos muestran el texto del guion con los tiempos de la transcripción; las palabras que no casan (cifras, nombres) se reparten entre sus vecinas
function alignWords(text: string, ww: { word: string; start: number; end: number }[], dur: number) {
  const sw = text.split(/\s+/).filter(Boolean);
  const nw = ww.map((x) => normW(x.word));
  const out = sw.map((w) => ({ w, s: NaN, e: NaN }));
  let j = 0;
  sw.forEach((w, i) => {
    const n = normW(w); if (!n) return;
    for (let k = j; k < Math.min(j + 5, nw.length); k++) if (nw[k] === n) { out[i].s = Number(ww[k].start); out[i].e = Number(ww[k].end); j = k + 1; break; }
  });
  for (let i = 0; i < out.length; i++) {
    if (!isNaN(out[i].s)) continue;
    let k = i; while (k < out.length && isNaN(out[k].s)) k++;
    const a = i > 0 ? out[i - 1].e : 0; const b = k < out.length ? out[k].s : dur;
    const step = Math.max(0, b - a) / (k - i);
    for (let m = i; m < k; m++) { out[m].s = a + step * (m - i); out[m].e = a + step * (m - i + 1); }
    i = k - 1;
  }
  return out.map((x) => ({ w: x.w, s: Math.round(x.s * 1000) / 1000, e: Math.round(x.e * 1000) / 1000 }));
}
async function whisperWords(bytes: Uint8Array, text: string, lang: string) {
  const est = bytes.length / 16000; // mp3 a 128 kbps
  await reserve("stt_sec", Math.ceil(est));
  const fd = new FormData();
  fd.append("file", new Blob([bytes as unknown as BlobPart], { type: "audio/mpeg" }), "voice.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  if (lang) fd.append("language", String(lang).slice(0, 2));
  fd.append("prompt", text.slice(0, 800));
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key("OPENAI_API_KEY")}` }, body: fd });
  if (!r.ok) throw new Error(`transcripción ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = await r.json();
  const duration = Number(d.duration) || est;
  return { words: alignWords(text, d.words ?? [], duration), duration };
}
// FLUX: devuelve null si el filtro de contenido la marca (se busca alternativa, como con OpenAI)
async function fluxImage(prompt: string, short: boolean, model = FLUX_MODEL) {
  await reserve("flux_images", 1);
  const r = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key("FAL_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: short ? { width: 864, height: 1536 } : { width: 1536, height: 864 }, num_images: 1, output_format: "jpeg", enable_safety_checker: true }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    if (r.status === 401 || r.status === 403 || /balance|credit|locked/i.test(t)) throw new UserError(`fal.ai: sin crédito o clave no válida (${r.status}): ${t}`);
    throw new Error(`fal.ai ${r.status}: ${t}`);
  }
  const d = await r.json();
  if (d.has_nsfw_concepts?.[0]) return null;
  const url = d.images?.[0]?.url;
  if (!url) throw new Error("fal.ai no devolvió imagen");
  const img = await fetch(url);
  if (!img.ok) throw new Error(`fal.ai descarga ${img.status}`);
  return new Uint8Array(await img.arrayBuffer());
}

// ---------- Paso: prueba de proveedores (no toca el vídeo) ----------
// Genera la narración de un Short ya hecho con varias voces de Fish y sus imágenes IA con FLUX,
// y lo deja en media/tests/{video}/compare.json junto a la voz de ElevenLabs y las imágenes de GPT que ya tenía.
// payload: { gpt_quality?: "low" (GPT Image en esa calidad, mismos planos), shots?: [índices de planos IA], fish_voice?: un ID concreto, voices?: 3 (si no hay ID, las más valoradas en el idioma del canal), fish_model?, flux_model?, images?: 4, skip_voice?, skip_images? }
async function stepCompare(job: Job) {
  const v = await getVideo(job.video_id);
  const ch = v.channel; const short = ch.format === "short";
  const p = job.payload ?? {};
  const dir = `tests/${v.id}`;
  const { data: scenes } = await sb.from("scenes").select("n,narration,audio_url,audio_duration,shots").eq("video_id", v.id).order("n");
  if (!scenes?.length) throw new UserError("El vídeo no tiene escenas");
  // Lo ya generado se guarda en el payload: si el trabajo se corta, no se paga dos veces
  // deno-lint-ignore no-explicit-any
  const out: any = p.out ?? { video_id: v.id, title: v.title, format: ch.format, created: new Date().toISOString(), notes: [] };
  const save = async () => { job.payload = { ...p, out }; await sb.from("jobs").update({ payload: job.payload }).eq("id", job.id); };
  if (!p.skip_voice && KEYS["FISH_AUDIO_API_KEY"] && !out.voice?.done) {
    const text = scenes.map((s) => plain(s.narration)).join(" ");
    const model = p.fish_model || FISH_MODEL;
    out.voice = out.voice ?? { text, chars: text.length, bytes_text: new TextEncoder().encode(text).length, model, eleven: scenes.map((s) => ({ n: s.n, url: s.audio_url, duration: s.audio_duration })), fish: [] };
    let voices: { id: string; title: string }[] = p.fish_voice ? [{ id: String(p.fish_voice), title: "elegida" }] : [];
    if (!voices.length) { try { voices = await fishVoices(String(ch.language || "es"), Number(p.voices ?? 3)); } catch (e) { out.notes.push(`No se pudo listar voces: ${(e as Error).message}`); } }
    if (!voices.length) voices = [{ id: "", title: "por defecto" }];
    for (const vo of voices) {
      if (out.voice.fish.some((x: { id: string }) => x.id === vo.id)) continue;
      const t0 = Date.now();
      const bytes = await fishTts(text, vo.id || undefined, model);
      // deno-lint-ignore no-explicit-any
      const item: any = { id: vo.id, title: vo.title, url: await upload(`${dir}/fish_${vo.id || "default"}.mp3`, bytes, "audio/mpeg"), seconds_to_generate: Math.round((Date.now() - t0) / 100) / 10, audio_seconds: Math.round(bytes.length / 1600) / 10 };
      // Con la primera voz se prueba también el cálculo de tiempos de los subtítulos
      if (!out.voice.fish.length && KEYS["OPENAI_API_KEY"]) {
        try { const w = await whisperWords(bytes, text, ch.language); item.words_sample = w.words.slice(0, 25); item.duration = w.duration; } catch (e) { out.notes.push(`Tiempos por palabra: ${(e as Error).message || (e as Error).constructor.name}`); }
      }
      out.voice.fish.push(item);
      await save();
    }
    out.voice.done = true;
  } else if (!p.skip_voice && !KEYS["FISH_AUDIO_API_KEY"]) out.notes.push("Falta FISH_AUDIO_API_KEY: no se ha probado la voz");
  if (!p.skip_images && KEYS["FAL_KEY"] && !out.images?.done) {
    const model = p.flux_model || FLUX_MODEL;
    // deno-lint-ignore no-explicit-any
    const shots = scenes.flatMap((s) => (s.shots ?? []).filter((x: any) => x.gen === "ai" && x.media_url)).slice(0, Number(p.images ?? 4));
    out.images = out.images ?? { model, items: [] };
    for (const sh of shots.slice(out.images.items.length)) {
      const prompt = ctxPrompt(sh, v, ch);
      const bytes = await fluxImage(prompt, short, model);
      out.images.items.push({ line: sh.line, prompt, gpt: sh.media_url, flux: bytes ? await upload(`${dir}/flux_${out.images.items.length}.jpg`, bytes, "image/jpeg") : null });
      await save();
    }
    out.images.done = true;
  } else if (!p.skip_images && !KEYS["FAL_KEY"]) out.notes.push("Falta FAL_KEY: no se han probado las imágenes");
  if (p.gpt_quality && !out.gpt?.done) {
    // deno-lint-ignore no-explicit-any
    const all = scenes.flatMap((s) => (s.shots ?? []).filter((x: any) => x.gen === "ai" && x.media_url));
    // deno-lint-ignore no-explicit-any
    const pick: any[] = Array.isArray(p.shots) ? p.shots.map((i: number) => all[i]).filter(Boolean) : all.slice(0, Number(p.images ?? 4));
    out.gpt = out.gpt ?? { quality: p.gpt_quality, items: [] };
    for (const sh of pick.slice(out.gpt.items.length)) {
      const prompt = ctxPrompt(sh, v, ch);
      const bytes = await aiImage(prompt, short, String(p.gpt_quality));
      out.gpt.items.push({ line: sh.line, prompt, medium: sh.media_url, [String(p.gpt_quality)]: await upload(`${dir}/gpt_${p.gpt_quality}_${out.gpt.items.length}.jpg`, bytes, "image/jpeg") });
      await save();
    }
    out.gpt.done = true;
  }
  await upload(`${dir}/compare.json`, new TextEncoder().encode(JSON.stringify(out, null, 2)), "application/json");
  await log(job, `Prueba de proveedores lista: ${out.voice?.fish?.length ?? 0} voces de Fish y ${out.images?.items?.length ?? 0} imágenes FLUX en media/${dir}/compare.json`);
}
