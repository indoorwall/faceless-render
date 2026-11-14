#!/usr/bin/env python3
"""Recorta un personaje generado sobre fondo verde (croma) y deja PNG transparente.
   python3 tools/key.py entrada.png salida.png
   Pide las imágenes de personajes a FLUX con: "..., isolated on a flat solid pure bright green chroma key background, no shadow, no floor"."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, dst = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert("RGB")).astype(np.float32)
ref = np.median(np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]]), axis=0)
d = np.sqrt(((im - ref) ** 2).sum(-1)); g = im[..., 1] - np.maximum(im[..., 0], im[..., 2])
lab, _ = ndimage.label((d < 70) | ((g > 40) & (d < 130)))
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist()) - {0}
bg = np.isin(lab, list(edge))
l2, n2 = ndimage.label(d < 45); sz = ndimage.sum(np.ones_like(d), l2, range(1, n2 + 1))
bg |= np.isin(l2, [k + 1 for k, v in enumerate(sz) if v > 600])            # huecos verdes encerrados (entre brazo y cuerpo)
fg = ndimage.binary_opening(~bg, iterations=1)
an = np.array(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)))
out = im.copy(); edgez = ((an > 0) & (an < 255)) | (ndimage.binary_dilation(bg, iterations=3) & ~bg)
m = np.maximum(out[..., 0], out[..., 2]); out[..., 1] = np.where(edgez, np.minimum(out[..., 1], m), out[..., 1])
img = Image.fromarray(np.dstack([out.clip(0, 255).astype(np.uint8), an]), "RGBA"); img = img.crop(img.getbbox()); img.save(dst)
print("OK", dst, img.size)
