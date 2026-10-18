"""Independent developer validation of generated ODT/ODS against official ODF 1.3 RNG.
Requires isolated tools installed in .cache/edipdf-analysis/python-odf.
Downloads only two public, SHA-256 pinned OASIS schemas, never user documents.
"""
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile
import hashlib
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '.cache/edipdf-analysis/python-odf'))
from lxml import etree
from odf.opendocument import load

CACHE = ROOT / '.cache/edipdf-analysis/odf-schema'
CACHE.mkdir(parents=True, exist_ok=True)
HASHES = {
    'OpenDocument-v1.3-schema.rng': '40bad03efdbb02825230d357da0aa6ac679934c5bf56c6281752c0c24d58e4e6',
    'OpenDocument-v1.3-manifest-schema.rng': '8aee71f03484be112af972d622cc9031280c007b0a454ae8815e8e333c9bdd17',
}
parser = etree.XMLParser(resolve_entities=False, no_network=True)
schemas = {}
for name, sha in HASHES.items():
    path = CACHE / name
    data = path.read_bytes() if path.exists() else urlopen('https://docs.oasis-open.org/office/OpenDocument/v1.3/os/schemas/' + name, timeout=25).read()
    if hashlib.sha256(data).hexdigest() != sha:
        raise ValueError('Official schema hash mismatch: ' + name)
    if not path.exists():
        path.write_bytes(data)
    schemas[name] = etree.RelaxNG(etree.fromstring(data, parser))
for argument in sys.argv[1:]:
    path = Path(argument)
    with ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith('.xml'):
                continue
            schema = schemas['OpenDocument-v1.3-manifest-schema.rng' if name == 'META-INF/manifest.xml' else 'OpenDocument-v1.3-schema.rng']
            schema.assertValid(etree.fromstring(archive.read(name), parser))
    document = load(str(path))
    assert document.mimetype in ('application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation')
    print(path.name + ': ODF 1.3 RNG valid; independent odfpy load passed')
