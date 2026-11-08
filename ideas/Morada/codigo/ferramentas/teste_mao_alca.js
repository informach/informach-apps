// close da mão esquerda segurando alças, de dois lados
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:900,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8765/teste_local.html');
const D=process.argv[2], corpo=process.argv[3]||'m';
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const escolhe = async (chave, rotulo) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[title="${rotulo}"]`); };
const perto = async (dist, lado, desce) => { await p.evaluate(([dist, lado, desce]) => { clearInterval(window.__cam);
  window.__cam = setInterval(() => { const { atual, camera, orbita, THREE } = window.__t(); const o = atual.raiz.getObjectByName('LeftHandMiddle1'); if (!o) return;
    const h = o.getWorldPosition(new THREE.Vector3()); h.y -= desce; orbita.target.copy(h); camera.position.set(h.x + lado[0] * dist, h.y + lado[1] * dist, h.z + lado[2] * dist); camera.lookAt(h); }, 30);
}, [dist, lado, desce]); };
await espera(); await p.click(`#sexo button[data-k="${corpo}"]`); await espera();
const esq = (process.argv[4]||"Bolsa,Bolsa sacola,Bolsa de academia,Maleta executiva,Sacolas de compras,Bolsa de pérolas").split(',');
let n=0;
for (const r of esq) { await escolhe('roupa-mao_esq', r);
  for (const [k, lado] of [['f', [0.0, 0.1, 1]], ['l', [-0.7, 0.1, -0.7]]]) { await perto(0.38, lado, 0.06); await p.waitForTimeout(1800); await p.locator('#palco').screenshot({path:`${D}/m_${String(n).padStart(2,'0')}_${k}.png`}); }
  n++; }
console.log('erros', JSON.stringify(errs)); await b.close();})();
