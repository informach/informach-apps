const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html'); await p.waitForTimeout(3000);
const out=process.argv[2];
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(800); };
await espera();
const ids=process.argv[3].split(',');
if (process.argv[4]==='f') { await p.click('#sexo button[data-k="f"]'); await espera(); }
if (process.argv[5]) { await p.click(`#gravidez button[data-k="${process.argv[5]}"]`); await espera(); await p.waitForTimeout(1500); }
for (const k of ids) { const sel=`button[data-k="bib:resident.${k}"]`; if (!(await p.$(sel))) { console.log('falta',k); continue; }
  await p.click(sel); await p.waitForTimeout(1800); await p.locator('#palco').screenshot({path:`${out}/${process.argv[4]||'m'}${process.argv[5]||''}_${k}.png`}); }
console.log('erros',JSON.stringify(errs.slice(0,8)));await b.close();})();
