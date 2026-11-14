# Estudio: guiones y montajes escritos por Claude

Las sesiones diarias de Claude (tareas programadas) escriben aquí los guiones de **Frente insólito**, **5 curiosidades** y
**Billion Dollar Stories**, en lugar de pagarlos a la API. Producen, verifican y dejan los vídeos en la web
(Faceless Studio), que los sube sola a YouTube en su hueco del calendario.

- Proyecto de Supabase: `embjkwggqooawqnzkoam` (herramienta `execute_sql` del conector de Supabase).
- Nunca pegues claves en el chat ni en el repositorio (es público). Lo que necesita clave (voz propia de Modal, imágenes
  FLUX, permiso de subida) se pide al worker con trabajos `studio` (sección 4).
- Presupuesto: los gastos del worker respetan el tope diario. Si un trabajo queda `queued` con `run_after` en el futuro, es
  que el tramo de presupuesto está agotado: espera o déjalo para la siguiente sesión, no lo fuerces.

| Canal | id | Qué produce cada día | Horas (Madrid) |
| --- | --- | --- | --- |
| Frente insólito (es) | `9aa16a1f-0a4d-42dd-9c8e-cac2090deb1e` | 2 Shorts | 12:30 y 18:30 |
| 5 curiosidades (es) | `b1fcab59-d0c6-4afc-8335-d00753b38cca` | 2 Shorts | 12:30 y 18:30 |
| Billion Dollar Stories (en, EE. UU.) | `fee9f75e-fd80-47c4-a3e3-70c396d0a104` | 1 largo + 2 Shorts | largo 20:00 · Shorts 16:00 y 01:00 |

El calendario lo pone la web (planificador): tú solo dejas los vídeos hechos. Produce **para el día siguiente**.

---

## 1. Reglas editoriales comunes

1. **Nada inventado.** Cada cifra, fecha y declaración sale de una fuente que has ABIERTO (no de un resultado de búsqueda).
   Distingue lo confirmado (documento oficial, dato de mercado, la propia persona) de lo atribuido a medios
   («according to reports»). Si no puedes comprobar algo, quítalo o reformúlalo.
2. **No nombres a particulares** envueltos en escándalos que no sean figuras públicas, ni presentes sospechas como hechos.
3. **Gancho en la primera frase**: una escena concreta con contradicción o una cifra imposible. Nunca «Hoy vamos a hablar de…».
4. **Sin relleno**: cada vídeo dura lo que necesita la historia.
5. **No repitas**: antes de elegir tema, mira los títulos de los últimos 60 vídeos del canal (consulta en la sección 2).

## 2. Frente insólito y 5 curiosidades (Shorts en español)

La web ya hace voz (ElevenLabs), imágenes, montaje, revisión y publicación. Tú escribes el guion y lo metes en la cola.

**Paso 1 — ¿Hace falta?** Si el canal ya tiene 2 o más Shorts hechos o en producción para mañana, no hagas nada:
```sql
select count(*) from videos where channel_id = '<id>' and format = 'short'
  and (status in ('scripting','script_review','producing','final_review')
       or (status in ('publishing','scheduled') and publish_at > now() and publish_at < now() + interval '36 hours'));
```
**Paso 2 — Contexto del canal** (guía de estilo, aprendizajes y qué ha funcionado):
```sql
select name, niche, tone, audience, style_guide, playbook, style_prompt, idea_format, packaging from channels where id = '<id>';
select title, stats->>'views' as views, stats->'analytics'->>'avg_pct' as pct, script->'scenes'->0->'shots'->0->>'line' as hook
  from videos where channel_id = '<id>' and youtube_video_id is not null order by published_at desc limit 60;
select id, idea_title, idea_angle, idea_hook from videos where channel_id = '<id>' and status = 'idea_review' order by created_at desc limit 30;
```
Puedes usar una idea del banco (`idea_review`) o una tuya. Frente: historias reales e insólitas de guerra; el gancho es
SIEMPRE una escena concreta con contradicción, nunca una pregunta hipotética. 5 curiosidades: formato «pregunta-hilo»
(el título es la pregunta; la 5.ª curiosidad la resuelve). Respeta la `style_guide` del canal: manda sobre esto.

**Paso 3 — Investiga** con WebSearch/WebFetch (Wikipedia y fuentes serias). Guarda las URL que abras.

