// Leva 13: calça boca de sino (barras separadas entre os pés) e short curto, parado e andando. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const D=process.argv[2];
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, ms=3000) => { await p.waitForTimeout(ms); console.log('foto', n); await p.locator('#palco').screenshot({path:`${D}/${n}.png`}); };
const escolhe = async (chave, id) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[data-k="${id}"]`); };
await espera(); await p.click('#sexo button[data-k="m"]'); await espera();
await escolhe('roupa-baixo', 'nov_calca_boca_sino'); await escolhe('roupa-cima', 'nov_camisa_onca');
await shot('l13_sino_parado');
await p.locator('button[data-k="bib:resident.walk.normal"]').first().click(); await shot('l13_sino_andando', 2600);
await escolhe('roupa-baixo', 'nov_short_curto'); await escolhe('roupa-cima', 'nov_polo');
await shot('l13_short_andando', 2600);
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
