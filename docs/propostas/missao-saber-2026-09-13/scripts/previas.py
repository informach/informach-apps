"""Render a declared sample of original PDFs for visual inspection (PyMuPDF)."""
import json
import fitz
from acervo import BASE, save_json

records = {r['id']: r for r in json.loads((BASE / 'manifesto.json').read_text(encoding='utf-8'))}
sample = [('cb9f961ae2c3b5f5', 3), ('d3a005dde5a10a4a', 25), ('0838192d009818b1', 33),
          ('317b619f7ab537c0', 2), ('4db83920ce1cbc02', 1), ('4bf5d38b19106096', 1)]
out = BASE / 'previas'
out.mkdir(parents=True, exist_ok=True)
log = []
for identity, page in sample:
    r = records[identity]
    with fitz.open(BASE / r['arquivo']) as d:
        name = identity + '-p' + str(page) + '.png'
        d[page - 1].get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False).save(out / name)
        log.append({'id': identity, 'pagina_fisica': page, 'original': r['arquivo'], 'imagem': 'previas/' + name})
save_json(BASE / 'amostra-visual.json', log)
print('6 páginas de 6 PDFs renderizadas em', out)