**Paso 4 — Escribe el guion** (≤ 120 palabras de narración, 4-7 escenas, planos de 4-9 palabras). JSON:
```json
{"title":"<55 caracteres, sin emojis","description":"3 párrafos cortos + 'Fuentes:' con enlaces","tags":["..."],
 "sources":[{"title":"","url":""}],"music_prompt":"",
 "scenes":[{"n":1,"sfx":"","keywords":["1-3 palabras clave"],"narration":"<las line unidas con espacios>",
   "shots":[{"line":"fragmento literal de la narración","visual_type":"ai|archive|stock_photo|stock_video|reframe",
             "visual_prompt":"(ai) inglés, ≤25 palabras, sujeto y posición","archive_query":"(archive) 2-5 palabras inglés",
             "stock_query":"(stock) 2-4 palabras inglés","reframe":null}]}]}
```
El primer plano es `ai` con el visual más impactante. Máximo 6 planos `ai`. `reframe` = `{"x":0.5,"y":0.4,"zoom":1.5}`.
`narration` de cada escena = sus `line` unidas, palabra por palabra.

**Paso 5 — Mételo en la cola** (el disparador de la base de datos arranca la producción al pasar a `producing`):
```sql
with v as (
  insert into videos (channel_id, status, format, engine, idea_title, title, description, tags, sources, script, auto, stage)
  values ('<id>', 'idea_review', 'short', 'documentary', '<título>', '<título>', '<descripción>', array['tag1','tag2'],
          '<sources json>'::jsonb, '<guion json>'::jsonb,
          jsonb_build_object('by','claude-studio','preapproved',true,'script',jsonb_build_object('by','claude-studio','at',now())),
          'Guion de Claude') returning id)
update videos set status = 'producing', progress = 0, stage = 'En cola' from v where videos.id = v.id returning videos.id;
```
`preapproved` hace que, cuando el vídeo esté montado y revisado, la web lo programe sola en su hueco.
Comprueba al final con `select status, stage, error from videos where id = '<id>'` que ha empezado (stage cambia).

## 3. Billion Dollar Stories (largo + 2 Shorts en inglés)

Identidad fija: la del piloto de Nvidia (dibujos caricaturescos FLUX, navy/amarillo/verde/rojo, tipografía Anton, cajas de
texto, mascota «Dummy» dibujada por código). **No la cambies.** Lema: *We make money make sense.*
Pilares: 70 % historias reales de dinero (empresas, fortunas, fraudes, crisis, Wall Street) y 30 % «Money Explained»
(inflación, acciones, intereses, deuda… con una historia o ejemplo cotidiano). Actualidad cuando la haya.
Estructura: gancho (5-10 s) → contexto mínimo → conflicto que escala → giro/revelación → conclusión memorable (no un
resumen). Explica cada concepto con un ejemplo sencillo (como la pizza = acciones). Humor que nace de la historia.
Inglés estadounidense sencillo. Personajes que reaccionan y se mueven solo cuando aporta. La mascota aparece en
explicaciones, veredicto y despedida, no en todas las escenas. Texto en pantalla: ≤ 4 palabras, cifras grandes.
Cierre: «This is Billion Dollar Stories. We make money make sense.» + avance del siguiente tema si lo sabes.
Ejemplo completo y verificado: `studio/bds/examples/nvidia/` (guion y cronología) y `examples/nvidia-v4/episode.json`
(montaje intermedio). **La referencia de calidad es `examples/nvidia-v5/episode.json` (V5 aprobada por Giol): todos los episodios deben salir así.** Reglas aprendidas:
- Un mensaje por plano: como mucho un cartel grande y una nota pequeña a la vez (usa `out` para que el anterior se vaya).
- Cada salto de tiempo se justifica en pantalla (rebobinado con contador de años, tira de calendario para una semana).
- Un solo gráfico de bolsa por vídeo; el resto se cuenta con personajes, contadores o la metáfora.
- Los personajes reaccionan en el momento clave (`react`) en vez de moverse sin motivo.
- Música según la emoción: suspense en el conflicto, alegre/cálida en orígenes y explicación, y silencios antes del golpe y en el giro.
- Un único final que RESUELVE el misterio del gancho («Where did it go? Nowhere. It was never cash.») + la idea memorable + despedida breve: «If that made money make a little more sense, hit subscribe. We make money make sense.»
- El conflicto se ve desde el primer fotograma (nada de planos vacíos al empezar ni mientras arranca la voz).
- Ningún fondo ni personaje más de 2 planos seguidos.
- Cada concepto financiero se explica con 🍕 PIZZA MATH u otro ejemplo cotidiano, con el sello en pantalla.

