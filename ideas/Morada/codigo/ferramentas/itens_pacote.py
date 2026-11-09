"""Junta itens da página (corpos_viewer/itens/<id>.txt) num arquivo só, itens/_novos.json ({id: texto}), para não passar
do limite de arquivos do artefato publicado. A página procura o item primeiro nesse pacote e depois no arquivo solto.
Uso: python3 -I itens_pacote.py <corpos_viewer> <lista de ids, um por linha>"""
import json, os, sys
V, lista = sys.argv[1], sys.argv[2]
ids = [l.strip() for l in open(lista) if l.strip()]
pac = {i: open(os.path.join(V, "itens", i + ".txt")).read().strip() for i in ids}
json.dump(pac, open(os.path.join(V, "itens", "_novos.json"), "w"), separators=(",", ":"))
print(len(pac), "itens,", round(os.path.getsize(os.path.join(V, "itens", "_novos.json")) / 1e6, 2), "MB")
