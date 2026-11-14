# 6 Shorts verticales (1080x1920) de los episodios 2-4. python3 build.py  → work/sh-<ep>-<a|b>/episode.json
import os, shutil, sys; sys.path.insert(0, "../../tools")
from ep import *
L = lambda n: f"lib/bg_{n}.png"
SR, EX, CC, VA, FL, BR, VS, VC, MO, CO, BK, PP, WR, CB = [L(n) for n in "server_room crypto_exchange coat_check vault trading_floor boardroom video_store video_store_closed mail_office courtroom bakery printing_press wallpaper_room central_bank".split()]
HK, SP, BAG, CL = "lib/cut_hacker.png", "lib/cut_spokesperson.png", "lib/cut_moneybag.png", "lib/cut_ceo_laughing.png"
LOGO = HTML("<div class='logo' style='left:540px;top:1560px;transform:translateX(-50%);font-size:44px' data-anim='fade' data-in='0.3'><i>$</i>BILLION DOLLAR STORIES</div>")
SUB = lambda at: {"type": "subscribe", "x": 540, "y": 1180, "at": at, "sound": "pop"}
X = 540
def w(at, t, y, st="box", sz=90, **k): return W(at, t, X, y, st, sz, **k)
def n(at, t, y, sz=36, **k): return N(at, t, X, y, sz, **k)
KB = [1.0, 1.1, 0]

def binance_a(): return [
  S(0, SR, [A(HK, X, 1920, 900, 0, "pop", "bob"), w(0, "BILLIONS STOLEN", 330, "red", 110, anim="none"), w("froze", "THEN IT FROZE ❄", 500, "box", 96)], tr="none", kb=KB, night=True, sounds=[[0, "hit", 0.6]]),
  S("on", EX, [w("october", "OCT 29", 300, "big", 150), w("6", "$6.3B OUT", 480, "red", 120, anim="slam"), n("exchange", "from the exchange Binance", 610)], kb=KB),
  S("part", "NAVY", [w("usdt", "USDT", 380, "big", 190, anim="slam"), w("digital", "= A DIGITAL DOLLAR", 580, "box", 80), w("tether", "MADE BY TETHER", 730, "green", 80)], tr="zoom"),
  S("unlike", "NAVY", [w("bitcoin", "BITCOIN: NO BOSS", 330, "box", 84), w("boss", "STABLECOIN: A BOSS", 500, "red", 80, anim="slam"), D("explain", X, 1700, 760, 0, "up")]),
  S("tethers", VA, [w("blacklist", "BLACKLIST ⛔", 330, "red", 120, anim="slam"), w("wallet", "ANY WALLET ADDRESS", 500, "box", 76)], kb=KB),
  S("says", VA, [A(BAG, X, 1800, 600, 0, "drop", "shake"), w("minutes", "WITHIN MINUTES", 300, "box", 84), w("half#1", "$1.5B+ FROZEN ❄", 470, "green", 100, anim="slam"), n("says", "— Tether says", 600)], kb=KB),
  S("thieves#1", "NAVY", [A(HK, X, 1920, 900, 0, "up", "shake"), w("still", "STILL HAD THE COINS", 300, "box", 76), w("couldnt", "CAN'T MOVE THEM", 460, "red", 100, anim="slam")]),
  S("crypto#1", "NAVY", [w(0, "CRYPTO,", 400, "big", 150), w("pause", "MEET THE PAUSE BUTTON ⏸", 580, "red", 66, anim="slam"), LOGO], tr="zoom")]

