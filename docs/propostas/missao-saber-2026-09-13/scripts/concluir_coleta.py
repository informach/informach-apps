"""Add final official recovery sources without re-downloading the whole archive."""
import hashlib
import json
from acervo import BASE, CACHE, MANIFEST, download, metadata, save_json, write_results

extras_path = BASE / 'fontes-adicionais.json'
extras = json.loads(extras_path.read_text(encoding='utf-8'))
url = 'http://obmep2010.obmep.org.br/provas_static/export/sites/default/provas/provas2005/2005/1a_fase/Solucoes/NIVEL-3.pdf'
if not any(r['url'] == url for r in extras):
    extras.append({'url': url, 'pagina': 'https://www.obmep.org.br/provas-2005.htm',
                   'olimpiada': 'obmep', 'titulo': '1a Fase Nivel 3 Solucao - espelho oficial OBMEP 2010', 'ano': 2005})
save_json(extras_path, extras)
records = json.loads(MANIFEST.read_text(encoding='utf-8'))
known = {r['url'] for r in records}
for e in extras:
    if e['url'] not in known:
        record = {'id': hashlib.sha256(e['url'].encode()).hexdigest()[:16], 'url': e['url'],
                  'paginas_origem': [e['pagina']],
                  **metadata(e['url'], e.get('titulo', ''), e['olimpiada'], e.get('ano')),
                  'uso_comercial': 'nao_autorizado_por_esta_coleta', 'revisao_editorial': 'pendente'}
        result = download(record)
        print(result['status'], result['url'], result.get('erro', ''), flush=True)
        records.append(result)
        known.add(e['url'])
for p in CACHE.glob('obmep-current-*.html'):
    (BASE / 'paginas' / p.name).write_bytes(p.read_bytes())
reg = CACHE / 'obmep-regulamento-2026.md'
if reg.exists():
    (BASE / 'paginas' / reg.name).write_bytes(reg.read_bytes())
for i, record in enumerate(records):
    if record['status'] == 'falha' and record.get('http_status', 0) >= 500:
        records[i] = download(record)
        print('Repetição de erro transitório:', records[i]['status'], record['url'], flush=True)
write_results(records)
