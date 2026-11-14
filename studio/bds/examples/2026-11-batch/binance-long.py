import sys; sys.path.insert(0, "../../tools")
from ep import *
SR, EX, CC, VA, FL = "lib/bg_server_room.png", "lib/bg_crypto_exchange.png", "lib/bg_coat_check.png", "lib/bg_vault.png", "lib/bg_trading_floor.png"
HK, SP, BAG = "lib/cut_hacker.png", "lib/cut_spokesperson.png", "lib/cut_moneybag.png"
COIN = BADGE("🧥 COIN CHECK MATH")
sc = [
 SC(1, [S(0, SR, [A(HK, 1400, 1080, 800, 0, "pop", "bob"), W("6", "$6.3 BILLION", 620, 420, "red", 140, anim="slam")], tr="none", kb=[1.0, 1.1, 0], night=True,
          sounds=[[0.3, "tick", 0.4], [0.9, "tick", 0.4], [1.5, "tick", 0.4], [2.1, "tick", 0.4]]),
        S("according", EX, [W("20", "≈ 20 MINUTES", 960, 200, "box", 110, out="its"), N("according", "— according to blockchain trackers", 960, 330, 34, out="its"),
                            W("largest", "LARGEST CRYPTO THEFT ON RECORD", 960, 200, "red", 72, anim="slam")], kb=[1.0, 1.12, 0])]),
 SC(2, [S(0, CC, [W("cent", "CUSTOMERS LOSE $0?", 960, 190, "green", 100), N("says", "— Binance says", 960, 320, 36)], kb=[1.0, 1.1, 0]),
        S("so", "NAVY", [W("who", "SO WHO GOT ROBBED?", 960, 420, "red", 130, anim="slam", out="and"), W("freeze", "AND WHY DID HALF FREEZE?", 960, 420, "box", 110)], tr="zoom")]),
 SC(3, [S(0, EX, [W("largest", "THE BIGGEST CRYPTO EXCHANGE", 960, 180, "box", 90, out="many"), W("many", "MANY NEVER TAKE IT HOME", 960, 180, "red", 96)], kb=[1.1, 1.0, 30])]),
 SC(4, [S(0, CC, [COIN, D("explain", 1650, 1060, 560, 0, "right"), W("ticket", "YOUR COAT → A TICKET", 960, 860, "box", 90, out="crypto")], kb=[1.0, 1.12, 0], sounds=[[0, "pop", 0.5]]),
        S("with", CC, [COIN, D("explain", 1650, 1060, 560, 0, "pop"), W("private", "THE KEY = YOUR PRIVATE KEY", 960, 860, "green", 84, out="exchange#1"), W("exchange#1", "THE EXCHANGE HOLDS THE KEY", 960, 860, "red", 84, out="balance"),
                  W("balance", "YOUR BALANCE = A TICKET", 960, 860, "box", 96)], tr="zoom", kb=[1.35, 1.45, -150])]),
 SC(5, [S(0, CC, [COIN, W("door", "COATS BY THE DOOR", 960, 860, "box", 90, out="exchanges")], kb=[1.12, 1.2, -60]),
        S("exchanges", SR, [W("hot", "🔥 HOT WALLETS", 960, 220, "red", 110), N("online", "online, so withdrawals are fast", 960, 350, 36),
                            N("according", "the money left from here — according to reports", 960, 980, 34)], tr="zoom", kb=[1.0, 1.1, 0])]),
 SC(6, [S(0, SR, [A(HK, 1350, 1080, 820, 0, "up", "bob"), W("laptop", "ONE HACKED LAPTOP?", 620, 300, "box", 96), N("early", "Binance's early investigation", 620, 420, 34)], night=True, kb=[1.0, 1.1, 0]),
        S("according", "NAVY", [W("ten", "10 BLOCKCHAINS", 960, 400, "red", 150, anim="slam", out="binance"), N("according", "— TRM Labs", 960, 560, 36, out="binance"),
                                W("binance", "NO SIGN ITS KEYS LEAKED", 960, 400, "green", 100), N("binance", "— Binance says", 960, 540, 36)], tr="zoom")]),
 SC(7, [S(0, EX, [W("froze", "WITHDRAWALS FROZEN", 960, 420, "stamp", 140, anim="slam", rot=-6)], kb=[1.0, 1.15, 0]),
        S("for", "NAVY", [W("previous", "2025 RECORD: $1.5B", 960, 330, "box", 100), N("exchange", "Bybit, early 2025", 960, 450, 36),
                          W("four", "THIS ONE: 4× BIGGER", 960, 640, "red", 120, anim="slam")], tr="slide-l")]),
 SC(8, [S(0, "NAVY", [W("stablecoins", "STABLECOINS = DIGITAL DOLLARS", 960, 300, "box", 96, out="bitcoin"), N("tether", "USDT (Tether) · USDC (Circle)", 960, 430, 40, out="bitcoin"),
                      W("bitcoin", "BITCOIN: NO BOSS", 600, 300, "box", 90, out="tethers"), W("stablecoin", "STABLECOIN: HAS A BOSS", 1300, 500, "red", 90, out="tethers")], tr="zoom"),
        S("tethers", VA, [A(BAG, 1450, 1050, 560, 0, "drop", "shake", react="froze"), W("froze", "FROZEN: $1.5B+", 620, 260, "stamp", 130, anim="slam", rot=-6, out="according"), N("tether#2", "— Tether says, within minutes", 620, 400, 34, out="according"),
                          N("according", "Circle froze about $800M more — according to reports", 760, 260, 34), W("total", "≈ $3 BILLION FROZEN", 760, 420, "green", 110), N("total", "— Binance says", 760, 540, 34)], kb=[1.0, 1.15, 0])]),
 SC(9, [S(0, "NAVY", [W("who", "WHO DID IT?", 960, 400, "big", 160, anim="slam", out="analytics")], tr="zoom"),
        S("analytics", SR, [A(HK, 1400, 1080, 800, 0, "pop", "bob"), W("north", "NORTH KOREA'S «TRADER TRAITOR»?", 640, 280, "red", 64), N("analytics", "— according to TRM Labs and Chainalysis", 640, 390, 32),
                            N("fbi", "the FBI said the same, as reported", 640, 460, 32)], night=True, kb=[1.0, 1.1, 0]),
        S("binance", "NAVY", [A(SP, 1400, 1080, 820, 0, "up", "bob"), W("careful", "BINANCE: NO NAMES YET", 620, 400, "box", 90), N("north", "North Korea routinely denies hacking", 620, 540, 34)])]),
 SC(10, [S(0, VA, [C("emergency", 0, 1, "SAFU ≈ ${v}B", 700, 300, 120, "#22C55E", 0.6), W("six", "THEFT: 6× BIGGER", 700, 520, "red", 100)], kb=[1.0, 1.12, 0]),
         S("so", "NAVY", [D("thumbs", 380, 1060, 680, 0, "left"), W("company", "BINANCE PAYS WITH ITS OWN MONEY", 1250, 300, "box", 76), C("95", 0, 95, "{v}% REPLACED", 1250, 560, 150, "#22C55E", 1.4),
                          N("theft", "3 days later — Binance says", 1250, 720, 34)], sounds=[["95", "score", 0.6]])]),
 SC(11, [S(0, CC, [W("withdrawals", "−$3.6B WITHDRAWN IN HOURS", 960, 200, "red", 90), N("techcrunch", "— according to TechCrunch", 960, 320, 34)], kb=[1.0, 1.12, 0]),
         S("by", "NAVY", [HTML("<div class='w' style='left:1450px;top:540px;width:300px;height:640px;border:8px solid #111;border-radius:22px;background:#FFC400;overflow:hidden;box-shadow:10px 10px 0 #111' data-anim='pop' data-in='0.2'><div style='position:absolute;left:0;right:0;top:0;height:4%;background:#EF4444'></div></div>"), W("170", "≈ $170B HELD FOR USERS", 560, 380, "box", 80), N("our", "our math", 560, 480, 34),
                          W("4", "HEIST ≈ 4% OF THE PILE", 560, 640, "red", 80)])]),
 SC(12, [S(0, "NAVY", [W("who", "WHO GOT ROBBED?", 960, 420, "red", 120, out="did"), W("did", "BINANCE.", 960, 420, "big", 220, anim="slam", out="almost")], tr="zoom"),
         S("almost", VA, [A(BAG, 1450, 1050, 560, 0, "pop", "shake"), W("say", "DIGITAL DOLLARS CAN SAY «STOP»", 700, 300, "box", 80)], kb=[1.0, 1.1, 0]),
         S("if", VA, [D("thumbs", 360, 1040, 700, 0, "left"), {"type": "subscribe", "x": 1300, "y": 300, "at": "subscribe", "sound": "pop"},
                      HTML("<div class='w' style='left:1300px;top:480px;font-family:Anton;font-size:64px;color:#F8F5EC' data-anim='fade' data-in='3.6'><span style='color:#FFC400'>$</span> WE MAKE MONEY MAKE SENSE</div>"),
                      {"type": "disclaimer", "at": 0.4, "x": 1300, "y": 1010}], kb=[1.0, 1.1, 0])]),
]
music = [["spy", 0], ["none", 1, "who"], ["fun", 2, None, 0.6], ["spy", 4, "exchanges"], ["none", 7, "then"], ["fun", 7, "stablecoins"], ["spy", 8], ["fun", 9]]
save("episode.json", sc, music)
