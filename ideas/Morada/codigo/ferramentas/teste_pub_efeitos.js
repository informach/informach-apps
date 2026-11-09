const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad/';
const T = SP + 'rosto_viewer/_three/node_modules/three/';
const TIPOS = { html: 'text/html; charset=utf-8', json: 'application/json', txt: 'text/plain', webp: 'image/webp', png: 'image/png', svg: 'image/svg+xml', js: 'application/javascript' };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [pag, pronto] of [['icones_viewer/icones.html', 'window.__morada && window.__morada.pronto()'], ['efeitos_viewer/efeitos.html?efeito=confete&modo=glb', 'window.__morada && window.__morada.pronto()']]) {
    const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const erros = [];
    await p.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (r) => r.fulfill({ path: T + r.request().url().replace(/^.*three@[^/]+\//, ''), contentType: 'application/javascript' }));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await p.route(/^http:\/\/teste\.local\//, (r) => { const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1)); if (rel.endsWith('.glb')) return r.fulfill({ status: 404, body: '' }); r.fulfill({ path: SP + rel, contentType: TIPOS[rel.split('.').pop()] || 'application/octet-stream' }); });
    p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); }); p.on('pageerror', (e) => erros.push(String(e)));
    await p.goto('http://teste.local/' + pag);
    await p.waitForFunction(pronto, undefined, { timeout: 300000 });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: SP + '_teste_veic/pub_' + pag.split('/')[0] + '.png' });
    console.log(pag, 'erros', JSON.stringify(erros.filter((e) => !/GL Driver/.test(e))));
    await p.close();
  }
  await b.close();
})();
