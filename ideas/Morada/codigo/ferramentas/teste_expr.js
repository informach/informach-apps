const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:860}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8765/teste_local.html'); await p.waitForTimeout(3000);
const out=process.argv[2];
for (const [sexo,idade] of [['m','adulto'],['f','crianca'],['m','colo']]) {
  await p.click(`#sexo button[data-k="${sexo}"]`); await p.click(`#idade button[data-k="${idade}"]`); await p.waitForTimeout(3500);
  if (await p.$('#extras button[data-k="chupeta"][aria-pressed="true"]')) await p.click('#extras button[data-k="chupeta"]');
  for (const e of ['dormindo','chorando']) { await p.click(`#expr button[data-k="${e}"]`); await p.waitForTimeout(500);
    await p.locator('#palco').screenshot({path:`${out}/e_${idade}_${e}.png`}); }
}
console.log('erros',JSON.stringify(errs));await b.close();})();
