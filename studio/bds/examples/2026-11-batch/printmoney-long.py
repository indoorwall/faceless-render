import sys; sys.path.insert(0, "../../tools")
from ep import *
PP, GR, CB, BK, WR, LR, CH = "lib/bg_printing_press.png", "lib/bg_grocery.png", "lib/bg_central_bank.png", "lib/bg_bakery.png", "lib/bg_wallpaper_room.png", "lib/bg_living_room.png", "lib/bg_pizza_chef.png"
def NOTE(at=0, x=960, y=430, w=1100, label="100 TRILLION DOLLARS"):
    return HTML(f"<div class='w' style='left:{x}px;top:{y}px;width:{w}px;height:{int(w*0.44)}px;background:linear-gradient(135deg,#d9efcf,#93c88c);border:10px solid #111;border-radius:26px;box-shadow:12px 12px 0 #111;font-family:Anton;color:#14532D;white-space:normal' data-anim='{"none" if str(at)=="0" else "pop"}' data-in='{at}'>"
                f"<div style='position:absolute;left:40px;top:28px;font-size:{int(w*0.07)}px'>100 000 000 000 000</div><div style='position:absolute;left:40px;bottom:30px;font-size:{int(w*0.08)}px'>{label}</div>"
                f"<div style='position:absolute;right:40px;top:50%;transform:translateY(-50%);width:{int(w*0.22)}px;height:{int(w*0.22)}px;border-radius:50%;border:8px solid #14532D;opacity:.5'></div></div>")
def BOARD(): return HTML("<div class='w' style='left:960px;top:335px;width:1000px;height:340px;background:#1f2a24;border:12px solid #6b4423;border-radius:12px;box-shadow:8px 8px 0 #111' data-anim='none' data-in='0'></div>")
# Zimbabwe/imprimir dinero V2: dinamismo Nvidia V5 (calendario de años, gráfica real de M2, contadores con sonido, personajes que reaccionan, Pizza Math en 5 planos)
TR, SPK, BAG = "lib/cut_trader_panic.png", "lib/cut_spokesperson.png", "lib/cut_moneybag.png"
def ICON(at, emoji, x, y, size=200, anim="pop"): return HTML(f"<div class='w' style='left:{x}px;top:{y}px;font-size:{size}px;line-height:1' data-anim='{anim}' data-in='{at}'>{emoji}</div>")
def YEARS(states, days): return {"type": "calendar", "days": list(days), "states": states}
def TAG(at, frm, to, x=520, y=600, dur=0.6, out=None): return {"type": "tag", "at": at, "from": frm, "to": to, "x": x, "y": y, "dur": dur, **({"out": out} if out else {})}
def BAR(at, x, h, color, label, val):
    return HTML(f"<div class='w' style='left:{x}px;top:{900-h//2}px;width:240px;height:{h}px;background:{color};border:8px solid #111;border-radius:14px;box-shadow:10px 10px 0 #111' data-anim='pop' data-in='{at}'></div>"
                f"<div class='w' style='left:{x}px;top:{900-h-60}px;font-family:Anton;font-size:64px;color:#F8F5EC' data-anim='pop' data-in='{at}'>{val}</div>"
                f"<div class='w' style='left:{x}px;top:960px;font-family:Inter;font-weight:900;font-size:30px;color:#F8F5EC' data-anim='fade' data-in='{at}'>{label}</div>")
ZEROS = HTML("".join(f"<div class='w' style='left:{300 + i * 95}px;top:470px;font-family:Anton;font-size:150px;color:{'#FFC400' if i == 0 else '#F8F5EC'};-webkit-text-stroke:4px #111' data-anim='pop' data-in='{0.1 if i == 0 else round(0.5 + 0.09 * i, 2)}'>{'1' if i == 0 else '0'}</div>" for i in range(15)))
Z = ("2008", "2009"); G = ("1922", "1923"); US = ("2020", "2021", "2022")
CTA2 = S("if", "lib/bg_vault.png", [D("thumbs", 360, 1040, 700, 0, "left"), {"type": "subscribe", "x": 1300, "y": 300, "at": "subscribe", "sound": "pop"},
      HTML("<div class='w' style='left:1300px;top:480px;font-family:Anton;font-size:64px;color:#F8F5EC' data-anim='fade' data-in='3.8'><span style='color:#FFC400'>$</span> WE MAKE MONEY MAKE SENSE</div>"),
      {"type": "disclaimer", "at": 0.4, "x": 1300, "y": 1010}], kb=[1.0, 1.1, 0])
