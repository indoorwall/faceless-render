#!/usr/bin/env python3
"""Tiempos de cada palabra con Whisper (local, gratis). python3 tools/words.py <carpeta> [v_01.mp3 ...]
   Crea w_XX.json junto a cada v_XX.mp3 y muestra el texto oído: si Whisper oye otra cosa
   (palabra de más, nombre mal pronunciado), vuelve a pedir esa voz con otra ortografía."""
import glob, json, os, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel
D = sys.argv[1]; files = [os.path.join(D, f) for f in sys.argv[2:]] or sorted(glob.glob(os.path.join(D, "v_*.mp3")))
m = WhisperModel("small.en", device="cpu", compute_type="int8")
for f in files:
    a = np.frombuffer(subprocess.check_output(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"]), np.float32)
    segs, _ = m.transcribe(a, word_timestamps=True, language="en")
    w = [{"w": x.word.strip(), "s": round(x.start, 2), "e": round(x.end, 2)} for s in segs for x in s.words]
    out = f.replace("/v_", "/w_").replace(".mp3", ".json"); json.dump(w, open(out, "w"))
    print(os.path.basename(f), "→", " ".join(f"{x['w']}@{x['s']}" for x in w), flush=True)
