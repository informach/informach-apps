// mede quanto a bolsa entra nas pernas e no quadril ao andar e correr: vértices da bolsa mais perto do eixo do osso do que
// a pele mais próxima (pele presa àquele osso, com a forma da gravidez)
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:900,height:700}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8765/' + process.argv[2]);
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const escolhe = async (chave, rotulo) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[title="${rotulo}"]`); };
const mede = () => p.evaluate(() => {
  const { atual: c, THREE } = window.__t(); const m = c.naMao.esq?.mesh; if (!m?.visible) return null;
  const corpo = c.corpoMesh, g = corpo.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pa = g.attributes.position, bones = corpo.skeleton.bones;
  const segs = [["LeftUpLeg","LeftLeg"],["LeftLeg","LeftFoot"],["RightUpLeg","RightLeg"],["RightLeg","RightFoot"],["Hips","Spine"],["Spine","Spine1"]];
  const S = segs.map(([a, b]) => { const A = c.raiz.getObjectByName(a), B = c.raiz.getObjectByName(b); return { ib: bones.indexOf(A), A: A.getWorldPosition(new THREE.Vector3()), B: B.getWorldPosition(new THREE.Vector3()), pele: [] }; });
  const proj = (s, v) => { const AB = s.B.clone().sub(s.A), t = Math.min(Math.max(v.clone().sub(s.A).dot(AB) / AB.lengthSq(), 0), 1); return s.A.clone().addScaledVector(AB, t); };
  for (let i = 0; i < pa.count; i++) for (const s of S) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === s.ib) w += sw.getComponent(i, k);
    if (w >= 0.5) s.pele.push(corpo.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(corpo.matrixWorld)); }
  const mp = m.geometry.attributes.position; let dentro = 0, fundo = 0;
  for (let i = 0; i < mp.count; i++) {
    const v = (m.isSkinnedMesh ? m.getVertexPosition(i, new THREE.Vector3()) : new THREE.Vector3().fromBufferAttribute(mp, i)).applyMatrix4(m.matrixWorld);
    for (const s of S) { const P = proj(s, v), dv = v.distanceTo(P); if (dv > 0.25) continue;
      let best = null, bd = 1e9; const dir = v.clone().sub(P).normalize();
      for (const q of s.pele) { const P2 = proj(s, q), d2 = q.clone().sub(P2); const ang = d2.clone().normalize().dot(dir); if (ang < 0.97 || Math.abs(P2.distanceTo(P)) > 0.03) continue; if (d2.length() < bd + 1) { if (!best || d2.length() > best) best = d2.length(); } }
      if (best && dv < best - 0.004) { dentro++; if (best - dv > fundo) { fundo = best - dv; const HP = (n) => c.raiz.getObjectByName('LeftHand' + n).getWorldPosition(new THREE.Vector3()); const h0 = HP('Middle1'); const X = h0.clone().sub(HP('')); const s0 = X.length(); X.normalize(); const Z = X.clone().cross(HP('Index1').sub(HP('Pinky1'))).normalize(); const Y = Z.clone().cross(X); const dd = v.clone().sub(h0); window.__pior = [segs[S.indexOf(s)].join('>'), ...[dd.dot(X)/s0, dd.dot(Y)/s0, dd.dot(Z)/s0].map(q=>+q.toFixed(2))]; } break; } }
  }
  return [dentro, +fundo.toFixed(3), mp.count, window.__pior];
});
await espera(); await p.click(`#sexo button[data-k="${process.argv[3]}"]`); await espera();
if (process.argv[5]) { await p.click(`#gravidez button[data-k="${process.argv[5]}"]`); await espera(); }
await escolhe('roupa-mao_esq', process.argv[4]);
for (const a of ['bib:resident.walk.normal', 'bib:resident.run.normal']) {
  await p.click(`button[data-k="${a}"]`); await p.waitForTimeout(2500);
  let tot = 0, maxd = 0, quadros = 0, piores = 0;
  for (let i = 0; i < 40; i++) { const r = await mede(); await p.waitForTimeout(37); if (!r) continue; quadros++; tot += r[0]; if (r[0]) { piores++; console.log('  ', i, r[0], r[1], JSON.stringify(r[3])); } maxd = Math.max(maxd, r[1]); }
  console.log(process.argv[2], process.argv[4], a.split('.').slice(-2).join('.'), 'quadros', quadros, 'com_vértice_dentro', piores, 'vértices_dentro_média', (tot / Math.max(quadros,1)).toFixed(1), 'fundo_máx_m', maxd);
}
console.log('erros', JSON.stringify(errs)); await b.close();})();
