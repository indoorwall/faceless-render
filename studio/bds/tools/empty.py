#!/usr/bin/env python3
"""Detecta fotogramas «vacíos» en prev/ (fondo azul casi liso): python3 tools/empty.py work/<ep> [fps]"""
import glob, os, re, sys
from PIL import Image, ImageStat
d = sys.argv[1]; fps = float(sys.argv[2]) if len(sys.argv) > 2 else 30
for f in sorted(glob.glob(f"{d}/prev/f_*.jpg"), key=lambda p: float(os.path.basename(p)[2:-4])):
    rgb = Image.open(f).convert("RGB").resize((192, 108)); im = rgb.convert("L"); sat = rgb.convert("HSV").split()[1]
    # contenido = píxeles muy claros u oscuros respecto al azul de fondo
    sp = list(sat.get_flattened_data() if hasattr(sat,"get_flattened_data") else sat.getdata()); px = list(im.get_flattened_data() if hasattr(im,'get_flattened_data') else im.getdata()); busy = sum(1 for p, q in zip(px, sp) if p > 150 or p < 12 or q > 140) / len(px)
    if busy < 0.02: print(f"{float(os.path.basename(f)[2:-4]):7.1f}s  vacío ({busy:.3f})")
