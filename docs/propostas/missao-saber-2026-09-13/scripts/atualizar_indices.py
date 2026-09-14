"""Cache current official OBMEP edition pages through the configured Firecrawl CLI."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
import subprocess

from acervo import CACHE

cli = shutil.which('firecrawl')
if not cli:
    raise SystemExit('Firecrawl CLI not installed')


def fetch(year):
    path = CACHE / ('obmep-current-' + str(year) + '.html')
    if path.exists():
        return str(year) + ' cache'
    result = subprocess.run([cli,'scrape','https://www.obmep.org.br/provas-' + str(year) + '.htm',
                             '--format','html','-o',str(path)], capture_output=True, text=True, encoding='utf-8', errors='replace',timeout=120)
    return str(year) + ' ' + str(result.returncode) + ' ' + result.stderr.strip()[:200]


with ThreadPoolExecutor(max_workers=2) as pool:
    for outcome in pool.map(fetch,list(range(2005,2020))+list(range(2021,2026))):
        print(outcome,flush=True)
