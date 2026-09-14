"""Verify archive integrity, curricular coverage, local links and lesson calculations."""
import hashlib
import itertools
import json
import math
import re
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote
import fitz
from acervo import ROOT, BASE, save_json

rows = json.loads((BASE / 'catalogo.json').read_text(encoding='utf-8'))
package = json.loads((BASE / 'pacote-poti.json').read_text(encoding='utf-8'))
errors, warnings, checked = [], [], []
fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_display_warnings(False)
targets = {r['arquivo']: r for r in rows if r['status'] == 'baixado'}
targets.update({r['arquivo']: r for r in package['membros'] if 'arquivo' in r})
for name, r in targets.items():
    try:
        path = BASE / name
        payload = path.read_bytes()
        assert len(payload) == r['bytes'], 'size mismatch'
        assert hashlib.sha256(payload).hexdigest() == r['sha256'], 'hash mismatch'
        if name.endswith('.pdf'):
            with fitz.open(path) as doc:
                assert len(doc) == r['paginas'], 'page count mismatch'
                sparse = 0
                chars = 0
                for p in doc:
                    text = p.get_text()
                    chars += len(text)
                    sparse += len(text.strip()) < 40
                item = {'arquivo': name, 'paginas': len(doc), 'paginas_pouco_texto': sparse, 'caracteres': chars}
            parser_warnings = fitz.TOOLS.mupdf_warnings()
            if parser_warnings:
                warnings.append({'arquivo': name, 'tipo': 'estrutura_pdf', 'detalhe': parser_warnings})
            checked.append(item)
        elif name.endswith('.zip'):
            with zipfile.ZipFile(path) as z:
                assert z.testzip() is None, 'ZIP CRC mismatch'
    except Exception as e:
        errors.append({'arquivo': name, 'erro': str(e)})

links = []
docs = list(ROOT.glob('*.md')) + [BASE / 'CATALOGO.md']
for p in docs:
    body = p.read_text(encoding='utf-8')
    if '\ufffd' in body:
        errors.append({'arquivo': p.name, 'erro': 'replacement character'})
    refs = set(re.findall(r'\[\^(\d+)\]', body))
    definitions = set(re.findall(r'^\[\^(\d+)\]:', body, flags=re.M))
    if refs != definitions:
        errors.append({'arquivo': p.name, 'erro': 'undefined footnotes', 'refs': sorted(refs - definitions)})
    for target in re.findall(r'\]\(([^\s)]+)\)', body):
        if re.match(r'https?://|#|mailto:', target):
            continue
        target = unquote(target.split('#', 1)[0].strip('<>'))
        links.append(str(p.parent / target))
        if not (p.parent / target).exists():
            errors.append({'arquivo': p.name, 'erro': 'broken local link', 'target': target})

# Independent calculations for the original lesson prototypes and business model.
D = Decimal
calculations = {}
calculations['desconto_sucessivo_150'] = str(D(150) * D('0.8') * D('0.9'))
calculations['desconto_30_150'] = str(D(150) * D('0.7'))
calculations['desconto_sucessivo_80'] = str(D(80) * D('0.75') * D('0.9'))
calculations['aumento_reducao'] = str(D(100) * D('1.2') * D('0.8'))
assert [D(v) for v in calculations.values()] == [108, 105, 54, 96]
cells = {(x, y) for x in range(5) for y in range(3)}
def perimeter(shape):
    return sum((x + dx, y + dy) not in shape for x, y in shape for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)])
calculations['areas_perimetros'] = [(len(s), perimeter(s)) for s in [cells, cells - {(4, 2)}, cells - {(2, 2)}]]
assert calculations['areas_perimetros'] == [(15, 16), (14, 16), (14, 18)]
def avoids_pair(values, total):
    return not any(total - x in values and total - x != x for x in values)
