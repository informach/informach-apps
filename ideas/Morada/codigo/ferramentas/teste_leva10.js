// Leva 10: acabamento (barra reta, bermuda sem dobras, boné com aba na frente), parado e andando, homem e mulher. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const D=process.argv[2];
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, ms=3000) => { await p.waitForTimeout(ms); console.log('foto', n); await p.locator('#palco').screenshot({path:`${D}/${n}.png`}); };
const escolhe = async (chave, id) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[data-k="${id}"]`); };
await espera();
await p.click('#sexo button[data-k="m"]'); await espera();
await escolhe('roupa-cima', 'nov_polo'); await escolhe('roupa-baixo', 'nov_bermuda_folgada'); await escolhe('roupa-cabeca', 'nov_bone_novo');
await shot('l10_m_parado');
await p.click('button[data-k="bib:resident.walk.normal"]'); await shot('l10_m_andando', 2500);
await p.click('#sexo button[data-k="f"]'); await espera();
await escolhe('roupa-cima', 'nov_camiseta_justa'); await escolhe('roupa-baixo', 'nov_calca_jeans'); await escolhe('roupa-cabeca', 'nov_bone_helice');
await shot('l10_f_parado');
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
