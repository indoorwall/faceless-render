#!/usr/bin/env python3
"""Mezcla voz + música (que baja sola bajo la voz) + efectos según plan.json y une el vídeo.
   python3 tools/mix.py <carpeta_episodio> <salida.mp4>"""
import json, os, subprocess, sys
D = os.path.abspath(sys.argv[1]); OUT = sys.argv[2]
LIB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib")
P = json.load(open(os.path.join(D, "plan.json"))); T = P["total"]
inp, f = [], []
def add(p): inp.extend(["-i", p]); return len(inp) // 2 - 1
vl = []
for t, a in P["voices"]:
    k = add(os.path.join(D, a)); ms = int(t * 1000)
    f.append(f"[{k}]adelay={ms}|{ms},aresample=44100,aformat=channel_layouts=stereo[v{k}]"); vl.append(f"[v{k}]")
f.append(f"{''.join(vl)}amix=inputs={len(vl)}:normalize=0,apad=whole_dur={T}[voice]"); f.append("[voice]asplit=2[vo][sc]")
sl = []
for i, (t, s, vol) in enumerate(P["sfx"]):
    k = add(os.path.join(LIB, f"sfx_{s}.mp3")); ms = int(t * 1000)
    f.append(f"[{k}]volume={vol},adelay={ms}|{ms},aresample=44100,aformat=channel_layouts=stereo[s{i}]"); sl.append(f"[s{i}]")
f.append(f"{''.join(sl) or '[vo]'}amix=inputs={max(1, len(sl))}:normalize=0[sfx]" if sl else "anullsrc=r=44100:cl=stereo,atrim=0:0.1[sfx]")
mus = P.get("music") or [["spy", 0]]; ml = []
for j, (trk, st) in enumerate(mus):
    en = mus[j + 1][1] if j + 1 < len(mus) else T
    k = add(os.path.join(LIB, f"music_{trk}.mp3")); ln = max(0.5, en - st + 0.6); ms = int(max(0, st - 0.3) * 1000)
    f.append(f"[{k}]aloop=loop=-1:size=2e9,atrim=0:{ln},afade=t=in:d=0.5,afade=t=out:st={max(0, ln - 1.2)}:d=1.2,adelay={ms}|{ms},aresample=44100,aformat=channel_layouts=stereo[m{j}]"); ml.append(f"[m{j}]")
f.append(f"{''.join(ml)}amix=inputs={len(ml)}:normalize=0,volume=0.55[mus]")
f.append("[mus][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[duck]")
f.append(f"[vo][duck][sfx]amix=inputs=3:normalize=0,atrim=0:{T},loudnorm=I=-14:TP=-1.5:LRA=11[out]")
mix = os.path.join(D, "mix.m4a")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inp, "-filter_complex", ";".join(f), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", mix], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(D, "video_only.mp4"), "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "copy", "-shortest", "-movflags", "+faststart", OUT], check=True)
print("OK", OUT)
