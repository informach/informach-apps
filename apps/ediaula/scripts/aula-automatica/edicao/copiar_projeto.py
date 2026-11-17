"""Copia o projeto gravado para "<nome> · edição automática.ediaula", na mesma pasta, com um id novo.

A edição automática vai sempre na cópia: refazê-la substitui só a cópia, e o projeto gravado (com os
ajustes feitos à mão) fica intacto. Uma cópia anterior vai para "<nome> · edição automática (anterior)".
Uso: copiar_projeto.py <projeto.ediaula>  ->  imprime o caminho da cópia
"""

import json
import os
import random
import shutil
import string
import sys

orig = sys.argv[1]
d = json.load(open(orig, encoding="utf8"))
base = os.path.splitext(orig)[0]
copia = f"{base} · edição automática.ediaula"
if os.path.exists(copia):
    shutil.move(copia, f"{base} · edição automática (anterior).ediaula")
d["id"] = "p" + "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(12))
d["name"] = f"{d.get('name') or os.path.basename(base)} · edição automática"
json.dump(d, open(copia, "w", encoding="utf8"), ensure_ascii=False)
print(copia.replace("\\", "/"))
