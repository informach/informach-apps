// Teste da página de efeitos (e da de ícones) sem servidor: os arquivos saem do disco pelo page.route, o three vem de
// rosto_viewer/_three/node_modules/three/. Não pode ter erro no console. Capturas em <pasta>/_capturas/.
// Uso: NODE_PATH=/opt/node-tools/node_modules node efeitos_teste.js <SP> efeitos|icones [rapido]
const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");

const SP = process.argv[2];
const QUAL = process.argv[3] || "efeitos";
const RAPIDO = process.argv[4] === "rapido";
const SO = process.argv[4] && process.argv[4] !== "rapido" ? process.argv[4].split(",") : null;
const PASTA = path.join(SP, QUAL === "efeitos" ? "efeitos_viewer" : "icones_viewer");
const PAGINA = QUAL === "efeitos" ? "efeitos.html" : "icones.html";
const THREE = path.join(SP, "rosto_viewer/_three/node_modules/three/");
const SAIDA = path.join(PASTA, "_capturas");
fs.mkdirSync(SAIDA, { recursive: true });
const TIPOS = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png",
  ".glb": "model/gltf-binary", ".svg": "image/svg+xml", ".webp": "image/webp" };

async function prepara(ctx, erros) {
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (r) => {
    const rel = r.request().url().replace(/^.*three@[^/]+\//, "");
    r.fulfill({ path: THREE + rel, contentType: "application/javascript" });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
  await ctx.route(/^https:\/\/morada\.local\//, (r) => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    const arq = path.join(PASTA, rel);
    if (!fs.existsSync(arq)) { erros.push("404 " + rel); return r.fulfill({ status: 404, body: "" }); }
    r.fulfill({ path: arq, contentType: TIPOS[path.extname(arq)] || "application/octet-stream" });
  });
}
function vigia(p, erros, nome) {
  p.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !m.text().includes("GL Driver Message")) erros.push(`[${nome}] ${m.type()}: ${m.text()}`); });
  p.on("pageerror", (e) => erros.push(`[${nome}] pageerror: ${e}`));
}
const espera = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const nav = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const erros = [];
  // ---------------- computador
  const ctx = await nav.newContext({ viewport: { width: 1180, height: 800 } });
  await prepara(ctx, erros);
  const p = await ctx.newPage();
  vigia(p, erros, "desktop");
  await p.goto(`https://morada.local/${PAGINA}`);
  await p.waitForFunction(() => window.__morada && window.__morada.pronto(), null, { timeout: 60000 });
  await espera(p, 2500);
  await p.screenshot({ path: path.join(SAIDA, "desktop.png") });
  if (QUAL === "efeitos") {
    const ids = await p.evaluate(() => window.__morada.efeitos);
    const lista = SO ? ids.filter((i) => SO.includes(i)) : RAPIDO ? ids.slice(0, 3) : ids;
    for (const modo of ["particulas", "glb"]) {
      await p.evaluate((m) => window.__morada.modo(m), modo);
      for (const [n, noite] of [[0, false], [1, true]]) {
        if (modo === "glb" && noite) continue;
        await p.evaluate((x) => window.__morada.noite(x), noite);
        const NOITE = ["confete", "fogo", "fumaca", "vapor", "espuma", "brilho", "coracoes", "zzz", "raiva", "balao_fala", "cheiro_ruim", "moscas", "sujeira_chao"];
        for (const id of (noite ? lista.filter((i) => NOITE.includes(i)) : lista)) {
          await p.evaluate((i) => window.__morada.escolhe(i), id);
          await p.waitForFunction(() => window.__morada.pronto(), null, { timeout: 30000 });
          await espera(p, id === "confete" ? 800 : 1300); console.log("captura", modo, noite ? "noite" : "dia", id);
          await p.locator("#palco").screenshot({ path: path.join(SAIDA, `${modo}_${noite ? "noite" : "dia"}_${id}.png`) });
        }
      }
    }
    await p.evaluate(() => window.__morada.noite(false));
    await p.evaluate(() => window.__morada.modo("particulas"));
    if (lista.includes("fumaca")) { // a variante escura (fogão queimando), de dia e de noite
      await p.evaluate(() => window.__morada.escolhe("fumaca"));
      await p.waitForFunction(() => window.__morada.pronto(), null, { timeout: 30000 });
      await p.click('[data-v="queimando"]');
      await p.waitForFunction(() => window.__morada.pronto(), null, { timeout: 30000 });
      await espera(p, 1600);
      await p.locator("#palco").screenshot({ path: path.join(SAIDA, "particulas_dia_fumaca_queimando.png") });
      await p.evaluate(() => window.__morada.noite(true));
      await espera(p, 600);
      await p.locator("#palco").screenshot({ path: path.join(SAIDA, "particulas_noite_fumaca_queimando.png") });
      await p.evaluate(() => window.__morada.noite(false));
    }
    await p.evaluate(() => window.__morada.escolhe("balao_pensamento"));
    await espera(p, 1800);
    await p.screenshot({ path: path.join(SAIDA, "desktop_pagina.png"), fullPage: true });
  } else {
    await p.screenshot({ path: path.join(SAIDA, "desktop_pagina.png"), fullPage: true });
    // busca, tamanhos, menu radial, marcador
    await p.fill("#busca", "bebê");
    await espera(p, 400);
    await p.screenshot({ path: path.join(SAIDA, "desktop_busca.png") });
    await p.fill("#busca", "");
    await p.click('[data-tam="256"]');
    await espera(p, 400);
    await p.screenshot({ path: path.join(SAIDA, "desktop_256.png") });
    await p.click('[data-tam="64"]');
    await p.click('[data-fundo="noite"]');
    await espera(p, 400);
    await p.screenshot({ path: path.join(SAIDA, "desktop_noite.png") });
    await p.locator("#radial").scrollIntoViewIfNeeded();
    await p.click("#radial-alvo");
    await espera(p, 700);
    await p.hover('#radial-menu [data-id="abracar"]');
    await espera(p, 300);
    await p.locator("#secao-radial").screenshot({ path: path.join(SAIDA, "desktop_radial.png") });
    for (const h of ["otimo", "bom", "ruim", "pessimo"]) {
      await p.click(`[data-humor="${h}"]`);
      await espera(p, 900);
      await p.locator("#palco-marcador").screenshot({ path: path.join(SAIDA, `marcador_${h}.png`) });
    }
    await p.click("#marcador-noite");
    await espera(p, 700);
    await p.locator("#palco-marcador").screenshot({ path: path.join(SAIDA, "marcador_noite.png") });
  }
  await ctx.close();
  // ---------------- celular
  const cel = await nav.newContext({ ...devices["Pixel 7"] });
  await prepara(cel, erros);
  const pc = await cel.newPage();
  vigia(pc, erros, "celular");
  await pc.goto(`https://morada.local/${PAGINA}${QUAL === "efeitos" ? "?efeito=coracoes" : ""}`);
  await pc.waitForFunction(() => window.__morada && window.__morada.pronto(), null, { timeout: 60000 });
  await espera(pc, 2500);
  await pc.screenshot({ path: path.join(SAIDA, "celular.png") });
  const larg = await pc.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (larg[0] > larg[1] + 1) erros.push(`celular: rolagem horizontal (${larg[0]} > ${larg[1]})`);
  await pc.screenshot({ path: path.join(SAIDA, "celular_pagina.png"), fullPage: true });
  if (QUAL === "efeitos") {
    await pc.evaluate(() => window.__morada.escolhe("fogo"));
    await espera(pc, 1500);
    await pc.locator("#palco").tap();
    await pc.screenshot({ path: path.join(SAIDA, "celular_fogo.png") });
  } else {
    await pc.locator("#radial").scrollIntoViewIfNeeded();
    await pc.tap("#radial-alvo");
    await espera(pc, 700);
    await pc.locator("#secao-radial").screenshot({ path: path.join(SAIDA, "celular_radial.png") });
  }
  await cel.close();
  await nav.close();
  console.log("erros", JSON.stringify(erros, null, 1));
  console.log(erros.length ? `FALHOU: ${erros.length} erro(s)` : "OK: nenhum erro no console");
})();
