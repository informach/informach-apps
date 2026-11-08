const { chromium } = require('playwright'); const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad', DIR = SP + '/corpos_viewer';
const T = SP + '/rosto_viewer/_three/node_modules/three/';
fs.writeFileSync(DIR + '/_teste_elenco.html', '<meta charset="utf-8">\n' + fs.readFileSync(DIR + '/corpos.html', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); const erros = [];
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (r) => r.fulfill({ path: T + r.request().url().replace(/^.*three@[^/]+\//, ''), contentType: 'application/javascript' }));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); }); p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto('http://localhost:8766/corpos_viewer/_teste_elenco.html');
  await p.waitForFunction(() => /animações/.test(document.getElementById('bib-status').textContent), undefined, { timeout: 300000 });
  console.log('botões', await p.locator('#elenco-grade button').count());
  await p.locator('#elenco-bloco').screenshot({ path: SP + '/_teste_veic/elenco_grade.png' });
  for (const nome of ['Leandro', 'Maitê']) {
    await p.fill('#elenco-busca', nome); await p.waitForTimeout(300);
    await p.locator('#elenco-grade button').first().click(); await p.waitForTimeout(9000);
    console.log(nome, await p.evaluate(() => document.querySelector('#bib button[aria-pressed="true"]')?.textContent));
    await p.locator('#palco').screenshot({ path: SP + '/_teste_veic/elenco_' + nome + '.png' });
  }
  console.log('erros', JSON.stringify(erros)); await b.close();
})();