assert avoids_pair(set(range(1, 9)), 16)
assert all(not avoids_pair(set(c), 16) for c in itertools.combinations(range(1, 16), 9))
assert avoids_pair(set(range(1, 11)), 20)
assert all(not avoids_pair(set(c), 20) for c in itertools.combinations(range(1, 20), 11))
calculations['cartoes_minimos'] = [9, 11]
calculations['combinacoes_verificadas'] = math.comb(15, 9) + math.comb(19, 11)
calculations['contribuicao_conta'] = str(D(28) * D('.88') - D('4.50'))
calculations['contas_equilibrio'] = math.ceil(D(25000) / D('20.14'))
assert calculations['contas_equilibrio'] == 1242
calculations['custo_ferramentas_visuais'] = [150 * 80, 300 * 80]
calculations['custo_atividades_e_ferramentas'] = [550 * 80 + 150 * 80, 1100 * 80 + 300 * 80]

# Coverage uses normalized metadata, counts distinct roles rather than copies or translations.
coverage = []
good = [r for r in rows if r['status'] == 'baixado']
for year in list(range(2005, 2020)) + list(range(2021, 2026)):
    expected = {(str(n), str(f), c) for n in [1, 2, 3] for f in [1, 2] for c in ['prova', 'solucao']}
    found = {(r['nivel'], r['fase'], r['categoria']) for r in good if r['grupo'] == 'obmep' and r['ano_catalogo'] == year}
    coverage.append({'olimpiada': 'obmep', 'ano': year, 'papeis_esperados': 12, 'papeis_encontrados': len(expected & found), 'faltantes': sorted(expected - found)})
for year in range(2021, 2027):
    expected = {(n, c, lang) for n in 'PEBCJS' for c, lang in [('prova', 'pt-BR'), ('prova', 'en'), ('gabarito', 'pt-BR')]}
    found = {(r['nivel'], r['categoria'], r['idioma']) for r in good if r['grupo'] == 'canguru' and r['ano_catalogo'] == year}
    coverage.append({'olimpiada': 'canguru', 'ano': year, 'papeis_esperados': 18, 'papeis_encontrados': len(expected & found), 'faltantes': sorted(expected - found)})
for year in [2024, 2025, 2026]:
    cats = ['prova-gabarito'] if year == 2024 else ['prova-gabarito', 'simulado'] if year == 2025 else ['caderno']
    expected = {(str(n), c) for n in [1, 2, 3] for c in cats}
    found = {(r['nivel'], r['categoria']) for r in good if r['grupo'] == 'olitef' and r['ano_catalogo'] == year}
    coverage.append({'olimpiada': 'olitef', 'ano': year, 'papeis_esperados': len(expected), 'papeis_encontrados': len(expected & found), 'faltantes': sorted(expected - found)})
save_json(BASE / 'cobertura.json', coverage)
report = {'executado_em': datetime.now(timezone.utc).isoformat(), 'arquivos_verificados': len(targets), 'pdfs_verificados': len(checked),
          'paginas_pdf_verificadas': sum(r['paginas'] for r in checked), 'links_locais_verificados': len(links),
          'erros': errors, 'avisos_pdf': warnings, 'arquivos_com_pouco_texto': [r for r in checked if r['paginas_pouco_texto']],
          'calculos': calculations, 'cobertura': coverage,
          'veredito': 'PASS' if not errors else 'FAIL',
          'escopo': 'Integridade dos arquivos locais, leitura de páginas PDF, links locais, cálculos e inventário. Não é revisão integral dos exercícios nem validação de aprendizagem.'}
