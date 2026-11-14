import sys; sys.path.insert(0, "../../tools")
from ep import *
PP, GR, CB, BK, WR, LR, CH = "lib/bg_printing_press.png", "lib/bg_grocery.png", "lib/bg_central_bank.png", "lib/bg_bakery.png", "lib/bg_wallpaper_room.png", "lib/bg_living_room.png", "lib/bg_pizza_chef.png"
def NOTE(at=0, x=960, y=430, w=1100, label="100 TRILLION DOLLARS"):
    return HTML(f"<div class='w' style='left:{x}px;top:{y}px;width:{w}px;height:{int(w*0.44)}px;background:linear-gradient(135deg,#d9efcf,#93c88c);border:10px solid #111;border-radius:26px;box-shadow:12px 12px 0 #111;font-family:Anton;color:#14532D;white-space:normal' data-anim='{"none" if str(at)=="0" else "pop"}' data-in='{at}'>"
                f"<div style='position:absolute;left:40px;top:28px;font-size:{int(w*0.07)}px'>100 000 000 000 000</div><div style='position:absolute;left:40px;bottom:30px;font-size:{int(w*0.08)}px'>{label}</div>"
                f"<div style='position:absolute;right:40px;top:50%;transform:translateY(-50%);width:{int(w*0.22)}px;height:{int(w*0.22)}px;border-radius:50%;border:8px solid #14532D;opacity:.5'></div></div>")
def BOARD(): return HTML("<div class='w' style='left:960px;top:335px;width:1000px;height:340px;background:#1f2a24;border:12px solid #6b4423;border-radius:12px;box-shadow:8px 8px 0 #111' data-anim='none' data-in='0'></div>")
CTA = S("if", "lib/bg_vault.png", [D("thumbs", 360, 1040, 700, 0, "left"), {"type": "subscribe", "x": 1300, "y": 300, "at": "subscribe", "sound": "pop"},
      HTML("<div class='w' style='left:1300px;top:480px;font-family:Anton;font-size:64px;color:#F8F5EC' data-anim='fade' data-in='3.8'><span style='color:#FFC400'>$</span> WE MAKE MONEY MAKE SENSE</div>"),
      {"type": "disclaimer", "at": 0.4, "x": 1300, "y": 1010}], kb=[1.0, 1.1, 0])
