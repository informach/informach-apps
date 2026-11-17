// No condutor do EdiSVG: gera o render das peças .edisvg vinculadas que ainda não têm render, uma de cada vez.
// Os pedidos de vínculo que chegam juntos (aplicar.mjs vincula uma peça atrás da outra) abrem um projeto por
// cima do outro, e só o último é renderizado. Esta ação abre cada peça sem render, salva (salvar renderiza as
// animações vinculadas do projeto) e espera o render aparecer no vinculos.json da pasta "<peça> · renders".
// Estado: svgArquivos = [caminhos dos .edisvg] (os que já têm render são pulados).
// Devolve { renderizadas, ja_tinham, falharam }.
import { existsSync, readFileSync } from "node:fs";

const manifesto = (arq) => `${arq.replace(/\.edisvg$/i, "")} · renders/vinculos.json`;
const temRender = (arq) => {
  const m = manifesto(arq);
  if (!existsSync(m)) return false;
  const itens = JSON.parse(readFileSync(m, "utf8")).items ?? [];
  return itens.length > 0 && itens.every((i) => i.render?.file);
};

export default async function renderizarPecas(ctx) {
  const e = await ctx.editor();
  const res = { renderizadas: [], ja_tinham: [], falharam: [] };
  for (const arq of ctx.state.svgArquivos ?? []) {
    const nome = arq.split(/[\\/]/).pop();
    if (temRender(arq)) {
      res.ja_tinham.push(nome);
      continue;
    }
    // Abrir: a pergunta de salvar o projeto anterior recebe "Descartar" (senão abre de verdade na tela).
    await e.keyboard.press("Escape").catch(() => {});
    await ctx.delay(400);
    await e.getByRole("button", { name: "Arquivo", exact: true }).click();
    await ctx.delay(600);
    await ctx.app.evaluate(() => globalThis.__prova.queue.push({ kind: "message", value: 1 }));
    await ctx.answer("open", [arq]);
    await e.getByText("Abrir projeto…", { exact: true }).first().click();
    await ctx.delay(7000);
    if (!(await e.title()).includes(nome)) {
      res.falharam.push(`${nome}: não abriu`);
      continue;
    }
    await e.keyboard.press("Control+s");
    let ok = false;
    for (let i = 0; i < 90 && !ok; i++) {
      await ctx.delay(2000);
      ok = temRender(arq);
    }
    (ok ? res.renderizadas : res.falharam).push(
      ok ? nome : `${nome}: o render não chegou em 3 min`,
    );
  }
  return res;
}
