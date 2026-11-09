const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
await p.waitForFunction(()=>document.getElementById('status').textContent==='',{timeout:240000});
const ids=['sitting_talking','lying_down','climbing_ladder','climbing_a_rope','push_start','kiss','button_pushing','stand_to_freehang','waving','mma_kick','dying','swagger_walk'];
for(const k of ids){await p.click(`button[data-k="direto_${k}"]`);await p.waitForTimeout(k==='lying_down'?5000:(k==='push_start'?3500:1800));await p.locator('#palco').screenshot({path:`d_${k}.png`});}
await p.screenshot({path:'d_painel.png'});
console.log(errs);await b.close();})();
