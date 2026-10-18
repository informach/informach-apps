"""Developer-only independent fixtures. odfpy 1.4.1, defusedxml 0.7.1, Pillow 12.3.0.
Install odfpy/defusedxml into .cache/edipdf-analysis/python-odf; no runtime dependency.
"""
from pathlib import Path
import hashlib
import json
import sys
from io import BytesIO

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / '.cache/edipdf-analysis/python-odf'))
from odf.opendocument import OpenDocumentText, OpenDocumentSpreadsheet
from odf import text, style, table, draw
from PIL import Image

OUT = ROOT / 'apps/edipdf/tests/fixtures/open-document'
OUT.mkdir(parents=True, exist_ok=True)
document = OpenDocumentText()
layout = style.PageLayout(name='A4Local')
layout.addElement(style.PageLayoutProperties(pagewidth='21cm', pageheight='29.7cm', margin='1.5cm'))
document.automaticstyles.addElement(layout)
master = style.MasterPage(name='Standard', pagelayoutname=layout)
document.masterstyles.addElement(master)
emphasis = style.Style(name='EmphasisLocal', family='text')
emphasis.addElement(style.TextProperties(fontweight='bold', fontstyle='italic', fontsize='14pt', color='#264a73'))
document.styles.addElement(emphasis)
break_style = style.Style(name='PageBreak', family='paragraph')
break_style.addElement(style.ParagraphProperties(breakbefore='page'))
document.automaticstyles.addElement(break_style)
document.text.addElement(text.H(outlinelevel=1, text='ODT_LOCAL_αβγ — Ação e informação'))
p = text.P(text='Espaços:')
p.addElement(text.S(c=3))
p.addText('A')
p.addElement(text.Tab())
p.addElement(text.Span(stylename=emphasis, text='ênfase'))
p.addElement(text.LineBreak())
p.addText('segunda linha')
document.text.addElement(p)
listing = text.List()
listing.addElement(text.ListItem())
listing.childNodes[0].addElement(text.P(text='Item independente'))
document.text.addElement(listing)
document.text.addElement(text.P(stylename=break_style, text='SEGUNDA_PÁGINA'))
t = table.Table(name='Dados')
for values in [('Produto', 'Valor'), ('Ação', '12,50'), ('αβγ', 'Literal =1+2')]:
    row = table.TableRow()
    for value in values:
        cell = table.TableCell(valuetype='string')
        cell.addElement(text.P(text=value))
        row.addElement(cell)
    t.addElement(row)
document.text.addElement(t)
image = BytesIO()
Image.new('RGB', (24, 12), (33, 120, 180)).save(image, format='PNG')
path = document.addPicture('Pictures/foto.png', mediatype='image/png', content=image.getvalue())
p = text.P()
frame = draw.Frame(width='2cm', height='1cm', anchortype='as-char')
frame.addElement(draw.Image(href=path, type='simple', show='embed', actuate='onLoad'))
p.addElement(frame)
document.text.addElement(p)
document.save(str(OUT / 'independent.odt'))

sheets = OpenDocumentSpreadsheet()
sheet = table.Table(name='Planejamento da turma — Outubro 2026')
for values in [('Texto', 'Número', 'Booleano', 'Vazio'), ('=1+2', 12.5, True, None), ('αβγ', -3.25, False, '')]:
    row = table.TableRow()
    for value in values:
        if isinstance(value, bool):
            cell = table.TableCell(valuetype='boolean', booleanvalue='true' if value else 'false')
        elif isinstance(value, (int, float)):
            cell = table.TableCell(valuetype='float', value=value)
        elif value is None:
            cell = table.TableCell()
        else:
            cell = table.TableCell(valuetype='string')
            cell.addElement(text.P(text=value))
        row.addElement(cell)
    sheet.addElement(row)
empty = table.TableRow(numberrowsrepeated=1048573)
empty.addElement(table.TableCell(numbercolumnsrepeated=1024))
sheet.addElement(empty)
sheets.spreadsheet.addElement(sheet)
sheets.save(str(OUT / 'independent.ods'))
manifest = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(OUT.glob('*.od?'))}
(OUT / 'manifest.json').write_text(json.dumps({'generator': 'odfpy 1.4.1 / Pillow 12.3.0', 'sha256': manifest}, indent=2) + '\n', encoding='utf-8')
print(manifest)
