# Generador de voz propio en Modal (tarjeta gráfica por segundos).
# Chatterbox Multilingual (licencia MIT, uso comercial permitido) + faster-whisper para los tiempos por palabra (subtítulos).
# Petición: POST {auth, text, language, ref_url?, exaggeration?, cfg_weight?} (auth = TTS_AUTH)
# Respuesta: {audio_b64 (mp3), duration, words:[{word,start,end}]}
import base64, io, os, re, subprocess, tempfile
import modal

app = modal.App("faceless-tts")

def _download():
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    from faster_whisper import WhisperModel
    WhisperModel("small", device="cpu", compute_type="int8")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install("chatterbox-tts", "faster-whisper==1.1.1", "fastapi[standard]", "requests")
    .run_function(_download)
)

@app.cls(image=image, gpu="L4", cpu=4, scaledown_window=120, timeout=900, secrets=[modal.Secret.from_name("faceless-tts")])
class Voice:
    @modal.enter()
    def load(self):
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        from faster_whisper import WhisperModel
        self.model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
        # Whisper en el procesador (int8): evita depender de las librerías cuDNN de la tarjeta y para frases cortas va sobrado
        self.whisper = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4)
        self.refs = {}

    def _ref(self, url, start=45.0, length=12.0):
        # Voz de referencia: se recorta un trozo limpio (por defecto 12 s a partir del segundo 45, para saltar la
        # presentación de los audiolibros de LibriVox) y se pasa a mono 24 kHz
        if not url:
            return None
        key = f"{url}#{start}-{length}"
        if key not in self.refs:
            import requests
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            src = tempfile.NamedTemporaryFile(delete=False); src.write(r.content); src.close()
            subprocess.run(["ffmpeg", "-y", "-ss", str(start), "-t", str(length), "-i", src.name, "-ac", "1", "-ar", "24000", f.name], check=True, capture_output=True)
            self.refs[key] = f.name
        return self.refs[key]

    @modal.method()
    def generate(self, body: dict):
        try:
            return self._speak(body)
        except Exception as e:  # el error vuelve al motor en vez de perderse
            import traceback
            return {"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-1500:]}

    def _speak(self, body):
        import torch, torchaudio
        text = str(body.get("text", "")).strip()
        lang = str(body.get("language", "es"))[:2]
        if not text:
            return {"error": "empty text"}
        ref = self._ref(body.get("ref_url"), float(body.get("ref_start", 45)), float(body.get("ref_len", 12)))
        # Frases de hasta ~250 caracteres: Chatterbox va mejor en trozos cortos
        parts, cur = [], ""
        for s in re.split(r"(?<=[.!?…])\s+", text):
            if len(cur) + len(s) < 250:
                cur = (cur + " " + s).strip()
            else:
                if cur: parts.append(cur)
                cur = s
        if cur: parts.append(cur)
        sr = self.model.sr
        pieces = []
        for p in parts:
            kw = dict(language_id=lang, exaggeration=float(body.get("exaggeration", 0.5)), cfg_weight=float(body.get("cfg_weight", 0.5)))
            if ref: kw["audio_prompt_path"] = ref
            wav = self.model.generate(p, **kw)
            pieces.append(wav.cpu())
            pieces.append(torch.zeros(1, int(sr * 0.18)))
        audio = torch.cat(pieces, dim=1)
        wavf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        torchaudio.save(wavf, audio, sr)
        mp3f = wavf.replace(".wav", ".mp3")
        subprocess.run(["ffmpeg", "-y", "-i", wavf, "-ac", "1", "-b:a", "128k", mp3f], check=True, capture_output=True)
        segs, info = self.whisper.transcribe(wavf, language=lang, word_timestamps=True, initial_prompt=text[:200])
        words = [{"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)} for s in segs for w in (s.words or [])]
        with open(mp3f, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
        return {"audio_b64": b64, "duration": round(audio.shape[1] / sr, 3), "words": words}


# Encargar (POST, devuelve call_id) y recoger (GET ?call_id=). Sin GPU: responden al instante.
web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]")

@app.function(image=web_image, secrets=[modal.Secret.from_name("faceless-tts")])
@modal.fastapi_endpoint(method="POST", label="faceless-tts")
def submit(body: dict):
    if not body.get("auth") or body.get("auth") != os.environ.get("TTS_AUTH"):
        return {"error": "unauthorized"}
    body = {k: v for k, v in body.items() if k != "auth"}
    call = Voice().generate.spawn(body)
    return {"call_id": call.object_id}

@app.function(image=web_image, secrets=[modal.Secret.from_name("faceless-tts")])
@modal.fastapi_endpoint(method="GET", label="faceless-tts-result")
def result(call_id: str, auth: str):
    if auth != os.environ.get("TTS_AUTH"):
        return {"error": "unauthorized"}
    from modal.functions import FunctionCall
    try:
        out = FunctionCall.from_id(call_id).get(timeout=0)
    except Exception as e:
        if "Timeout" in type(e).__name__:
            return {"pending": True}
        return {"error": f"{type(e).__name__}: {e}"}
    return out
