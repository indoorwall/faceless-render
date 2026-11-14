# Propuesta Frente insólito: el Ejército Fantasma, en formato animado (vertical)
import sys; sys.path.insert(0, "../../tools")
from ep import *
L = lambda n: f"lib/es_ghost_{n}.png"
X = 540
def w(at, t, y, st="box", sz=84, **k): return W(at, t, X, y, st, sz, **k)
def ICON(at, e, x, y, size=180): return HTML(f"<div class='w' style='left:{x}px;top:{y}px;font-size:{size}px;line-height:1' data-anim='pop' data-in='{at}'>{e}</div>")
STAR = HTML("<div class='w' style='left:820px;top:830px;font-size:150px;color:#fff;-webkit-text-stroke:5px #111' data-anim='none' data-in='0'>★</div>")
BRAND = HTML("<div class='w' style='left:540px;top:1580px;font-family:Anton;font-size:46px;color:#F8F5EC;letter-spacing:3px;-webkit-text-stroke:2px #111' data-anim='fade' data-in='0.2'>FRENTE INSÓLITO</div>")
def YEARS(states): return {"type": "calendar", "days": ["1944", "1945", "1996"], "states": states}
KB = [1.0, 1.12, 0]
shots = [
  S(0, L("bikes"), [w(0, "LEVANTARON UN TANQUE…", 300, "box", 80, anim="none"), w(0.3, "¡CON LAS MANOS!", 440, "red", 100, anim="slam")], tr="none", kb=KB, sounds=[[0.3, "hit", 0.6]]),
  S("cuatro", L("lift"), [w("cuatro", "4 SOLDADOS", 1300, "box", 100), w("sherman", "UN TANQUE SHERMAN", 1450, "red", 84, anim="slam")], kb=[1.0, 1.15, 0], sounds=[["manos", "pop", 0.5]]),
  S("uno", L("bikes"), [w("shilston", "ARTHUR SHILSTONE", 280, "box", 80), w("americanos", "«LOS AMERICANOS", 1300, "green", 84), w("fuertes", "SON MUY FUERTES»", 1440, "green", 84, anim="slam")], kb=[1.15, 1.3, 0]),
  S("el", L("pump"), [w("goma", "¡ERA DE GOMA!", 280, "stamp", 140, anim="slam", rot=-6), C("42", 0, 42, "{v} KILOS", X, 1400, 170, "#FFC400", 0.8)], tr="zoom", kb=KB, sounds=[["goma", "hit", 0.8], ["42", "tick", 0.4], ["42+0.4", "tick", 0.4]]),
  S("ellos#1", L("artist"), [w("ejército", "EL EJÉRCITO FANTASMA 👻", 280, "big", 84, anim="slam"), w("1", "1.100 SOLDADOS", 1300, "box", 96), w("artistas", "MUCHOS, ARTISTAS 🎨", 1450, "green", 84)], kb=KB),
  S("su", L("aerial"), [w("inventar", "INVENTAR EJÉRCITOS", 280, "box", 90), w("hinchables", "TANQUES HINCHABLES 🎈", 430, "green", 80, anim="slam"), w("alemanes", "PARA LOS AVIONES NAZIS 👀", 1450, "red", 66)],
    kb=[1.0, 1.2, 0], sounds=[["hinchables", "pop", 0.5]]),
  S("noche", L("speakers"), [w("altavoces", "ALTAVOCES GIGANTES 🔊", 280, "box", 80), C("24", 0, 24, "SE OÍAN A {v} KM", X, 1420, 100, "#FFC400", 0.8)], kb=KB, night=False,
    sounds=[["altavoces", "zoom", 0.5], ["24", "tick", 0.4], ["24+0.4", "tick", 0.4]]),
  S("montaron", "NAVY", [ICON(0.1, "🎭", X, 700, 260), C("20", 0, 20, "+{v} ENGAÑOS", X, 1050, 170, "#EF4444", 1.0)], tr="zoom",
    sounds=[[0.3, "tick", 0.4], [0.6, "tick", 0.4], [0.9, "tick", 0.4], [1.2, "hit", 0.6]]),
  S("en#1", L("rhine"), [YEARS([[0, "1945", {}]]), w("rin", "EL RIN", 300, "box", 110), w("1#1", "1.100 HOMBRES…", 1250, "box", 90, out="30"),
                        C("30", 1, 30, "= {v}.000 SOLDADOS", X, 1250, 90, "#22C55E", 1.0), w("divisiones", "2 DIVISIONES FALSAS", 1420, "red", 80)], kb=[1.0, 1.15, 0]),
  S("cruce", L("rhine"), [w("cruce", "EL CRUCE DE VERDAD:", 300, "box", 84), w("resistencia", "POCA RESISTENCIA ✅", 460, "green", 90, anim="slam")], kb=[1.15, 1.3, 0], sounds=[["resistencia", "score", 0.6]]),
  S("todo", "NAVY", [YEARS([[0, "1945", {}], ["1#2", "1996", {"1996": "SE SABE"}]]), w("secreto", "SECRETO OFICIAL", 700, "stamp", 120, anim="slam", rot=-6), w("1#2", "HASTA 1996", 950, "box", 110)], tr="zoom",
    sounds=[["secreto", "hit", 0.7]]),
  S("los#2", L("lift"), [w(0, "MUY FUERTES…", 1250, "box", 100), w("goma#1", "…Y DE GOMA 🎈", 1420, "red", 110, anim="slam"), BRAND], kb=[1.15, 1.0, 0], sounds=[["goma#1", "pop", 0.6]]),
]
save("episode.json", [SC(1, shots, gap=0.2)], [["spy", 0, None, 0.8], ["none", 0, "el"], ["spy", 0, "ellos#1", 0.8], ["none", 0, "todo"], ["fun", 0, "los#2", 0.9]], orientation="portrait", end_pad=1.2)