def binance_b(): return [
  S(0, EX, [w(0, "−$6.3B", 330, "red", 170, anim="none"), w("customers", "CUSTOMERS LOSE $0?", 530, "green", 80), n("says", "— Binance says", 650)], tr="none", kb=KB, sounds=[[0, "hit", 0.6]]),
  S("how", "NAVY", [w(0, "HOW?", 450, "big", 220, anim="slam")], tr="zoom"),
  S("when", EX, [w("dont", "YOU DON'T HOLD IT", 320, "red", 84, anim="slam"), D("shock", X, 1700, 760, 0, "up", "shake")], kb=KB),
  S("the", CC, [w("keys", "EXCHANGE: THE KEYS 🔑", 280, "box", 70), w("iou", "YOU: AN IOU", 440, "green", 90), w("ticket", "= A COAT-CHECK TICKET", 590, "box", 62)], kb=KB),
  S("so", CC, [w("robbed", "BACK ROOM ROBBED", 320, "red", 90, anim="slam"), w("choice", "NOW WHAT?", 490, "box", 90)], kb=[1.1, 1.0, 0], night=True),
  S("its#1", VA, [A(BAG, X, 1800, 600, 0.2, "drop", "shake"), C("fund", 0, 1, "FUND: ${v}B", X, 330, 120, "#FFC400", 0.6), w("small", "WAY TOO SMALL", 520, "red", 100, anim="slam")], kb=KB),
  S("so#1", BR, [A(SP, X, 1920, 950, 0, "up", "bob"), w("rest", "PAYS THE REST", 300, "box", 90), w("company", "WITH ITS OWN MONEY", 460, "green", 76)], kb=KB),
  S("three", "NAVY", [w("three", "3 DAYS LATER", 300, "box", 90), C("95", 0, 95, "{v}% REPLACED", X, 520, 130, "#22C55E", 1.0), n("95", "— Binance says", 660)], tr="zoom"),
  S("lucky", CC, [w("lucky", "LUCKY CUSTOMERS", 330, "green", 90), w("unlucky", "UNLUCKY COAT-CHECK", 500, "red", 80, anim="slam"), LOGO], kb=KB)]

def blockbuster_a(): return [
  S(0, VS, [w(0, "$40 LATE FEE", 330, "red", 120, anim="none"), w("200", "→ A $200B COMPANY?", 510, "green", 76)], tr="none", kb=KB, sounds=[[0, "hit", 0.6]]),
  S("reed", VS, [w("reed", "REED HASTINGS", 300, "box", 96), n("said", "— as he has told the story", 420), w("inspired", "→ NETFLIX", 580, "green", 130, anim="slam")], kb=KB),
  S("back", VS, [w("secret", "LATE FEES = $$$", 300, "box", 90), C("800", 0, 800, "${v}M", X, 520, 180, "#FFC400", 1.0), n("according", "in 2000 alone — according to reports", 680)], kb=[1.1, 1.0, 0]),
  S("so", "NAVY", [D("thumbs", X, 1750, 720, 0, "up"), w("opposite", "NETFLIX: THE OPPOSITE", 300, "green", 74), w("monthly", "ONE MONTHLY PRICE", 460, "box", 80), w("no", "NO LATE FEES ✓", 620, "green", 96, anim="slam")], kb=KB),
  S("blockbuster#1", BR, [A(CL, X, 1920, 1000, 0, "up", "bob"), w("50", "BUY NETFLIX FOR $50M?", 300, "box", 70), w("no#1", "NO.", 520, "stamp", 220, anim="slam", rot=-8)], kb=KB),
  S("today", "NAVY", [w(0.1, "NETFLIX TODAY", 300, "box", 90), C("255", 0, 255, "${v}B", X, 500, 220, "#22C55E", 1.2), n("worth", "approximate market value", 680)], tr="zoom"),
  S("not", VC, [w("overdue", "FOR ONE OVERDUE MOVIE", 330, "box", 70), SUB("subscribe"), LOGO], kb=KB)]

