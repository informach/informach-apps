const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2], out = process.argv[3];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + dir + '/index.html');
  await p.waitForTimeout(1500);
  const tabs = await p.$$('#tabs [role=tab]');
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i].click(); await p.waitForTimeout(200);
    const id = await tabs[i].getAttribute('aria-controls');
    await (await p.$('#' + id + ' .screen-wrap')).screenshot({ path: `${out}/tela_${String(i + 1).padStart(2, '0')}_${id}.png` });
  }
  for (const s of ['inicio', 'analise', 'planos', 'economia', 'espacos']) {
    await (await p.$('#' + s)).screenshot({ path: `${out}/sec_${s}.png` });
  }
  await p.emulateMedia({ colorScheme: 'dark' });
  await (await p.$('#inicio')).screenshot({ path: `${out}/sec_inicio_escuro.png` });
  await (await p.$('#economia')).screenshot({ path: `${out}/sec_economia_escuro.png` });
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto('file://' + dir + '/index.html'); await m.waitForTimeout(1000);
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  const wide = await m.evaluate(() => [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > 392 && !e.closest('.tbl,pre,.screen-wrap,.nav,.tabs')).slice(0, 8).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)));
  await m.screenshot({ path: out + '/celular_topo.png' });
  console.log('scrollWidth', sw, 'largos', JSON.stringify(wide), 'erros', JSON.stringify(errs));
  await b.close();
})();
