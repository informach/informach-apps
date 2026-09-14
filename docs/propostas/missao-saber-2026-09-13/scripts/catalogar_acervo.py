"""Catalogue downloaded official material; preserve raw acquisition metadata."""
import csv
import hashlib
import json
import re
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlparse

import fitz
from bs4 import BeautifulSoup
from acervo import ROOT, BASE, save_json, slug


def norm(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()


def capture(pattern, s):
    m = re.search(pattern, s, re.I)
    return m.group(1) if m else None


records = json.loads((BASE / 'manifesto.json').read_text(encoding='utf-8'))
mirim_code = (BASE / 'paginas/mirim-main.js').read_text(encoding='utf-8')
mirim = {}
for m in re.finditer(r'link:"(https://drive.google.com/file/d/[^\"]+)"\},"([^\"]+)"', mirim_code):
    headings = list(re.finditer(r'variant:"h6"\},"([^\"]+)"', mirim_code[:m.start()]))
    heading = headings[-1].group(1) if headings else ''
    label = m.group(2)
    if 'MIRIM' not in label and 'NIVEL A' not in label:
        continue
    phase = capture(r'^([12])', heading) if 'Fase' in heading else None
    year = capture(r'(20\d{2})', heading)
    if 'NIVEL A' in label:
        edition = int(capture(r'^([123])', label))
        year = 2018 + edition
        level = 'A'
    else:
        level = capture(r'MIRIM ([12])', label)
    mirim[m.group(1)] = {'grupo': 'obmep-mirim', 'ano_catalogo': int(year),
                         'nivel': level, 'fase': phase,
                         'categoria': 'solucao' if 'SOLU' in label else 'prova',
                         'titulo_catalogo': label.replace('\\xaa', 'ª') + ' / ' + heading.replace('\\xaa', 'ª').replace('\\xe9', 'é'),
                         'metodo_catalogacao': 'Título e seção do índice público Mirim'}

pic_titles = {}
data = json.loads((BASE / 'paginas/obmep-apostilas.json').read_text(encoding='utf-8'))
for a in BeautifulSoup(data.get('html', ''), 'html.parser').select('a[href]'):
    if '.pdf' in a['href']:
        pic_titles[a['href']] = a.parent.get_text(' ', strip=True).removesuffix(' abrir')

for r in records:
    label = r['titulo_indice']
    first = r.get('inicio_documento', '')
    filename = unquote(urlparse(r['url']).path.rsplit('/', 1)[-1]).replace('+', ' ')
    n = norm(label + ' ' + filename + ' ' + first[:220])
    source = ' '.join(r['paginas_origem'])
    year = r.get('ano')
    # Never use a number occurring inside a problem as the date of a Mirim/PIC/POTI course.
    level = capture(r'nivel[ _-]*([1234apebcjs])\b', n)
    if level:
        level = level.upper()
    phase = capture(r'([12])[aªoº ]*\s*fase', norm(label))
    category = 'material'
    for token, cat in [('regulamento', 'regulamento'), ('corte', 'nota-corte'), ('programatico', 'programa'),
                       ('caderno', 'caderno'), ('simulado', 'simulado'), ('gabarito', 'gabarito'),
                       ('solu', 'solucao'), ('prova', 'prova')]:
        if token in n:
            category = cat
            break
    title = label or filename
    method = 'Título do índice, nome do arquivo e cabeçalho do PDF; classificação automática revisável'
    if r['olimpiada'] == 'olitef':
        if 'caderno do estudante' in norm(first):
            category, year = 'caderno', 2026
            title = 'OLITEF 2026 — Caderno do Estudante — Nível ' + r['nivel_pdf']
            method = 'Capa e expediente (página física 3) do PDF'
        elif len(filename) < 60 and '_files/' in r['url']:
            year = int(capture(r'OLITEF\s+(20\d{2})', first) or year or 2026)
            title = ('OLITEF ' + str(year) + ' — ' + first[:180]).strip()
        if category == 'gabarito' and 'PROVA' in first[:50]:
            category = 'prova-gabarito'
        if category in ('nota-corte', 'regulamento'):
            level = None
    elif r['olimpiada'] == 'canguru':
        year = int(capture(r'(20\d{2})', first[:120]) or year or 0) or None
        if category == 'material' and (level or 'points' in norm(first) or 'problemas' in norm(first)):
            category = 'prova'
        if not level:
            for word, val in [('pre ecolier', 'P'), ('ecolier', 'E'), ('benjamin', 'B'), ('cadet', 'C'), ('junior', 'J'), ('student', 'S')]:
                if word in norm(first[:150]):
                    level = val
                    break
        if category in ('nota-corte', 'programa'):
            level = None
        r['idioma'] = 'en' if re.search(r'(ingl|[_ -]ing[_ .-]|english|points problems)', norm(filename + ' ' + first[:180])) else 'pt-BR'
        title = 'Canguru ' + str(year or 'sem data') + ' — ' + category + (' — Nível ' + level if level else '') + ' — ' + r['idioma']
    if 'banco.htm' in source:
        category = 'banco-errata' if 'errat' in n else 'banco'
        level = '1/2/3'
        title = label.removesuffix(' abrir')
    elif 'apostilas.htm' in source:
        category, year, level = 'apostila-pic', None, None
        title = pic_titles.get(r['url'], filename)
        method = 'Título editorial do índice PIC; edição do documento deve ser conferida antes de publicar'
    elif 'simulados.htm' in source:
        category = 'simulado-' + ('solucao' if 'solu' in n else 'gabarito' if 'gabarito' in n else 'prova')
    if r['olimpiada'] == 'obmep-poti':
        category, year, level = ('pacote' if r.get('formato') == 'zip' else 'material-poti'), None, None
        module = capture(r'modulo=(\d+)', source)
        title = 'POTI — pacote histórico' if not module else 'POTI — módulo ' + module + ' — ' + filename
        if module:
            soup = BeautifulSoup((BASE / 'paginas' / ('poti-modulo-' + module + '.html')).read_text(encoding='utf-8'), 'html.parser')
            h3 = soup.find('h3')
            if h3:
                title = 'POTI — módulo ' + module + ' — ' + h3.get_text(' ', strip=True) + ' — ' + filename
            a = soup.find('a', href=r['url'])
            if a:
                text = a.parent.get_text(' ', strip=True)
                if len(text) < 350:
                    title = 'POTI — módulo ' + module + ' — ' + text
        method = 'Catálogo de módulos POTI; ano não inferido dos números dos exercícios'
    r.update(grupo=r['olimpiada'], ano_catalogo=year, nivel=level, fase=phase, categoria=category,
             titulo_catalogo=title, metodo_catalogacao=method)
    if r['url'] in mirim:
        r.update(mirim[r['url']])
    elif 'olimpiada carioca' in norm(label):
        r['grupo'] = 'obmep-carioca'

records.sort(key=lambda r: (r['grupo'], r['ano_catalogo'] or 0, r['titulo_catalogo'], r['id']))
save_json(BASE / 'catalogo.json', records)
fields = ['id', 'grupo', 'ano_catalogo', 'nivel', 'fase', 'categoria', 'titulo_catalogo', 'idioma', 'status', 'arquivo',
          'paginas', 'sha256', 'bytes', 'url', 'metodo_catalogacao', 'uso_comercial', 'revisao_editorial', 'erro']
with (BASE / 'catalogo.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(records)

# Inspect ZIP members as data only. Create local paths from hashes; never extract supplied paths.
package = next(r for r in records if r.get('formato') == 'zip')
members = []
unique = {}
fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_display_warnings(False)
with zipfile.ZipFile(BASE / package['arquivo']) as z:
    bad = z.testzip()
    if bad:
        raise ValueError('ZIP CRC failure: ' + bad)
    for item in z.infolist():
        info = {'nome_no_zip': item.filename, 'bytes': item.file_size, 'diretorio': item.is_dir()}
        if item.filename.lower().endswith('.pdf') and not item.is_dir():
            payload = z.read(item)
            sha = hashlib.sha256(payload).hexdigest()
            info['sha256'] = sha
            if sha not in unique:
                rel = Path('arquivos/obmep-poti/pacote') / (slug(Path(item.filename).stem, 60) + '--' + sha[:16] + '.pdf')
                dest = BASE / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(payload)
                with fitz.open(stream=payload, filetype='pdf') as doc:
                    text = '\n\n'.join('--- PAGINA ' + str(i + 1) + ' ---\n' + p.get_text() for i, p in enumerate(doc))
                    txt = Path('textos/obmep-poti/pacote') / (sha[:16] + '.txt')
                    (BASE / txt).parent.mkdir(parents=True, exist_ok=True)
                    (BASE / txt).write_text(text, encoding='utf-8')
                    unique[sha] = {'arquivo': rel.as_posix(), 'texto': txt.as_posix(), 'paginas': len(doc),
                                   'avisos_pdf': fitz.TOOLS.mupdf_warnings(), 'bytes': len(payload)}
            info.update(unique[sha])
        members.append(info)
save_json(BASE / 'pacote-poti.json', {'url': package['url'], 'arquivo_zip': package['arquivo'],
                                    'crc': 'ok', 'membros': members})
with (BASE / 'pacote-poti.csv').open('w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['nome_no_zip', 'bytes', 'diretorio', 'sha256', 'arquivo', 'paginas', 'texto'], extrasaction='ignore')
    w.writeheader()
    w.writerows(members)

good = [r for r in records if r['status'] == 'baixado']
summary = {'urls_documentos': len(records), 'downloads_validos': len(good), 'urls_com_falha': len(records) - len(good),
           'arquivos_unicos_sha256': len({r['sha256'] for r in good}), 'bytes_downloads': sum(r['bytes'] for r in good),
           'paginas_pdf_downloads': sum(r.get('paginas', 0) for r in good),
           'por_grupo': dict(Counter(r['grupo'] for r in good)),
           'por_categoria': dict(Counter(r['categoria'] for r in good)),
           'zip_entradas': len(members), 'zip_membros_pdf': sum('sha256' in r for r in members),
           'zip_pdfs_unicos': len(unique), 'zip_paginas_pdfs_unicos': sum(r['paginas'] for r in unique.values()),
           'zip_bytes_pdfs_unicos': sum(r['bytes'] for r in unique.values()),
           'mirim_urls_identificadas_no_indice': len(mirim)}
save_json(BASE / 'resumo-catalogo.json', summary)

lines = ['# Catálogo de arquivos', '', 'Consulta: 13/09/2026. Caminhos relativos a este catálogo. Os originais estão no disco local e fora do Git.', '',
         'A catalogação não é aprovação editorial nem licença comercial. Use os campos normalizados deste catálogo; o manifesto bruto preserva inferências iniciais e pode conter anos ou níveis corrigidos aqui.', '']
for group in sorted({r['grupo'] for r in records}):
    lines += ['## ' + group, '', '| Ano | Nível / fase | Documento | Original oficial |', '| --- | --- | --- | --- |']
    for r in records:
        if r['grupo'] != group:
            continue
        title = r['titulo_catalogo'].replace('|', '/').replace('\n', ' ')[:220]
        doc = '[' + title + '](' + r['arquivo'] + ')' if r['status'] == 'baixado' else title + ' — **falha**'
        lines.append('| ' + str(r['ano_catalogo'] or '—') + ' | ' + str(r['nivel'] or '—') + ' / ' + str(r['fase'] or '—') + ' | ' + doc + ' | [fonte](' + r['url'] + ') |')
    lines += ['']
(BASE / 'CATALOGO.md').write_text('\n'.join(lines), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
print('OBMEP core slots by year:', Counter(r['ano_catalogo'] for r in good if r['grupo'] == 'obmep' and r['fase'] and r['categoria'] in ('prova', 'solucao')))
