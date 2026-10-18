"""Developer-only independent readback of the native journey's synthetic PNG/JPEG exports."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[3]
directory = ROOT / '.cache/edipdf-analysis/native-batch'
for page in (1, 2):
    images = {}
    for suffix in ('png', 'jpg'):
        path = directory / f'pagina-{page}.{suffix}'
        with Image.open(path) as image:
            image.load()
            assert image.size == (600, 800), (path.name, image.size)
            dpi = image.info.get('dpi')
            assert dpi and all(abs(value - 72) < 0.02 for value in dpi), (path.name, dpi)
            assert image.mode in ('RGB', 'RGBA'), (path.name, image.mode)
            if image.mode == 'RGBA':
                assert image.getchannel('A').getextrema() == (255, 255)
            images[suffix] = image.convert('RGB')
            print(f'{path.name}: independent Pillow decode, 600x800, RGB, {dpi[0]:.3f} dpi passed')
    difference = ImageStat.Stat(ImageChops.difference(images['png'], images['jpg']))
    average = sum(difference.mean) / 3
    assert average < 3, (page, average)
    print(f'page {page}: native PNG/JPEG appearance difference {average:.4f}/255 passed')