def blockbuster_b(): return [
  S(0, VS, [w(0, "9,000+ STORES", 330, "big", 130, anim="none"), w("now", "NOW: 1", 540, "red", 170, anim="slam")], tr="none", kb=KB, sounds=[[0, "pop", 0.5]]),
  S("its", VS, [w("bend", "BEND, OREGON", 330, "box", 100)], kb=[1.1, 1.0, 0]),
  S("blockbuster", CO, [w("bankruptcy", "BANKRUPT", 400, "stamp", 170, anim="slam", rot=-8), w("2010", "2010", 620, "box", 110)], kb=KB),
  S("stores", VC, [w("shut", "STORES SHUT DOWN", 330, "red", 90, anim="slam")], kb=KB),
  S("in#2", VC, [w("january", "JAN 2020", 290, "box", 100), w("zealand", "NEW ZEALAND: CLOSED", 450, "red", 72), w("planet", "BEND = THE LAST ONE", 610, "green", 76, anim="slam")], kb=[1.1, 1.0, 0]),
  S("theres#1", VS, [w("documentary", "THERE'S A DOCUMENTARY 🎬", 330, "box", 64)], kb=KB),
  S("meanwhile", "NAVY", [D("shock", X, 1750, 720, 0, "up"), w(0.1, "MEANWHILE…", 300, "box", 80, out="netflix"), w("netflix", "NETFLIX", 300, "big", 130, out="dvd"), w("dvd", "NETFLIX DVD-BY-MAIL", 300, "box", 76), w("2023", "SHUT DOWN 2023", 470, "red", 96, anim="slam")], kb=KB),
  S("which", VS, [w("outlasted", "BLOCKBUSTER OUTLASTED", 300, "green", 70), w("dvds", "NETFLIX'S DVDs", 460, "box", 90)], kb=KB),
  S("kind", VS, [w(0, "BE KIND.", 320, "big", 130), w("rewind", "REWIND.", 490, "box", 110), SUB("subscribe"), LOGO], tr="zoom", kb=KB)]

BOARD = HTML("<div class='w' style='left:540px;top:600px;width:1060px;height:720px;background:#1f2a24;border:12px solid #6b4423;border-radius:12px;box-shadow:8px 8px 0 #111' data-anim='none' data-in='0'></div>")
def printmoney_a(): return [
  S(0, BK, [BOARD, C(0, 160, 160, "{v} MARKS", X, 520, 120, "#F8F5EC", 0.1, out="200"), C("200", 0, 200, "{v} BILLION", X, 520, 120, "#F8F5EC", 1.2),
            n(0, "a loaf of bread in Berlin", 300, 40), n(0, "end of 1922", 680, 44, out="year"), n("year", "late 1923", 680, 44)], tr="none", kb=[1.0, 1.06, 0], sounds=[["200", "error", 0.6]]),
  S("same", "NAVY", [w(0, "SAME BREAD", 300, "box", 100), w("same#1", "SAME BAKERY", 450, "box", 100), w("what", "WHAT CHANGED?", 630, "red", 92, anim="slam"), D("shock", X, 1750, 700, 0, "up")], tr="zoom"),
  S("according", PP, [w("striking", "PAY STRIKERS", 300, "box", 96, out="printing"), w("printing", "= PRINT MONEY", 300, "red", 100, anim="slam"), n("according", "— according to historians", 430)], kb=KB),
  S("the#1", "NAVY", [w("better", "BREAD: SAME", 380, "box", 100), w("worse", "MONEY: WORSE", 560, "red", 110, anim="slam")], tr="zoom"),
  S("by#1", "NAVY", [w("november", "NOV 1923", 300, "box", 90), w("american", "$1 =", 470, "big", 140), C("four", 0, 4, "{v} TRILLION MARKS", X, 650, 84, "#EF4444", 0.8)]),
  S("some", WR, [w("wallpaper", "MONEY AS WALLPAPER", 320, "box", 84)], kb=KB),
  S("fix", "NAVY", [w("fix", "THE FIX?", 300, "big", 130), w("currency", "NEW CURRENCY", 470, "green", 100), w("zeros", "−12 ZEROS", 650, "red", 130, anim="slam")], tr="zoom"),
  S("turns", PP, [w("cheapest", "CHEAPEST WALLPAPER =", 300, "box", 70), w("broken", "A BROKEN MONEY PRINTER", 450, "red", 66, anim="slam"), LOGO], kb=KB)]

