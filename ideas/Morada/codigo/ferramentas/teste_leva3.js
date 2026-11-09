// Leva 3: conjuntos com objetos de mão, óculos e chapéus novos; seletor por imagem; grávida 3; plus; criança. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, el='#palco') => { await p.waitForTimeout(4500); console.log('foto', n, JSON.stringify(errs.slice(-2))); await p.locator(el).screenshot({path:`${process.argv[2]}/${n}.png`}); };
const conj = async (nome) => { const v = await p.$eval('#roupa-conjunto', (s, n) => [...s.options].find(o => o.text === n)?.value, nome); await p.selectOption('#roupa-conjunto', v); };
const escolhe = async (chave, rotulo) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[title="${rotulo}"]`); };
await espera();
await p.click('#sexo button[data-k="f"]'); await espera();
for (const [n, f] of [["Cantor(a) de palco","cantora"],["Vovó de bengala","vovo"],["Dia de chuva","chuva"],["Encontro","encontro"],["Praia de biquíni","praia"],["Inverno de capuz","inverno"],["Viajante","viajante"],["Cinema 3D","cinema"]]) { await conj(n); await shot('l3_'+f); }
await escolhe('penteado', 'Espetado'); await escolhe('roupa-cabeca', 'Boina'); await shot('l3_boina_espetado');
await p.click('button[aria-controls="grade-roupa-cabeca"]'); await shot('l3_grade', '#roupa-slots');
await p.click('button[aria-controls="grade-roupa-cabeca"]');
await conj("Retrô"); await p.click('#gravidez button[data-k="3"]'); await espera(); await shot('l3_g3_retro');
await conj("Dia de compras"); await shot('l3_g3_compras');
await p.click('button[data-k="bib:resident.walk.normal"]'); await shot('l3_g3_andando');
await p.click('#gravidez button[data-k="0"]'); await espera();
await p.click('#sexo button[data-k="m"]'); await espera(); await p.click('#minis button[data-k="plus_m"]'); await espera();
await conj("Executivo(a) de maleta"); await shot('l3_plus_executivo');
await conj("Roqueiro(a)"); await escolhe('penteado', 'Moicano'); await shot('l3_plus_roqueiro');
await p.click('#sexo button[data-k="f"]'); await espera(); await p.click('#idade button[data-k="crianca"]'); await espera();
await conj("Sorveteria"); await shot('l3_crianca_sorvete');
await conj("Festa à fantasia: urso"); await shot('l3_crianca_urso');
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
