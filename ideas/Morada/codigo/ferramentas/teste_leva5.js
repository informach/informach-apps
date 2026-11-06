// Leva 5: pose de segurar em todos os objetos de mão; troca de mão com a pose; arrastão até a barra. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, ms=3500) => { await p.waitForTimeout(ms); console.log('foto', n, JSON.stringify(errs.slice(-2))); await p.locator('#palco').screenshot({path:`${process.argv[2]}/${n}.png`}); };
const conj = async (nome) => { const v = await p.$eval('#roupa-conjunto', (s, n) => [...s.options].find(o => o.text === n)?.value, nome); await p.selectOption('#roupa-conjunto', v); };
const escolhe = async (chave, rotulo) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[title="${rotulo}"]`); };
const anim = async (k) => { await p.click(`button[data-k="${k}"]`); };
await espera();
await p.click('#sexo button[data-k="f"]'); await espera();
await conj("Café");
for (const [r, f] of [["Celular","celular"],["Copo de café","cafe"],["Microfone","microfone"],["Sorvete","sorvete"],["Picolé","picole"],["Câmera fotográfica","camera"],["Livro","livro"],["Buquê de flores","buque"],["Bengala","bengala"],["Guarda-chuva","guarda_chuva"]]) {
  await escolhe('roupa-mao_dir', r); await shot('l5_'+f, 3000);
}
await escolhe('roupa-mao_dir', 'Nenhum');
for (const [r, f] of [["Bolsa","bolsa"],["Maleta","maleta"],["Mala de rodinhas","mala"],["Sacolas de compras","sacolas"],["Sacola de compras com pão","sacola_papel"]]) {
  await escolhe('roupa-mao_esq', r); await shot('l5_'+f, 3000);
}
await escolhe('roupa-mao_dir', 'Copo de café'); await anim('bib:resident.walk.normal'); await shot('l5_andando_cafe_bolsa');
await escolhe('roupa-mao_esq', 'Nenhum'); await anim('bib:resident.wave'); await shot('l5_tchau_troca', 2500);
await anim('bib:resident.talk.b'); await shot('l5_explicando', 2500);
await anim('bib:resident.idle.neutral');
await conj("Roqueira de arrastão"); await p.waitForTimeout(4000);
const bx = await p.locator('#palco canvas').boundingBox();
await p.mouse.move(bx.x + bx.width/2, bx.y + bx.height*0.62);
for (let i=0;i<6;i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(150); }
await shot('l5_arrastao_short', 2000);
await conj("Festa à fantasia: coelho"); await shot('l5_arrastao_maio');
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
