const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2], out = process.argv[3];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + dir + '/index.html');
  await p.waitForTimeout(3000);
  const tabs = await p.$$('#tabs [role=tab]');
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i].click();
    await p.waitForTimeout(300);
    const id = await tabs[i].getAttribute('aria-controls');
    const el = await p.$('#' + id + ' .screen-wrap');
    await el.screenshot({ path: `${out}/tela_${i + 1}_${id}.png` });
  }
  await p.screenshot({ path: out + '/topo.png' });
  const dg = await p.$('#dominio pre');
  if (dg) await dg.screenshot({ path: out + '/dominio.png' });
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await m.goto('file://' + dir + '/index.html');
  await m.waitForTimeout(2000);
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: out + '/celular_topo.png' });
  await (await m.$('#telas')).screenshot({ path: out + '/celular_telas.png' });
  console.log('scrollWidth celular', sw, 'erros', JSON.stringify(errs));
  await b.close();
})();
