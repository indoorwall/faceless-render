#!/usr/bin/env python3
"""Miniaturas estilo «impacto» (número gigante con grietas sobre banda rasgada + brochazo amarillo + flecha + personajes).
   from thumb import thumb, page ; page([thumb(...), ...]) → HTML; captura cada #id a 1920x1080 y baja a 1280x720 JPG."""
import random
L = "../../lib/"
def _torn(w, h, r):
    pts = []
    for i in range(0, 101, 4): pts.append(f"{i}% {r.uniform(0, 9):.1f}%")
    for i in range(0, 101, 6): pts.append(f"{100 - r.uniform(0, 2.5):.1f}% {i}%")
    for i in range(100, -1, -4): pts.append(f"{i}% {100 - r.uniform(0, 9):.1f}%")
    for i in range(100, -1, -6): pts.append(f"{r.uniform(0, 2.5):.1f}% {i}%")
    return "polygon(" + ",".join(pts) + ")"
def _cracks(w, h, r, n=5):
    out = []
    for _ in range(n):
        x, y = r.uniform(.15, .85) * w, r.uniform(.25, .75) * h; d = [f"M{x:.0f},{y:.0f}"]
        ang = r.uniform(0, 6.28)
        import math
        for _ in range(r.randint(5, 9)):
            ang += r.uniform(-.7, .7); st = r.uniform(14, 34); x += math.cos(ang) * st; y += math.sin(ang) * st; d.append(f"L{x:.0f},{y:.0f}")
        p = " ".join(d)
        out.append(f"<path d='{p}' stroke='rgba(255,255,255,.55)' stroke-width='2' fill='none' transform='translate(2,2)'/><path d='{p}' stroke='#2a2420' stroke-width='{r.uniform(2, 3.4):.1f}' fill='none' stroke-linejoin='bevel'/>")
    return "".join(out)
def thumb(id, bg, big, sub, hero=None, hero_side="left", hero_h=1150, extra=None, banner="#D7191C", big_color="#F4F1EA",
          arrow="down", glow="#ff3b3b", tint="rgba(10,20,45,.35)", big_size=330, sub_size=120, html="", seed=1):
    r = random.Random(seed)
    hx = -60 if hero_side == "left" else 1920 - int(hero_h * 0.62)
    bx = 640 if hero_side == "left" else 120
    h = [f"<div class='t' id='{id}'>",
         f"<div class='bg' style=\"background-image:url('{L}{bg}');filter:brightness(.5) saturate(1.35) contrast(1.1)\"></div>" if bg else "<div class='bg navy'></div>",
         f"<div style='position:absolute;inset:0;background:{tint};mix-blend-mode:multiply'></div>",
         f"<div style='position:absolute;inset:0;background:radial-gradient(45% 55% at {1300 if hero_side=='left' else 620}px 420px,{glow}55,transparent 70%)'></div>"]
    if hero:
        h.append(f"<img src='{L}{hero}' style='position:absolute;left:{hx}px;bottom:-40px;height:{hero_h}px;filter:drop-shadow(0 0 18px rgba(255,255,255,.55)) drop-shadow(0 0 60px {glow}) contrast(1.12) saturate(1.2)'>")
    bw = 1160
    h.append(f"<div style='position:absolute;left:{bx}px;top:200px;width:{bw}px;height:{int(big_size*1.25)}px;transform:rotate(-3deg)'>"
             f"<div style='position:absolute;inset:0;background:linear-gradient(160deg,{banner},#7a0b0d);clip-path:{_torn(bw, 400, r)};box-shadow:0 0 60px {banner}'></div>"
             f"<div style='position:absolute;inset:0;display:grid;place-items:center;font-family:Anton;font-size:{big_size}px;line-height:1;color:{big_color};letter-spacing:4px;"
             f"text-shadow:4px 4px 0 #b9b2a6,8px 8px 0 #8e877c,12px 12px 0 #5b554d,16px 16px 0 #2b2824,22px 26px 30px rgba(0,0,0,.7);-webkit-text-stroke:3px #111'>{big}</div>"
             f"<svg style='position:absolute;inset:0' width='{bw}' height='{int(big_size*1.25)}'>{_cracks(bw, big_size*1.25, r)}</svg></div>")
    if arrow:
        col = "#ff2020"; x0 = bx + int(bw * .62)
        h.append(f"<svg style='position:absolute;left:{x0}px;top:0;overflow:visible' width='10' height='10'><defs><marker id='ah{id}' markerWidth='5' markerHeight='5' refX='2.5' refY='2.5' orient='auto'><path d='M0,0 L5,2.5 L0,5 z' fill='{col}'/></marker></defs>"
                 f"<polyline points='0,{200+int(big_size*1.2)} 110,{300+int(big_size*1.2)} 170,{250+int(big_size*1.2)} 330,{420+int(big_size*1.2)}' fill='none' stroke='{col}' stroke-width='22' stroke-linejoin='round' marker-end='url(#ah{id})' style='filter:drop-shadow(0 0 14px {col})'/></svg>")
    sx = bx + 60; sw = len(sub) * sub_size * .5 + 110
    h.append(f"<div style='position:absolute;left:{sx}px;top:800px;transform:rotate(-2deg)'>"
             f"<svg style='position:absolute;left:-50px;top:-30px;overflow:visible' width='10' height='10'><path d='M0,40 C{sw*.2:.0f},0 {sw*.6:.0f},10 {sw:.0f},20 L{sw+20:.0f},{sub_size+40} C{sw*.65:.0f},{sub_size+62} {sw*.3:.0f},{sub_size+58} 10,{sub_size+64} Z' fill='#FFD60A' style='filter:drop-shadow(8px 10px 0 rgba(0,0,0,.45))'/></svg>"
             f"<div style='position:relative;font-family:Anton;font-style:italic;font-size:{sub_size}px;color:#111;white-space:nowrap;letter-spacing:2px'>{sub}</div>"
             f"<svg style='position:absolute;left:{sw*.35:.0f}px;top:{sub_size+12}px;overflow:visible' width='10' height='10'><path d='M0,10 C{sw*.15:.0f},0 {sw*.3:.0f},0 {sw*.45:.0f},8' stroke='#E11D1D' stroke-width='14' fill='none' stroke-linecap='round'/></svg></div>")
    if extra:
        src, ex_h = extra
        ex_x = 1920 - int(ex_h * .62) if hero_side == "left" else 20
        h.append(f"<img src='{L}{src}' style='position:absolute;left:{ex_x}px;bottom:-30px;height:{ex_h}px;filter:drop-shadow(0 0 14px rgba(255,255,255,.5)) drop-shadow(10px 14px 0 rgba(0,0,0,.4))'>")
    h.append(html)
    h.append("<div style='position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.6));pointer-events:none'></div></div>")
    return "".join(h)
def page(thumbs):
    return ("<!doctype html><html><head><meta charset='utf-8'><link href='https://fonts.googleapis.com/css2?family=Anton&display=swap' rel='stylesheet'><style>"
            "*{margin:0;box-sizing:border-box}body{background:#000}.t{width:1920px;height:1080px;position:relative;overflow:hidden}"
            ".bg{position:absolute;inset:0;background-size:cover;background-position:center}"
            ".navy{background:radial-gradient(120% 90% at 30% 20%,#1d2b57,#0E1630)}</style></head><body>" + "".join(thumbs) + "</body></html>")
