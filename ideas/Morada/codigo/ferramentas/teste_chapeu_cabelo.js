// Com chapéu, o penteado vira a versão achatada; tiara não achata. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n) => { await p.waitForTimeout(4000); console.log('foto', n, JSON.stringify(errs.slice(-2))); await p.locator('#palco').screenshot({path:`${process.argv[2]}/${n}.png`}); };
await espera(); await p.click('#sexo button[data-k="f"]'); await espera(); await p.click('#idade button[data-k="crianca"]'); await espera();
await p.selectOption('#roupa-cabeca','nov_sapo'); await shot('cc_sapo');
await p.selectOption('#roupa-cabeca','nov_tiara'); await shot('cc_tiara');
await p.selectOption('#roupa-cabeca','nov_cauboi'); await shot('cc_cauboi');
await p.selectOption('#cabelo-tipo select','cabelo_criativo10_volume'); await shot('cc_cauboi_volume');
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
