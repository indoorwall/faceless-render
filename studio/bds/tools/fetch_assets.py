#!/usr/bin/env python3
"""Descarga la biblioteca del canal (assets.json) a studio/bds/lib/. python3 tools/fetch_assets.py"""
import json, os, urllib.request
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); L = os.path.join(R, "lib"); os.makedirs(L, exist_ok=True)
A = json.load(open(os.path.join(R, "assets.json")))
for name, meta in A["files"].items():
    p = os.path.join(L, name)
    if not os.path.exists(p): urllib.request.urlretrieve(A["base"] + name, p)
print("OK", len(A["files"]), "archivos en", L)
