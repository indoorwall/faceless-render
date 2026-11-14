"""Atajos para escribir episode.json en Python (menos texto que el JSON a mano).
   from ep import *  →  S(at, bg, [items], tr=, kb=, night=, sounds=) · W(at, text, x, y, style, size, **kw) · A(src, x, y, h, at, enter, idle, **kw)
   D(pose, x, y, h, at, enter, idle) · N(at, text, x, y, size) · C(at, frm, to, fmt, x, y, size, color, dur) · CAL(states) · PIZZA(...)"""
import json
def S(at, bg, items, tr="slide-l", kb=None, night=False, sounds=None):
    d = {"at": at, "bg": bg, "tr": tr, "items": items}
    if kb: d["kb"] = kb
    if night: d["night"] = True
    if sounds: d["sounds"] = sounds
    return d
def W(at, text, x=960, y=200, style="box", size=96, **kw): return {"type": "word", "at": at, "text": text, "x": x, "y": y, "style": style, "size": size, **kw}
def A(src, x=1400, y=1080, h=860, at=0, enter="up", idle="bob", **kw): return {"type": "actor", "src": src, "x": x, "y": y, "h": h, "at": at, "enter": enter, "idle": idle, **kw}
def D(pose, x=380, y=1060, h=720, at=0, enter="left", idle="bob", **kw): return {"type": "dummy", "pose": pose, "x": x, "y": y, "h": h, "at": at, "enter": enter, "idle": idle, **kw}
def N(at, text, x=960, y=1000, size=32, **kw): return {"type": "note", "at": at, "text": text, "x": x, "y": y, "size": size, **kw}
def C(at, frm, to, fmt, x=960, y=460, size=260, color="#EF4444", dur=1.2, **kw): return {"type": "count", "at": at, "from": frm, "to": to, "fmt": fmt, "x": x, "y": y, "size": size, "color": color, "dur": dur, "sound": kw.pop("sound", "none"), **kw}
def CAL(states): return {"type": "calendar", "states": states}
def PIZZA(x=1000, y=220, size=620, at=0, **kw): return {"type": "pizza8", "x": x, "y": y, "size": size, "at": at, **kw}
def BADGE(label="🍕 PIZZA MATH"): return {"type": "html", "html": f"<div class='w box' style='left:260px;top:120px;font-size:56px' data-anim='none' data-in='0'>{label}</div>"}
def HTML(h): return {"type": "html", "html": h}
def SC(n, shots, gap=0.35): return {"voice": f"v_s{n}.mp3", "words": f"w_s{n}.json", "gap": gap, "shots": shots}
def save(path, scenes, music, orientation="landscape", end_pad=1.6):
    json.dump({"orientation": orientation, "end_pad": end_pad, "music": music, "scenes": scenes}, open(path, "w"), indent=1, ensure_ascii=False)
