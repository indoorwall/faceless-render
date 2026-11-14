# Binance V2: mismo dinamismo que Nvidia V5 (calendario, personajes que reaccionan, contadores con sonido, silencios, Coin Check Math animada)
import sys; sys.path.insert(0, "../../tools")
from ep import *
SR, EX, CC, VA, BR = "lib/bg_server_room.png", "lib/bg_crypto_exchange.png", "lib/bg_coat_check.png", "lib/bg_vault.png", "lib/bg_boardroom.png"
HK, SP, BAG, TR, EW = "lib/cut_hacker.png", "lib/cut_spokesperson.png", "lib/cut_moneybag.png", "lib/cut_trader_panic.png", "lib/cut_exec_woman.png"
COIN = BADGE("🧥 COIN CHECK MATH")
def BOX(at, html, x, y, anim="pop"): return HTML(f"<div class='w' style='left:{x}px;top:{y}px' data-anim='{anim}' data-in='{at}'>{html}</div>")
def TICKET(at, x=1500, y=520, s=1.0): return HTML(f"<div class='w' style='left:{x}px;top:{y}px;width:{int(300*s)}px;height:{int(170*s)}px;background:#FFC400;border:8px solid #111;border-radius:18px;box-shadow:10px 10px 0 #111;font-family:Anton;font-size:{int(70*s)}px;color:#111;display:grid;place-items:center' data-anim='pop' data-in='{at}'>🎟 #13</div>")
def ICON(at, emoji, x, y, size=220, anim="pop"): return HTML(f"<div class='w' style='left:{x}px;top:{y}px;font-size:{size}px;line-height:1' data-anim='{anim}' data-in='{at}'>{emoji}</div>")
def BAR(at, x, h, color, label, val):
    return HTML(f"<div class='w' style='left:{x}px;top:{900-h//2}px;width:240px;height:{h}px;background:{color};border:8px solid #111;border-radius:14px;box-shadow:10px 10px 0 #111' data-anim='pop' data-in='{at}'></div>"
                f"<div class='w' style='left:{x}px;top:{900-h-60}px;font-family:Anton;font-size:64px;color:#F8F5EC' data-anim='pop' data-in='{at}'>{val}</div>"
                f"<div class='w' style='left:{x}px;top:960px;font-family:Inter;font-weight:900;font-size:30px;color:#F8F5EC' data-anim='fade' data-in='{at}'>{label}</div>")
