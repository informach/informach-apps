import sys, glob, os
from PIL import Image
d, out = sys.argv[1], sys.argv[2]; tam = int(sys.argv[3]) if len(sys.argv) > 3 else 192
fs = sorted(glob.glob(os.path.join(d, "*.webp")))
W = min(8, len(fs)); H = (len(fs) + W - 1) // W
S = Image.new("RGBA", (W * tam, H * tam), (42, 61, 99, 255))
for i, f in enumerate(fs):
    im = Image.open(f).convert("RGBA").resize((tam, tam))
    S.alpha_composite(im, ((i % W) * tam, (i // W) * tam))
S.save(out)
