"""Junta os sons para publicar a página (o artefato tem limite de 512 arquivos):
- sons_out/voz_pacotes/<idade>_<sexo>.json: as falas gravadas em MP3 (base64), uma chave por fala;
- sons_out/pacotes/<interface|casa|bichos>_<mp3|ogg>.json: os sons curtos, chave = caminho sem extensão.
Músicas e ambientes continuam um arquivo por som. Uso: python3 -I sons_pacotes.py <sons_out>"""
import base64, glob, json, os, re, sys
O = sys.argv[1]
os.makedirs(os.path.join(O, "voz_pacotes"), exist_ok=True); os.makedirs(os.path.join(O, "pacotes"), exist_ok=True)
grupos = {}
for f in sorted(glob.glob(os.path.join(O, "voz", "*.mp3"))):
    n = os.path.basename(f)[:-4]
    grupos.setdefault(re.sub(r"_[^_]+_[0-9]+$", "", n), {})[n] = base64.b64encode(open(f, "rb").read()).decode()
for g, d in grupos.items():
    json.dump(d, open(os.path.join(O, "voz_pacotes", g + ".json"), "w"), separators=(",", ":"))
for cat in ("interface", "casa", "bichos"):
    for fmt in ("mp3", "ogg"):
        d = {}
        for r, _, ns in os.walk(os.path.join(O, cat)):
            for n in ns:
                if n.endswith("." + fmt):
                    d[os.path.relpath(os.path.join(r, n), O)[:-len(fmt) - 1]] = base64.b64encode(open(os.path.join(r, n), "rb").read()).decode()
        json.dump(d, open(os.path.join(O, "pacotes", f"{cat}_{fmt}.json"), "w"), separators=(",", ":"))
print("ok", len(grupos), "grupos de voz")
