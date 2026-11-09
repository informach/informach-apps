"""Monta a pasta da página de ícones (icones_viewer/) a partir de icones_out/.

Uso: python3 -I icones_pagina.py <SP>
"""
import os
import shutil
import sys

ARQUIVOS = ["icones.json", "sprite/icones.svg", "sprite/icones_64.png", "sprite/icones_128.png", "sprite/icones.json",
            "marcador/marcador.glb", "marcador/propostas.png", "menu_radial.png", "folha_icones.png"] + \
           [f"barras/barra_{e}.png" for e in ("otimo", "bom", "medio", "baixo", "critico")]


def main():
    sp = os.path.abspath(sys.argv[1])
    src, dst = os.path.join(sp, "icones_out"), os.path.join(sp, "icones_viewer")
    for a in ARQUIVOS:
        os.makedirs(os.path.dirname(os.path.join(dst, a)), exist_ok=True)
        shutil.copy2(os.path.join(src, a), os.path.join(dst, a))
    print("página de ícones:", len(ARQUIVOS), "arquivos")


if __name__ == "__main__":
    main()
