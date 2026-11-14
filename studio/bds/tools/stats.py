#!/usr/bin/env python3
"""Mide el dinamismo de un montaje frente al estándar Nvidia V5: python3 tools/stats.py work/<ep>
   Mínimos (por minuto): 8 planos, 24 efectos, 3 personajes en escena; además calendario si hay saltos de tiempo y Pizza Math."""
import collections, json, sys
d = sys.argv[1]; E = json.load(open(f"{d}/episode.json")); tot = json.load(open(f"{d}/plan.json"))["total"]
shots = [s for sc in E["scenes"] for s in sc["shots"]]; items = [i for s in shots for i in s["items"]]
ty = collections.Counter(i["type"] for i in items); m = tot / 60
chars = ty["actor"] + ty["dummy"]
checks = [("planos/min", len(shots) / m, 8), ("efectos/min", len(items) / m, 24), ("personajes/min", chars / m, 3),
          ("tipos de recurso", len(ty), 10), ("cambios de música", len(E["music"]), 6)]
ok = True
for name, v, mn in checks:
    flag = "OK " if v >= mn else "BAJO"; ok &= v >= mn
    print(f"{flag} {name:18s} {v:6.1f}  (mínimo {mn})")
print("calendario:", "sí" if ty["calendar"] else "NO", "· pizza:", "sí" if ty["pizza8"] or ty["pizza"] else "no", "· tipos:", dict(ty))
sys.exit(0 if ok else 1)
