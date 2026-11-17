"""Deixa só os pedaços que o EdiSVG aceita (IHDR, PLTE, IDAT, IEND, tRNS, sRGB, gAMA)."""
import struct, sys
OK = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"sRGB", b"gAMA"}
for f in sys.argv[1:]:
    d = open(f, "rb").read(); out = d[:8]; i = 8
    while i < len(d):
        n = struct.unpack(">I", d[i:i + 4])[0]; t = d[i + 4:i + 8]
        if t in OK: out += d[i:i + 12 + n]
        i += 12 + n
    open(f, "wb").write(out)
