"""Resumo das medidas dos testes de encaixe das ruas diagonais (lê <pasta>/<teste>_medidas.json).

  python3 -I morada-art/ruas_diagonais_resumo.py SP/cidade_out/ruas_diagonais/encaixe
"""
import json
import os
import sys

pasta = sys.argv[1]
for t in ("a", "a2", "b", "c", "c2", "d"):
    f = os.path.join(pasta, t + "_medidas.json")
    if not os.path.exists(f):
        continue
    d = json.load(open(f))
    c = d["chao"]
    print(f"[{t}] chão: {c['bordas_medidas']} bordas, {c['amostras']} amostras, degraus > 5 mm: {c['degraus_>5mm']} "
          f"(máx {c['degrau_max_mm']} mm), frestas: {c['frestas']}, só pintura/junta (1–5 mm): "
          f"{c['so_pintura_ou_junta_1_a_5mm']}; controle piso×piso: {c.get('controle_piso_piso')}")
    so = d["sobreposicao_chao"]
    print(f"     sobreposição (passa da quadra, mm): máx {max(so.values()) if so else 0}")
    for j in d["tabuleiros"]:
        print(f"     tabuleiro {j['junta']}: {j['antes']} → {j['depois']}: degrau máx {j['degrau_max_mm']} mm, "
              f"frestas {j['frestas']}/{j['amostras']}, passa do corte {j['passa_do_corte_mm']} mm")
    fx = d["faixas"]
    print(f"     faixas: {fx['ligadas']} de {fx['pontas']} pontas ligadas (dist máx {fx['dist_max_mm']} mm), "
          f"{fx['soltas_(fim_da_montagem)']} soltas nas pontas da montagem")