PZ = lambda: PIZZA(240, 640, 600, 0, idle="none")
BADGE_P = HTML("<div class='w box' style='left:540px;top:150px;font-size:56px' data-anim='none' data-in='0'>🍕 PIZZA MATH</div>")
def printmoney_b(): return [
  S(0, CB, [w(0, "THE FED WANTS", 300, "box", 96, anim="none"), w("expensive", "PRICIER GROCERIES", 460, "red", 84, anim="slam")], tr="none", kb=KB, sounds=[[0, "pop", 0.5]]),
  S("on", CB, [w("purpose", "ON PURPOSE.", 300, "big", 130), w("little", "(A LITTLE)", 460, "box", 84)], kb=[1.1, 1.0, 0]),
  S("its", "NAVY", [C(0.2, 0, 2, "≈ {v}% A YEAR", X, 420, 140, "#FFC400", 0.6), w("not", "NOT ZERO", 620, "red", 110, anim="slam")], tr="zoom"),
  S("fed", "NAVY", [w("low", "LOW & STEADY", 300, "green", 100), w("plan", "= EASIER TO PLAN", 460, "box", 84), n("says", "— the Fed says", 580), D("explain", X, 1750, 760, 0, "up")]),
  S("pizza", "NAVY", [BADGE_P, PZ(), w("10", "10 PIZZAS · $10", 340, "box", 84), {"type": "tag", "at": "each", "from": 1, "to": 1, "x": X, "y": 1420, "dur": 0.1}], sounds=[[0, "pop", 0.5]]),
  S("print", "NAVY", [BADGE_P, PZ(), w("print", "PRINT +$10", 340, "red", 96), {"type": "tag", "at": 0, "from": 1, "to": 1, "x": X, "y": 1420, "dur": 0.1, "out": "costs"}, {"type": "tag", "at": "costs", "from": 1, "to": 2, "x": X, "y": 1420, "dur": 0.6}], tr="none", sounds=[["costs", "error", 0.5]]),
  S("but", "NAVY", [BADGE_P, PZ(), w("bake", "+10 PIZZAS", 340, "green", 96), {"type": "tag", "at": 0, "from": 2, "to": 2, "x": X, "y": 1420, "dur": 0.1, "out": "again"}, {"type": "tag", "at": "again", "from": 2, "to": 1, "x": X, "y": 1420, "dur": 0.6}], tr="none", sounds=[["again", "score", 0.5]]),
  S("trick", "NAVY", [w("trick", "MONEY + PIZZAS", 380, "box", 96), w("together", "GROW TOGETHER, SLOWLY", 540, "green", 70, anim="slam")], tr="zoom"),
  S("in", CB, [w("9", "9.1%", 400, "big", 230, anim="slam"), n("prices", "prices vs. a year earlier, June 2022 — Bureau of Labor Statistics", 580, 28), w("lot", "THAT'S A LOT OF PIZZA", 740, "box", 70), LOGO], kb=KB)]

JOBS = {("binance", "a"): (binance_a, "spy"), ("binance", "b"): (binance_b, "spy"), ("blockbuster", "a"): (blockbuster_a, "fun"),
        ("blockbuster", "b"): (blockbuster_b, "fun"), ("printmoney", "a"): (printmoney_a, "spy"), ("printmoney", "b"): (printmoney_b, "fun")}
for (e, k), (fn, mus) in JOBS.items():
    d = f"../sh-{e}-{k}"; os.makedirs(d, exist_ok=True)
    shutil.copy(f"../ep-{e}/short_{k}.mp3", f"{d}/v_s1.mp3"); shutil.copy(f"../ep-{e}/short_{k}.json", f"{d}/w_s1.json")
    save(f"{d}/episode.json", [SC(1, fn(), gap=0.2)], [[mus, 0, None, 0.9]], orientation="portrait", end_pad=1.2)
    print("ok", d)