sc = [
 SC(1, [S(0, "NAVY", [YEARS([[0, "2009", {}]], Z), NOTE("0", 820, 470, 1000), W(0, "ZIMBABWE, 2009", 820, 170, "box", 80, anim="none"), A(TR, 1660, 1080, 640, 0, "pop", "shake", react="trillion")],
          tr="none", sounds=[[0, "pop", 0.5], ["trillion", "hit", 0.7]]),
        S("thats", "NAVY", [ZEROS, W("zeroes", "A 1 WITH 14 ZEROS", 960, 760, "box", 100)], tr="zoom",
          sounds=[[0.6 + 0.18 * i, "tick", 0.35] for i in range(7)]),
        S("and", "NAVY", [NOTE(0, 820, 420, 900), W("30", "≈ $30", 1500, 660, "red", 200, anim="slam", rot=-6), N("according", "black-market value — according to Reuters", 820, 900, 38),
                          D("shock", 1720, 1060, 420, "30", "up", "shake")], tr="zoom", sounds=[["30", "hit", 0.7]])]),
 SC(2, [S(0, "NAVY", [W(0.1, "THE QUESTION EVERYONE ASKS", 960, 400, "box", 100), D("explain", 1650, 1060, 560, 0.3, "right")], tr="zoom"),
        S("if", PP, [W("print", "PRINT MONEY…", 760, 220, "box", 110), W("mountain", "…A MOUNTAIN OF IT", 760, 400, "red", 100, anim="slam"), W("rich", "= EVERYONE RICH? 🤑", 760, 580, "green", 96)], kb=[1.0, 1.15, 0],
          sounds=[["mountain", "hit", 0.6]]),
        S("zimbabwe", "NAVY", [W("zimbabwe", "ZIMBABWE TRIED.", 760, 360, "red", 120, anim="slam"), W("germany", "SO DID GERMANY.", 760, 600, "box", 120, anim="slam"), A(TR, 1650, 1080, 600, "germany", "up", "shake")], tr="zoom")]),
 SC(3, [S(0, "NAVY", [{"type": "scan", "at": 0}, C(0.2, 2026, 1923, "◀◀ {v}", 960, 460, 300, "#FFC400", 1.6), N("germany", "Germany", 960, 680, 50)], tr="zoom",
          sounds=[[0.3, "tick", 0.4], [0.7, "tick", 0.4], [1.1, "tick", 0.4], [1.6, "hit", 0.6]]),
        S("after", "NAVY", [YEARS([[0, "1922", {}]], G), W("huge", "HUGE WAR PAYMENTS 💸", 960, 340, "box", 100, out="then"), W("then", "TROOPS OCCUPY THE RUHR", 960, 340, "red", 100, anim="slam"),
                            N("then", "French and Belgian troops, 1923", 960, 470, 40), ICON("troops", "🪖", 960, 720, 200)], tr="slide-l", sounds=[["troops", "pop", 0.5]]),
        S("workers", PP, [W("strike", "WORKERS ON STRIKE ✊", 760, 220, "box", 96), W("printing", "PAID WITH… PRINTED MONEY", 760, 400, "red", 90, anim="slam")], kb=[1.0, 1.2, 0])]),
 SC(4, [S(0, BK, [YEARS([[0, "1922", {}], ["by", "1923", {}]], G), BOARD(), C("160", 160, 160, "{v} MARKS", 960, 330, 110, "#F8F5EC", 0.1, out="200"), C("200", 0, 200, "{v} BILLION MARKS", 960, 330, 100, "#F8F5EC", 1.2),
                  N(0.2, "a loaf of bread in Berlin — according to historians", 960, 1000, 32)], kb=[1.0, 1.08, 0], tr="slide-l", sounds=[["160", "pop", 0.5], ["200", "error", 0.6]]),
        S("by#1", "NAVY", [W("november", "NOV 1923", 960, 200, "box", 90), W("american", "$1 =", 600, 460, "big", 180), C("four", 0, 4, "{v} TRILLION MARKS", 1250, 460, 110, "#EF4444", 0.8),
                           A(TR, 1650, 1080, 520, "trillion", "up", "shake")], tr="zoom", sounds=[["four", "tick", 0.4], ["trillion", "hit", 0.7]]),
        S("paper", WR, [W("wallpaper", "MONEY AS WALLPAPER", 960, 200, "box", 110, anim="slam")], kb=[1.0, 1.15, 0])]),
 SC(5, [S(0, "NAVY", [W(0.1, "NOW: ZIMBABWE · 2000s", 960, 420, "box", 110), ICON(0.3, "🇿🇼", 960, 650, 180)], tr="zoom"),
        S("land", GR, [W("land", "LAND REFORM → FARMS HURT", 960, 220, "box", 80), W("less", "LESS FOOD 🌽", 960, 400, "red", 130, anim="slam")], kb=[1.0, 1.15, 0]),
        S("at", PP, [W("printed", "MORE MONEY 💵", 760, 240, "green", 130, anim="slam"), N("war", "to pay for a war in Congo and bigger salaries", 760, 380, 36)], kb=[1.0, 1.15, 0]),
        S("less#1", "NAVY", [W("less#1", "LESS STUFF", 560, 360, "red", 110), ICON("less#1", "🌽", 560, 600, 120), W("more", "MORE MONEY", 1360, 360, "green", 110), ICON("more", "💵💵💵", 1360, 600, 160),
                             W("guess", "= ?", 960, 820, "big", 170, anim="slam")], sounds=[["guess", "hit", 0.6]])]),
 SC(6, [S(0, "NAVY", [YEARS([[0, "2009", {}]], Z), W(0, "JANUARY 2009", 960, 140, "box", 70, out="doubling"), TAG(0.2, 1, 1, 960, 640, 0.1, out="doubling"), W("doubling", "PRICES DOUBLING EVERY DAY", 960, 260, "red", 96, anim="slam"), N("according", "— according to Reuters", 960, 380, 36),
                      TAG("doubling", 1, 2, 960, 640, 0.4, out="every"), TAG("every", 2, 4, 960, 640, 0.4, out="day"), TAG("day", 4, 8, 960, 640, 0.4)], tr="zoom",
          sounds=[["doubling", "error", 0.4], ["every", "error", 0.4], ["day", "error", 0.5]]),
        S("people", GR, [A(TR, 1500, 1080, 760, 0, "right", "walk", walk=-200), W("hours", "HOURS IN LINE ⏳", 640, 240, "box", 100), N("barely", "for barely enough to buy bread", 640, 360, 36)], kb=[1.0, 1.12, 0]),
        S("the", "NAVY", [NOTE(0, 960, 420, 1000), ICON("chopping", "✂️", 1600, 300, 160), W("3", "−3 ZEROS", 960, 860, "box", 90, out="10"), W("10", "−10 ZEROS", 960, 860, "box", 90, out="12"), W("12", "−12 MORE", 960, 860, "red", 90)],
          tr="slide-l", sounds=[["3", "pop", 0.5], ["10", "pop", 0.5], ["12", "pop", 0.5]]),
        S("in#1", "NAVY", [YEARS([[0, "2009", {"2009": "USD"}]], Z), W("april", "APRIL 2009", 960, 300, "box", 100), W("switched", "SWITCH TO U.S. DOLLARS 💵", 960, 500, "green", 90, anim="slam"),
                           D("shock", 1700, 1060, 440, 0.2, "up", "shake")], tr="zoom")]),
 SC(7, [S(0, CH, [BADGE(), W(0.1, "PIZZA MATH TIME!", 960, 860, "box", 110, anim="slam"), N("simplified", "a super simplified example, not a real economy", 960, 980, 34)], kb=[1.0, 1.15, 0], sounds=[[0, "pop", 0.5]]),
        S("picture", "NAVY", [BADGE(), PIZZA(1060, 230, 560, 0, idle="none"), W("10", "10 PIZZAS · $10", 520, 340, "box", 90), TAG("costs", 1, 1, dur=0.1), D("explain", 400, 1060, 380, 0.2, "left")],
          sounds=[["costs", "pop", 0.5]]),
        S("now", "NAVY", [BADGE(), PIZZA(1060, 230, 560, 0, idle="none"), A(SPK, 420, 1080, 560, 0, "left", "bob"), W("mayor", "THE MAYOR PRINTS +$10 💵", 560, 300, "red", 76, anim="slam"),
                          W("still", "STILL 10 PIZZAS", 560, 460, "box", 80)], sounds=[["prints", "pop", 0.5]]),
        S("everyone", "NAVY", [BADGE(), PIZZA(1060, 230, 560, 0, idle="none"), W("wants", "EVERYONE WANTS PIZZA", 520, 340, "box", 80), TAG(0, 1, 1, dur=0.1, out="2"), TAG("2", 1, 2),
                               D("shock", 400, 1060, 360, "climbs", "up", "shake")], sounds=[["2", "error", 0.6]]),
        S("nobody", "NAVY", [W("nobody", "NOBODY GOT RICHER", 960, 340, "box", 110), W("smaller", "EACH DOLLAR GOT SMALLER 📉", 960, 560, "red", 90, anim="slam"),
                             {"type": "face", "kind": "scared", "x": 1550, "y": 620, "size": 300, "at": "smaller"}], tr="zoom")]),
 SC(8, [S(0, "NAVY", [BADGE(), W(0.1, "THE PART PEOPLE FORGET", 960, 420, "box", 110), D("thumbs", 1650, 1060, 520, 0.3, "right")], tr="zoom"),
        S("if", "NAVY", [BADGE(), PIZZA(1060, 230, 560, 0, idle="none"), W("bakes", "+10 PIZZAS 🍕", 520, 340, "green", 100, anim="slam"), TAG(0, 2, 2, dur=0.1, out="one"), TAG("one", 2, 1)],
          sounds=[["one", "score", 0.6]]),
        S("prices", "NAVY", [ICON(0.1, "⚖️", 960, 520, 260), W("money", "MONEY 💵", 480, 400, "green", 110), W("stuff", "STUFF 🍕", 1440, 400, "box", 110), W("economy", "PRICE = MONEY vs. STUFF", 960, 820, "box", 90)],
          tr="slide-l"),
        S("zimbabwe", "NAVY", [W("both", "ZIMBABWE: HIT FROM BOTH SIDES", 960, 220, "red", 80), W("more#1", "MORE MONEY ↑", 600, 480, "green", 100, anim="slam"), W("fewer", "FEWER PIZZAS ↓", 1320, 480, "red", 100, anim="slam"),
                               D("shock", 960, 1060, 400, "fewer", "up", "shake")], tr="zoom")]),
 SC(9, [S(0, "NAVY", [W(0, "NOW: AMERICA 🇺🇸", 960, 420, "box", 130, anim="slam")], tr="zoom"),
        S("the", LR, [YEARS([[0, "2020", {}], ["march", "2021", {}]], US), W("stimulus", "STIMULUS CHECKS ✉️", 960, 220, "green", 100), W("1", "$1,200", 520, 440, "box", 90), W("600", "$600", 960, 440, "box", 90),
                      W("400", "$1,400", 1400, 440, "box", 90), N("person", "per person", 960, 560, 40)], kb=[1.0, 1.12, 0], sounds=[["1", "pop", 0.5], ["600", "pop", 0.5], ["400", "pop", 0.5]]),
        S("federal", "NAVY", [{"type": "chart", "x": 90, "y": 230, "w": 1050, "h": 588, "at": 0, "draw": "15", "label": "U.S. MONEY SUPPLY (M2)", "points": "50,472 160,333 470,266 950,138", "dur": 5.0, "color": "#22C55E"},
                              W("15", "$15.5T", 1450, 600, "box", 100), N("february", "Feb 2020", 1450, 710, 36, out="21"), W("21", "$21.5T", 1450, 330, "green", 110, anim="slam"), N("end", "end of 2021", 1450, 440, 36),
                              N("federal", "Federal Reserve data", 600, 900, 34)], sounds=[["21", "score", 0.6]]),
        S("by", "NAVY", [C(0.1, 0, 40, "≈ +{v}%", 960, 400, 260, "#22C55E", 1.4), W("years", "MORE MONEY IN UNDER 2 YEARS", 960, 640, "box", 84), N("our", "our math", 960, 760, 36)], tr="zoom",
          sounds=[[0.4, "tick", 0.4], [0.9, "tick", 0.4], [1.5, "hit", 0.6]])]),
 SC(10, [S(0, "NAVY", [BADGE(), PIZZA(1060, 230, 560, 0, idle="none"), ICON("stuck", "🚧", 1340, 520, 220), W("stuck", "THE PIZZAS GOT STUCK", 520, 340, "red", 84, anim="slam")], sounds=[["stuck", "error", 0.5]]),
         S("the#1", GR, [W("supply", "SUPPLY CHAINS TANGLED", 960, 220, "red", 100), W("energy", "ENERGY PRICES ↑", 960, 400, "red", 100, anim="slam")], kb=[1.0, 1.15, 0]),
         S("in", "NAVY", [YEARS([[0, "2022", {}]], US), W(0.1, "JUNE 2022 · PRICES:", 760, 200, "box", 80), C(0.3, 0, 8, "+{v}%…", 760, 420, 200, "#FFC400", 3.5, out="9"), W("9", "9.1%", 760, 420, "big", 300, anim="slam"), N("bureau", "prices vs. a year earlier, June 2022 — Bureau of Labor Statistics", 760, 640, 32),
                          W("biggest", "BIGGEST SINCE 1981", 760, 780, "box", 80), D("shock", 1650, 1060, 560, "9", "up", "shake")], tr="zoom", sounds=[["9", "hit", 0.7]]),
         S("gasoline", GR, [C("60", 0, 60, "⛽ GAS ≈ +{v}%", 960, 300, 140, "#EF4444", 0.8)], kb=[1.1, 1.0, 0], sounds=[["60", "error", 0.5]]),
         S("one", "NAVY", [N(0, "one San Francisco Fed study", 960, 200, 40), BAR("half", 640, 520, "#F59E0B", "SUPPLY PROBLEMS", "≈ 1/2"), BAR("third", 1280, 350, "#38BDF8", "DEMAND", "≈ 1/3")], tr="slide-l",
           sounds=[["half", "pop", 0.5], ["third", "pop", 0.5]])]),
 SC(11, [S(0, "NAVY", [W("twist", "THE TWIST:", 960, 300, "box", 110), W("america", "AMERICA ≠ ZIMBABWE", 960, 520, "big", 140, anim="slam")], tr="zoom"),
         S("9", "NAVY", [W(0, "9% HURT", 700, 340, "red", 120), {"type": "face", "kind": "scared", "x": 1450, "y": 300, "size": 380, "at": 0.1, "out": "doubling"},
                         {"type": "face", "kind": "happy", "x": 1450, "y": 300, "size": 380, "at": "doubling"}, W("doubling", "BUT NOT DOUBLING EVERY DAY", 700, 560, "green", 76, anim="slam")], tr="slide-l"),
         S("in", CB, [YEARS([[0, "2022", {}]], US), A(SPK, 1500, 1080, 820, 0, "up", "bob"), W("march", "MARCH 2022", 680, 260, "box", 100), W("raising", "INTEREST RATES ⬆", 680, 440, "red", 100, anim="slam"),
                      N("cool", "to cool things down", 680, 560, 36)], kb=[1.0, 1.12, 0]),
         S("and", "NAVY", [W("never", "GOAL ≠ ZERO INFLATION", 960, 220, "box", 90), C("2", 0, 2, "≈ {v}% A YEAR", 960, 440, 170, "#22C55E", 0.6), W("low", "LOW AND STEADY", 960, 640, "green", 96),
                           N("families", "so families can plan ahead", 960, 760, 38), D("thumbs", 1700, 1060, 460, "low", "up", "bob")], tr="zoom", sounds=[["2", "score", 0.5]])]),
 SC(12, [S(0, "NAVY", [W(0, "SO WHY NOT JUST PRINT MORE?", 960, 440, "red", 100, anim="slam")], tr="zoom"),
         S("because", "NAVY", [W(0, "BECAUSE…", 760, 160, "box", 80), W("wealth", "MONEY ≠ WEALTH", 760, 360, "box", 120, anim="slam"), W("pizzas", "PIZZAS ARE. 🍕", 760, 580, "green", 120, anim="slam"), PIZZA(1300, 300, 480, "pizzas", idle="spin")], tr="slide-l"),
         S("print#1", PP, [W("without", "PRINT WITHOUT MAKING STUFF", 760, 240, "box", 80), W("nobody", "= NOBODY GETS RICHER", 760, 420, "red", 90, anim="slam")], kb=[1.0, 1.15, 0]),
         S("every", "NAVY", [NOTE(0, 820, 420, 900), W("30", "≈ $30", 1500, 660, "red", 200, anim="slam", rot=-6), D("shock", 1720, 1060, 420, "30", "up", "shake")], tr="zoom", sounds=[["30", "hit", 0.7]]),
         CTA2]),
]
music = [["spy", 0, None, 1.0], ["none", 1, "zimbabwe-0.5"], ["spy", 2, None, 1.0], ["fun", 6, None, 0.8], ["none", 8, 0], ["spy", 8, "the", 1.0], ["none", 10, 0], ["fun", 10, "9", 0.9],
         ["none", 11, "because-0.3"], ["fun", 11, "pizzas", 1.0]]
save("episode.json", sc, music)
