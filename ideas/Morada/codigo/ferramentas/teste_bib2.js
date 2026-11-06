const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>errs.push(m.type()+': '+m.text()));
await p.goto('http://localhost:8765/teste_local.html');
for(let i=0;i<20;i++){await p.waitForTimeout(3000);const s=await p.evaluate(()=>[document.getElementById('status').textContent,document.getElementById('bib-status').textContent]);console.log(i,s);if(/animações|Não consegui/.test(s[1]))break;}
console.log(JSON.stringify(errs.slice(0,10)));await b.close();})();
