# Generador de voz en español con CosyVoice 3 (FunAudioLLM, licencia Apache-2.0, uso comercial permitido; habla español de forma nativa).
# Imita el timbre de una voz de referencia (grabación libre de derechos) que se transcribe sola con Whisper.
# Encargar: POST {auth, text, ref_url, ref_start?, ref_len?, instruct?} → {call_id}; recoger: GET ?call_id=&auth= → {audio_b64, duration, words}
import base64, os, re, subprocess, sys, tempfile
import modal

app = modal.App("faceless-tts-es")
REPO = "/opt/CosyVoice"
MODEL = "/opt/models/Fun-CosyVoice3-0.5B"

def _download():
    from huggingface_hub import snapshot_download
    snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=MODEL)
    from faster_whisper import WhisperModel
    WhisperModel("small", device="cpu", compute_type="int8")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "sox", "libsox-dev", "build-essential")
    .run_commands(f"git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git {REPO}")
    .pip_install(
        "torch==2.3.1", "torchaudio==2.3.1", extra_index_url="https://download.pytorch.org/whl/cu121")
    .pip_install(
        "conformer==0.3.2", "diffusers==0.29.0", "hydra-core==1.3.2", "HyperPyYAML==1.2.3", "inflect==7.3.1",
        "librosa==0.10.2", "lightning==2.2.4", "matplotlib==3.7.5", "modelscope==1.20.0", "networkx==3.1",
        "numpy==1.26.4", "omegaconf==2.3.0", "onnx==1.16.0", "onnxruntime-gpu==1.18.0", "openai-whisper==20231117",
        "protobuf==4.25", "pyarrow==18.1.0", "pydantic==2.7.0", "pyworld==0.3.4", "rich==13.7.1", "soundfile==0.12.1",
        "transformers==4.51.3", "x-transformers==2.11.24", "wetext==0.0.4", "wget==3.2", "gdown==5.1.0",
        "huggingface_hub", "faster-whisper==1.1.1", "requests", "fastapi[standard]")
    .run_function(_download)
)

@app.cls(image=image, gpu=["L4", "A10G", "T4"], cpu=4, scaledown_window=120, timeout=900, secrets=[modal.Secret.from_name("faceless-tts")])
class VoiceES:
    @modal.enter()
    def load(self):
        sys.path.insert(0, REPO); sys.path.insert(0, f"{REPO}/third_party/Matcha-TTS")
        os.chdir(REPO)
        from cosyvoice.cli.cosyvoice import AutoModel
        from faster_whisper import WhisperModel
        self.model = AutoModel(model_dir=MODEL)
        self.whisper = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4)
        self.refs = {}

    def _ref(self, url, start, length):
        key = f"{url}#{start}-{length}"
        if key not in self.refs:
            import requests
            r = requests.get(url, timeout=120); r.raise_for_status()
            src = tempfile.NamedTemporaryFile(delete=False); src.write(r.content); src.close()
            wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
            subprocess.run(["ffmpeg", "-y", "-ss", str(start), "-t", str(length), "-i", src.name, "-ac", "1", "-ar", "16000", wav], check=True, capture_output=True)
            segs, _ = self.whisper.transcribe(wav, language="es")
            self.refs[key] = (wav, " ".join(s.text.strip() for s in segs).strip())
        return self.refs[key]

    @modal.method()
    def generate(self, body: dict):
        try:
            return self._speak(body)
        except Exception as e:
            import traceback
            return {"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-1500:]}

    def _speak(self, body):
        import torch, torchaudio
        text = str(body.get("text", "")).strip()
        if not text:
            return {"error": "empty text"}
        if not body.get("ref_url"):
            return {"error": "CosyVoice necesita una voz de referencia (ref_url)"}
        wav, ref_text = self._ref(body["ref_url"], float(body.get("ref_start", 45)), float(body.get("ref_len", 12)))
        sysmsg = "You are a helpful assistant."
        instruct = str(body.get("instruct") or "").strip()
        sr = self.model.sample_rate
        pieces = []
        for out in self.model.inference_zero_shot(text, f"{sysmsg}<|endofprompt|>{ref_text}", wav, stream=False) if not instruct else \
                self.model.inference_instruct2(text, f"{sysmsg} {instruct}<|endofprompt|>", wav, stream=False):
            pieces.append(out["tts_speech"].cpu())
        audio = torch.cat(pieces, dim=1)
        wavf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        torchaudio.save(wavf, audio, sr)
        mp3f = wavf.replace(".wav", ".mp3")
        subprocess.run(["ffmpeg", "-y", "-i", wavf, "-ac", "1", "-b:a", "128k", mp3f], check=True, capture_output=True)
        segs, _ = self.whisper.transcribe(wavf, language="es", word_timestamps=True)
        words = [{"word": str(w.word).strip(), "start": round(float(w.start), 3), "end": round(float(w.end), 3)} for s in segs for w in (s.words or [])]
        with open(mp3f, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
        return {"audio_b64": b64, "duration": round(float(audio.shape[1]) / float(sr), 3), "words": words, "ref_text": ref_text}

web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]", "numpy")

@app.function(image=web_image, secrets=[modal.Secret.from_name("faceless-tts")])
@modal.fastapi_endpoint(method="POST", label="faceless-tts-es")
def submit(body: dict):
    if not body.get("auth") or body.get("auth") != os.environ.get("TTS_AUTH"):
        return {"error": "unauthorized"}
    body = {k: v for k, v in body.items() if k != "auth"}
    return {"call_id": VoiceES().generate.spawn(body).object_id}

@app.function(image=web_image, secrets=[modal.Secret.from_name("faceless-tts")])
@modal.fastapi_endpoint(method="GET", label="faceless-tts-es-result")
def result(call_id: str, auth: str):
    if auth != os.environ.get("TTS_AUTH"):
        return {"error": "unauthorized"}
    from modal.functions import FunctionCall
    try:
        return FunctionCall.from_id(call_id).get(timeout=0)
    except Exception as e:
        if "Timeout" in type(e).__name__:
            return {"pending": True}
        return {"error": f"{type(e).__name__}: {e}"}
