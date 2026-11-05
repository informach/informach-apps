const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html'); await p.waitForTimeout(3000);
const out=process.argv[2];
await p.click('#sexo button[data-k="f"]'); await p.waitForTimeout(3500);
for (const g of ['0','2','3']) { await p.click(`#gravidez button[data-k="${g}"]`); await p.waitForTimeout(500); await p.locator('#palco').screenshot({path:`${out}/g_${g}.png`}); }
await p.click('button[data-k="bib:resident.walk.normal"]').catch(()=>{}); await p.waitForTimeout(1500); await p.locator('#palco').screenshot({path:`${out}/g_3_andando.png`});
console.log('gravidez visível', await p.$eval('#gravidez-bloco', e=>!e.hidden));
console.log('erros',JSON.stringify(errs));await b.close();})();
