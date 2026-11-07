const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1400,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8766/construcao_viewer/teste_local.html');
const D=process.argv[2];
await p.waitForFunction(()=>document.getElementById('carregando').hidden,undefined,{timeout:240000}); await p.waitForTimeout(2500);
await p.screenshot({path:`${D}/pag_a.png`});
await p.click('#modos button:nth-child(2)'); await p.waitForFunction(()=>document.getElementById('carregando').hidden,undefined,{timeout:240000}); await p.waitForTimeout(2000);
// troca o chão e uma parede
await p.click('#amostras .amostra >> nth=3'); await p.click('#superficies button >> nth=1'); await p.click('#amostras .amostra >> nth=7'); await p.waitForTimeout(2500);
await p.locator('.palco').screenshot({path:`${D}/pag_b.png`});
await p.click('#modos button:nth-child(3)'); await p.waitForFunction(()=>document.getElementById('carregando').hidden,undefined,{timeout:240000});
await p.click('#pecas button:has-text("Arco largo")'); await p.waitForFunction(()=>document.getElementById('carregando').hidden,undefined,{timeout:240000}); await p.waitForTimeout(2000);
await p.locator('.palco').screenshot({path:`${D}/pag_c.png`});
await p.setViewportSize({width:400,height:900}); await p.waitForTimeout(1500); await p.screenshot({path:`${D}/pag_celular.png`, fullPage:false});
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
