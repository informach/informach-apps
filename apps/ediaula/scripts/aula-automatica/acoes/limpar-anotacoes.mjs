// Tira os destaques, as caixas e os balões do projeto aberto (remove_clips), para gerar as anotações de
// novo sem duplicar. Estado: projeto (caminho do .ediaula aberto, lido depois de salvar para saber os ids).
import { readFileSync } from "node:fs";
import { chamar } from "./ia.mjs";

export default async function limparAnotacoes(ctx) {
  const e = await ctx.editor();
  await e.keyboard.press("Control+s").catch(() => {});
  await ctx.delay(2000);
  const d = JSON.parse(readFileSync(ctx.state.projeto, "utf8"));
  const ids = d.clips
    .filter((c) => ["highlight", "box", "balloon"].includes(c.annotation?.kind))
    .map((c) => c.id);
  if (!ids.length) return "nenhuma anotação para tirar";
  const ov = await chamar(ctx, "get_overview", {});
  const revision = Number(/Revisão do projeto: (\d+)/.exec(ov.text ?? "")?.[1]);
  const r = await chamar(ctx, "remove_clips", { clip_ids: ids, revision });
  return r.text;
}
