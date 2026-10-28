# Faceless Studio — traspaso a Claude Code (28/10/2026)

Sistema automático de canales de YouTube faceless: ideas → guion → voz → música/efectos → imágenes → montaje → revisión → publicación. Hablar con el usuario (Giol) en español, tuteando, conciso. Prioridad: **máxima calidad con mínimo coste**; el tiempo de producción da igual.

## Piezas

| Pieza | Dónde | Cómo se despliega |
|---|---|---|
| Web (una sola página, `web/index.html`) | Vercel, desde este repo | Push a `main` |
| Motor (`supabase/functions/worker/index.ts`, Deno) | Supabase Edge Function `worker`, proyecto `embjkwggqooawqnzkoam` (org "Heartbeat", plan Pro) | Desde la v31, la función publicada es un archivo de una línea que importa `index.ts` de GitHub (el repo es público), fijado a un commit. Para publicar: subir el cambio y volver a desplegar ese archivo con el hash nuevo (herramienta de Supabase, `verify_jwt` desactivado). También vale `supabase functions deploy worker --project-ref embjkwggqooawqnzkoam --no-verify-jwt` desde un equipo con la CLI. |
| Servidor de montaje (`server.js`, `render.js`, `tools.js`, FFmpeg) | Google Cloud Run (`europe-southwest1`), Cloud Build trigger sobre `main` | Push a `main` (Cloud Build) |
| Base de datos, cola, cron | Supabase Postgres | SQL de referencia en `supabase/sql/functions_and_cron.sql` |

**Ojo con Cloud Build:** cualquier push a `main` que no esté en el filtro de ignorados redespliega Cloud Run y **mata los montajes en curso**. Ya se ignora `web/**`. **Antes de fusionar esta rama**, añadir también `supabase/**` y `**/*.md` en Cloud Build → Activadores → (activador de faceless-render) → filtro de archivos ignorados. Si no, comprobar antes que no hay vídeos en "producing".

## Cómo funciona el motor

- **Cola:** tabla `jobs`. `claim_job()` reparte trabajos y relanza los colgados más de 10 min; a los 3 cuelgues marca el vídeo como fallido.
- **Disparo:** pg_cron `fs-worker` cada minuto llama a `kick_worker()` si hay trabajos pendientes o colgados. Cada ejecución del worker procesa trabajos durante 60 s y se vuelve a llamar si queda cola.
- **Trigger `on_video_status_change`:**
  - `scripting` → `revise` si hay guion y feedback, si no `script`.
  - `producing` → `voice`.
  - `publishing` → `publish`.
  - No dispara si el estado anterior es `failed` ni si `stage = 'Volviendo a montar'`. Esta etapa se usa para relanzar solo un paso sin que el trigger cree trabajos duplicados.
- **Pasos:**
  - `script`: Opus por la API de lotes (mitad de precio), con documentación de Wikipedia y sin búsquedas web. Guionista y director van en una sola llamada. Devuelve solo el JSON y corta en `</json>`.
  - `revise`: Sonnet por lotes; aplica parches mínimos al guion.
  - `voice`: ElevenLabs `eleven_v3` con tiempos por palabra. Reaprovecha la voz y las imágenes que no han cambiado.
  - `audio`:
    - Música: biblioteca de como mucho 4 pistas por canal (`MUSIC_LIBRARY`). Después se rotan sin coste.
    - Efectos: catálogo fijo `SFX_LIB` de 10, que se genera una vez por canal en `channels/{id}/sfx/`.
  - `visuals`:
    - IA: `gpt-image-2` en **calidad baja** (desde el 28/10; las miniaturas siguen en media) y JPEG, con tope de 4 por Short y 12 por largo. Genera 2 por ejecución para no agotar la CPU de la función.
    - Archivo: Wikimedia Commons, con filtro de coincidencia `matchScore`.
    - También usa Pexels (solo para stock) y reencuadres.
  - `render` y `render_check`: el servidor propio en Cloud Run.
  - `thumbs`: 2 fondos IA más el texto compuesto en el servidor.
  - `analyze`: Sonnet por lotes con fotogramas del vídeo.
  - `learn`: Haiku; mantiene el manual del canal.
  - `refill_ideas`: Sonnet por lotes; banco de ideas con formato Short o largo.
  - `fix_visuals`: revisión de imágenes sin Claude; con `payload {dry:true}` solo informa.
  - `metrics`: API de YouTube.
