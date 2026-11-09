// Leva 12: saia sentada e ajoelhada (a saia segue a pele nessas poses e volta aos pesos de pano em pé), shorts sem nó
// na virilha. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const D=process.argv[2];
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, ms=3500) => { await p.waitForTimeout(ms); console.log('foto', n); await p.locator('#palco').screenshot({path:`${D}/${n}.png`}); };
const escolhe = async (chave, id) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[data-k="${id}"]`); };
const anim = async (k) => { const s = `button[data-k="${k}"]`; if (!(await p.locator(s).count())) { console.log('sem', k); return false; } await p.locator(s).first().click(); return true; };
await espera();
await p.click('#sexo button[data-k="f"]'); await espera();
await escolhe('roupa-inteira', 'gen_vestido_midi');
await shot('l12_vestido_parado');
if (await anim('bib:resident.sit.chair.idle')) await shot('l12_vestido_sentada', 4000);
if (await anim('bib:resident.romance.propose')) await shot('l12_vestido_ajoelhada', 4000);
if (await anim('bib:resident.walk.normal')) { await shot('l12_vestido_andando', 3000); await shot('l12_vestido_andando2', 450); }
await escolhe('roupa-inteira', '');
await p.click('#sexo button[data-k="m"]'); await espera();
await escolhe('roupa-baixo', 'nov_bermuda_folgada'); await escolhe('roupa-cima', 'nov_camiseta_justa');
await shot('l12_bermuda');
await anim('bib:resident.walk.normal'); await shot('l12_bermuda_andando', 2600); await shot('l12_bermuda_andando2', 450);
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
