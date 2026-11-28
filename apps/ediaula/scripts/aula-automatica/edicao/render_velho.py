"""Render velho de peça refeita: o .edisvg mais novo que o vinculos.json da pasta "<peça> · renders".

O vinculos.json fica (é ele que diz ao EdiSVG que a peça está vinculada a uma aula e deve renderizar a cada
salvamento); só o render de cada animação sai, e a peça renderiza de novo ao ser salva (renderizar-pecas.mjs).
Apagar o arquivo inteiro desfazia o vínculo, e salvar não renderizava mais (Cadê A1P3, 28/11/2026). Sem
vinculos.json nenhum (apagado antes desta regra), ele é refeito a partir do .edisvg.

Uso: render_velho.py <pasta das peças>    imprime cada peça descartada
"""
import glob
import json
import os
import sys
import time


def manifesto(arq):
    return f"{arq[:-len('.edisvg')]} · renders/vinculos.json"


def descartar(arq):
    """Tira o render velho da peça (mantém o vínculo). Devolve True se descartou."""
    m = manifesto(arq)
    pasta = os.path.dirname(m)
    agora = int(time.time() * 1000)
    if os.path.exists(m):
        if os.path.getmtime(arq) <= os.path.getmtime(m):
            return False
        d = json.load(open(m, encoding="utf-8"))
        for item in d.get("items", []):
            item.pop("render", None)
            item.pop("error", None)
            item["updatedAt"] = agora
    elif os.path.isdir(pasta):
        # A pasta de renders existe (a peça já foi vinculada) mas o manifesto sumiu: refeito do .edisvg.
        doc = json.load(open(arq, encoding="utf-8"))
        anim = doc["motion"]["animations"][0]
        d = {"version": 1, "projectId": doc["id"], "items": [{
            "animationId": anim["id"], "artboardId": doc.get("defaultArtboardId", "artboard-cena"),
            "name": anim["name"], "updatedAt": agora}]}
    else:
        return False
    json.dump(d, open(m, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return True


if __name__ == "__main__":
    for arq in sorted(glob.glob(os.path.join(sys.argv[1], "*.edisvg"))):
        if descartar(arq):
            print("render antigo descartado:", os.path.basename(arq))