**TODO REAL (innegociable).** No se publica nada que no esté verificado en una fuente abierta en esa sesión. Tabla de
hechos obligatoria (confirmado / atribuido a medios / cálculo propio) guardada en `script.facts` del vídeo. Si un dato no
se puede comprobar, se quita. Nunca cifras inventadas, citas inventadas, nombres de particulares ni sospechas presentadas
como hechos. Las cifras de bolsa son valor de mercado: dilo así y explica la diferencia con el dinero en efectivo.

**Miniatura (cada largo) — estilo «impacto»** (referencia del dueño del canal): fondo oscuro con brillo de color,
protagonista GRANDE con luz de contorno, número enorme en 3D con grietas sobre una banda rasgada (roja; azul si es
«congelado», verde si es una subida), subtítulo en brochazo amarillo con subrayado rojo, flecha roja de caída si hay
pérdida y un segundo personaje asustado en la esquina. Nada de texto tapado por personajes. Con los dibujos del canal:
sin fotos realistas de personas reales ni logos de marcas. Hazlas con `tools/thumb.py` (ejemplo:
`work/thumbs/build2.py`): 2 versiones, captura 1920x1080 → JPG 1280x720 (< 2 MB). Súbelas con `upload_url` y pon la
mejor en `thumbnail_url` y ambas en `thumbnails` (`[{"id":"A","url":…,"selected":true},{"id":"B","url":…,"selected":false}]`).

