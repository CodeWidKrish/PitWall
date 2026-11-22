"""Clean W17 textures: livery masks without logos, tyres without lettering, all downsized."""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
T = sys.argv[1]; OUT = "tex"
Image.MAX_IMAGE_PIXELS = None

def livery_mask(src, dst, size=2048):
    im = np.asarray(Image.open(f"{T}/{src}").convert("RGB").resize((size, size), Image.LANCZOS)).astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    teal = (g > 110) & (b > 100) & (r < 80)
    grey = (r > 90) & (g > 100) & (b > 100) & ~teal
    # drop small islands (logos such as the star cluster), keep real panels
    lab, n = ndimage.label(grey)
    sizes = ndimage.sum(grey, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.where(sizes > size * size * 0.0012)[0])
    grey = grey & keep
    lab, n = ndimage.label(teal)
    sizes = ndimage.sum(teal, lab, range(1, n + 1))
    teal = teal & np.isin(lab, 1 + np.where(sizes > size * size * 0.0002)[0])
    out = np.zeros((size, size, 3), np.uint8)
    out[..., 0] = np.where(grey, 255, 0)
    out[..., 1] = np.where(teal, 255, 0)
    m = Image.fromarray(out).filter(__import__("PIL.ImageFilter", fromlist=["x"]).GaussianBlur(0.8))
    m.save(f"{OUT}/{dst}.png", optimize=True)
    print(dst, "primary", grey.mean().round(3), "accent", teal.mean().round(3), "islands dropped")

def tyre(src, dst, size=1024):
    im = np.asarray(Image.open(f"{T}/{src}").convert("RGB").resize((size, size), Image.LANCZOS)).astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    red = (r > 90) & (r > g + 40)
    light = (r > 150) & (g > 150) & (b > 150)  # barcode label
    mask = ndimage.binary_dilation(red | light, iterations=3)
    base = np.median(im[~mask].reshape(-1, 3), axis=0)
    im[mask] = base
    Image.fromarray(im.astype(np.uint8)).save(f"{OUT}/{dst}.jpg", quality=86)
    print(dst, "lettering px", int(mask.sum()))

def plain(src, dst, size=1024, fmt="jpg"):
    im = Image.open(f"{T}/{src}").convert("RGB")
    if max(im.size) > size: im = im.resize((min(size, im.size[0]), min(size, im.size[1])), Image.LANCZOS)
    im.save(f"{OUT}/{dst}.{fmt}", quality=86) if fmt == "jpg" else im.save(f"{OUT}/{dst}.png")

livery_mask("mercedes_paint_d.tif_10.png", "livery_body")
livery_mask("mercedes_paint_halo_11.png", "livery_halo")
tyre("S_16.png", "tyre")
plain("mercedes_details_d.tif_5.png", "details")
plain("generic_main_d_1.png", "generic")
plain("mercedes_wheel_d.tif_13.png", "wheel")
plain("mercedes_steering_wheel_d25_23.png", "steering", 512)
plain("gp21_cinture_19.png", "belts", 512)
