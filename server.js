// Servidor de render de Faceless Studio.
// POST /jobs        (Bearer RENDER_SECRET) → encola un render; body = spec + upload_url
// GET  /jobs/:id    (Bearer RENDER_SECRET) → estado y progreso
// POST /frames      (Bearer) → fotogramas del vídeo en base64 para analizarlo
// POST /thumbnail   (Bearer) → compone una miniatura JPG y la sube
// GET  /health      → ok (con la versión, para comprobar que el despliegue está al día)
// spec.kind = "retos" → Motor B (retos con gráficos 2D); si no, montaje documental
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createReadStream } from "node:fs";
import { render, cleanup } from "./render.js";
import { frames, thumbnail } from "./tools.js";

const PORT = Number(process.env.PORT || 8080);
const VERSION = "2026-10-29-idiomas-1";
const SECRET = process.env.RENDER_SECRET || "";
const jobs = new Map(); // id -> {status, progress, stage, error, duration, size, created}
const queue = [];
let busy = false;

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
function authed(req) {
  return SECRET.length >= 16 && req.headers.authorization === `Bearer ${SECRET}`;
}
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function upload(file, size, url) {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "x-upsert": "true" },
    body: createReadStream(file),
    duplex: "half",
  });
  if (!r.ok) throw new Error(`Subida fallida (${r.status}): ${(await r.text()).slice(0, 300)}`);
}

async function work() {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  const { id, spec } = next;
  const j = jobs.get(id);
  const dir = path.join(os.tmpdir(), `render-${id}`);
  try {
    j.status = "running";
    const cb = (p, stage) => { j.progress = p; j.stage = stage; };
    // El motor de retos se carga solo cuando hace falta: si fallara, el documental sigue funcionando
    const out = spec.kind === "retos" ? await (await import("./render-retos.js")).renderRetos(spec, dir, cb) : await render(spec, dir, cb);
    j.stage = "Subiendo vídeo"; j.progress = 97;
    await upload(out.file, out.size, spec.upload_url);
    Object.assign(j, { status: "succeeded", progress: 100, stage: null, duration: out.duration, size: out.size, ...(out.report ? { report: out.report } : {}) });
  } catch (e) {
    console.error(id, e);
    Object.assign(j, { status: "failed", error: String(e.message || e).slice(0, 1500) });
  } finally {
    await cleanup(dir).catch(() => {});
    busy = false;
    setImmediate(work);
  }
}

// Olvida trabajos antiguos
setInterval(() => {
  const cut = Date.now() - 24 * 3600e3;
  for (const [id, j] of jobs) if (j.created < cut) jobs.delete(id);
}, 3600e3);

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") return send(res, 200, { ok: true, busy, queued: queue.length, version: VERSION });
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });
    if (req.method === "POST" && url.pathname === "/jobs") {
      const spec = await readJson(req);
      if (!spec.id || !spec.upload_url || (spec.kind === "retos" ? !spec.project?.challenges?.length : !Array.isArray(spec.scenes))) return send(res, 400, { error: "spec incompleta" });
      if (jobs.get(spec.id)?.status === "running") return send(res, 409, { error: "ya en curso" });
      jobs.set(spec.id, { status: "queued", progress: 0, stage: "En cola de render", created: Date.now() });
      queue.push({ id: spec.id, spec });
      setImmediate(work);
      return send(res, 202, { id: spec.id, queued: queue.length });
    }
    if (req.method === "POST" && (url.pathname === "/frames" || url.pathname === "/thumbnail")) {
      const body = await readJson(req);
      const dir = path.join(os.tmpdir(), `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      try {
        if (url.pathname === "/frames") {
          if (!body.video_url) return send(res, 400, { error: "falta video_url" });
          return send(res, 200, await frames(body, dir));
        }
        if (!body.image_url || !body.upload_url) return send(res, 400, { error: "faltan image_url o upload_url" });
        const { file, ...r } = await thumbnail(body, dir);
        return send(res, 200, r);
      } finally { cleanup(dir).catch(() => {}); }
    }
    const m = url.pathname.match(/^\/jobs\/([\w-]+)$/);
    if (req.method === "GET" && m) {
      const j = jobs.get(m[1]);
      return j ? send(res, 200, j) : send(res, 404, { error: "desconocido" });
    }
    send(res, 404, { error: "no encontrado" });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`render listo en :${PORT}`));
