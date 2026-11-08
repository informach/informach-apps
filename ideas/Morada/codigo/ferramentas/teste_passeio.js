// Teste da página Tipos de corpo: aleatório (regras e semente), salvar/carregar/padrão, últimos personagens (com e sem
// localStorage) e modo passeio (teclado, crossfade, pés sem deslizar, objetos de mão, idoso, bebê, celular com joystick).
// Uso: node tools/teste_passeio.js   (servidor em http://localhost:8766/ servindo o scratchpad)
const { chromium, devices } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad';
const DIR = SP + '/corpos_viewer', COPIA = DIR + '/_teste_passeio.html';
const T = SP + '/rosto_viewer/_three/node_modules/three/';
// a cópia local ganha o charset e o viewport que o esqueleto do artefato põe ao publicar
fs.writeFileSync(COPIA, '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' + fs.readFileSync(DIR + '/corpos.html', 'utf8'));
const URL = 'http://localhost:8766/corpos_viewer/_teste_passeio.html';
const erros = [];
const log = (...a) => console.log(...a);
async function abre(ctx, nome) {
  const p = await ctx.newPage();
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (r) => r.fulfill({ path: T + r.request().url().replace(/^.*three@[^/]+\//, ''), contentType: 'application/javascript' }));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(`[${nome}] ${m.text()}`); });
  p.on('pageerror', (e) => erros.push(`[${nome}] ${e}`));
  await p.goto(URL);
  await espera(p);
  return p;
}
const espera = (p) => p.waitForFunction(() => /animações/.test(document.getElementById('bib-status').textContent), undefined, { timeout: 240000 });
const foto = async (p, n, sel = '#palco') => { await p.locator(sel).screenshot({ path: `${DIR}/_passeio_${n}.png` }); log('foto', n); };
const semRolagem = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
// pé de apoio x deslocamento, em passos fixos de 1/60 s dentro da página (o swiftshader desenha ~1 quadro por segundo):
// a velocidade horizontal do pé mais baixo (enquanto ele continua o mais baixo e está no chão) contra a do corpo
const medeDeslize = (p, teclas, nomes = ['LeftToeBase', 'RightToeBase']) => p.evaluate(([teclas, nomes]) => {
  const M = moradaPersonagem, P = M.passeio;
  // num trecho livre da praça (para -x não há chafariz, banco, árvore nem poste), parado
  P.pos.set(0, 0, 0); P.yaw = -Math.PI / 2; P.camYaw = -Math.PI / 2; P.vel = 0; P.camAlvo.set(0, 1, 0);
  P.teclas.clear(); teclas.forEach((k) => P.teclas.add(k));
  for (let i = 0; i < 150; i++) M.passo(1 / 60); // acelera e troca de animação (crossfade termina)
  const c = M.corpo(), os = nomes.map((n) => c.raiz.getObjectByName(n));
  const am = []; let ant = null;
  for (let i = 0; i < 240; i++) {
    M.passo(1 / 60);
    const ps = os.map((o) => o.getWorldPosition(o.position.clone())); let k = 0; for (let j = 1; j < ps.length; j++) if (ps[j].y < ps[k].y) k = j;
    if (ant && ant.k === k) am.push({ vpe: Math.hypot(ps[k].x - ant.ps[k].x, ps[k].z - ant.ps[k].z) * 60, vc: Math.hypot(c.raiz.position.x - ant.rx, c.raiz.position.z - ant.rz) * 60, y: ps[k].y });
    ant = { ps, k, rx: c.raiz.position.x, rz: c.raiz.position.z };
  }
  const ymin = Math.min(...am.map((a) => a.y)), ap = am.filter((a) => a.y < ymin + 0.02 * c.altura);
  const med = (l) => { const s = l.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? null; };
  const pe = med(ap.map((a) => a.vpe)), corpo = med(am.map((a) => a.vc));
  return { amostras: ap.length, pe: +pe.toFixed(3), corpo: +corpo.toFixed(3), deslize: +(pe / corpo).toFixed(2), anim: c.acao?.getClip().name, ritmo: +c.acao.getEffectiveTimeScale().toFixed(2) };
}, [teclas, nomes]);
const PARTE = process.argv[2] || 'todos';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  if (PARTE === 'todos' || PARTE === 'desktop') {
  // ------------------------------------------------ regras do sorteio (sem montar): 3000 sementes
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  const p = await abre(ctx, 'desktop');
  await p.waitForFunction(() => moradaPersonagem.sorteio(1).roupa !== undefined || true);
  const regras = await p.evaluate(async () => {
    const cab = await (await fetch('cabelos.json')).json(), rp = await (await fetch('roupas.json')).json();
    const homens = new Set(cab.grupos.homens_adultos), por = Object.fromEntries(rp.itens.map((x) => [x.id, x]));
    const slot = (id) => { let x = por[id]; while (x && !x.slot && x.base) x = por[x.base]; return x?.slot; };
    const cobre = (id) => { let x = por[id]; while (x && !x.cobre && x.base) x = por[x.base]; return x?.cobre || ['cima', 'baixo']; };
    const prob = [], cont = { corpos: {}, conj: 0, barba: 0, objetos: 0, chapeu: 0, oculos: 0, gravida: 0 };
    for (let s = 1; s <= 3000; s++) {
      const q = moradaPersonagem.sorteio(s), f = q.corpo;
      cont.corpos[f] = (cont.corpos[f] || 0) + 1;
      if (JSON.stringify(q) !== JSON.stringify(moradaPersonagem.sorteio(s))) prob.push(`semente ${s} não repete`);
      if (f.startsWith('recem')) { if (q.roupa || q.objetos) prob.push(`${s}: recém com roupa`); continue; }
      if (q.cabelo.barba !== 'nenhum') { cont.barba++; if (!homens.has(f)) prob.push(`${s}: barba em ${f}`); }
      for (const [sl, v] of Object.entries(q.roupa)) if (slot(v.id) !== sl) prob.push(`${s}: ${v.id} na parte ${sl}`);
      for (const [l, v] of Object.entries(q.objetos)) if (slot(v.id) !== 'mao_' + l) prob.push(`${s}: objeto ${v.id} na mão ${l}`);
      if (q.roupa.inteira) for (const c of cobre(q.roupa.inteira.id)) if (q.roupa[c]) prob.push(`${s}: ${q.roupa.inteira.id} e ${q.roupa[c].id} juntas`);
      if (!q.roupa.inteira && !(q.roupa.cima || q.roupa.baixo)) prob.push(`${s}: sem roupa (${f})`);
      if (f.startsWith('bebe') && (Object.keys(q.objetos).length || q.roupa.oculos || q.roupa.sobre)) prob.push(`${s}: bebê com ${JSON.stringify(q.roupa)}`);
      if (Object.keys(q.objetos).length) cont.objetos++;
      if (q.roupa.cabeca) cont.chapeu++;
      if (q.roupa.oculos) cont.oculos++;
      if (q.gravidez > 0) cont.gravida++;
      if (Object.values(q.objetos).some((v) => v.id === 'nov_bengala') && !/^idos/.test(f)) prob.push(`${s}: bengala em ${f}`);
    }
    return { prob: prob.slice(0, 20), nprob: prob.length, cont };
  });
  log('regras do sorteio', JSON.stringify(regras));
  // ------------------------------------------------ editor: aleatório com semente, repetir, filtros
  await foto(p, '0_editor_inicio');
  await p.click('#btn-aleatorio'); await p.waitForTimeout(500);
  await p.waitForFunction(() => /Sorteado/.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 120000 });
  await p.fill('#semente', '4242'); await p.click('#btn-repetir');
  await p.waitForFunction(() => /4242/.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 120000 });
  await p.waitForTimeout(4000);
  const j1 = await p.evaluate(() => JSON.stringify(moradaPersonagem.atual()));
  await foto(p, '1_aleatorio_4242', '.app');
  await p.fill('#semente', '77'); await p.click('#btn-repetir');
  await p.waitForFunction(() => /semente 77\./.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 120000 });
  await p.waitForTimeout(4000); await foto(p, '1_aleatorio_77');
  await p.fill('#semente', '4242'); await p.click('#btn-repetir');
  await p.waitForFunction(() => /4242/.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 120000 });
  const j2 = await p.evaluate(() => JSON.stringify(moradaPersonagem.atual()));
  log('semente repete o personagem:', j1 === j2, j1);
  // filtros: só idosos
  await p.click('#filtros summary');
  for (const k of ['colo', 'pequeno', 'crianca', 'adolescente', 'adulto']) await p.uncheck(`input[data-filtro="faixas"][value="${k}"]`);
  log('conta do filtro:', await p.textContent('#filtros-conta'));
  const so = await p.evaluate(() => [...Array(200)].map((_, i) => moradaPersonagem.sorteio(i + 1).corpo));
  log('só idosos no sorteio:', so.every((c) => /^idos/.test(c)));
  for (const s of [5, 9, 31]) { await p.fill('#semente', String(s)); await p.click('#btn-repetir'); await p.waitForFunction((s) => new RegExp(`semente ${s}\\.`).test(document.getElementById('ferr-aviso').textContent), s, { timeout: 120000 }); }
  await p.waitForTimeout(3500); await foto(p, '1_aleatorio_idoso');
  await foto(p, '1_painel_filtros', 'aside');
  await p.click('#filtros-campos button'); // marcar tudo de novo
  await p.click('#filtros summary');
  // ------------------------------------------------ salvar, carregar, padrão, recentes
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-baixar')]);
  const salvo = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  log('arquivo salvo:', dl.suggestedFilename(), JSON.stringify(salvo));
  await p.click('#btn-padrao'); await p.waitForTimeout(1500);
  const padrao = await p.evaluate(() => moradaPersonagem.atual());
  log('padrão:', JSON.stringify(padrao));
  await p.setInputFiles('#arquivo', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(salvo)) });
  await p.waitForFunction(() => /carregado/.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 120000 });
  const volta = await p.evaluate(() => moradaPersonagem.atual());
  log('carregado = salvo:', JSON.stringify(volta) === JSON.stringify(salvo));
  await p.setInputFiles('#arquivo', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"oi":1}') });
  await p.waitForFunction(() => /não é um personagem/.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 30000 }).catch(() => {});
  log('arquivo inválido:', await p.textContent('#ferr-aviso'));
  await p.waitForTimeout(2500);
  log('recentes:', await p.locator('#recentes button img').count(), 'com miniatura;', await p.locator('#recentes button').count(), 'botões');
  await foto(p, '2_recentes', '.ferramentas');
  // ------------------------------------------------ passeio: adulta com bolsa e café
  await p.evaluate(() => moradaPersonagem.aplicar({ corpo: 'adulta', pele: 'Morena', expressao: 'feliz', cabelo: { penteado: 'rabo_cavalo', cor: 'Preto', barba: 'nenhum' },
    roupa: { cima: { id: 'nov_camisa_listrada_vertical', cor: '#3D7BD6' }, baixo: { id: 'nov_calca_jeans', cor: '#3D5A8A' }, pes: { id: 'roupa_tenis_009', cor: null }, cabeca: { id: 'nov_bone_novo', cor: '#D9433B' } },
    objetos: { esq: { id: 'nov_bolsa', cor: '#EE70A9' }, dir: { id: 'nov_cafe', cor: null } } }));
  await espera(p); await p.waitForTimeout(3000);
  await p.click('#btn-passeio'); await p.waitForTimeout(2500);
  await foto(p, '3_parado');
  const ini = await p.evaluate(() => ({ pos: moradaPersonagem.passeio.pos.toArray(), anim: moradaPersonagem.corpo().acao?.getClip().name,
    vel: Object.fromEntries(Object.entries(moradaPersonagem.clipesPasseio(moradaPersonagem.corpo())).map(([k, n]) => [k, n && +moradaPersonagem.velocidadeClipe(moradaPersonagem.corpo(), n)?.toFixed(3)])) }));
  log('passeio parado:', JSON.stringify(ini));
  log('andando:', JSON.stringify(await medeDeslize(p, ['w'])));
  await foto(p, '4_andando');
  log('correndo:', JSON.stringify(await medeDeslize(p, ['w', 'shift'])));
  await foto(p, '5_correndo');
  await p.evaluate(() => { const P = moradaPersonagem.passeio; P.teclas.clear(); P.teclas.add('w'); P.teclas.add('a'); for (let i = 0; i < 70; i++) moradaPersonagem.passo(1 / 60); });
  await foto(p, '6_virando');
  await p.evaluate(() => { const P = moradaPersonagem.passeio; P.teclas.clear(); for (let i = 0; i < 120; i++) moradaPersonagem.passo(1 / 60); });
  // teclado de verdade: anda um pouco com W
  const antesW = await p.evaluate(() => moradaPersonagem.passeio.pos.toArray());
  await p.keyboard.down('w'); await p.waitForTimeout(3000); await p.keyboard.up('w');
  const depoisW = await p.evaluate(() => moradaPersonagem.passeio.pos.toArray());
  log('teclado W moveu:', Math.hypot(depoisW[0] - antesW[0], depoisW[2] - antesW[2]).toFixed(2), 'm');
  await p.evaluate(() => { for (let i = 0; i < 120; i++) moradaPersonagem.passo(1 / 60); });
  const fim = await p.evaluate(() => ({ pos: moradaPersonagem.passeio.pos.toArray().map((x) => +x.toFixed(2)), yaw: +moradaPersonagem.passeio.yaw.toFixed(2), anim: moradaPersonagem.corpo().acao?.getClip().name,
    maos: Object.fromEntries(['dir', 'esq'].map((l) => [l, moradaPersonagem.corpo().naMao?.[l]?.rid || null])) }));
  log('parou:', JSON.stringify(fim));
  // trocar o objeto de mão no passeio, pelo painel
  await p.click('button[aria-controls="grade-roupa-mao_dir"]'); await p.click('#grade-roupa-mao_dir button[data-k="nov_guarda_chuva_aberto"]');
  await p.keyboard.down('w'); await p.waitForTimeout(3000); await foto(p, '7_guarda_chuva'); await p.keyboard.up('w');
  // idoso com bengala
  await p.evaluate(() => moradaPersonagem.aplicar({ corpo: 'idoso', pele: 'Clara', expressao: 'neutro', cabelo: { penteado: 'careca', cor: 'Grisalho', barba: 'bigode_2' },
    roupa: { cima: { id: 'nov_camisa_social', cor: '#F2F2F2' }, sobre: { id: 'nov_cardiga', cor: '#7B4B2D' }, baixo: { id: 'nov_calca_social', cor: '#5B6370' }, pes: { id: 'roupa_sapato_seguranca', cor: null }, cabeca: { id: 'nov_palheta', cor: null } },
    objetos: { dir: { id: 'nov_bengala', cor: null } } }));
  await p.waitForFunction(() => moradaPersonagem.corpo()?.id === 'idoso' && moradaPersonagem.corpo().bib, undefined, { timeout: 120000 });
  log('idoso andando:', JSON.stringify(await medeDeslize(p, ['w'])));
  await foto(p, '8_idoso');
  log('idoso com Shift:', JSON.stringify(await medeDeslize(p, ['w', 'shift'])));
  await p.evaluate(() => moradaPersonagem.passeio.teclas.clear());
  for (const id of ['crianca_m', 'adolescente_f', 'plus_m', 'musculoso', 'alto_magro', 'pequena_f']) {
    await p.evaluate((id) => moradaPersonagem.aplicar({ corpo: id }), id);
    await p.waitForFunction((id) => moradaPersonagem.corpo()?.id === id && moradaPersonagem.corpo().bib, id, { timeout: 120000 });
    log(id, 'andar:', JSON.stringify(await medeDeslize(p, ['w'])), 'correr:', JSON.stringify(await medeDeslize(p, ['w', 'shift'])));
  }
  await p.evaluate(() => moradaPersonagem.passeio.teclas.clear());
  // gestante (sem correr na biblioteca de grávida) e bebê (engatinha)
  await p.evaluate(() => moradaPersonagem.aplicar({ corpo: 'plus_f', pele: 'Escura', cabelo: { penteado: 'afro', cor: 'Preto' }, roupa: { inteira: { id: 'gen_vestido_midi', cor: '#3BAA5C' }, pes: { id: 'roupa_tenis_009' } }, gravidez: 3 }));
  await p.waitForFunction(() => moradaPersonagem.corpo()?.bibFonte === 'plus_f_gravida', undefined, { timeout: 120000 });
  log('gestante com Shift:', JSON.stringify(await medeDeslize(p, ['w', 'shift'])));
  await foto(p, '9_gestante'); await p.evaluate(() => moradaPersonagem.passeio.teclas.clear());
  await p.evaluate(() => moradaPersonagem.aplicar({ corpo: 'bebe_f', pele: 'Clara', cabelo: { penteado: 'maria_chiquinha', cor: 'Loiro' }, roupa: { inteira: { id: 'nov_jardineira', cor: '#F4CFD6' }, cima: { id: 'nov_camiseta_larga', cor: '#F2F2F2' } } }));
  await p.waitForFunction(() => moradaPersonagem.corpo()?.id === 'bebe_f' && moradaPersonagem.corpo().bib, undefined, { timeout: 120000 });
  log('bebê (joelhos e mãos):', JSON.stringify(await medeDeslize(p, ['w'], ['LeftHand', 'RightHand', 'LeftLeg', 'RightLeg'])));
  await foto(p, '10_bebe'); await p.evaluate(() => moradaPersonagem.passeio.teclas.clear());
  await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
  const saiu = await p.evaluate(() => ({ passeando: document.querySelector('.app').classList.contains('passeando'), pos: moradaPersonagem.corpo().raiz.position.toArray().map((x) => +x.toFixed(3)), anim: moradaPersonagem.atual() && document.querySelector('#bib button[aria-pressed="true"]')?.textContent }));
  log('saiu do passeio:', JSON.stringify(saiu));
  await foto(p, '11_editor_depois');
  // gestos com objeto continuam: adulto com celular acenando
  await p.evaluate(() => moradaPersonagem.aplicar({ corpo: 'adulto', roupa: { cima: { id: 'nov_polo' }, baixo: { id: 'nov_calca_jeans' } }, objetos: { dir: { id: 'nov_celular' } } }));
  await espera(p); await p.locator('button[data-k="bib:resident.wave"]').first().click(); await p.waitForTimeout(2500);
  log('acenando com celular:', JSON.stringify(await p.evaluate(() => ({ dir: moradaPersonagem.corpo().naMao?.dir?.rid || null, esq: moradaPersonagem.corpo().naMao?.esq?.rid || null }))));
  await foto(p, '12_gesto_celular');
  log('desktop sem rolagem horizontal:', JSON.stringify(await semRolagem(p)));
  await ctx.close();
  }
  if (PARTE === 'todos' || PARTE === 'celular') {
  // ------------------------------------------------ celular: editor, aleatório, passeio com joystick
  const cel = await b.newContext({ ...devices['Pixel 7'] });
  const m = await abre(cel, 'celular');
  log('celular sem rolagem horizontal (início):', JSON.stringify(await semRolagem(m)));
  await m.click('#btn-aleatorio');
  await m.waitForFunction(() => /Sorteado/.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 120000 });
  await m.click('#filtros summary'); await m.waitForTimeout(3000);
  log('celular sem rolagem horizontal (filtros abertos):', JSON.stringify(await semRolagem(m)));
  await m.screenshot({ path: `${DIR}/_passeio_13_celular_editor.png`, fullPage: true }); log('foto 13_celular_editor');
  await m.click('#json-caixa summary'); await m.waitForTimeout(300);
  log('celular sem rolagem horizontal (JSON aberto):', JSON.stringify(await semRolagem(m)));
  await m.locator('#btn-passeio').tap(); await m.waitForTimeout(2500);
  log('joystick visível:', await m.isVisible('#joystick'));
  const jb = await m.locator('#joystick').boundingBox();
  const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2;
  await m.mouse.move(cx, cy); await m.mouse.down(); await m.mouse.move(cx + 10, cy - 30, { steps: 4 });
  await m.waitForTimeout(2500);
  const p1 = await m.evaluate(() => ({ pos: moradaPersonagem.passeio.pos.toArray().map((x) => +x.toFixed(2)), anim: moradaPersonagem.corpo().acao?.getClip().name }));
  await m.mouse.move(cx, cy - 70, { steps: 4 }); await m.waitForTimeout(2500);
  const p2 = await m.evaluate(() => ({ pos: moradaPersonagem.passeio.pos.toArray().map((x) => +x.toFixed(2)), anim: moradaPersonagem.corpo().acao?.getClip().name }));
  await m.locator('#palco').screenshot({ path: `${DIR}/_passeio_14_celular_joystick.png` }); log('foto 14_celular_joystick');
  await m.mouse.up(); await m.waitForTimeout(1500);
  log('celular joystick: meio =', JSON.stringify(p1), 'borda =', JSON.stringify(p2));
  log('celular sem rolagem horizontal (passeio):', JSON.stringify(await semRolagem(m)));
  await cel.close();
  }
  if (PARTE === 'todos' || PARTE === 'storage') {
  // ------------------------------------------------ sem localStorage (bloqueado): a página continua funcionando
  const sem = await b.newContext({ viewport: { width: 1100, height: 800 } });
  await sem.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('armazenamento bloqueado'); } }); });
  const s = await abre(sem, 'sem-storage');
  await s.click('#btn-aleatorio');
  await s.waitForFunction(() => /Sorteado/.test(document.getElementById('ferr-aviso').textContent), undefined, { timeout: 120000 });
  await s.click('#btn-guardar'); await s.waitForTimeout(2500);
  log('sem localStorage:', await s.textContent('#ferr-aviso'), '| recentes na tela:', await s.locator('#recentes button').count());
  await sem.close();
  }
  await b.close();
  fs.unlinkSync(COPIA);
  log('erros', JSON.stringify(erros.slice(0, 20)), erros.length);
})().catch((e) => { console.error('FALHOU', e); try { fs.unlinkSync(COPIA); } catch {} process.exit(1); });
