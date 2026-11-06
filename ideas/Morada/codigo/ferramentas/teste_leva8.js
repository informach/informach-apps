// Leva 8: alças presas e na mão; bolsa não entra em nenhuma perna nem no tronco (inclusive grávida); sentado, o objeto
// no chão vem junto aos poucos quando a pessoa se desloca. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const D=process.argv[2];
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, ms=3000) => { await p.waitForTimeout(ms); console.log('foto', n, JSON.stringify(errs.slice(-2))); await p.locator('#palco').screenshot({path:`${D}/${n}.png`}); };
const escolhe = async (chave, rotulo) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[title="${rotulo}"]`); };
const anim = async (k) => { await p.click(`button[data-k="${k}"]`); };
// câmera perto da mão esquerda (a cada quadro, até a foto)
const perto = async (osso, dist, lado) => { await p.evaluate(([osso, dist, lado]) => {
  const t = window.__t(); clearInterval(window.__cam);
  window.__cam = setInterval(() => { const { atual, camera, orbita, THREE } = window.__t(); const o = atual.raiz.getObjectByName(osso); if (!o) return;
    const h = o.getWorldPosition(new THREE.Vector3()); orbita.target.copy(h); camera.position.set(h.x + lado[0] * dist, h.y + lado[1] * dist, h.z + lado[2] * dist); camera.lookAt(h); }, 30);
}, [osso, dist, lado]); };
const solta = async () => { await p.evaluate(() => clearInterval(window.__cam)); };
await espera();
await p.click('#sexo button[data-k="m"]'); await espera();
await escolhe('roupa-mao_esq', 'Bolsa de academia'); await anim('bib:resident.walk.normal');
await perto('Hips', 1.6, [-0.55, 0.05, 0.85]);
for (let i = 0; i < 6; i++) await shot('l8_andando_' + i, i ? 250 : 3000);
await perto('Hips', 1.6, [0.0, 0.05, 1.0]);
for (let i = 0; i < 4; i++) await shot('l8_andando_frente_' + i, i ? 250 : 800);
await anim('bib:resident.run.normal');
await perto('Hips', 1.7, [-0.55, 0.05, 0.85]);
for (let i = 0; i < 3; i++) await shot('l8_correndo_' + i, i ? 200 : 2500);
// sentado e se deslocando: move o corpo aos poucos, de lado e para a frente
await anim('bib:resident.sit.chair.idle'); await perto('Hips', 2.0, [-0.75, 0.55, 0.6]); await shot('l8_sentado_0', 3500);
const pos0 = await p.evaluate(() => { const { atual, apoio, auxiliar } = window.__t(); window.__m0 = [apoio.position.clone(), auxiliar.position.clone()]; return atual.raiz.position.toArray(); });
const mede = async () => p.evaluate(() => { const { atual, THREE } = window.__t(); const h = atual.raiz.getObjectByName('Hips').getWorldPosition(new THREE.Vector3());
  const m = (atual.chao || [])[0]?.mesh; return m ? { quadril: h.toArray().map(v=>+v.toFixed(3)), objeto: m.position.toArray().map(v=>+v.toFixed(3)), dist: +Math.hypot(m.position.x-h.x, m.position.z-h.z).toFixed(3) } : null; });
console.log('antes', JSON.stringify(await mede()));
for (let i = 1; i <= 40; i++) { await p.evaluate(([dx, dz, x0, z0]) => { const { atual, apoio, auxiliar } = window.__t(); atual.raiz.position.x = x0 + dx; atual.raiz.position.z = z0 + dz;
    for (const [k, o] of [apoio, auxiliar].entries()) { o.position.x = window.__m0[k].x + dx; o.position.z = window.__m0[k].z + dz; } }, [-0.02 * i, 0.01 * i, pos0[0], pos0[2]]); await p.waitForTimeout(60);
  if (i % 10 === 0) { console.log('passo', i, JSON.stringify(await mede())); await shot('l8_sentado_' + (i / 10), 50); } }
// grávida 3 andando com a tote
await p.click('#sexo button[data-k="f"]'); await espera();
await p.click('#gravidez button[data-k="3"]').catch(() => console.log('sem gravidez'));
await espera();
await escolhe('roupa-mao_esq', 'Bolsa sacola'); 
await anim('bib:resident.walk.normal');
await perto('Hips', 1.6, [0.0, 0.05, 1.0]);
for (let i = 0; i < 4; i++) await shot('l8_gravida_' + i, i ? 250 : 3500);
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
