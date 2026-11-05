const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html'); await p.waitForTimeout(20000);
console.log('status', await p.textContent('#status'), '| bib', await p.textContent('#bib-status'), '| nome', await p.textContent('#nome'));
console.log('erros',JSON.stringify(errs.slice(0,8)));await b.close();})();
