// Peças comuns das ações que mexem na aula aberta pelas ferramentas do EdiAula (aplicar, acabamento,
// revisão final). Os ids e os tempos vêm do arquivo salvo; a revisão, do get_overview.
import { readFileSync } from "node:fs";
import { chamar } from "./ia.mjs";

/** Chama uma ferramenta e devolve o texto; uma recusa vira erro com o nome da ferramenta. */
export function ferramentas(ctx) {
  const ia = async (name, input) => {
    const r = await chamar(ctx, name, input);
    if (!r.ok) throw new Error(`${name}: ${r.text}`);
    return String(r.text ?? "");
  };
  const revisao = async () => {
    const r = await chamar(ctx, "get_overview", {});
    const m = /Revisão do projeto: (\d+)/.exec(r.text ?? "");
    if (!m) throw new Error("get_overview não disse a revisão");
    return Number(m[1]);
  };
  return { ia, revisao };
}

/** Salva a aula aberta e lê o arquivo: o projeto, e o nome e a mídia de cada clipe. */
export async function lerProjeto(ctx, arquivo) {
  const e = await ctx.editor();
  await e.keyboard.press("Control+s").catch(() => {});
  await ctx.delay(2000);
  const d = JSON.parse(readFileSync(arquivo, "utf8"));
  const A = new Map(d.assets.map((a) => [a.id, a]));
  return {
    d,
    nome: (c) => A.get(c.assetId)?.name ?? "",
    asset: (c) => A.get(c.assetId),
    trilha: (id) => d.tracks.find((t) => t.id === id),
  };
}

/** O primeiro id entre colchetes da resposta de uma ferramenta ("Anotação [c_x] em 0:10"). */
export const idDe = (texto) => /\[([^\]\s]+)\]/.exec(texto)?.[1] ?? null;

export const fimDe = (c) => c.start + c.duration;

/** A gravação da tela (a mídia "Tela …") e a faixa dela. */
export function gravacao(proj) {
  const tela = proj.d.clips.find((c) => proj.nome(c).startsWith("Tela"));
  if (!tela) throw new Error("não achei a gravação da tela (mídia 'Tela …')");
  return tela;
}

/** Caminhos iguais no Windows (barras e maiúsculas não contam). */
export const mesmoCaminho = (a, b) =>
  String(a).replaceAll("\\", "/").toLowerCase() === String(b).replaceAll("\\", "/").toLowerCase();

/** A largura do clipe na tela, como fração do quadro (a imagem cabe no quadro com scale 1). */
export function larguraNaTela(d, clip, asset) {
  const { width: W, height: H } = d.settings;
  const fit = Math.min(W / asset.width, H / asset.height);
  return (fit * (clip.transform?.scale ?? 1) * asset.width) / W;
}
