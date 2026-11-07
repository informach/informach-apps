const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const erros = [];
  const T = '/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad/rosto_viewer/_three/node_modules/three/';
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (r) => {
    const rel = r.request().url().replace(/^.*three@[^/]+\//, '');
    r.fulfill({ path: T + rel, contentType: 'application/javascript' });
  });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  p.on('pageerror', e => erros.push(String(e)));
  await p.goto('http://localhost:8766/moveis_viewer/teste_local.html' + (process.argv[2] || ''));
  await p.waitForTimeout(6000);
  await p.screenshot({ path: process.env.SAIDA + '/m1.png' });
  const abre = await p.$('#abre-todos'); if (abre) await abre.click();
  await p.waitForTimeout(1500);
  const en = await p.$('#encher:not([hidden])'); if (en) await en.click();
  await p.waitForTimeout(3000);
  await p.click('#ver-espacos');
  await p.waitForTimeout(800);
  await p.screenshot({ path: process.env.SAIDA + '/m2.png' });
  await p.setViewportSize({ width: 400, height: 900 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: process.env.SAIDA + '/m3.png', fullPage: true });
  console.log('erros', JSON.stringify(erros));
  await b.close();
})();
