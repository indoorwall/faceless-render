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

@app.cls(image=image, gpu="L4", scaledown_window=120, timeout=900, secrets=[modal.Secret.from_name("faceless-tts")])
class TTS:
    @modal.enter()
    def load(self):
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        from faster_whisper import WhisperModel
        self.model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
        self.whisper = WhisperModel("small", device="cuda", compute_type="float16")
        self.refs = {}

    def _ref(self, url):
        if not url:
            return None
        if url not in self.refs:
            import requests
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            src = tempfile.NamedTemporaryFile(delete=False); src.write(r.content); src.close()
            subprocess.run(["ffmpeg", "-y", "-i", src.name, "-ac", "1", "-ar", "24000", f.name], check=True, capture_output=True)
            self.refs[url] = f.name
        return self.refs[url]

    @modal.fastapi_endpoint(method="POST", label="faceless-tts")
    def speak(self, body: dict):
        # La clave va en el cuerpo (body.auth): el enlace es público, sin clave no se genera nada
        if not body.get("auth") or body.get("auth") != os.environ.get("TTS_AUTH"):
            return {"error": "unauthorized"}
        return self._speak(body)

    def _speak(self, body):
        import torch, torchaudio
        text = str(body.get("text", "")).strip()
        lang = str(body.get("language", "es"))[:2]
        if not text:
            return {"error": "empty text"}
        ref = self._ref(body.get("ref_url"))
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
