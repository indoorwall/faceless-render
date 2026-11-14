#!/usr/bin/env python3
"""Billion Dollar Stories — motor de montaje.

Convierte un guion de montaje (episode.json) en render.html + plan.json:
  python3 engine.py work/<episodio>/episode.json
El HTML se graba con tools/rec.cjs y el audio se mezcla con tools/mix.py (ver studio/README.md).

Formato de episode.json (todas las rutas relativas a la carpeta del episodio):
{
  "orientation": "landscape" | "portrait",          # 1920x1080 o 1080x1920
  "music": [["spy", 0], ["fun", 8]],                # pista y escena desde la que suena (tools/fetch_assets.py)
  "end_pad": 1.6,                                   # segundos de cola tras la última escena
  "scenes": [
    {"voice": "v_01.mp3", "words": "w_01.json", "gap": 0.35,
     "shots": [
       {"at": 0, "bg": "lib/bg_floor.png" | "NAVY", "night": false, "kb": [1.0, 1.08, 0, 0], "tr": "zoom|slide-l|slide-r|none",
        "items": [ ...ver ITEMS... ],
        "sounds": [["Monday", "tick", 0.5]]}
     ]}
  ]
}
Tiempos ("at", "react", "draw", "out" y los de "sounds"): número = segundos desde el inicio del PLANO,
o una palabra de la narración de la escena: "monday", "same#2" (3.ª aparición), "600+0.4" (con desfase).
El "at" de un plano se mide desde el inicio de la escena; el plano dura hasta el siguiente (el último, hasta el final del audio + gap).

ITEMS (x, y en píxeles del lienzo; las palabras se centran en x,y; los personajes se apoyan en y = pies):
  {"type":"word","at":"monday","text":"MONDAY","x":960,"y":300,"style":"box|red|green|big|stamp","size":96,"anim":"pop|slam|fade|slide-l|slide-r","rot":0,"sound":"pop|hit|error|zoom|none","out":null}
  {"type":"note","at":..,"text":"— according to reports","x":..,"y":..,"size":34}
  {"type":"actor","src":"lib/cut_trader.png","x":1500,"y":1080,"h":800,"at":0,"enter":"up|left|right|pop|drop","idle":"bob|shake|walk|wobble|jump|none","react":"600","walk":-1100,"flip":false,"out":null}
  {"type":"dummy","pose":"explain|shock|thumbs","x":..,"y":..,"h":..,"at":..,"enter":..,"idle":..}
  {"type":"count","at":..,"from":0,"to":600,"fmt":"−${v}B","x":..,"y":..,"size":170,"color":"#EF4444","dur":1.2,"out":null}
  {"type":"tag","at":..,"from":174,"to":149,"x":..,"y":..,"dur":4,"out":null}           # etiqueta de precio
  {"type":"chart","x":..,"y":..,"w":1050,"h":588,"at":0,"draw":"600-0.6","label":"NVDA","points":"50,110 950,500","dur":1.6,"color":"#EF4444"}
                     (points en un lienzo de 1000x560: y=110 arriba, y=500 abajo)
  {"type":"pizza","x":..,"y":..,"size":640,"at":0,"idle":"spin|none"}
  {"type":"pie","x":..,"y":..,"size":720,"at":0,"pull":"slice","label":"NVDA"}
  {"type":"chip","x":..,"y":..,"size":400,"at":..} · {"type":"factory",...} · {"type":"face","kind":"happy|scared",...,"out":..}
  {"type":"fold","at":..,"text":"−$600B","x":..,"y":..,"size":300,"color":"#EF4444","fold":"twist"}   # el número se dobla como papel
  {"type":"logo"} · {"type":"stripes"} · {"type":"disclaimer","at":..}
  {"type":"subscribe","x":..,"y":..,"at":..} · {"type":"html","html":"<div class='w' ...>"}
"""
import html as H, json, math, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
EP = sys.argv[1]
WD = os.path.dirname(os.path.abspath(EP))
E = json.load(open(EP))
PORT = E.get("orientation") == "portrait"
SW, SH = (1080, 1920) if PORT else (1920, 1080)

def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(WD, f)]))

shots, sfx, voices, shakes = [], [], [], []

