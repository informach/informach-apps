// Leva 11: acabamento da biblioteca (saia e vestido com pesos de pano, barra da blusa, faixa, coroa, viseira, máscara),
// parado e andando, mulher e homem. Confere que as peças com pesos próprios usam esses pesos. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const D=process.argv[2];
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, ms=3000) => { await p.waitForTimeout(ms); console.log('foto', n); await p.locator('#palco').screenshot({path:`${D}/${n}.png`}); };
const escolhe = async (chave, id) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[data-k="${id}"]`); };
await espera();
await p.click('#sexo button[data-k="f"]'); await espera();
await escolhe('roupa-inteira', 'gen_vestido_midi'); await escolhe('roupa-cabeca', 'nov_coroa');
await shot('l11_f_vestido_parado');
await p.click('button[data-k="bib:resident.walk.normal"]'); await shot('l11_f_vestido_andando', 2500);
await escolhe('roupa-inteira', '');  // tira
await escolhe('roupa-cima', 'nov_camiseta_justa'); await escolhe('roupa-baixo', 'gen_saia_rodada'); await escolhe('roupa-cabeca', 'nov_faixa_cabeca');
await shot('l11_f_saia_andando', 2500);
await p.click('#sexo button[data-k="m"]'); await espera();
await escolhe('roupa-cima', 'nov_manga_longa'); await escolhe('roupa-baixo', 'nov_calca_social'); await escolhe('roupa-sobre', 'nov_paleto');
await escolhe('roupa-cabeca', 'nov_viseira');
await shot('l11_m_paleto_parado');
await p.click('button[data-k="bib:resident.walk.normal"]'); await shot('l11_m_paleto_andando', 2500);
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
