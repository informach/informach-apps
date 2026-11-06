// Página com as peças novas: conjuntos (profissões e casuais) na adulta, grávida 3, plus, criança; sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n) => { await p.waitForTimeout(4000); console.log('foto', n, JSON.stringify(errs.slice(-2))); await p.locator('#palco').screenshot({path:`${process.argv[2]}/${n}.png`}); };
const conj = async (nome) => { const v = await p.$eval('#roupa-conjunto', (s, n) => [...s.options].find(o => o.text === n)?.value, nome); await p.selectOption('#roupa-conjunto', v); };
await espera();
if (!process.env.SO_CRIANCA) {
await p.click('#sexo button[data-k="f"]'); await espera();
for (const [n, f] of [["Médico(a)","medica"],["Chef","chef"],["Bombeiro(a)","bombeira"],["Fazendeiro(a)","fazendeira"],["Camareiro(a)","camareira"],["Caubói/caubóia","cauboia"],["Inverno","inverno"],["Rei/rainha","rainha"]]) { await conj(n); await shot('adulta_'+f); }
await p.selectOption('#cabelo-tipo select','rabo_cavalo'); await shot('adulta_rabo');
await conj("Casual de jardineira"); await p.click('#gravidez button[data-k="3"]'); await espera(); await shot('adulta_g3_jardineira');
await conj("Detetive"); await shot('adulta_g3_detetive');
await p.click('button[data-k="bib:resident.walk.normal"]'); await shot('adulta_g3_andando');
await p.click('#gravidez button[data-k="0"]'); await espera();
await p.click('#sexo button[data-k="m"]'); await espera(); await p.click('#minis button[data-k="plus_m"]'); await espera();
await conj("Policial"); await shot('plus_policial');
await conj("Operário(a) de obra"); await shot('plus_obra');
await p.selectOption('#cabelo-tipo select','moicano'); await conj("Skatista"); await shot('plus_skatista');
}
await p.click('#sexo button[data-k="f"]'); await espera(); await p.click('#idade button[data-k="crianca"]'); await espera();
await conj("Fantasia de sapo"); await shot('crianca_sapo');
await conj("Estudante"); await p.selectOption('#cabelo-tipo select','trancas').catch(()=>{}); await shot('crianca_estudante');
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