class Scene:
    def __init__(self, words):
        self.w = words
    def t(self, ref):
        """Segundos desde el inicio de la escena."""
        if ref is None: return None
        if isinstance(ref, (int, float)): return float(ref)
        m = re.match(r"^\s*([^+#\-]+?)(?:#(\d+))?\s*([+-]\s*[\d.]+)?\s*$", str(ref))
        if not m: raise SystemExit(f"Tiempo no válido: {ref}")
        w, n, off = m.group(1).strip().lower(), int(m.group(2) or 0), float((m.group(3) or "0").replace(" ", ""))
        # Un texto es siempre una palabra («600» = la palabra «$600»); los segundos se escriben como número JSON
        key = re.sub(r"[^a-z0-9]", "", w)
        hits = [x["s"] for x in self.w if re.sub(r"[^a-z0-9]", "", x["w"].lower()).startswith(key)]
        if len(hits) <= n: raise SystemExit(f"No encuentro la palabra «{w}»#{n} en la escena (palabras: {' '.join(x['w'] for x in self.w)[:400]})")
        return hits[n] + off

PIZZA_SVG = ('<circle cx="290" cy="290" r="280" fill="#D97706" stroke="#111" stroke-width="14"/><circle cx="290" cy="290" r="240" fill="#FCD34D"/>'
    '<g fill="#C2410C" stroke="#7C2D12" stroke-width="5"><circle cx="200" cy="170" r="30"/><circle cx="360" cy="150" r="30"/><circle cx="130" cy="300" r="30"/><circle cx="300" cy="290" r="30"/><circle cx="450" cy="320" r="30"/><circle cx="210" cy="430" r="30"/><circle cx="380" cy="450" r="30"/><circle cx="470" cy="220" r="30"/></g>'
    '<g stroke="#111" stroke-width="5">' + "".join(f'<line x1="290" y1="290" x2="{290+280*math.cos(a*math.pi/16):.0f}" y2="{290+280*math.sin(a*math.pi/16):.0f}"/>' for a in range(32)) + '</g>')
CHIP_SVG = ('<g stroke="#9CA3AF" stroke-width="14" stroke-linecap="round">' + "".join(f'<line x1="{-120+i*48}" y1="-170" x2="{-120+i*48}" y2="-125"/><line x1="{-120+i*48}" y1="125" x2="{-120+i*48}" y2="170"/><line x1="-170" y1="{-120+i*48}" x2="-125" y2="{-120+i*48}"/><line x1="125" y1="{-120+i*48}" x2="170" y2="{-120+i*48}"/>' for i in range(6)) +
    '</g><rect x="-130" y="-130" width="260" height="260" rx="26" fill="#14532D" stroke="#111" stroke-width="12"/><rect x="-80" y="-80" width="160" height="160" rx="14" fill="#22C55E" stroke="#111" stroke-width="8"/><text y="22" text-anchor="middle" font-family="Anton" font-size="64" fill="#0E1630">AI</text>')
FACTORY_SVG = ('<path d="M30 360 V200 L120 250 V200 L210 250 V200 L300 250 V90 H350 V360 Z" fill="#475569" stroke="#111" stroke-width="12" stroke-linejoin="round"/>'
    '<g fill="#FFC400" stroke="#111" stroke-width="6"><rect x="60" y="280" width="50" height="40"/><rect x="150" y="280" width="50" height="40"/><rect x="240" y="280" width="50" height="40"/></g>')
FACES = {
    "happy": '<circle r="180" fill="#22C55E" stroke="#111" stroke-width="14"/><circle cx="-60" cy="-40" r="20" fill="#111"/><circle cx="60" cy="-40" r="20" fill="#111"/><path d="M-90 40 Q0 130 90 40" fill="none" stroke="#111" stroke-width="16" stroke-linecap="round"/>',
    "scared": '<circle r="180" fill="#EF4444" stroke="#111" stroke-width="14"/><circle cx="-60" cy="-50" r="32" fill="#fff" stroke="#111" stroke-width="8"/><circle cx="60" cy="-50" r="32" fill="#fff" stroke="#111" stroke-width="8"/><circle cx="-60" cy="-50" r="10" fill="#111"/><circle cx="60" cy="-50" r="10" fill="#111"/><ellipse cy="70" rx="45" ry="60" fill="#4A1414" stroke="#111" stroke-width="10"/>',
}
SND_VOL = {"pop": 0.4, "hit": 0.75, "error": 0.6, "zoom": 0.6, "tick": 0.5, "score": 0.6, "whoosh": 0.3}

