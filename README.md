# faceless-render

Servidor de montaje con FFmpeg para Faceless Studio. Recibe la especificación de un vídeo (escenas, voz, efectos, música), lo monta en 1080p con subtítulos palabra a palabra, ducking de música y audio normalizado a -14 LUFS, y lo sube a Supabase Storage.

- `POST /jobs` — encola un render (cabecera `Authorization: Bearer $RENDER_SECRET`)
- `GET /jobs/:id` — estado y progreso
- `GET /health`

Variables de entorno: `RENDER_SECRET` (obligatoria, mínimo 16 caracteres), `PORT` (la pone Railway).
