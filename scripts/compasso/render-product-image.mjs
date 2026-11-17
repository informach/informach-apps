// Gera scripts/compasso/assets/compasso-produto.png, a imagem do produto no Stripe,
// com as cores e fontes da Conta: node scripts/compasso/render-product-image.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const root = "C:/Users/tocha/projects/informach-apps/";
const require = createRequire(`${root}apps/conta/package.json`);
const { chromium } = require("@playwright/test");
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(require.resolve(`@fontsource-variable/${pkg}/files/${file}`)).toString("base64")}`;
const bricolage = font("bricolage-grotesque", "bricolage-grotesque-latin-opsz-normal.woff2");
const jakarta = font("plus-jakarta-sans", "plus-jakarta-sans-latin-wght-normal.woff2");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Bricolage";src:url("${bricolage}") format("woff2");font-weight:200 800}
@font-face{font-family:"Jakarta";src:url("${jakarta}") format("woff2");font-weight:200 800}
html,body{margin:0;width:1024px;height:1024px}
body{background:#f6f4ec;display:grid;place-items:center;font-family:"Jakarta"}
.card{width:1024px;height:1024px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px}
.ring{position:absolute;inset:64px;border:2px solid #d5dcd0;border-radius:48px}
.name{font-family:"Bricolage";font-weight:620;font-size:132px;letter-spacing:-0.045em;color:#203b31;line-height:1}
.line{font-size:34px;color:#58675e;letter-spacing:-0.01em}
</style></head><body><div class="card"><div class="ring"></div>
<svg width="420" height="420" viewBox="0 0 200 200" aria-hidden="true">
  <circle cx="100" cy="100" r="92" fill="#fffef9" stroke="#285e45" stroke-width="6"/>
  <circle cx="100" cy="100" r="74" fill="none" stroke="#e4eddf" stroke-width="10"/>
  <g stroke="#285e45" stroke-width="5" stroke-linecap="round">
    <line x1="100" y1="16" x2="100" y2="30"/><line x1="100" y1="170" x2="100" y2="184"/>
    <line x1="16" y1="100" x2="30" y2="100"/><line x1="170" y1="100" x2="184" y2="100"/>
  </g>
  <polygon points="100,38 114,100 100,108 86,100" fill="#a44328"/>
  <polygon points="100,162 86,100 100,92 114,100" fill="#285e45"/>
  <circle cx="100" cy="100" r="9" fill="#fffef9" stroke="#203b31" stroke-width="5"/>
</svg>
<div class="name">Compasso</div>
<div class="line">A rotina da família num lugar só</div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const out = process.argv[2] ?? `${root}scripts/compasso/assets/compasso-produto.png`;
  await page.screenshot({ path: out, type: "png" });
  console.log(out);
} finally {
  await browser.close();
}
