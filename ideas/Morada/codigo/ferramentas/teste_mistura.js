const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8765/teste_local.html'); await p.waitForTimeout(3000);
const out=process.argv[2];
await p.click('#sexo button[data-k="f"]');
await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000});
await p.click('button[data-k="bib:resident.walk.normal"]'); await p.waitForTimeout(800);
await p.click('#gravidez button[data-k="3"]');
await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200);
for (const k of ['resident.sit.chair.idle','resident.lie.idle','resident.sit.clap']) { await p.click(`button[data-k="bib:${k}"]`); await p.waitForTimeout(1500); await p.locator('#palco').screenshot({path:`${out}/m_${k}.png`}); }
const n = await p.evaluate(() => 0);
console.log('erros',JSON.stringify(errs));await b.close();})();