def o(v): return "" if v is None else f' data-out="{v:.2f}"'
def P(src):
    """«lib/x.png» = biblioteca del canal (studio/bds/lib); cualquier otra ruta, relativa a la carpeta del episodio."""
    return os.path.relpath(os.path.join(ROOT, src), WD) if str(src).startswith("lib/") else src

def item(it, sc, s0, t_abs):
    """HTML de un elemento. s0 = inicio del plano dentro de la escena; t_abs = inicio absoluto del plano."""
    T = lambda r: None if r is None else sc.t(r) - s0 if isinstance(r, str) else float(r)
    ty = it["type"]; at = T(it.get("at", 0)) or 0.0; out = T(it.get("out"))
    x, y = it.get("x", SW // 2), it.get("y", SH // 2)
    snd = it.get("sound")
    if ty in ("word", "fold") and snd is None: snd = "hit" if it.get("anim") == "slam" else "pop"
    if snd and snd != "none":
        sfx.append((t_abs + at, snd, SND_VOL.get(snd, 0.5)))
        if snd == "hit": shakes.append(t_abs + at)
    if ty == "word":
        st = f"left:{x}px;top:{y}px;font-size:{it.get('size', 90)}px"
        return f'<div class="w {it.get("style", "box")}" style="{st}" data-anim="{it.get("anim", "pop")}" data-in="{at:.2f}"{o(out)} data-rot="{it.get("rot", 0)}">{it["text"]}</div>'
    if ty == "note":
        return f'<div class="w" style="left:{x}px;top:{y}px;font-family:Inter;font-weight:700;font-size:{it.get("size", 34)}px;color:#fff;background:rgba(0,0,0,.6);padding:8px 20px;border-radius:10px" data-anim="fade" data-in="{at:.2f}"{o(out)}>{H.escape(it["text"])}</div>'
    if ty == "actor":
        h = it.get("h", 800); r = T(it.get("react"))
        return (f'<img class="a" src="{P(it["src"])}" style="left:{x}px;top:{y-h}px;height:{h}px" data-anim="{it.get("enter", "pop")}" data-in="{at:.2f}"{o(out)} data-idle="{it.get("idle", "bob")}" data-walk="{it.get("walk", 0)}"'
                + (' data-flip="1"' if it.get("flip") else "") + (f' data-react="{r:.2f}"' if r is not None else "") + ">")
    if ty == "dummy":
        h = it.get("h", 700)
        return f'<svg class="a" viewBox="-270 -280 620 720" style="left:{x}px;top:{y-h}px;height:{h}px;width:{h*620/720:.0f}px" data-anim="{it.get("enter", "pop")}" data-in="{at:.2f}"{o(out)} data-idle="{it.get("idle", "bob")}"><use href="#dm_{it.get("pose", "explain")}"/></svg>'
    if ty == "count":
        fmt = it.get("fmt", "{v}")
        return f'<div class="w big" style="left:{x}px;top:{y}px;font-size:{it.get("size", 170)}px;color:{it.get("color", "#EF4444")}" data-anim="count" data-in="{at:.2f}" data-dur="{it.get("dur", 1.2)}" data-from="{it.get("from", 0)}" data-to="{it["to"]}" data-fmt="{fmt}"{o(out)}>{fmt.replace("{v}", str(it.get("from", 0)))}</div>'
    if ty == "tag":
        return f'<div class="w" style="left:{x}px;top:{y}px;font-family:Anton;font-size:{it.get("size", 110)}px;color:#111;background:#F8F5EC;border:8px solid #111;border-radius:18px;padding:4px 34px;box-shadow:10px 10px 0 #111" data-anim="count" data-in="{at:.2f}" data-dur="{it.get("dur", 2)}" data-from="{it["from"]}" data-to="{it["to"]}" data-fmt="${{v}}"{o(out)} data-rot="-4">${it["from"]}</div>'
    if ty == "chart":
        dr = T(it.get("draw", at)); w, h = it.get("w", 1050), it.get("h", 588)
        return (f'<svg class="ov" style="left:{x}px;top:{y}px" width="{w}" height="{h}" viewBox="0 0 1000 560" data-anim="fade" data-in="{at:.2f}"{o(out)}>'
                '<rect x="0" y="0" width="1000" height="560" rx="28" fill="#0E1630" stroke="#111" stroke-width="10"/>'
                '<g stroke="rgba(255,255,255,.12)" stroke-width="3"><line x1="40" y1="140" x2="960" y2="140"/><line x1="40" y1="280" x2="960" y2="280"/><line x1="40" y1="420" x2="960" y2="420"/></g>'
                f'<polyline pathLength="1" data-anim="draw" data-in="{dr:.2f}" data-dur="{it.get("dur", 1.3)}" fill="none" stroke="{it.get("color", "#EF4444")}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" points="{it["points"]}"/>'
                f'<text x="50" y="80" font-family="Anton" font-size="56" fill="#F8F5EC">{H.escape(it.get("label", ""))}</text></svg>')
    if ty == "pizza":
        s = it.get("size", 640)
        return f'<svg class="ov" style="left:{x}px;top:{y}px" width="{s}" height="{s}" viewBox="0 0 580 580" data-anim="pop" data-in="{at:.2f}"{o(out)} data-idle="{it.get("idle", "spin")}">{PIZZA_SVG}</svg>'
    if ty == "pie":
        s = it.get("size", 720); pull = T(it.get("pull", at + 1))
        return (f'<svg class="ov" style="left:{x}px;top:{y}px" width="{s}" height="{s}" viewBox="-300 -300 600 600" data-anim="pop" data-in="{at:.2f}"{o(out)}>'
                '<circle r="270" fill="#22C55E" stroke="#111" stroke-width="14"/><path d="M0 0 L0 -270 A270 270 0 0 1 225 -150 Z" fill="#3B82F6" stroke="#111" stroke-width="8"/>'
                '<path d="M0 0 L225 -150 A270 270 0 0 1 250 100 Z" fill="#A855F7" stroke="#111" stroke-width="8"/><path d="M0 0 L-260 -70 A270 270 0 0 1 0 -270 Z" fill="#F59E0B" stroke="#111" stroke-width="8"/>'
                f'<g data-anim="slide-out" data-in="{pull:.2f}"><path d="M0 0 L250 100 A270 270 0 0 1 150 225 Z" fill="#EF4444" stroke="#111" stroke-width="10"/><text x="150" y="150" font-family="Anton" font-size="44" fill="#fff" stroke="#111" stroke-width="3" paint-order="stroke">{H.escape(it.get("label", ""))}</text></g></svg>')
    if ty in ("chip", "factory"):
        s = it.get("size", 400); vb = "-200 -200 400 400" if ty == "chip" else "0 0 400 400"
        return f'<svg class="ov" style="left:{x}px;top:{y}px" width="{s}" height="{s}" viewBox="{vb}" data-anim="pop" data-in="{at:.2f}"{o(out)}{" data-idle=\"glow\"" if it.get("glow") else ""}>{CHIP_SVG if ty == "chip" else FACTORY_SVG}</svg>'
    if ty == "face":
        s = it.get("size", 400)
        return f'<svg class="ov" style="left:{x}px;top:{y}px" width="{s}" height="{s}" viewBox="-200 -200 400 400" data-anim="pop" data-in="{at:.2f}"{o(out)}>{FACES[it.get("kind", "happy")]}</svg>'
    if ty == "fold":
        f = T(it["fold"]); st = f'left:{x}px;top:{y}px;font-size:{it.get("size", 300)}px;color:{it.get("color", "#EF4444")}'
        return (f'<div class="w big" style="{st}" data-anim="pop" data-in="{at:.2f}" data-out="{f:.2f}">{it["text"]}</div>'
                f'<div class="w big" style="{st}" data-anim="fold" data-in="{f:.2f}">{it["text"]}</div>')
    if ty == "logo":
        return f'<div class="logo" style="left:{it.get("x", 90)}px;top:{it.get("y", 90)}px" data-anim="slide-l" data-in="{at:.2f}"><i>$</i>BILLION DOLLAR STORIES</div>'
    if ty == "stripes":
        return '<div class="stripe" style="top:0" data-anim="slide-l" data-in="0"></div><div class="stripe" style="bottom:0" data-anim="slide-r" data-in="0"></div>'
    if ty == "disclaimer":
        return f'<div class="w" style="left:{x}px;top:{it.get("y", SH-70)}px;font-family:Inter;font-size:30px;color:#F8F5EC;opacity:.7" data-anim="fade" data-in="{at:.2f}">For education only. Not financial advice.</div>'
    if ty == "subscribe":
        return f'<div class="w sub" style="left:{x}px;top:{y}px" data-anim="pop" data-in="{at:.2f}">▶ SUBSCRIBE</div>'
    if ty == "html":
        return it["html"]
    raise SystemExit(f"Tipo de elemento desconocido: {ty}")

T0 = 0.0
music_marks = []
for si, scn in enumerate(E["scenes"]):
    words = json.load(open(os.path.join(WD, scn["words"])))
    sc = Scene(words)
    d = dur(scn["voice"]); gap = float(scn.get("gap", 0.35))
    voices.append((T0, scn["voice"]))
    end = d + gap if si < len(E["scenes"]) - 1 else d + float(E.get("end_pad", 1.6))
    starts = [sc.t(sh.get("at", 0)) if k else 0.0 for k, sh in enumerate(scn["shots"])]
    for k, sh in enumerate(scn["shots"]):
        s0, s1 = starts[k], (starts[k + 1] if k + 1 < len(starts) else end)
        t_abs = T0 + s0
        body = [item(it, sc, s0, t_abs) for it in sh.get("items", [])]
        bg = sh.get("bg", "NAVY"); kb = sh.get("kb", [1.03, 1.12, 0, 0]); kb = (kb + [0, 0, 0, 0])[:4]
        if bg == "NAVY":
            bgh = f'<div class="bg navy" data-kb="1,1.06,{-120 if not PORT else 0},0"></div>'
        else:
            flt = ";filter:brightness(.55) saturate(.8) hue-rotate(10deg)" if sh.get("night") else ""
            bgh = f'<div class="bg" style="background-image:url({P(bg)}){flt}" data-kb="{kb[0]},{kb[1]},{kb[2]},{kb[3]}"></div>'
        tr = sh.get("tr", "slide-l")
        shots.append(f'<div class="shot" data-t0="{t_abs:.3f}" data-t1="{T0 + s1:.3f}" data-tr="{tr}">{bgh}{"".join(body)}</div>')
        if tr != "none" and not (si == 0 and k == 0): sfx.append((t_abs, "whoosh", 0.3))
        for ref, snd, vol in sh.get("sounds", []):
            ts = t_abs + ((sc.t(ref) - s0) if isinstance(ref, str) else float(ref))
            sfx.append((ts, snd, vol))
            if snd == "hit": shakes.append(ts)
    T0 += end
    music_marks.append(T0)

TOTAL = T0
starts_abs = [0.0] + music_marks[:-1]
music = [[trk, round(starts_abs[min(int(sc_i), len(starts_abs) - 1)], 3)] for trk, sc_i in E.get("music", [["spy", 0]])]
page = open(os.path.join(ROOT, "render_tpl.html")).read()
page = (page.replace("%%W%%", str(SW)).replace("%%H%%", str(SH))
        .replace("%%DEFS%%", open(os.path.join(ROOT, "dummy_defs.svg")).read())
        .replace("%%SHOTS%%", "\n".join(shots)).replace("%%SHAKES%%", json.dumps([round(x, 3) for x in shakes])))
open(os.path.join(WD, "render.html"), "w").write(page)
json.dump({"total": round(TOTAL, 3), "width": SW, "height": SH, "voices": voices, "sfx": sorted(sfx), "music": music}, open(os.path.join(WD, "plan.json"), "w"), indent=1)
print(f"OK {os.path.basename(WD)}: {TOTAL:.1f} s, {len(shots)} planos, {len(sfx)} efectos → render.html + plan.json")
