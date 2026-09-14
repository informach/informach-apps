"""Expand the official archive using public page links and current edition corrections."""
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from acervo import ROOT, BASE, CACHE, fetch_page, save_json

path = BASE / 'fontes-adicionais.json'
extras = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
known = {r['url'] for r in extras}


def add(url, page, group, title='', year=None):
    if url not in known:
        extras.append({'url':url, 'pagina':page, 'olimpiada':group, 'titulo':title, 'ano':year})
        known.add(url)


add('https://www.cangurudematematicabrasil.com.br/_files/ugd/7aad12_e4850730edb3462799273e3dcfb75447.pdf',
    'https://www.cangurudematematicabrasil.com.br/regulamento', 'canguru', 'Conteudo programatico cumulativo P E B C J S')
add('https://canguru-de-matematica.s3.amazonaws.com/Gabarito/2022/Gabarito+N%C3%ADvel+S+2022.pdf',
    'https://www.cangurudematematicabrasil.com.br/provas-anteriores', 'canguru', 'Gabarito Nivel S 2022; URL inferida do padrao oficial e confirmada HTTP 200', 2022)
add('https://poti.impa.br/uploads/Materiais.zip', 'https://poti.impa.br/index.php/site/material', 'obmep-poti', 'Material teorico e simulados de anos anteriores - pacote oficial')
for filename in ['olitef-home.json']:
    d = json.loads((CACHE / filename).read_text(encoding='utf-8'))
    for url in d['links']:
        if url.endswith('.pdf'):
            add(url, d['metadata']['sourceURL'], 'olitef')

for year in list(range(2005,2020))+list(range(2021,2026)):
    page = 'https://www.obmep.org.br/provas-' + str(year) + '.htm'
    path = CACHE / ('obmep-current-' + str(year) + '.html')
    if path.exists():
        soup = BeautifulSoup(path.read_text(encoding='utf-8'), 'html.parser')
        for a in soup.select('a[href]'):
            if 'drive.google.com/file/d/' in a['href']:
                level = a.find_previous(class_='line-title')
                block = a.find_parent(id=re.compile('provasCol'))
                phase = block.find('h2').get_text(' ',strip=True) if block and block.find('h2') else ''
                title = phase + ' ' + (level.get_text(' ',strip=True) if level else '') + ' ' + a.get_text(' ',strip=True)
                add(a['href'],page,'obmep',title,year)

# The Mirim SPA embeds the public tab content in its main JavaScript bundle.
# Read URL literals as data, without executing any remote script.
mirim_page = 'https://olimpiadamirim.obmep.org.br/provas-solucoes'
mirim_html = fetch_page(mirim_page,'mirim-shell')
shell = BeautifulSoup(mirim_html,'html.parser')
script_url = urljoin(mirim_page,next(e['src'] for e in shell.select('script[src]') if '/static/js/main.' in e['src']))
script = requests.get(script_url,timeout=40)
script.raise_for_status()
(BASE / 'paginas' / 'mirim-main.js').write_bytes(script.content)
code = script.text
for m in re.finditer(r'https?[^"\s<>]+',code):
    url = m.group(0).replace('\\/','/')
    if 'drive.google.com/file/d/' in url or re.search(r'\.(pdf|zip)$',url):
        add(url,mirim_page,'obmep-mirim','Recurso publico dos menus Mirim; conferir titulo no PDF')
print('Mirim document URLs',sum(r['olimpiada']=='obmep-mirim' for r in extras))

# All public theory-module links advertised by the current POTI material catalogue.
module_pages = []
for n in range(1,16):
    module_pages.append('https://poti.impa.br/index.php/site/material?MaterialTeorico_page=' + str(n))


def read_modules(url):
    html = fetch_page(url,'poti-material-'+url.rsplit('=',1)[-1])
    soup = BeautifulSoup(html,'html.parser')
    return {urljoin(url,a['href']) for a in soup.select('a[href]') if '/modulo/ver?' in a['href']}


modules = set()
with ThreadPoolExecutor(max_workers=3) as pool:
    for found in pool.map(read_modules,module_pages):
        modules.update(found)


def read_documents(url):
    html = fetch_page(url,'poti-modulo-'+url.rsplit('=',1)[-1])
    soup = BeautifulSoup(html,'html.parser')
    title = soup.title.get_text(' ',strip=True) if soup.title else 'POTI material'
    return url,title,[urljoin(url,a['href']) for a in soup.select('a[href]') if '.pdf' in a['href']]


with ThreadPoolExecutor(max_workers=3) as pool:
    for url,title,docs in pool.map(read_documents,sorted(modules)):
        for doc in docs:
            add(doc,url,'obmep-poti',title)
print('POTI modules',len(modules),'PDFs/ZIPs',sum(r['olimpiada']=='obmep-poti' for r in extras))
save_json(BASE / 'fontes-adicionais.json',extras)
print('Additional sources',len(extras))