def CALD(states, days=("OCT 29", "OCT 30", "OCT 31", "NOV 1")): return {"type": "calendar", "days": list(days), "states": states}
sc = [
 SC(1, [S(0, SR, [CALD([[0, "OCT 29", {}]]), A(HK, 1450, 1080, 860, 0, "pop", "shake", react="6"), W(0, "BINANCE HEIST", 560, 330, "red", 110, anim="none"),
                  C("6", 0, 6, "${v}.3B", 560, 560, 230, "#EF4444", 1.0)], tr="none", night=True, kb=[1.0, 1.1, 0],
          sounds=[[0.3, "tick", 0.4], [0.9, "tick", 0.4], [1.5, "tick", 0.4], [2.1, "tick", 0.4], ["6", "hit", 0.8]]),
        S("the", EX, [W("biggest", "THE WORLD'S BIGGEST CRYPTO EXCHANGE", 960, 200, "box", 76), A(TR, 1500, 1080, 760, "biggest", "up", "shake")], kb=[1.0, 1.12, 0]),
        S("according", "NAVY", [C(0.1, 0, 20, "{v} MIN", 960, 430, 260, "#FFC400", 3.0), N("according", "most of it gone — according to blockchain trackers", 960, 640, 36), ICON(0, "⏱", 400, 430, 200)], tr="zoom",
          sounds=[[0.4, "tick", 0.4], [1.0, "tick", 0.4], [1.6, "tick", 0.4], [2.2, "tick", 0.4], [2.8, "tick", 0.4]]),
        S("its", "NAVY", [W(0, "LARGEST CRYPTO THEFT", 960, 330, "box", 110), W("record", "ON RECORD", 960, 560, "stamp", 170, anim="slam", rot=-6), A(TR, 1650, 1080, 560, 0.2, "up", "shake")], tr="zoom")]),
 SC(2, [S(0, CC, [A(SP, 1500, 1080, 900, 0, "up", "bob"), W("strange", "THE STRANGE PART…", 620, 200, "box", 90), W("cent", "CUSTOMERS LOSE: $0", 620, 380, "green", 110, anim="slam"), N("says", "— Binance says", 620, 500, 36)], kb=[1.0, 1.1, 0]),
        S("six", "NAVY", [W(0, "−$6B GONE", 560, 340, "red", 140, anim="slam"), W("balance", "BALANCES: SAME ✓", 560, 600, "green", 100), {"type": "face", "kind": "happy", "x": 1330, "y": 300, "size": 420, "at": "nobodys"}],
          tr="slide-l", sounds=[["nobodys", "pop", 0.5]]),
        S("so", "NAVY", [W("who", "SO WHO GOT ROBBED?", 960, 440, "big", 160, anim="slam"), D("shock", 1650, 1060, 520, "robbed", "up", "shake")], tr="zoom"),
        S("and#1", VA, [A(BAG, 1450, 1050, 600, 0, "drop", "shake", react="freeze"), W("half", "HALF THE LOOT…", 640, 260, "box", 100), W("freeze", "❄ FROZE IN PLACE", 640, 440, "red", 100, anim="slam"),
                      W("pause", "⏸ PAUSE?", 640, 640, "box", 100)], kb=[1.0, 1.15, 0], sounds=[["pause", "hit", 0.6]])]),
 SC(3, [S(0, EX, [W("2017", "SINCE 2017", 560, 220, "box", 100), W("largest", "#1 BY DAILY TRADING", 560, 400, "green", 90), D("thumbs", 1600, 1060, 640, 0.2, "right", "bob")], kb=[1.1, 1.0, 30], sounds=[["2017", "pop", 0.5]]),
        S("its", EX, [W("bitcoin", "WHERE PEOPLE BUY BITCOIN ₿", 960, 200, "box", 90), A(TR, 1550, 1080, 700, 0, "up", "bob")], kb=[1.0, 1.12, 0]),
        S("and#1", "NAVY", [W("key", "THE KEY DETAIL 🔑", 960, 330, "box", 110), W("never", "MANY NEVER TAKE IT HOME", 960, 560, "red", 110, anim="slam"), D("shock", 1650, 1060, 480, "never", "up", "shake")], tr="zoom")]),
 SC(4, [S(0, CC, [COIN, D("explain", 1650, 1060, 600, 0, "right"), W("coat", "CRYPTO ON AN EXCHANGE = A COAT CHECK", 860, 860, "box", 72)], kb=[1.0, 1.1, 0], sounds=[[0, "pop", 0.5]]),
        S("you", CC, [COIN, D("explain", 1650, 1060, 600, 0, "none"), W("hand", "YOU HAND OVER YOUR COAT", 800, 860, "box", 84), TICKET("ticket", 800, 560)], tr="none", kb=[1.1, 1.18, -40],
          sounds=[["ticket", "pop", 0.6]]),
        S("your#1", CC, [COIN, W("back", "COAT → THE BACK ROOM", 800, 860, "box", 84), ICON("key", "🔑", 800, 520, 240), W("holds", "THEY HOLD THE KEY", 800, 300, "red", 84)], tr="zoom", kb=[1.3, 1.4, -150],
          sounds=[["key", "pop", 0.6]]),
        S("with", "NAVY", [COIN, ICON(0, "🔑", 520, 520, 300), W("private", "PRIVATE KEY = A SECRET CODE", 1200, 380, "green", 76), W("whoever", "WHOEVER HOLDS IT MOVES THE COINS", 1200, 600, "red", 64)], tr="slide-l"),
        S("on#1", CC, [COIN, W(0.1, "EXCHANGE: 🔑", 560, 420, "red", 100), W("balance", "YOU: 🎟 A TICKET", 1360, 420, "green", 100), TICKET("balance+0.3", 1360, 660, 0.8), D("shock", 960, 1060, 420, "ticket", "up", "shake")], tr="zoom", kb=[1.0, 1.08, 0])]),
 SC(5, [S(0, CC, [COIN, W("door", "A FEW COATS BY THE DOOR", 960, 860, "box", 90), D("thumbs", 1650, 1060, 560, 0, "right")], kb=[1.12, 1.2, -60]),
        S("exchanges", SR, [W("hot", "🔥 HOT WALLETS", 960, 240, "red", 120, anim="slam"), N("online", "online, so withdrawals go out fast", 960, 380, 36)], tr="zoom", kb=[1.0, 1.1, 0], night=True),
        S("according", SR, [A(HK, 1500, 1080, 780, 0, "right", "walk", walk=-500), W("money", "THE MONEY LEFT FROM HERE", 700, 260, "red", 84), N("according", "— according to reports", 700, 380, 34)], kb=[1.1, 1.0, 0], night=True)]),
 SC(6, [S(0, "NAVY", [W(0, "HOW DID THEY GET IN?", 960, 440, "big", 150, anim="slam")], tr="zoom", sounds=[["in", "hit", 0.6]]),
        S("binances", SR, [A(HK, 1450, 1080, 860, 0, "pop", "bob"), W("laptop", "ONE ENGINEER'S LAPTOP 💻", 640, 280, "box", 84), N("investigation", "Binance's early investigation", 640, 400, 34), W("hacked", "HACKED?", 640, 560, "red", 120, anim="slam")], night=True, kb=[1.0, 1.1, 0]),
        S("from", SR, [W("sent", "FAKE WITHDRAWAL ORDERS", 960, 260, "red", 96), N("reportedly", "— reportedly", 960, 380, 34), ICON("orders", "📤", 600, 640, 160), ICON("orders+0.3", "📤", 960, 660, 160), ICON("orders+0.6", "📤", 1320, 640, 160),
                       W("real", "TREATED AS REAL ✓", 960, 900, "green", 80)], tr="zoom", kb=[1.0, 1.1, 0], night=True,
          sounds=[["orders", "pop", 0.5], ["orders+0.3", "pop", 0.5], ["orders+0.6", "pop", 0.5]]),
        S("according", "NAVY", [W(0, "THE MONEY SCATTERED…", 960, 240, "box", 100), ICON(0.2, "⛓", 960, 520, 220), C("ten", 0, 10, "{v} BLOCKCHAINS", 960, 760, 140, "#EF4444", 1.2), N("according", "— according to TRM Labs", 960, 900, 36)], tr="zoom",
          sounds=[["ten", "tick", 0.4], ["ten+0.3", "tick", 0.4], ["ten+0.6", "tick", 0.4], ["ten+0.9", "tick", 0.4]]),
        S("binance", BR, [A(SP, 1500, 1080, 880, 0, "up", "bob"), W("evidence", "«NO SIGN OUR KEYS LEAKED»", 680, 380, "green", 84), N("says", "— Binance says", 680, 500, 34)], kb=[1.0, 1.08, 0])]),
 SC(7, [S(0, EX, [W("froze", "WITHDRAWALS FROZEN", 760, 420, "stamp", 140, anim="slam", rot=-6), A(TR, 1600, 1080, 760, 0, "up", "shake", react="froze")], kb=[1.0, 1.15, 0], sounds=[["froze", "error", 0.6]]),
        S("for", "NAVY", [BAR("previous", 620, 180, "#94A3B8", "BYBIT · EARLY 2025", "$1.5B"), BAR("this", 1300, 700, "#EF4444", "BINANCE · OCT 2026", "$6.3B"),
                          W("four", "4× BIGGER", 960, 160, "red", 120, anim="slam")], tr="slide-l", sounds=[["previous", "pop", 0.5], ["this", "hit", 0.7]])]),
 SC(8, [S(0, "NAVY", [W(0.1, "THEN… THE TWIST", 960, 440, "big", 170, anim="slam")], tr="zoom"),
        S("a", VA, [A(BAG, 1450, 1050, 600, 0, "drop", "bob"), W("stablecoins", "STABLECOINS", 640, 300, "box", 130, anim="slam")], kb=[1.0, 1.12, 0]),
        S("digital", "NAVY", [W(0, "= DIGITAL DOLLARS", 960, 200, "green", 100), BOX("usdt", "<div class='w box' style='position:relative;font-size:90px'>USDT 💵</div>", 600, 520),
                              N("tether", "Tether", 600, 650, 44), BOX("usdc", "<div class='w box' style='position:relative;font-size:90px'>USDC 💵</div>", 1320, 520), N("circle", "Circle", 1320, 650, 44)], tr="zoom",
          sounds=[["usdt", "pop", 0.5], ["usdc", "pop", 0.5]]),
        S("bitcoin", "NAVY", [W(0, "BITCOIN: NO BOSS", 560, 300, "box", 90), D("thumbs", 560, 1060, 520, 0.2, "up"), W("stablecoin", "STABLECOIN: HAS A BOSS", 1380, 300, "red", 80),
                              A(EW, 1380, 1080, 640, "does", "up", "bob"), W("block", "⛔ CAN BLOCK A WALLET", 1380, 470, "red", 70, anim="slam")], tr="slide-l"),
        S("tethers", VA, [A(BAG, 1500, 1050, 600, 0, "pop", "shake", react="froze"), W("minutes", "WITHIN MINUTES", 640, 220, "box", 96), C("froze", 0, 1, "${v}.5B+ FROZEN ❄", 640, 420, 120, "#38BDF8", 0.8),
                          N("tether#1", "— Tether says", 640, 560, 34)], kb=[1.0, 1.15, 0], sounds=[["froze", "hit", 0.7]]),
        S("according", VA, [W("circle", "CIRCLE: +$800M", 640, 220, "box", 96), N("according", "— according to reports", 640, 340, 34), C("3", 0, 3, "≈ ${v}B FROZEN", 640, 560, 140, "#22C55E", 0.9),
                            N("binance", "— Binance says", 640, 700, 34), A(BAG, 1500, 1050, 600, 0, "none", "shake")], tr="zoom", kb=[1.1, 1.2, 0], sounds=[["frozen", "score", 0.6]])]),
 SC(9, [S(0, "NAVY", [W(0, "WHO DID IT?", 960, 440, "big", 180, anim="slam")], tr="zoom"),
        S("analytics", SR, [A(HK, 1450, 1080, 860, 0, "pop", "shake"), W("north", "NORTH KOREA'S «TRADER TRAITOR»?", 640, 280, "red", 62, anim="slam"), N("analytics", "— according to TRM Labs and Chainalysis", 640, 400, 32)], night=True, kb=[1.0, 1.1, 0]),
        S("two", "NAVY", [CALD([[0, "OCT 29", {"OCT 29": "HEIST"}], ["later", "OCT 31", {"OCT 31": "FBI"}]]), W(0, "2 DAYS LATER…", 960, 300, "box", 90, out="fbi"), W("fbi", "THE FBI: SAME ANSWER", 960, 480, "box", 110), N("same", "as reported", 960, 620, 36)], tr="slide-l"),
        S("binance", BR, [A(SP, 1500, 1080, 880, 0, "up", "bob"), W("careful", "BINANCE: «NO NAMES YET»", 680, 360, "box", 90), N("north#1", "North Korea routinely denies hacking", 680, 500, 34)], kb=[1.0, 1.08, 0])]),
 SC(10, [S(0, VA, [ICON(0, "🛟", 560, 560, 260), W("emergency", "EMERGENCY FUND «SAFU»", 1250, 260, "box", 84), C("1", 0, 1, "≈ ${v}B", 1250, 520, 200, "#22C55E", 0.6)], kb=[1.0, 1.12, 0], sounds=[["1", "score", 0.5]]),
         S("the", "NAVY", [BAR(0, 620, 110, "#22C55E", "SAFU FUND", "$1B"), BAR("six", 1300, 680, "#EF4444", "THE THEFT", "$6.3B"), W("six", "6× BIGGER", 960, 160, "red", 120, anim="slam"),
                           D("shock", 1720, 1060, 420, "bigger", "up", "shake")], tr="slide-l", sounds=[["six", "error", 0.6]]),
         S("so", BR, [A(SP, 1450, 1080, 880, 0, "up", "bob"), W("cover", "BINANCE COVERS THE REST", 680, 300, "box", 84), W("company", "WITH ITS OWN MONEY 💰", 680, 460, "green", 90, anim="slam")], kb=[1.0, 1.1, 0]),
         S("three", "NAVY", [CALD([[0, "OCT 29", {"OCT 29": "HEIST"}], ["theft", "NOV 1", {"NOV 1": "95%"}]]), C(0.3, 0, 95, "{v}% REPLACED", 960, 480, 160, "#22C55E", 2.0), N("said", "— Binance says", 960, 640, 36),
                             W("reopening", "WITHDRAWALS REOPEN ✓", 960, 800, "green", 80), D("thumbs", 1720, 1060, 460, "95", "up", "bob")], tr="slide-l", sounds=[[2.3, "score", 0.6]])]),
 SC(11, [S(0, EX, [A(TR, 1500, 1080, 820, 0, "up", "jump", react="exit"), W("rushed", "EVERYONE RUSHED OUT 🏃", 680, 260, "red", 90, anim="slam")], kb=[1.0, 1.12, 0]),
         S("according", "NAVY", [C(0.2, 0, 3, "−${v}.6B", 960, 400, 240, "#EF4444", 2.0), W("hours", "WITHDRAWN IN A FEW HOURS", 960, 620, "box", 84), N("according", "— according to TechCrunch", 960, 740, 34)], tr="zoom",
           sounds=[[0.4, "tick", 0.4], [0.9, "tick", 0.4], [1.4, "tick", 0.4], [2.2, "hit", 0.6]]),
         S("by", "NAVY", [HTML("<div class='w' style='left:1450px;top:540px;width:300px;height:640px;border:8px solid #111;border-radius:22px;background:#FFC400;overflow:hidden;box-shadow:10px 10px 0 #111' data-anim='pop' data-in='0.2'><div style='position:absolute;left:0;right:0;top:0;height:4%;background:#EF4444'></div></div>"),
                          W("170", "≈ $170B HELD FOR USERS", 640, 340, "box", 80), N("our", "our math", 640, 450, 34), W("4", "THE HEIST ≈ 4% OF THE PILE", 640, 640, "red", 76, anim="slam")],
           tr="slide-l", sounds=[["4", "hit", 0.6]])]),
 SC(12, [S(0, "NAVY", [W(0, "SO WHO GOT ROBBED?", 960, 300, "red", 110), W("binance", "BINANCE ITSELF.", 960, 520, "big", 200, anim="slam")], tr="zoom"),
         S("customers", CC, [A(SP, 1500, 1080, 880, 0, "up", "bob"), TICKET(0.2, 640, 560), W("chose", "THE COAT CHECK PAID FOR THE COATS", 760, 260, "box", 64)], kb=[1.0, 1.1, 0], sounds=[["chose", "score", 0.5]]),
         S("almost", VA, [A(BAG, 1500, 1050, 600, 0, "pop", "shake"), W("froze", "HALF FROZE ❄", 680, 240, "box", 100), W("stop", "DIGITAL DOLLARS CAN SAY «STOP» ✋", 680, 440, "red", 70, anim="slam")], kb=[1.0, 1.1, 0]),
         S("if", VA, [D("thumbs", 360, 1040, 700, 0, "left"), {"type": "subscribe", "x": 1300, "y": 300, "at": "subscribe", "sound": "pop"},
                      HTML("<div class='w' style='left:1300px;top:480px;font-family:Anton;font-size:64px;color:#F8F5EC' data-anim='fade' data-in='3.6'><span style='color:#FFC400'>$</span> WE MAKE MONEY MAKE SENSE</div>"),
                      N("we+1.0", "Next: Blockbuster laughed at a $50 million Netflix deal", 1300, 640, 34), {"type": "disclaimer", "at": 0.4, "x": 1300, "y": 1010}], kb=[1.0, 1.1, 0])]),
]
music = [["spy", 0, None, 1.0], ["none", 1, "so"], ["spy", 1, "and", 0.9], ["fun", 2, None, 0.6], ["spy", 4, "exchanges", 1.0], ["none", 5, 0], ["spy", 5, "binances", 1.0],
         ["none", 7, 0], ["fun", 7, "stablecoins", 1.0], ["none", 8, 0], ["spy", 8, "analytics", 1.0], ["fun", 9, None, 0.8], ["none", 11, 0], ["fun", 11, "customers", 1.0]]
save("episode.json", sc, music)
