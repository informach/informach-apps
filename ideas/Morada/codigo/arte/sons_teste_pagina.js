// Teste da página Sons do Morada com Playwright, sem servidor: page.route serve os arquivos lendo do disco.
// Uso: node sons_teste_pagina.js <pasta_das_fotos>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const SP = '/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad';
const VIEWER = path.join(SP, 'sons_viewer');
const OUT = path.join(SP, 'sons_out');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.png': 'image/png', '.md': 'text/markdown' };
const FOTOS = process.argv[2] || path.join(SP, 'sons_viewer', '_teste');
fs.mkdirSync(FOTOS, { recursive: true });

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1320, height: 860 } });
  const erros = [];
  const servidos = { n: 0, bytes: 0 };
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erros.push(`${m.type()}: ${m.text()}`); });
  p.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) erros.push('falhou: ' + r.url()); });
  await p.route('**/*', async (rota) => {
    const u = new URL(rota.request().url());
    if (/fonts\.(googleapis|gstatic)\.com/.test(u.host)) return rota.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.host !== 'morada.teste') return rota.abort();
    let arq = decodeURIComponent(u.pathname);
    arq = arq.startsWith('/sons/') ? path.join(OUT, arq.slice(6)) : path.join(VIEWER, arq.slice(1));
    const real = path.resolve(arq);
    if (!(real.startsWith(OUT) || real.startsWith(VIEWER)) || !fs.existsSync(real) || fs.statSync(real).isDirectory()) {
      return rota.fulfill({ status: 404, body: 'não achei ' + u.pathname });
    }
    const corpo = fs.readFileSync(real);
    servidos.n++; servidos.bytes += corpo.length;
    return rota.fulfill({ status: 200, contentType: TIPOS[path.extname(real)] || 'application/octet-stream', body: corpo });
  });
  const foto = async (n) => { await p.screenshot({ path: path.join(FOTOS, n + '.png') }); console.log('foto', n); };
  const est = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__sons)));

  await p.goto('http://morada.teste/sons.html');
  await p.waitForFunction(() => window.__sons && window.__sons.pronto, null, { timeout: 30000 });
  console.log('sub:', await p.textContent('#sub'));
  const relato = {};

  // categorias de efeitos: toca os dois primeiros e um laço de cada grupo
  for (const cat of ['interface', 'casa', 'bichos', 'ambientes']) {
    await p.click('#aba-' + cat);
    const ids = await p.$$eval('.som', (bs) => bs.map((b) => ({ id: b.id, laco: !!b.querySelector('.selo.laco') })));
    const alvo = [ids[0], ids[1], ids.find((i) => i.laco)].filter(Boolean);
    const tocados = [];
    for (const a of alvo) {
      await p.click('#' + a.id);
      await p.waitForTimeout(700);
      const e = await est();
      tocados.push(`${a.id}${a.laco ? ' (laço)' : ''}: ${e.tocando ? 'tocando' : 'acabou'}`);
    }
    relato[cat] = { cartoes: ids.length, tocados };
    if (cat === 'casa') await foto('s_casa');
  }
  // laço e volume
  await p.click('#aba-ambientes');
  const amb = await p.$$eval('.som', (bs) => bs.map((b) => b.id));
  if (!(await p.$eval('#b-parar', (b) => b.disabled))) await p.click('#b-parar');
  await p.click('#' + amb[0]);
  await p.waitForTimeout(500);
  await p.uncheck('#c-laco');
  const laco1 = await p.evaluate(() => window.__sons.tocando);
  await p.check('#c-laco');
  await p.$eval('#r-vol', (r) => { r.value = '35'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  relato.volume = await p.textContent('#v-vol');
  relato.laco = laco1;
  await foto('s_ambientes');
  await p.click('#b-parar');

  // voz inventada ao vivo e frases gravadas
  await p.click('#aba-voz');
  const falas = [];
  for (const [idade, sexo, emo] of [['adulto', 'f', 'feliz'], ['crianca', 'm', 'rindo'], ['idoso', 'f', 'sono'], ['adulto', 'm', 'bravo'], ['bebe', 'm', 'choro'], ['idoso', 'm', 'surpreso']]) {
    await p.click(`#voz-idade-${idade}`);
    await p.click(`#voz-voz-${sexo}`);
    await p.click(`#voz-emocao-${emo}`);
    await p.click('#b-falar');
    await p.waitForFunction((n) => window.__sons.ultimaFala && window.__sons.ultimaFala.emocao === n, emo, { timeout: 10000 });
    await p.waitForTimeout(450);
    const e = await est();
    falas.push(`${idade}/${sexo}/${emo}: "${e.ultimaFala.texto}" ${e.ultimaFala.dur.toFixed(2)} s, ${e.ultimaFala.quadros} quadros`);
    if (emo === 'feliz') await foto('s_voz_ao_vivo');
  }
  relato.falas_ao_vivo = falas;
  const frases = await p.$$eval('.frase', (bs) => bs.map((b) => b.textContent));
  await p.click('.frase >> nth=0');
  await p.waitForTimeout(500);
  const boca = await p.$eval('#boca', (e) => e.getAttribute('ry'));
  relato.frases_gravadas = { n: frases.length, exemplo: frases.slice(0, 3), boca_ry: boca };
  await foto('s_voz_gravada');

  // música: início → laço → fim
  await p.click('#aba-musica');
  await p.click('#mus-menu-tocar');
  await p.waitForTimeout(1800);
  const m1 = await est();
  const est1 = await p.textContent('.musica[data-musica="menu"] .estado');
  await foto('s_musica');
  await p.waitForTimeout(4000);
  const est2 = await p.textContent('.musica[data-musica="menu"] .estado');
  await p.click('#mus-menu-fim');
  await p.waitForTimeout(500);
  const m2 = await est();
  relato.musica = { tocando: m1.tocando, estado_inicio: est1, estado_laco: est2, terminando: m2.terminando };
  await p.waitForTimeout(3000);
  await p.click('#mus-festa-laco');
  await p.waitForTimeout(1200);
  relato.musica.festa = (await est()).tocando;
  await p.click('#b-parar');

  // créditos
  await p.click('#aba-creditos');
  relato.creditos = await p.$$eval('.cred', (c) => c.length);
  await foto('s_creditos');

  // laços decodificados no navegador: amostras de OGG e MP3 contra o esperado (sem emenda = mesma duração)
  relato.decodificacao = await p.evaluate(async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const out = [];
    for (const arq of ['ambientes/chuva_laco', 'casa/chuveiro_laco', 'musica/menu_laco', 'bichos/ronronar_laco']) {
      const linha = [arq];
      for (const f of ['ogg', 'mp3']) {
        const buf = await ctx.decodeAudioData(await (await fetch(`sons/${arq}.${f}`)).arrayBuffer());
        linha.push(`${f} ${buf.length} amostras a ${buf.sampleRate} Hz`);
      }
      out.push(linha.join(' · '));
    }
    return out;
  });

  // celular
  await p.setViewportSize({ width: 390, height: 860 });
  await p.click('#aba-interface');
  await p.waitForTimeout(400);
  const largura = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  relato.celular_rolagem_horizontal = largura[0] > largura[1] ? `sim (${largura[0]} > ${largura[1]})` : 'não';
  await foto('s_celular');
  await p.click('#aba-voz');
  await p.waitForTimeout(300);
  await foto('s_celular_voz');

  const e = await est();
  relato.decodificados = e.decodificados;
  relato.erros_da_pagina = e.erros;
  relato.servidos = servidos;
  console.log(JSON.stringify(relato, null, 1));
  console.log('erros do console:', JSON.stringify(erros));
  await b.close();
})();
