"""Follow legacy public solution popups and archive their linked original PDFs."""
import hashlib
import json
import re
import shutil
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup
from acervo import BASE, download, metadata, save_json, write_results, document_link

pages = {}
rate_lock = threading.Lock()
next_request = 0.0
for path in (BASE / 'paginas').glob('obmep-20??.html'):
    year = int(path.stem[-4:])
    soup = BeautifulSoup(path.read_text(encoding='utf-8'), 'html.parser')
    for a in soup.select('a[onclick]'):
        m = re.search(r"window.open\('([^']+)'", a['onclick'])
        if not m:
            continue
        url = m.group(1).replace('http://www.obmep.org.br/', 'https://www.obmep.org.br/')
        block = a.find_parent(id=re.compile('provasCol'))
        phase = block.find('h2').get_text(' ', strip=True) if block and block.find('h2') else ''
        pages[url] = {'url': url, 'ano': year, 'titulo': phase + ' Solução ' + a.get_text(' ', strip=True)}

# The current 2021 index omits the main first-phase links. Probe the same public
# solution-page naming pattern; retain the fact that these URLs were inferred.
for level in [1, 2, 3]:
    url = 'https://www.obmep.org.br/provas_static/2021/f1n' + str(level) + '.htm'
    pages[url] = {'url': url, 'ano': 2021, 'titulo': '2021 - 1a FASE Solução NÍVEL ' + str(level),
                  'descoberta': 'URL inferida do padrão público; disponibilidade conferida na requisição'}


def fetch(p):
    global next_request
    out = BASE / 'paginas' / ('solucao-popup-' + hashlib.sha256(p['url'].encode()).hexdigest()[:16] + '.json')
    try:
        if not out.exists():
            for attempt in range(3):
                with rate_lock:
                    time.sleep(max(0, next_request - time.monotonic()))
                    next_request = time.monotonic() + 7
                run = subprocess.run([shutil.which('firecrawl'), 'scrape', p['url'], '--format', 'markdown,links', '-o', str(out)], capture_output=True, text=True, encoding='utf-8', timeout=120)
                if not run.returncode:
                    break
                if 'Rate limit' in run.stderr and attempt < 2:
                    delay = int(re.search(r'retry after (\d+)s', run.stderr).group(1)) if re.search(r'retry after (\d+)s', run.stderr) else 45
                    time.sleep(min(delay + 2, 59))
                else:
                    raise ValueError(run.stderr[-400:])
        data = json.loads(out.read_text(encoding='utf-8'))
        links = [u for u in data.get('links', []) if document_link(u)]
        if not links:
            raise ValueError('Nenhum PDF no popup; verificar pagina salva')
        return {**p, 'status': 'consultado', 'arquivo': out.relative_to(BASE).as_posix(), 'documentos': links}
    except Exception as e:
        return {**p, 'status': 'falha', 'erro': str(e)}


results = []
with ThreadPoolExecutor(max_workers=2) as pool:
    for r in pool.map(fetch, pages.values()):
        results.append(r)
        print(len(results), '/', len(pages), r['ano'], r['status'], flush=True)
save_json(BASE / 'solucoes-interativas.json', results)
records = json.loads((BASE / 'manifesto.json').read_text(encoding='utf-8'))
known = {r['url'] for r in records}
extra_path = BASE / 'fontes-adicionais.json'
extras = json.loads(extra_path.read_text(encoding='utf-8'))
new = []
for p in results:
    for u in p.get('documentos', []):
        if u in known:
            continue
        known.add(u)
        extra = {'url': u, 'pagina': p['url'], 'olimpiada': 'obmep', 'ano': p['ano'], 'titulo': p['titulo']}
        extras.append(extra)
        new.append({'id': hashlib.sha256(u.encode()).hexdigest()[:16], 'url': u, 'paginas_origem': [p['url']],
                    **metadata(u, p['titulo'], 'obmep', p['ano']), 'uso_comercial': 'nao_autorizado_por_esta_coleta', 'revisao_editorial': 'pendente'})
save_json(extra_path, extras)
with ThreadPoolExecutor(max_workers=3) as pool:
    for i, r in enumerate(pool.map(download, new), 1):
        records.append(r)
        print('PDF', i, '/', len(new), r['status'], flush=True)
write_results(records)
