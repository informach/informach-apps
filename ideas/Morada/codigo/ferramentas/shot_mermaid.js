const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2], out = process.argv[3];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + dir + '/index.html'); await p.waitForTimeout(4000);
  const pres = await p.$$('pre.mermaid');
  for (let i = 0; i < pres.length; i++) await pres[i].screenshot({ path: `${out}/mermaid_${i}.png` });
  console.log(pres.length, await p.$$eval('pre.mermaid svg', a => a.length), JSON.stringify(errs));
  await b.close();
})();
