"""Development-only golden corpus, generated with Pillow/libtiff (no app dependency).

Run from the repository root. Committed fixtures allow Node tests without Python.
"""
from pathlib import Path
from PIL import Image, ImageCms
import hashlib
import json
import random

root = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "tiff"
root.mkdir(parents=True, exist_ok=True)
rgb = Image.new("RGB", (64, 48))
for y in range(48):
    for x in range(64):
        rgb.putpixel((x, y), (255, 0, 0) if x < 32 and y < 24 else (0, 0, 255) if x >= 32 and y >= 24 else (20, 200, 40))
records = []

def save(name, image, compression="raw", tags=None, following=None):
    path = root / (name + ".tif")
    image.save(path, compression=compression, dpi=(72, 72), tiffinfo=tags or {}, save_all=bool(following), append_images=following or [])
    expected = []
    with Image.open(path) as decoded:
        for index in range(getattr(decoded, "n_frames", 1)):
            decoded.seek(index)
            # Pillow's TIFF decoder applies orientation on load. Avoid a second transpose.
            decoded.load()
            page = decoded.convert("RGBA")
            if image.mode in ("I;16", "I;16B"):
                page = Image.new("RGBA", decoded.size)
                page.putdata([(round(value * 255 / 65535),) * 3 + (255,) for value in decoded.get_flattened_data()])
            png = name + "-" + str(index + 1) + ".png"
            page.save(root / png)
            expected.append(png)
    records.append({"name": path.name, "pages": expected, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "compression": compression})

for compression in ("raw", "packbits", "tiff_lzw", "tiff_adobe_deflate"):
    save("rgb-" + compression, rgb, compression)
for orientation in range(1, 9):
    save("orientation-" + str(orientation), rgb, "tiff_lzw", {274: orientation})
binary = Image.new("1", (173, 65), 1)
for y in range(65):
    for x in range(173):
        binary.putpixel((x, y), int((x // 11 + y // 7) % 2 == 0))
for compression in ("group3", "group4", "tiff_ccitt"):
    save("fax-" + compression, binary, compression)
    save("fax-whitezero-" + compression, binary, compression, {262: 0})
save("multipage", rgb, "tiff_adobe_deflate", following=[rgb.transpose(Image.Transpose.ROTATE_180), rgb.convert("L")])
alpha = rgb.convert("RGBA")
for y in range(48):
    for x in range(64):
        value = alpha.getpixel((x, y))
        alpha.putpixel((x, y), value[:3] + (128 if x < 32 else 255,))
save("alpha", alpha, "tiff_adobe_deflate")
save("palette", rgb.quantize(colors=8), "tiff_lzw")
for mode in ("I;16", "I;16B"):
    gray = Image.new(mode, (64, 48))
    for y in range(48):
        for x in range(64):
            gray.putpixel((x, y), 65535 if x >= 32 else 0)
    save("gray-" + mode.replace(";", "-"), gray, "raw")
noise = Image.new("RGB", (128, 96))
randomizer = random.Random(20261018)
noise.putdata([tuple(randomizer.randrange(256) for _ in range(3)) for _ in range(128 * 96)])
save("lzw-dictionary", noise, "tiff_lzw")
save("predictor", rgb, "tiff_adobe_deflate", {317: 2})
save("jpeg", rgb, "jpeg")
save("multistrip", rgb, "tiff_lzw", {278: 7})
save("fax-lsb", binary, "group4", {266: 2, 278: 9})
save("raw-lsb", binary, "raw", {266: 2})
save("icc", rgb, "tiff_adobe_deflate", {34675: ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()})
associated = rgb.convert("RGBA")
for y in range(48):
    for x in range(64):
        value = rgb.getpixel((x, y))
        associated.putpixel((x, y), tuple(round(channel * 128 / 255) for channel in value) + (128,))
save("associated-alpha", associated, "tiff_lzw", {338: (1,)})
(root / "manifest.json").write_text(json.dumps({"generator": "Pillow " + Image.__version__ + " / libtiff", "fixtures": records}, indent=2) + "\n", encoding="utf8")
print(str(len(records)) + " TIFF fixtures generated in " + str(root))
