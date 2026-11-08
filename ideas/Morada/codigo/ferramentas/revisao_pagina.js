// Revisão na página: cada peça dos slots pedidos vestida sozinha (mais nada), no homem e na mulher, de frente e de
// costas (a câmera gira 180° arrastando o palco). Uso: node revisao_pagina.js <saída> [slots=cima,baixo,inteira,sobre] [sexos=m,f]
const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{const D=process.argv[2]; const slots=(process.argv[3]||'cima,baixo,inteira,sobre').split(','); const sexos=(process.argv[4]||'m,f').split(',');
fs.mkdirSync(D,{recursive:true});
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8765/teste_local.html');
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const escolhe = async (chave, id) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[data-k="${id}"]`); };
const gira = async () => { const bb=await p.locator('#palco canvas').first().boundingBox(); const y=bb.y+bb.height*0.85, x=bb.x+bb.width/2;
  await p.mouse.move(x-bb.height/4,y); await p.mouse.down(); for(let k=1;k<=10;k++) await p.mouse.move(x-bb.height/4+k*bb.height/20,y); await p.mouse.up(); };
await espera();
for (const sx of sexos) {
  await p.click(`#sexo button[data-k="${sx}"]`); await espera();
  for (const slot of slots) {
    await p.click(`button[aria-controls="grade-roupa-${slot}"]`); await p.waitForTimeout(300);
    const ids = await p.$$eval(`#grade-roupa-${slot} button[data-k]`, (bs)=>bs.map(x=>x.dataset.k).filter(k=>k));
    await p.click(`button[aria-controls="grade-roupa-${slot}"]`); await p.waitForTimeout(200);
    console.log('slot', slot, ids.length);
    for (const id of ids) {
      try {
        await escolhe('roupa-'+slot, id); await p.waitForTimeout(2200);
        await p.locator('#palco').screenshot({path:`${D}/${sx}_${id}_0.png`});
        await gira(); await p.waitForTimeout(700);
        await p.locator('#palco').screenshot({path:`${D}/${sx}_${id}_1.png`});
        await gira(); await p.waitForTimeout(300);
        console.log('ok', sx, slot, id);
      } catch(e) { console.log('falhou', sx, id, e.message.split('\n')[0]); }
    }
    try { await escolhe('roupa-'+slot, ''); } catch(e) {}
  }
}
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