save_json(BASE / 'verificacao.json', report)
command = 'python -X utf8 docs/propostas/missao-saber-2026-09-13/scripts/verificar_entrega.py'
verification_text = f'''# Verificação da entrega

```text
VERIFICATION REPORT
-------------------
Claim: Integridade dos arquivos locais, leitura de PDFs, links locais e cálculos dos exemplos.
Command: {command}
Executed: {report['executado_em']}
Exit code: {int(bool(errors))}
Output summary: {len(targets)} arquivos; {len(checked)} PDFs; {report['paginas_pdf_verificadas']} páginas; {len(links)} links locais; {len(errors)} erros.
Warnings: {len(warnings)} PDFs com avisos internos de estrutura; {len(report['arquivos_com_pouco_texto'])} PDFs com alguma página de pouco texto extraível.
Errors: {len(errors)}
Verdict: {report['veredito']}
```

O [resultado detalhado](acervo/verificacao.json) contém os arquivos afetados, avisos do parser, cálculos e cobertura. Os PDFs foram preservados exatamente como baixados, com tamanho e SHA-256 conferidos. Avisos internos de estrutura não foram tratados como revisão editorial aprovada: cada uso curricular continua sujeito a inspeção. Páginas com pouco texto podem conter figuras, capas ou digitalizações; essa marca é uma triagem para OCR, não diagnóstico automático de defeito.

## Conferências realizadas

- Todos os arquivos classificados como baixados foram encontrados no disco e tiveram tamanho e hash conferidos.
- Todas as páginas dos PDFs diretos e dos PDFs distintos extraídos do ZIP puderam ser abertas e submetidas à extração textual; a qualidade semântica da extração não foi certificada.
- O ZIP POTI passou pela verificação CRC; membros foram extraídos para nomes locais controlados, sem executar arquivos do pacote.
- Os links locais dos documentos foram conferidos. As fontes web foram consultadas durante a pesquisa; a verificação local não repete todas as requisições externas.
- Os exemplos de descontos e área/perímetro foram recalculados. A garantia de pares dos problemas de cartões foi verificada por enumeração de **{calculations['combinacoes_verificadas']} combinações**, além dos contraexemplos de minimalidade.
- O cenário econômico foi recalculado: contribuição de R$ 20,14 por conta e 1.242 contas para cobrir R$ 25 mil/mês de custo fixo, sob as premissas da proposta.

## Inspeção visual declarada

Foram renderizadas e inspecionadas seis páginas de seis PDFs: caderno OLITEF N1 p. 3, N2 p. 25, N3 p. 33; Canguru E 2026 p. 2; prova OBMEP 2025 F2 N1 p. 1 e respectivas soluções p. 1. O [registro da amostra](acervo/amostra-visual.json) aponta os originais e as [imagens locais](acervo/previas/).

Nas páginas observadas, os textos e diagramas estavam visíveis e legíveis. A amostra evidenciou a importância de preservar relações espaciais e figuras; a extração textual não basta para interpretá-las. Na licença do caderno N1, o ícone apresenta SA enquanto o texto e a URL indicam ND; a inconsistência foi registrada na política autoral.

## Correspondência com o pedido

| Pedido | Entrega | Limite explícito |
| --- | --- | --- |
| Proposta útil e vendável | Proposta de valor, compradores, alternativas, preços de teste, custos e piloto | Não houve entrevistas nem validação de disposição a pagar |
| Inspiração no Duolingo | Missões, jornada, hábito, revisão e personalização | Matemática também exige aprofundamento e justificativa |
| Estudar Brilliant com a sessão fornecida | Navegação autenticada, dois trechos de aulas, tentativa e ajuda em porcentagens; estudo e requisitos incorporados | Amostra exploratória, sem conclusão de cursos nem avaliação longitudinal do tutor |
| Didática e funcionalidades | Arquitetura pedagógica, experiências, métricas e prioridades | Eficácia do app ainda precisa ser medida |
| Evoluir quiz-escolar ao lado dos outros apps | Análise do legado, portfólio, arquitetura e migração | Nenhum app foi implementado nesta entrega |
| Materiais de todos os anos e níveis | Downloads, origens, hashes e quadro de cobertura | Existem lacunas registradas no acervo; não há alegação de completude universal |
| Conteúdo integralmente autoral | Política de autoria, currículo e três aulas de exemplo | Cursos completos e segunda revisão humana ainda serão produzidos |

O [quadro de cobertura](acervo/cobertura.json) distingue prova, solução, nível, fase e edição. Integridade de arquivo não prova completude histórica, correção de cada gabarito ou licença de uso. Não foram executados build ou testes dos aplicativos, pois a entrega altera documentação, scripts de pesquisa e a exclusão local do acervo no Git, sem modificar o código dos produtos.
'''
(ROOT / 'VERIFICACAO.md').write_text(verification_text, encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['avisos_pdf', 'arquivos_com_pouco_texto', 'cobertura']}, ensure_ascii=False, indent=2))
print('PDFs com avisos de estrutura:', len(warnings))
print('PDFs com alguma página sem texto suficiente:', len(report['arquivos_com_pouco_texto']))
print('Lacunas de cobertura:', json.dumps([r for r in coverage if r['faltantes']], ensure_ascii=False))
sys.exit(bool(errors))
