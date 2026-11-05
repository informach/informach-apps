const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.addInitScript(() => {
  const docs = {}; const subs = [];
  const snap = () => ({ docs: Object.entries(docs).map(([id, v]) => ({ id, exists: true, data: () => v })) });
  const emit = () => subs.forEach((f) => f(snap()));
  const db = { collection: (c) => ({ onSnapshot: (f) => { subs.push(f); setTimeout(() => f(snap()), 50); return () => {}; },
    doc: (id) => ({ set: async (v) => { docs[id] = v; window.__escritos = (window.__escritos || 0) + 1; emit(); }, delete: async () => { delete docs[id]; emit(); } }) }) };
  window.claude = { use: async (n) => n === 'db' ? db : n === 'user' ? { canEdit: async () => true } : null };
  window.__docs = docs;
});
await p.goto('http://localhost:8765/teste_local.html');
await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000});
console.log('painel visível', await p.$eval('#avaliar', e => !e.hidden), '|', await p.textContent('#avaliar-texto'));
await p.click('button[data-k="bib:resident.wave"]'); await p.waitForTimeout(500);
console.log('texto', await p.textContent('#avaliar-texto'));
await p.click('#avaliar-botoes button[data-k="boa"]'); await p.waitForTimeout(300);
await p.click('button[data-k="bib:resident.stretch"]'); await p.waitForTimeout(300);
await p.click('#avaliar-botoes button[data-k="ruim"]'); await p.waitForTimeout(300);
console.log('docs', JSON.stringify(await p.evaluate(() => window.__docs)));
console.log('classes', await p.$eval('button[data-k="bib:resident.wave"]', e => e.className), await p.$eval('button[data-k="bib:resident.stretch"]', e => e.className));
console.log('resumo', await p.textContent('#avaliar-resumo'));
await p.locator('#avaliar').screenshot({path: process.argv[2]});
console.log('erros',JSON.stringify(errs.slice(0,5)));await b.close();})();