- **Claves:** en Supabase Vault con el prefijo `fs_` (las lee `get_api_keys()`). Las que hay:
  - Modelos y servicios: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `CREATOMATE_API_KEY`.
  - YouTube y Google: `YOUTUBE_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
  - Montaje: `RENDER_URL`, `RENDER_SECRET`.
- **Coste por vídeo:** queda en `videos.usage` (tokens por modelo, con los de lotes aparte; imágenes, caracteres de voz, segundos de música y efectos). La web calcula el coste de Claude a partir de ahí.
- **Errores sin crédito:** si OpenAI o ElevenLabs se quedan sin saldo, el paso falla como `UserError`, sin reintentos y con un mensaje claro.

## Canal actual
- "Frente insólito", id `9aa16a1f-0a4d-42dd-9c8e-cac2090deb1e`, historias insólitas de guerra. Publica Shorts y largos de 8 min (`formats ['short','long']`).
- Cada vídeo lleva su propio `format` y `target_minutes`; `getVideo()` los aplica sobre los del canal.

## Lo hecho hoy (28/10)
1. **Imágenes que no encajaban** (11-S, colegio, inodoro de Milang…):
   - Causas: el plan B generaba la imagen IA a partir de la frase suelta, y Commons aceptaba cualquier resultado.
   - Arreglo: `ctxPrompt()` con contexto de la historia y la época, `matchScore` en Commons, nada de stock moderno para fotos de archivo, y el paso `fix_visuals`.
   - Revisados y vueltos a montar Emús, Plaga, Fútbol, Cadáver e Inodoro. A la Paloma se le quitaron las imágenes malas; las rehará al producirse.
   - **El Oso está publicado con 11 imágenes malas. No se ha tocado**: queda pendiente de que Giol decida.
2. **Gasto de Claude:** el director se fusionó con el guionista; lotes a mitad de precio; Wikipedia en vez de búsquedas web; revisión en silencio, sin borradores; los Shorts sin conceptos de miniatura.
   - Esta mañana se gastaron unos 2,5 $ de Opus en 6 guiones a precio completo, todos anteriores a los lotes.
   - Estimación actual: unos 0,08–0,10 $ por Short y unos 0,25 $ por largo. **Sin verificar todavía** con un guion real.
3. **Cuelgues:** «CPU Time exceeded» al decodificar imágenes en base64.
   - Decodificador rápido propio, imágenes en JPEG y 2 imágenes por ejecución.
   - El cron ahora también despierta al worker cuando hay trabajos colgados.
4. **Créditos agotados de OpenAI y ElevenLabs:**
   - Biblioteca de música por canal y catálogo de efectos.
   - Tope de imágenes IA más bajo y 2 miniaturas.
   - Fallo sin reintentos cuando no hay crédito.

## Presupuesto diario (desde 28/10)
- Tope total: **3 € al día** (`app_config.daily_cap_eur`), hora de Madrid. Precios por unidad en `app_config.prices_eur` (aproximados).
- Cada llamada de pago reserva antes con `reserve_spend()`. Claude comprueba antes con `budget_left()` y apunta lo gastado al recibir la respuesta con `record_spend()`.
- Si no hay margen, el trabajo pasa a la cola para mañana a las 00:05, con la etapa «Esperando al presupuesto de mañana». Lo gastado está en `spend_daily`.
- Canal: `voice_provider` ('elevenlabs' | 'fish') con `fish_voice_id`, e `image_provider` ('openai' | 'flux'). Por defecto: ElevenLabs y OpenAI.

## Prueba de imágenes (28/10)
- OpenAI en calidad baja frente a media, con 3 escenas de «La guerra de un cubo de madera»: prácticamente igual (8 frente a 7,8 de media) y unas 3 veces más barata. Se activó la calidad baja para las escenas.
- FLUX schnell, probado por Giol en Hugging Face: 6/10, más vistoso pero menos fiel a la época. No se ha abierto saldo en fal.ai; el código de FLUX queda listo pero desactivado (`image_provider = 'openai'`).

## YouTube (28/10)
- `youtube-auth` (código en `supabase/functions/youtube-auth/index.ts`, publicado igual que el motor: un archivo de una línea que importa de GitHub). Permisos: `youtube.upload`, `youtube.readonly` y `yt-analytics.readonly`. Al conectar, lanza las primeras analíticas.
- Paso `analytics` por canal conectado. Lo encola `metrics` cada día a las 5:15 UTC.
  - Enlaza por título los vídeos subidos a mano.
  - Guarda en `videos.stats.analytics`: visitas, % visto, retención (`retention`), tráfico, suscriptores y las 2 mayores caídas con la frase del guion (`drops`).
  - Cada 4 días encola `learn` con todo eso.
- Publicar o programar: en «Vídeos por aprobar», con fecha → sube como privado con `publishAt`.
  - **Proyecto de Google sin auditar → YouTube bloquea como privados los vídeos subidos por API.** Hay que pedir el «YouTube API Services Audit and Quota Extension».
  - Cuota por defecto: 10.000 unidades al día, y cada subida gasta unas 1.600 (unas 6 subidas al día).

## Motor B — retos interactivos (28/10)
Canal «Reto Imposible» (`production_type = 'challenges'`). Cada canal usa siempre su motor; el documental no cambia.

**Arquitectura.** Un único motor en JavaScript puro, sin dependencias, que usan las tres partes:
- `web/retos/engine.js`: 13 mecánicas en 9 categorías, validación por código, rondas, puntos, rangos y línea de tiempo con los sonidos alineados a fotogramas. Para añadir una mecánica: un generador en `GEN`, su validador en `VAL` y su plantilla en `TPL` de draw.js.
- `web/retos/draw.js`: plantillas 2D con Canvas. Dibuja en el tamaño de diseño (1920×1080 o 1080×1920) y escala, así la vista previa es idéntica al vídeo final.
- `render-retos.js` (Cloud Run): fotogramas con node-canvas que se pasan a FFmpeg.
  - Mezcla de audio en código, con sincronía exacta: unos 4 ms medidos en el MP4 final.
  - Música por niveles con fundidos y bajada bajo la voz.
  - Volumen a -14 LUFS: se mide, se aplica ganancia + limitador y se vuelve a medir (método de la secante, hasta ±0,12 LU, máx. 6 pasadas). El informe guarda `loudness_passes` y `gain_db`. Después de codificar se mide el pico real: el AAC de FFmpeg en Cloud Run se pasa del limitador (llegó a +1 dB). Si supera -1 dB, se recodifica solo el audio (el vídeo se copia) con un techo más bajo y la ganancia compensada; el informe lo anota en `true_peak_fixes`.
  - Miniatura programática.
- `web/retos/ui.js`: la interfaz.
  - En el canal: tipo de producción, identidad visual, identidad sonora (12 efectos y 3 músicas, con versiones), volúmenes, narración y temporizador.
  - En «Revisar»: el generador.
  - En la ficha del vídeo: editor con previsualización (WebAudio).

**Flujo.**
1. Generar (web o paso `retos_generate`): el vídeo queda en `script_review` con `engine = 'challenges'` y el proyecto en `videos.retos`.
2. Aprobar: pasa a `producing` y el trigger encola `retos_assets`. Este paso valida y genera solo lo que falta de la biblioteca (`channel_audio`); luego van `render` y `render_check`.
3. Al terminar se guardan el informe de recursos en `videos.retos.report` y el historial en `challenge_history`.

**Datos.**
- `channels`: `production_type`, `retos_config` y `theme`.
- `videos`: `engine` y `retos`.
- `channel_audio`: sfx, música y voz, con `history` de versiones.
- `challenge_history`.
- Política de storage para subir archivos a `channels/*/audio/`.

**Pruebas.** `npm test` ejecuta tests/retos.test.mjs: 15.600 retos validados, validación de respuestas manipuladas, sincronía, cambio de posiciones, rejilla de figuras (dentro de su caja y sin solapes) y dibujo con node-canvas en los 4 estilos y 2 formatos.

**Estilo visual (rediseño 28/10).**
- `engine.js` → `STYLES` (light «Light Game», predeterminado; arcade «Soft Arcade», con Nunito, fondos de color y sombra sólida; dark «Soft Dark»), `FONTS` y `mergeTheme(theme)`.
- Tema del canal: `{style, anim}` o, en personalizado, `{style:"custom", base, overrides:{bg, card, ink, timer, ok, alert, teal, observation, memory, logic, extreme}, font, radius, shadow, anim}`. Los temas antiguos sin `style` (fondo azul) pasan a Light.
- Un vídeo puede llevar su propio estilo en `videos.retos.theme` (se elige en el editor). Si no lo lleva, usa el del canal; el worker hace `v.retos?.theme ?? ch.theme`.
- Fondo suave por tipo de juego (observación, memoria, lógica, extremo). Las figuras se reparten al dibujar con `gridLayout`, sin tocar los datos del reto.
- Revelación progresiva: `REVEAL_FIRST` (0,35 s) y `REVEAL_STEP` (0,45 s) entre soluciones. Cada una suena con S05 la primera y S09 las demás; el dibujo y el sonido usan las mismas constantes.
- Short: los últimos 330 px quedan libres para la interfaz de YouTube.
- **Ojo con cairo (node-canvas):** escalar a 0 deja el lienzo inservible para todos los fotogramas siguientes. En draw.js siempre se escala con `zs()`; la prueba 7 lo detecta.

## Playable World — minijuegos de Reto Imposible (28/10)
Giol quiere que Reto Imposible parezca una colección de pequeños videojuegos, no un cuestionario. Es un **estilo de juego** dentro del mismo motor B (selector «Estilo de juego» del generador: Clásico o Playable World). El clásico no cambia.
- `web/retos/world.js`: lógica pura de cada juego, con generador, validador y **simulación**. La respuesta, la animación de la revelación y sus sonidos salen de esa simulación, así que el vídeo no puede contradecir la solución.
  - Pilotos hechos:
    - `maze`: laberinto con 3 entradas y una meta. Se corta un tramo del camino de cada entrada equivocada (comprobado por recorrido en anchura); las bolas equivocadas chocan y la buena recorre el camino hasta el cofre. Proporciones según el formato.
    - `machine`: tablero de palancas que cambian de lado al pasar cada bola; caen 1–3 bolas y se pregunta por la última.
    - `room_error`: habitación con 12 objetos y un solo error comprobable (8 tipos). La revelación hace zoom al error y lo corrige.
  - Pendientes de la petición (secciones 4 C, E y F): memoria visual con escenas, diferencias con escenas ilustradas y escape visual. Para añadir un juego: un generador, un validador y `reveal()` en `WORLD` (world.js), más su escena en `SCENES` (world-draw.js).
- `web/retos/world-draw.js`: escenas ilustradas por código. `web/retos/pix.js`: mascota PIX con 8 expresiones, en Canvas y en SVG (`pixSVG`).
- `engine.js`: categorías `maze`, `machine` y `error` y `GAME_STYLES`. `buildProject({game_style:"world"})` marca el proyecto, y entonces `timeline` añade una portada con PIX (`intro`) y un mapa de niveles entre retos (`map`), sin pantallas de ronda. El último nivel se presenta como «Desafío final». `solvedAt(c)` marca cuándo suenan el acierto y los puntos.
- **Efectos nuevos S13–S22** (rodadura, palanca, engranajes, puerta, aparecer, desaparecer, salto, choque, caída en cubo y zoom):
  - S13 está generado con ElevenLabs.
  - S14–S22 son la versión 1 sintetizada por código: `tools/synth-sfx.mjs` los escribe en `web/sfx/` y se sirven desde Vercel. El 28/10 se había agotado el tope de 3 € y ElevenLabs no pudo generarlos.
  - Se pueden regenerar con ElevenLabs desde «Identidad sonora» cuando haya presupuesto.
- Demos piloto (3 niveles), en `final_review` en la plataforma con el título «PILOTO Playable World · 3 niveles»:
  - Short `659e004e…`: unos 69 s.
  - Largo `33cde24c…`: unos 80 s.
- El primer Short `77b98d23…` se ha vuelto a montar con el estilo claro.

## Pendiente (por orden)
0. **Playable World:** que Giol valore las demos y, si le gustan, completar memoria visual, diferencias con escenas y escape visual, más PIX en las pantallas de resultados. Valorar los efectos sintetizados frente a ElevenLabs.
0. **YouTube (en cola, lo pidió Giol el 28/10):** redactar el texto del formulario «YouTube API Services Audit and Quota Extension» y dejar lista la programación desde la plataforma (subir como privado con `publishAt`, cuota diaria). Está detrás del motor de retos.
1. **Escalar a 10 canales, unos 10 largos y 20 Shorts al día, por unos 300 $/mes en vez de más de 800 $.** Giol quiere que la voz sea muy profesional.
   - **Voz:** probar **Fish Audio `s2-pro`** (15 $ por millón de bytes de texto) frente a ElevenLabs v3 con el mismo Short, y que Giol elija de oído.
     - Si se cambia, los tiempos por palabra para los subtítulos saldrían de la transcripción de OpenAI (Whisper, 0,006 $/min) o del alineado forzado.
     - El proveedor de voz debería ser configurable por canal.
   - **Imágenes:** OpenAI solo para el gancho y las miniaturas; el resto con **FLUX schnell en fal.ai** (unos 0,003 $ por imagen). También configurable por canal.
   - **Claves:** hace falta que Giol cree las cuentas de Fish Audio y fal.ai. `FISH_AUDIO_API_KEY` y `FAL_KEY` ya están en `set_api_key()` y `api_key_status()` (aplicado en la base de datos) y en Ajustes.
   - **Paso de prueba `compare`** (no toca el vídeo): genera con Fish la narración entera de un Short ya hecho y con FLUX sus primeras 4 imágenes IA. Lo deja en `media/tests/{video}/compare.json`, junto a las URLs de ElevenLabs y GPT Image que ya tenía. Para lanzarlo: `insert into jobs(step, video_id, payload) values ('compare', '97ab9b84-27ac-462c-a42d-919be6dd6622', '{"fish_voice":"<id de voz de Fish>"}');`. Opciones del payload: `fish_model`, `flux_model`, `images`, `skip_voice` y `skip_images`.
2. **«4 tormentas que decidieron guerras»** (largo) ha fallado en `voice` por falta de créditos de ElevenLabs. Hay que relanzarlo con `retry_video` cuando haya crédito o voz nueva.
3. **Comprobar el coste real** del próximo guion por lotes (`videos.usage`, claves `opus_batch_in/out`).
4. **Antes de fusionar** esta rama `handoff-worker` en `main`: el filtro de Cloud Build (ver arriba).
5. **Opcional:**
   - Pasar los guiones de Shorts a Sonnet si la calidad aguanta (ahorraría alrededor de la mitad).
   - Que la web muestre también el coste de imágenes, voz y música, no solo el de Claude.

## Precauciones
- No borrar datos con DELETE salvo que haga falta; mejor actualizaciones.
- No poner el email del usuario en cabeceras como User-Agent.
- Los mensajes de commit terminan con la atribución de Claude.
