// Rasteriza SVGs em PNG com fundo transparente, no Chromium do Playwright (o mesmo motor da página).
// Uso: NODE_PATH=/opt/node-tools/node_modules node icones_rasteriza.js tarefas.json
// tarefas.json: [{"svg": "caminho.svg", "png": "saida.png", "w": 128, "h": 128}, ...]
// O SVG ocupa a área toda (largura e altura são as do PNG); a proporção vem do viewBox do próprio SVG.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const tarefas = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  let n = 0;
  for (const t of tarefas) {
    const svg = fs.readFileSync(t.svg, "utf8").replace(/<svg\b/, '<svg preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%"');
    await pag.setViewportSize({ width: t.w, height: t.h });
    await pag.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;width:${t.w}px;height:${t.h}px;overflow:hidden}</style></head><body>${svg}</body></html>`);
    fs.mkdirSync(path.dirname(t.png), { recursive: true });
    await pag.screenshot({ path: t.png, omitBackground: true, clip: { x: 0, y: 0, width: t.w, height: t.h } });
    n++;
  }
  await nav.close();
  console.log(`rasterizados: ${n}`);
})();
