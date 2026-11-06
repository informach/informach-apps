const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html'); await p.waitForTimeout(3000);
const out=process.argv[2];
await p.click('#sexo button[data-k="f"]');
await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000});
console.log('normal:', await p.textContent('#bib-status'), 'tem parto?', !!(await p.$('button[data-k="bib:resident.parto.contracao_pe"]')));
await p.click('#gravidez button[data-k="3"]');
await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000});
await p.waitForTimeout(800);
console.log('3º tri:', await p.textContent('#bib-status'), 'tem parto?', !!(await p.$('button[data-k="bib:resident.parto.contracao_pe"]')), 'tem flexão?', !!(await p.$('button[data-k="bib:resident.fit.pushup"]')));
for (const k of ['resident.gravida.belly_hold','resident.parto.contracao_deitada']) { const sel=`button[data-k="bib:${k}"]`; if (await p.$(sel)) { await p.click(sel); await p.waitForTimeout(1500); await p.locator('#palco').screenshot({path:`${out}/gv_${k}.png`}); console.log(k,'|',(await p.textContent('#nota-apoio')).slice(0,140)); } }
await p.click('#gravidez button[data-k="0"]'); await p.waitForTimeout(3000);
console.log('voltou:', await p.textContent('#bib-status'));
console.log('erros',JSON.stringify(errs));await b.close();})();
