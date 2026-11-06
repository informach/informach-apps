const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
  const erros = []; p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); }); p.on('pageerror', e => erros.push(String(e)));
  await p.goto('http://localhost:8766/teste_local.html'); await p.waitForTimeout(9000);
  console.log('status:', await p.textContent('#status'), 'amostras:', await p.locator('.amostra').count(), 'anims:', await p.locator('#lista button').count());
  await p.screenshot({ path: process.argv[2] + '_1.png' });
  const am = p.locator('.amostra'); await am.nth(4).click(); await am.nth(11).click(); await am.nth(15).click(); await am.nth(21).click();
  await p.locator('#lista button', { hasText: 'Dançando' }).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: process.argv[2] + '_2.png' });
  console.log('erros:', erros.slice(0, 5)); await b.close();
})();
