const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const pronto=()=>p.waitForFunction(()=>document.getElementById('status').textContent==='',{timeout:240000});
await p.goto('http://localhost:8765/teste_local.html');await pronto();
await p.click('button[data-k="deitando"]');await p.waitForTimeout(5500);await p.locator('#palco').screenshot({path:'c1.png'});
await p.click('button[data-k="dormindo_cama"]');await p.waitForTimeout(2500);await p.locator('#palco').screenshot({path:'c2.png'});
await p.click('#idade button[data-k="pequeno"]');await pronto();await p.click('button[data-k="dormindo_cama"]');await p.waitForTimeout(2500);await p.locator('#palco').screenshot({path:'c3.png'});
console.log(errs);await b.close();})();
