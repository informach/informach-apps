const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:820}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text())});
await p.goto('http://localhost:8766/teste_local.html');
const D=process.argv[2];
const pronto = async () => { await p.waitForFunction(()=>document.getElementById('carregando').hidden,undefined,{timeout:120000}); await p.waitForTimeout(1500); };
const shot = async (n) => { await p.screenshot({path:`${D}/${n}.png`}); console.log('foto', n); };
await pronto(); await shot('b_inicio');
console.log(await p.evaluate(() => Object.entries(window.__bichos.bichos).map(([k,v])=>k+':'+Object.keys(v.clips||{}).join(',')).join(' | ')));
for (const [bicho, anim, n] of [['gato_frajola','parado','b_frajola'],['gato_frajola','latir','b_frajola_miar'],['salsicha','andar','b_salsicha_andar'],['lulu_rosa','brincar','b_lulu_brincar'],['spitz','pata','b_spitz_pata'],['rottweiler','dormir','b_rott_dormir']]) {
  await p.click('#bicho-' + bicho); await pronto(); await p.click('#anim-' + anim); await p.waitForTimeout(1800); await shot(n); }
await p.click('#modo-todos'); await pronto(); await p.click('#anim-parado'); await p.waitForTimeout(1500); await shot('b_todos');
await p.click('#anim-deitar'); await p.waitForTimeout(4500); await shot('b_todos_deitar');
await p.setViewportSize({width:400,height:860}); await p.waitForTimeout(1200); await shot('b_celular');
console.log('erros', JSON.stringify(errs.slice(0,10))); await b.close();})();
