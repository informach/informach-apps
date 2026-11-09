"""Voz inventada dos moradores ("moradês"): gera as frases da biblioteca com o motor em JavaScript
(sons_voz_motor.js, o mesmo módulo que o jogo usa ao vivo no navegador), normaliza e grava cada uma,
com o envelope da boca por quadro em sons_out/voz/boca.json.

Combinações: criança, adulto e idoso × masculina e feminina × neutro, feliz, triste, bravo, surpreso, rindo e
sono; e o bebê (masculino e feminino) com choro, balbucio e risada. 12 frases por combinação.
"""
import json, os, shutil, subprocess, sys
import numpy as np
from sons_lib import *

CAT = "voz"
AQUI = os.path.dirname(os.path.abspath(__file__))
MOTOR = os.path.join(AQUI, "sons_voz_motor.js")
RENDER = os.path.join(AQUI, "sons_voz_render.mjs")
FRASES = 12
IDADES = {"bebe": "Bebê", "crianca": "Criança", "adulto": "Adulto", "idoso": "Idoso"}
SEXOS = {"m": "masculina", "f": "feminina"}
EMOCOES = {"neutro": "neutro", "feliz": "feliz", "triste": "triste", "bravo": "bravo", "surpreso": "surpreso",
           "rindo": "rindo", "sono": "sono", "choro": "choro de bebê", "balbucio": "balbucio"}
POR_IDADE = {"bebe": ["choro", "balbucio", "rindo"],
             "crianca": ["neutro", "feliz", "triste", "bravo", "surpreso", "rindo", "sono"],
             "adulto": ["neutro", "feliz", "triste", "bravo", "surpreso", "rindo", "sono"],
             "idoso": ["neutro", "feliz", "triste", "bravo", "surpreso", "rindo", "sono"]}


def render(pedidos, pasta):
    """Roda o motor JS no Node para uma lista de pedidos; devolve {id: (amostras, info)}."""
    os.makedirs(pasta, exist_ok=True)
    arq = os.path.join(pasta, "pedidos.json")
    json.dump(pedidos, open(arq, "w"))
    subprocess.run(["nice", "-n", "15", "node", RENDER, arq, pasta], check=True, capture_output=True)
    ind = json.load(open(os.path.join(pasta, "indice.json")))
    out = {}
    for p in pedidos:
        x = np.fromfile(os.path.join(pasta, p["id"] + ".f32"), dtype=np.float32).astype(np.float64)
        out[p["id"]] = (x, ind[p["id"]])
        os.remove(os.path.join(pasta, p["id"] + ".f32"))
    return out


def main():
    os.makedirs(os.path.join(OUT, CAT), exist_ok=True)
    shutil.copyfile(MOTOR, os.path.join(OUT, CAT, "morada_voz.js"))
    pedidos = []
    for idade, emos in POR_IDADE.items():
        for sexo in SEXOS:
            for emo in emos:
                for k in range(FRASES):
                    pedidos.append({"id": f"{idade}_{sexo}_{emo}_{k + 1:02d}", "idade": idade, "sexo": sexo, "emocao": emo,
                                    "semente": 1000 + k * 37 + (7 if sexo == "f" else 0)})
    so = sys.argv[1:]
    if so:
        pedidos = [p for p in pedidos if any(p["id"].startswith(s) for s in so)]
    falas = render(pedidos, "/dev/shm/morada_sons/voz_render")
    cam_boca = os.path.join(OUT, CAT, "boca.json")
    boca = json.load(open(cam_boca)) if os.path.exists(cam_boca) else {}
    for p in pedidos:
        x, info = falas[p["id"]]
        nome = f"{IDADES[p['idade']]}, voz {SEXOS[p['sexo']]}, {EMOCOES[p['emocao']]} {p['id'][-2:]}"
        it = salvar(CAT, p["id"], x, nome, f"{p['idade']}_{p['sexo']}", descricao=info["texto"], aparar_silencio=False,
                    fade_ent=0.002, fade_sai=0.01, max_limite=16.0,
                    extra={"idade": p["idade"], "sexo": p["sexo"], "emocao": p["emocao"], "texto": info["texto"], "semente": p["semente"]})
        boca[p["id"]] = {"fps": info["boca"]["fps"], "inicio_s": 0.006, "amp": info["boca"]["amp"], "forma": info["boca"]["forma"]}
        print(f"{p['id']:24s} {it['dur']:5.2f}s {it['lufs']:6.1f} LUFS  {info['texto']}")
    json.dump(boca, open(cam_boca, "w"), separators=(",", ":"), ensure_ascii=False)


if __name__ == "__main__":
    main()
