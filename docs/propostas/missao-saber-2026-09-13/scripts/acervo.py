"""Collect public official study documents; keep provenance and verify PDF bytes.

Run from repository root: python docs/propostas/missao-saber-2026-09-13/scripts/acervo.py
Requires requests, beautifulsoup4, PyMuPDF. No login or commercial publication.
Discovery uses official indices, including their publicly linked edition pages.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

import fitz
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
CACHE = REPO / '.firecrawl'
BASE = ROOT / 'acervo'
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; EducationalResearch/1.0)'}
MANIFEST = BASE / 'manifesto.json'


def slug(value, limit=100):
    value = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')[:limit] or 'documento'


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def fetch_page(url, cache_name=None):
    path = BASE / 'paginas' / ((cache_name or hashlib.sha256(url.encode()).hexdigest()[:16]) + '.html')
    if path.exists():
        return path.read_text(encoding='utf-8')
    response = requests.get(url, headers=HEADERS, timeout=40)
    response.raise_for_status()
    # Many legacy OBMEP pages declare a conflicting charset. UTF-8 is their byte encoding.
    body = response.content.decode('utf-8', errors='replace')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding='utf-8')
    return body


def document_link(url):
    return bool(re.search(r'\.(pdf|zip|docx?)(?:$|[?#])', url, re.I) or re.search(r'drive.google.com/(?:a/[^/]+/)?file/d/',url))


def metadata(url, label='', group='', year=None):
    decoded = unquote(url).replace('+', ' ')
    combined = label + ' ' + decoded
    years = re.findall(r'(?<!\d)(20[0-2]\d)(?!\d)', combined)
    level = re.search(r'(?:n[ií]vel[ _-]*|prova)([123PEBCJS])(?:\W|_|\.|$)', combined, re.I)
    kind = 'material'
    for token, val in [('simulad', 'simulado'), ('caderno', 'caderno'), ('apostila', 'apostila'), ('gabarito', 'gabarito'), ('solu', 'solucao'), ('prova', 'prova'), ('regulamento', 'regulamento'), ('corte', 'nota-corte')]:
        if token in combined.lower():
            kind = val
            break
    if 'prova' in combined.lower() and 'gabarito' in combined.lower():
        kind = 'prova-gabarito'
    return {
        'olimpiada': group, 'ano': year or (int(years[-1]) if years else None),
        'nivel_indice': level.group(1).upper() if level else None,
        'tipo_indice': kind, 'titulo_indice': label.strip(),
        'idioma': 'en' if re.search(r'ingl|_ING|_EN\.', combined, re.I) else 'pt-BR',
    }


def discover():
    records = {}
    pages = []

    def add(url, page, group, label='', year=None):
        if not document_link(url):
            return
        # Do not collect named award lists: these do not supply curriculum content.
        if re.search(r'alunos.premiados|premiacao.dos.alunos', slug(label)):
            return
        key = hashlib.sha256(url.encode()).hexdigest()[:16]
        if key in records:
            if page not in records[key]['paginas_origem']:
                records[key]['paginas_origem'].append(page)
            return
        records[key] = {'id': key, 'url': url, 'paginas_origem': [page], **metadata(url, label, group, year),
                        'uso_comercial': 'nao_autorizado_por_esta_coleta', 'revisao_editorial': 'pendente'}

    for filename, group in [('olitef-arquivo.json', 'olitef'), ('canguru-arquivo.json', 'canguru'), ('canguru-popup.json', 'canguru'), ('obmep-banco.json', 'obmep'), ('obmep-apostilas.json', 'obmep'), ('obmep-simulados.json', 'obmep'), ('obmep-mirim.json', 'obmep-mirim')]:
        path = CACHE / filename
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding='utf-8'))
        page = data['metadata']['sourceURL']
        (BASE / 'paginas').mkdir(parents=True, exist_ok=True)
        save_json(BASE / 'paginas' / filename, data)
        pages.append({'url': page, 'arquivo': 'paginas/' + filename, 'origem': 'indice_oficial_renderizado'})
        soup = BeautifulSoup(data.get('html', ''), 'html.parser')
        links = {}
        for a in soup.select('a[href]'):
            label = a.get_text(' ', strip=True)
            if filename == 'obmep-banco.json':
                label = 'Banco de Questoes ' + a.parent.get_text(' ',strip=True)
            links[urljoin(page,a['href'])] = label
        for url in data.get('links', []):
            label = links.get(url, '')
            add(url, page, group, label)

    index_url = 'https://20a.obmep.org.br/provas.htm'
    index = fetch_page(index_url, 'obmep-indice')
    years = sorted(set(re.findall(r"load_page\('(provas-(\d{4})\.htm)'", index)))

    def edition(entry):
        path, year = entry
        url = urljoin(index_url, path)
        return url, year, fetch_page(url, 'obmep-' + year)

    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(edition, e) for e in years]):
            try:
                page, year, html = future.result()
                pages.append({'url': page, 'ano': int(year), 'arquivo': 'paginas/obmep-' + year + '.html', 'origem': 'indice_oficial'})
                soup = BeautifulSoup(html, 'html.parser')
                for a in soup.select('a[href]'):
                    label = a.get_text(' ', strip=True)
                    # Preserve edition/phase/level context as printed by the source.
                    block = a.find_parent(id=re.compile('provasCol'))
                    phase = block.find('h2').get_text(' ', strip=True) if block and block.find('h2') else ''
                    level = a.find_previous(class_='line-title')
                    context = ' '.join([phase, level.get_text(' ', strip=True) if level else '', label])
                    add(urljoin(page, a['href']), page, 'obmep', context, int(year))
                print('indice OBMEP', year, flush=True)
            except Exception as exc:
                pages.append({'status': 'falha', 'erro': str(exc)})

    extra_path = ROOT / 'acervo' / 'fontes-adicionais.json'
    if extra_path.exists():
        for e in json.loads(extra_path.read_text(encoding='utf-8')):
            add(e['url'], e['pagina'], e['olimpiada'], e.get('titulo', ''), e.get('ano'))
    save_json(BASE / 'indices.json', pages)
    save_json(BASE / 'fontes-descobertas.json', list(records.values()))
    return list(records.values())


def download(record, prior=None):
    result = dict(record)
    if prior and prior.get('status') == 'baixado':
        path = BASE / prior['arquivo']
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == prior['sha256']:
            return {**prior, **{k:v for k,v in record.items() if v is not None}}
    original = record['url']
    url = original
    match = re.search(r'drive.google.com/(?:a/[^/]+/)?file/d/([^/]+)', url)
    if match:
        url = 'https://drive.google.com/uc?export=download&id=' + match.group(1)
    result['coletado_em'] = datetime.now(timezone.utc).isoformat()
    try:
        response = requests.get(url, headers=HEADERS, timeout=60)
        result.update(http_status=response.status_code, url_download=response.url)
        response.raise_for_status()
        content = response.content
        if not content.startswith(b'%PDF-'):
            # Public Drive downloads may use a direct download host. This is a public file URL, not authentication.
            if match:
                url = 'https://drive.usercontent.google.com/download?id=' + match.group(1) + '&export=download&confirm=t'
                response = requests.get(url, headers=HEADERS, timeout=60)
                result.update(http_status=response.status_code, url_download=response.url)
                response.raise_for_status()
                content = response.content
            if not content.startswith(b'%PDF-'):
                if content.startswith(b'PK'):
                    ext = '.zip' if '.zip' in original.lower() else '.docx'
                else:
                    raise ValueError('Resposta nao e PDF/ZIP/DOCX; nao salvar pagina de erro como documento')
            else:
                ext = '.pdf'
        else:
            ext = '.pdf'
        doc = None
        text_content = ''
        if ext == '.pdf':
            doc = fitz.open(stream=content, filetype='pdf')
            if not len(doc):
                raise ValueError('PDF sem paginas')
            parts = ['\n\n--- PAGINA ' + str(i + 1) + ' ---\n' + p.get_text() for i, p in enumerate(doc)]
            text_content = ''.join(parts)
            result['paginas'] = len(doc)
            result['caracteres_extraidos'] = len(text_content)
            result['extracao'] = 'texto_extraido_revisao_pendente' if len(text_content) / len(doc) > 80 else 'requer_ocr_ou_inspecao'
            first = doc[0].get_text()
            result['inicio_documento'] = ' '.join(first.split())[:900]
            if not result.get('ano'):
                ys = re.findall(r'\b(20[0-2]\d)\b', first[:2500])
                result['ano'] = int(ys[0]) if ys else None
            m = re.search(r'(?:N[ÍIíi]VEL|N[íi]vel)\s*[:\-]?\s*([123PEBCJS])\b', first)
            if m:
                result['nivel_pdf'] = m.group(1)
            result['licenca_trechos'] = []
            for i in range(min(len(doc), 5)):
                page_text = doc[i].get_text()
                for term in ['creativecommons', 'BY-NC', 'Todos os direitos', 'direitos reservados', 'reprodução', 'reproducao']:
                    pos = page_text.lower().find(term.lower())
                    if pos >= 0:
                        result['licenca_trechos'].append({'pagina': i + 1, 'trecho': ' '.join(page_text[max(0,pos-100):pos+280].split())})
            doc.close()
        name = slug(unquote(urlparse(original).path.split('/')[-1]).replace('+', ' '), 80)
        if name in ('view', 'preview'):
            name = slug(record.get('titulo_indice') or result.get('inicio_documento', '')[:100], 80)
        rel = Path('arquivos') / record['olimpiada'] / str(result.get('ano') or 'sem-ano') / (name + '--' + record['id'] + ext)
        target = BASE / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        result.update(status='baixado', arquivo=rel.as_posix(), bytes=len(content), sha256=hashlib.sha256(content).hexdigest(), formato=ext[1:])
        if text_content:
            txt = Path('textos') / record['olimpiada'] / (record['id'] + '.txt')
            (BASE / txt).parent.mkdir(parents=True, exist_ok=True)
            (BASE / txt).write_text(text_content, encoding='utf-8')
            result['texto'] = txt.as_posix()
    except Exception as exc:
        result.update(status='falha', erro=str(exc))
    return result


def write_results(records):
    records.sort(key=lambda r: (r['olimpiada'], r.get('ano') or 0, r.get('titulo_indice',''), r['url']))
    save_json(MANIFEST, records)
    fields = ['id','olimpiada','ano','nivel_indice','nivel_pdf','tipo_indice','titulo_indice','idioma','status','arquivo','paginas','bytes','sha256','url','url_download','coletado_em','uso_comercial','revisao_editorial','extracao','erro']
    with (BASE / 'manifesto.csv').open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(records)
    counts = Counter((r['olimpiada'], r['status']) for r in records)
    summary = {'documentos': len(records), 'baixados': sum(r['status']=='baixado' for r in records),
               'falhas': sum(r['status']!='baixado' for r in records),
               'bytes': sum(r.get('bytes',0) for r in records), 'paginas_pdf': sum(r.get('paginas',0) for r in records),
               'por_grupo': {str(k):v for k,v in counts.items()}}
    save_json(BASE / 'resumo.json', summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download-only', action='store_true')
    parser.add_argument('--group')
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args()
    discovered = json.loads((BASE / 'fontes-descobertas.json').read_text(encoding='utf-8')) if args.download_only else discover()
    prior = {r['id']:r for r in json.loads(MANIFEST.read_text(encoding='utf-8'))} if MANIFEST.exists() else {}
    selected = [r for r in discovered if not args.group or r['olimpiada']==args.group]
    results = [r for r in prior.values() if r['id'] not in {x['id'] for x in selected}]
    with ThreadPoolExecutor(max_workers=max(1,min(args.workers,6))) as pool:
        tasks = [pool.submit(download, r, prior.get(r['id'])) for r in selected]
        for i, future in enumerate(as_completed(tasks),1):
            r = future.result()
            results.append(r)
            if i % 20 == 0 or r['status']=='falha':
                print(i, '/', len(selected), r['olimpiada'], r['status'], r.get('erro',r.get('ano')), flush=True)
            if i % 25 == 0:
                save_json(MANIFEST, results)
    write_results(results)


if __name__ == '__main__':
    main()
