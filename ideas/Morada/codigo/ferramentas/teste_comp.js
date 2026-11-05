const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000});
console.log(await p.textContent('#bib-status'));
const out=process.argv[2]; const ids=process.argv[3].split(',');
for(const k of ids){ const sel=`button[data-k="bib:resident.${k}"]`; if(!(await p.$(sel))){console.log('sem',k);continue;}
  await p.click(sel);await p.waitForTimeout(1800);await p.locator('#palco').screenshot({path:`${out}/c_${k}.png`});
  console.log(k,'|',(await p.textContent('#nota-apoio')).slice(0,160));}
console.log('erros',JSON.stringify(errs));await b.close();})();