sc = [
 SC(1, [S(0, "NAVY", [NOTE("0"), W(0, "ZIMBABWE, 2009", 960, 140, "box", 80, anim="none")], tr="none", sounds=[[0, "pop", 0.5]]),
        S("thats", "NAVY", [W("one", "A 1 WITH 14 ZEROS", 960, 460, "big", 150, anim="slam")], tr="zoom"),
        S("and", "NAVY", [NOTE(0, 820, 400, 900), W("30", "≈ $30", 1500, 640, "red", 200, anim="slam", rot=-6), N("according", "black-market value — according to Reuters", 960, 900, 38)], tr="zoom")]),
 SC(2, [S(0, PP, [W("why", "WHY NOT PRINT A MOUNTAIN OF IT?", 960, 200, "box", 84)], kb=[1.0, 1.15, 0]),
        S("zimbabwe", "NAVY", [W("zimbabwe", "ZIMBABWE TRIED.", 960, 380, "red", 120, anim="slam"), W("germany", "SO DID GERMANY.", 960, 600, "box", 120, anim="slam")], tr="zoom")]),
 SC(3, [S(0, "NAVY", [{"type": "scan", "at": 0}, C(0.2, 2026, 1923, "{v}", 960, 460, 300, "#FFC400", 1.6)], tr="zoom",
          sounds=[[0.3, "tick", 0.4], [0.7, "tick", 0.4], [1.1, "tick", 0.4], [1.6, "hit", 0.6]]),
        S("after", "NAVY", [W("huge", "HUGE WAR PAYMENTS", 960, 340, "box", 100, out="then"), W("then", "TROOPS OCCUPY THE RUHR", 960, 340, "red", 100), N("then", "French and Belgian troops, 1923", 960, 470, 40)], tr="slide-l"),
        S("workers", PP, [W("printing", "PAY STRIKERS = PRINT MONEY", 960, 200, "red", 90)], kb=[1.0, 1.2, 0])]),
 SC(4, [S(0, BK, [BOARD(), C("160", 160, 160, "{v} MARKS", 960, 330, 110, "#F8F5EC", 0.1, out="200"), C("200", 0, 200, "{v} BILLION MARKS", 960, 330, 100, "#F8F5EC", 1.2),
                  N("historians", "price of a loaf of bread in Berlin — according to historians", 960, 1000, 32), N("1922", "end of 1922", 960, 450, 40, out="by"), N("by", "late 1923", 960, 450, 40)],
          kb=[1.0, 1.08, 0], sounds=[["200", "error", 0.6]]),
        S("by#1", "NAVY", [W("four", "$1 = 4 TRILLION MARKS", 960, 460, "red", 110, anim="slam")], tr="zoom"),
        S("paper", WR, [W("wallpaper", "MONEY AS WALLPAPER", 960, 200, "box", 110)], kb=[1.0, 1.15, 0])]),
 SC(5, [S(0, GR, [W("less", "LESS FOOD", 960, 240, "red", 140, anim="slam")], kb=[1.0, 1.15, 0]),
        S("at", PP, [W("printed", "MORE MONEY", 960, 240, "green", 140, anim="slam"), N("war", "to pay for a war in Congo and higher salaries", 960, 380, 36)], kb=[1.0, 1.15, 0]),
        S("less#1", "NAVY", [W("less#1", "LESS STUFF", 600, 420, "red", 110), W("more", "MORE MONEY", 1320, 420, "green", 110), W("guess", "= ?", 960, 680, "big", 160, anim="slam")])]),
 SC(6, [S(0, "NAVY", [W("doubling", "PRICES DOUBLING EVERY DAY", 960, 380, "red", 100, anim="slam"), N("according", "— according to Reuters", 960, 510, 38),
                      W("people", "HOURS IN LINE FOR BREAD MONEY", 960, 700, "box", 70)], tr="zoom"),
        S("the", "NAVY", [NOTE(0, 960, 420, 1000), W("3", "−3 ZEROS", 960, 860, "box", 90, out="10"), W("10", "−10 ZEROS", 960, 860, "box", 90, out="12"), W("12", "−12 MORE", 960, 860, "red", 90)], tr="slide-l",
          sounds=[["3", "pop", 0.5], ["10", "pop", 0.5], ["12", "pop", 0.5]]),
        S("in#1", "NAVY", [W("april", "APRIL 2009: SWITCH TO US DOLLARS", 960, 460, "green", 84, anim="slam")], tr="zoom")]),
 SC(7, [S(0, CH, [BADGE(), N("simplified", "a super simplified example, not a real economy", 960, 960, 40)], kb=[1.0, 1.15, 0], sounds=[[0, "pop", 0.5]]),
        S("picture", "NAVY", [BADGE(), PIZZA(1060, 230, 560, 0, idle="none"), W("10", "10 PIZZAS · $10", 520, 340, "box", 90, out="now"),
                              {"type": "tag", "at": "costs", "from": 1, "to": 1, "x": 520, "y": 560, "dur": 0.1, "out": "2"}, W("now", "MAYOR PRINTS +$10", 520, 340, "red", 90),
                              {"type": "tag", "at": "2", "from": 1, "to": 2, "x": 520, "y": 560, "dur": 0.6}, W("nobody", "NOBODY GOT RICHER", 520, 800, "box", 76)],
          sounds=[["2", "error", 0.6]])]),
 SC(8, [S(0, "NAVY", [BADGE(), PIZZA(1060, 230, 560, 0, idle="none"), W("bakes", "+10 PIZZAS → $1 AGAIN", 520, 340, "green", 80, out="prices"), {"type": "tag", "at": "one", "from": 2, "to": 1, "x": 520, "y": 560, "dur": 0.6},
                      W("prices", "PRICE = MONEY vs. STUFF", 520, 340, "box", 80, out="zimbabwe"), W("zimbabwe", "ZIMBABWE: BOTH WRONG", 520, 340, "red", 80)], sounds=[["one", "score", 0.5]])]),
 SC(9, [S(0, LR, [W("checks", "STIMULUS CHECKS", 960, 180, "green", 110), N("1", "$1,200 · then $600 · then $1,400 per person", 960, 300, 40)], kb=[1.0, 1.12, 0]),
        S("federal", CB, [W("15", "$15.5T", 560, 260, "box", 120), N("february", "Feb 2020", 560, 380, 36), W("21", "$21.5T", 1360, 260, "red", 120), N("end", "end of 2021", 1360, 380, 36),
                          W("40", "≈ +40% MONEY", 960, 620, "big", 130, anim="slam"), N("our", "money supply, Federal Reserve data · % is our math", 960, 760, 34)], kb=[1.0, 1.1, 0])]),
 SC(10, [S(0, GR, [W("supply", "SUPPLY CHAINS TANGLED", 960, 200, "red", 100)], kb=[1.0, 1.15, 0]),
         S("in", "NAVY", [W("9", "9.1%", 960, 400, "big", 300, anim="slam"), N("bureau", "prices vs. a year earlier, June 2022 — Bureau of Labor Statistics", 960, 640, 34), W("biggest", "BIGGEST SINCE 1981", 960, 780, "box", 80)], tr="zoom"),
         S("gasoline", GR, [W("gasoline", "GAS ≈ +60%", 960, 220, "red", 130, anim="slam", out="one"), W("one", "SUPPLY ≈ HALF · DEMAND ≈ A THIRD", 960, 220, "box", 76), N("one", "one San Francisco Fed study", 960, 340, 36)], kb=[1.1, 1.0, 0])]),
 SC(11, [S(0, CB, [W("america", "AMERICA ≠ ZIMBABWE", 960, 200, "box", 110, out="in"), W("in", "MARCH 2022: RATES UP", 960, 200, "red", 100, out="the#2"), W("the#2", "TARGET: ≈ 2% A YEAR", 960, 200, "green", 110)], kb=[1.0, 1.12, 0]),
         S("low", "NAVY", [D("thumbs", 380, 1060, 700, 0, "left"), W("low", "LOW AND STEADY", 1250, 420, "box", 100), N("families", "so families can plan ahead", 1250, 540, 40)])]),
 SC(12, [S(0, "NAVY", [W("because", "MONEY ≠ WEALTH", 960, 380, "box", 130, anim="slam"), W("pizzas", "PIZZAS ARE.", 960, 620, "green", 120, anim="slam")], tr="zoom"),
         S("print#1", "NAVY", [NOTE(0, 820, 400, 900), W("30", "≈ $30", 1500, 640, "red", 200, anim="slam", rot=-6)], tr="zoom"),
         CTA]),
]
music = [["spy", 0], ["none", 1, "zimbabwe"], ["spy", 2, None], ["fun", 6, None, 0.8], ["spy", 8], ["fun", 10]]
save("episode.json", sc, music)
