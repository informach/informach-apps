const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900},deviceScaleFactor:2});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
await p.waitForFunction(()=>document.getElementById('status').textContent==='',{timeout:180000});
await p.waitForTimeout(2000);await p.screenshot({path:'todos_pagina.png'});
await p.click('button[data-id="bebe_f"]');await p.waitForTimeout(1500);await p.screenshot({path:'v_bebe.png'});
console.log(errs);await b.close();})();
