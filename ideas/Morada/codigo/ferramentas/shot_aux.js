const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const pronto=()=>p.waitForFunction(()=>document.getElementById('status').textContent==='',{timeout:240000});
const shot=async(n,w=1800)=>{await p.waitForTimeout(w);await p.locator('#palco').screenshot({path:n});};
await p.goto('http://localhost:8765/teste_local.html');await pronto();
for(const k of ['chute','insulto','beijo_par','escada','pendurado','dancando','sentado','rezando']){await p.click(`button[data-k="${k}"]`);await shot(`x_adulto_${k}.png`, k==='chute'?1100:1800);}
await p.click('#idade button[data-k="crianca"]');await pronto();
for(const k of ['beijo_par','escada','pendurado']){await p.click(`button[data-k="${k}"]`);await shot(`x_crianca_${k}.png`);}
console.log(errs);await b.close();})();
