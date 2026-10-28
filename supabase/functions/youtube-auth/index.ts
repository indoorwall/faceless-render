// Conexión OAuth de un canal de YouTube. POST (con JWT de miembro) devuelve la URL de Google; GET es el callback.
// Permisos: subir vídeos, leer el canal y leer sus analíticas (retención, tráfico…).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const REDIRECT = `${SB_URL}/functions/v1/youtube-auth`;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const page = (msg: string) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0c;color:#f2f2f2"><div style="text-align:center"><h2>${esc(msg)}</h2><p style="opacity:.6">Ya puedes cerrar esta pestaña.</p></div><script>try{window.opener&&window.opener.postMessage('yt-connected','*')}catch(e){}</script>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

async function hmac(data: string) {
  const { data: cfg } = await sb.from("app_config").select("value").eq("key", "cron_secret").single();
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(cfg!.value), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
async function keys() {
  const { data } = await sb.rpc("get_api_keys");
  return (data ?? {}) as Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const K = await keys();
  if (req.method === "POST") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await sb.auth.getUser(token);
    if (!data?.user) return json({ error: "unauthorized" }, 401);
    const { data: m } = await sb.from("members").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (!m) return json({ error: "unauthorized" }, 401);
    if (!K.GOOGLE_CLIENT_ID || !K.GOOGLE_CLIENT_SECRET) return json({ error: "Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Ajustes." }, 400);
    const { channel_id } = await req.json();
    const state = `${channel_id}.${await hmac(channel_id)}`;
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({ client_id: K.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: SCOPES, state }).toString();
    return json({ url: u.toString() });
  }
  // Callback de Google
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.get("error")) return page("Conexión cancelada");
  const [channelId, sig] = state.split(".");
  if (!code || !channelId || sig !== (await hmac(channelId))) return page("Enlace no válido");
  const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: K.GOOGLE_CLIENT_ID, client_secret: K.GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }) });
  const tk = await t.json();
  if (!t.ok || !tk.refresh_token) return page(`No se pudo conectar (${tk.error ?? t.status})`);
  // Sin el permiso de analíticas el canal se conecta igual, pero se avisa
  const granted = String(tk.scope ?? "");
  const me = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${tk.access_token}` } }).then((r) => r.json());
  const yc = me.items?.[0];
  await sb.from("youtube_tokens").upsert({ channel_id: channelId, refresh_token: tk.refresh_token, youtube_channel_title: yc?.snippet?.title ?? null, updated_at: new Date().toISOString() });
  await sb.from("channels").update({ youtube_connected: true, youtube_channel_id: yc?.id ?? null }).eq("id", channelId);
  const noAnalytics = !granted.includes("yt-analytics");
  await sb.from("activity").insert({ channel_id: channelId, message: `YouTube conectado: ${yc?.snippet?.title ?? "canal"}${noAnalytics ? " (sin permiso de analíticas: vuelve a conectar y marca todas las casillas)" : ""}`, level: noAnalytics ? "warn" : "info" });
  // Primeras analíticas en cuanto se conecta
  await sb.from("jobs").insert({ step: "analytics", channel_id: channelId, payload: {} });
  return page(`Conectado a ${yc?.snippet?.title ?? "YouTube"}`);
});