**0. Preparación** (cada sesión es un ordenador nuevo):
```bash
cd studio/bds && pip install -q scipy faster-whisper numpy pillow && python3 tools/fetch_assets.py
```
**1. Tema.** Busca la noticia de dinero del día (o un clásico del pilar 70/30). Mira que no se haya hecho ya:
`select title from videos where channel_id = 'fee9f75e-fd80-47c4-a3e3-70c396d0a104' order by created_at desc limit 60;`
**2. Verifica** en fuentes primarias y escribe una tabla de hechos: confirmado / atribuido. Si algo no se puede comprobar,
no va.
**3. Guion** del largo (lo que pida la historia, normalmente 4-8 min) dividido en escenas, más 3 títulos y 2 miniaturas;
elige el mejor título. Y 2 Shorts **con narración propia** (20-60 s, gancho inmediato, no recortes del largo).
**4. Voz** (Modal, gratis dentro de los créditos): un trabajo por escena. `exaggeration` 0.45 = cálida/explicación, 0.55-0.6 = momentos de tensión o giro. Escribe nombres difíciles de forma fonética
(«En-vidia» si Whisper oye mal «Nvidia»; «A-I» en vez de «A.I.»).
```sql
insert into jobs(step, payload) values ('studio', jsonb_build_object('op','tts','language','en',
  'ref_url','https://archive.org/download/treasure_island_1307_librivox/treasureisland_02_stevenson_64kb.mp3','ref_start',60,
  'exaggeration',0.5,'text','<texto de la escena>','path','studio/bds/<fecha-slug>/v_01.mp3')) returning id;
select status, error, payload->'result' from jobs where id = <id>;   -- result.url cuando status = done
```
Descarga cada `result.url` a `work/<fecha-slug>/v_01.mp3` y saca los tiempos: `python3 tools/words.py work/<fecha-slug>`.
Lee lo que ha oído Whisper: si sobra una palabra o un nombre suena mal, vuelve a pedir esa escena.
**5. Imágenes nuevas** (≈0,004 € cada una) solo para lo que no haya en `assets.json`:
```sql
insert into jobs(step, payload) values ('studio', jsonb_build_object('op','images',
  'style','bold modern cartoon caricature for a premium YouTube explainer: big expressive heads on small bodies, thick clean black outlines, smooth cel shading, limited palette of deep midnight navy, hazard yellow, money green and alarm red, high detail',
  'prompts', jsonb_build_array('Wide empty background: ... no people', 'Full body cartoon ... isolated on a flat solid pure bright green chroma key background, no shadow, no floor'),
  'paths', jsonb_build_array('studio/bds/<fecha-slug>/bg_x.png','studio/bds/<fecha-slug>/raw_y.png'))) returning id;
```
Personajes: pídelos sobre verde y recórtalos con `python3 tools/key.py raw_y.png cut_y.png`. Mira cada imagen (Read)
antes de usarla: sin texto raro, sin flechas que contradigan la historia, personas completas. Personajes reales =
caricatura genérica reconocible por el contexto, nunca un retrato fotográfico.
Si una imagen nueva es reutilizable, súbela a `studio/lib/` y añádela a `assets.json` (commit al repo).
**6. Montaje**: escribe `work/<fecha-slug>/episode.json` (formato en la cabecera de `engine.py`; mira el ejemplo de Nvidia) y:
```bash
python3 engine.py work/<slug>/episode.json
node tools/rec.cjs work/<slug> 30 8          # capturas cada 8 s en work/<slug>/prev/: míralas y corrige
node tools/rec.cjs work/<slug>               # vídeo (≈ 20 min para 4 min de vídeo)
python3 tools/mix.py work/<slug> work/<slug>/final.mp4
```
Shorts: igual, con `"orientation":"portrait"` (1080x1920), su propio `episode.json` en otra carpeta. En vertical el fondo
16:9 se recorre en panorámica: `"kb":[1.0,1.05,dx,x0]` (x0 = desplazamiento inicial en px, dx = recorrido).
Miniatura: HTML 1920x1080 con los dibujos del canal y 1-2 palabras grandes (ejemplo en `examples/nvidia/thumbs.html`),
captura con Playwright y guárdala en JPG 1280x720.
**7. Revisión antes de subir**: mira capturas de todo el vídeo, comprueba que cada texto en pantalla coincide con lo que
dice la voz y con la tabla de hechos.
**8. Subir a la web** (máximo 50 MB por archivo; `mix.py` ya comprime hasta que quepa) — pide una URL de subida por archivo y súbelo con curl:
```sql
insert into jobs(step, payload) values ('studio', jsonb_build_object('op','upload_url','path','studio/bds/<slug>/final.mp4')) returning id;
```
```bash
curl -sf -X PUT -H "Content-Type: video/mp4" --data-binary @work/<slug>/final.mp4 "<result.upload_url>"
```
Y crea los vídeos ya terminados (la web no los vuelve a montar; los programa y los sube a YouTube):
```sql
insert into videos (channel_id, status, format, engine, idea_title, title, description, tags, sources, video_url,
                    thumbnail_url, duration_sec, script, auto, analysis, stage, progress)
values ('fee9f75e-fd80-47c4-a3e3-70c396d0a104', 'final_review', 'long', 'studio', '<título>', '<título>', '<descripción con Fuentes:>', array['...'],
        '<sources json>'::jsonb, '<public_url del mp4>', '<public_url de la miniatura>', <segundos>,
        jsonb_build_object('narration', '<guion completo>', 'facts', '<tabla de hechos json>'::jsonb),
        jsonb_build_object('by','claude-studio','preapproved',true),
        jsonb_build_object('status','done','video_url','<public_url del mp4>','score',8,'by','claude-studio','issues','[]'::jsonb),
        'Hecho por Claude', 100);
```
(los Shorts igual con `format = 'short'` y sin miniatura). Si `youtube_connected` es false, quedan esperando a que se
conecte el canal; no es un error.

## 4. Trabajos `studio` del worker

| op | payload | result |
| --- | --- | --- |
| `tts` | `text`, `language`, `ref_url`, `ref_start`, `path` | `url`, `duration` |
| `images` | `prompts[]`, `paths[]`, `style`, `vertical` | `urls[]` (null si falló) |
| `upload_url` | `path` | `upload_url` (PUT, válida 2 h), `public_url` |

Rutas siempre bajo `studio/`. El worker los coge en menos de un minuto; la primera voz del día tarda ~1-2 min (arranca la
tarjeta gráfica de Modal). Consulta con `select status, error, payload->'result' from jobs where id = …`.

## 5. Al terminar

Deja un resumen en el registro de actividad para que se vea en la web:
```sql
insert into activity (channel_id, message, level) values ('<id>', 'Estudio: <qué has hecho hoy, títulos, incidencias>', 'info');
```
