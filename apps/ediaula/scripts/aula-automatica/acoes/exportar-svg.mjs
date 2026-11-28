// No condutor do EdiSVG: abre ctx.state.svgArquivo (.edisvg) e exporta o MP4 em ctx.state.svgSaida.
// Antes de abrir, enfileira "Descartar" para a pergunta de salvar o projeto anterior, que senão abre de
// verdade na tela.
import { statSync } from "node:fs";

export default async function exportarSvg(ctx) {
  const e = await ctx.editor();
  const nomeArq = ctx.state.svgArquivo.split(/[\\/]/).pop();
  if (!(await e.title()).includes(nomeArq) || ctx.state.svgReabrir !== false) {
    await e.keyboard.press("Escape").catch(() => {});
    await ctx.delay(400);
    await e.getByRole("button", { name: "Arquivo", exact: true }).click();
    await ctx.delay(600);
    await ctx.app.evaluate(() => globalThis.__prova.queue.push({ kind: "message", value: 1 }));
    await ctx.answer("open", [ctx.state.svgArquivo]);
    await e.getByText("Abrir projeto…", { exact: true }).first().click();
    await ctx.delay(7000);
  }
  const titulo = await e.title();
  if (!titulo.includes(nomeArq)) return { erro: "não abriu", titulo };
  await e.getByRole("button", { name: "↗ Exportar" }).click();
  await ctx.delay(1200);
  await e.getByText("Vídeo MP4 · H.264", { exact: false }).first().click();
  await ctx.delay(1200);
  await e.getByText("Confirmo converter a animação em imagens").first().click();
  await ctx.delay(400);
  // Cena com componente (o Zappy de zappy_kit.py, instância da prancheta dele): o EdiSVG pede a confirmação de
  // exportar só a linha do tempo (máquinas de estado ficam de fora; o Zappy toca a animação sincronizada).
  const soTimeline = e.getByText("Confirmo exportar somente a timeline");
  if (await soTimeline.count()) {
    await soTimeline.first().click();
    await ctx.delay(400);
  }
  await ctx.answer("save", ctx.state.svgSaida);
  await e.getByRole("button", { name: "↗ Exportar arquivo" }).click();
  let tam = -1;
  for (let i = 0; i < 240; i++) {
    await ctx.delay(2000);
    let t = -1;
    try {
      t = statSync(ctx.state.svgSaida).size;
    } catch {}
    if (t > 0 && t === tam) break;
    tam = t;
  }
  return { titulo, tam };
}
