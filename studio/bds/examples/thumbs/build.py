import sys; sys.path.insert(0, "../../tools")
from thumb import thumb, page
NOTE = "<div style='position:absolute;left:150px;top:600px;width:620px;height:270px;transform:rotate(-8deg);background:linear-gradient(135deg,#d9efcf,#93c88c);border:10px solid #111;border-radius:22px;box-shadow:0 0 40px #9cff9c,12px 12px 0 #111;font-family:Anton;color:#14532D'><div style='position:absolute;left:28px;top:20px;font-size:44px'>100 000 000 000 000</div><div style='position:absolute;left:28px;bottom:22px;font-size:50px'>100 TRILLION DOLLARS</div></div>"
T = [
 thumb("binance_a", "bg_server_room.png", "−$6.3B", "WHO LOST IT?", hero="cut_hacker.png", hero_side="left", hero_h=1000, extra=("cut_trader_panic.png", 600), seed=3),
 thumb("binance_b", "bg_vault.png", "FROZEN", "$1.5B IN MINUTES", hero="cut_hacker.png", hero_side="right", hero_h=1000, banner="#1c7ed6", glow="#5ad1ff", big_color="#EAF8FF", arrow=None, seed=5, sub_size=104),
 thumb("blockbuster_a", "bg_boardroom.png", "$50M?", "THEY LAUGHED", hero="cut_ceo_laughing.png", hero_side="left", hero_h=1150, extra=("cut_founders.png", 560), arrow=None, glow="#ffb020", seed=7),
 thumb("blockbuster_b", "bg_video_store_closed.png", "5,000X", "THE DEAL THEY SKIPPED", hero="cut_ceo_laughing.png", hero_side="right", hero_h=1100, banner="#1f9d55", glow="#30ff80", arrow=None, seed=9, sub_size=96),
 thumb("printmoney_a", "bg_printing_press.png", "$30?!", "FOR 100 TRILLION", hero="cut_trader_panic.png", hero_side="left", hero_h=1050, seed=11, sub_size=104, big_size=360, arrow=None),
 thumb("printmoney_b", "bg_printing_press.png", "PIZZA: $2", "JUST PRINT MORE?", hero="cut_trader_panic.png", hero_side="left", hero_h=1050, glow="#ff9b2f", seed=13, big_size=290, arrow=None),
]
open("thumbs2.html", "w").write(page(T))
