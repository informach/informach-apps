const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const pronto=()=>p.waitForFunction(()=>document.getElementById('status').textContent==='',{timeout:240000});
await p.goto('http://localhost:8765/teste_local.html');await pronto();
await p.click('button[data-k="escada"]');await p.waitForTimeout(1500);await p.locator('#palco').screenshot({path:'e1.png'});
await p.click('button[data-k="parado"]');await p.waitForTimeout(800);await p.locator('#palco').screenshot({path:'e2.png'});
await p.click('#idade button[data-k="colo"]');await pronto();await p.click('button[data-k="escada"]');await p.waitForTimeout(1500);await p.locator('#palco').screenshot({path:'e3.png'});
console.log(errs);await b.close();})();
