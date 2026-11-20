// Põe imagens (prints de telas que o robô não grava, como a área da criança vista por outra conta)
// no lugar de trechos da gravação da tela, como as animações de conceito, e destaques por cima delas.
// Estado:
//   projeto    caminho do .ediaula aberto
//   prints     [{ arquivo, at, duracao, transicao? }]: a imagem já importada (pela janela de abrir),
//              o segundo da aula em que entra e quanto fica; transicao é a do place_cutaway
//              (colorcircles quando muda o assunto, dissolve entre telas do mesmo passo a passo)
//   destaques  [{ at, duracao, x, y, w, h }]: contorno amarelo sobre um print (x e y no centro, em
//              frações do quadro; w e h em pixels), na faixa "Marcações" quando ela existe
// Devolve o que foi feito, uma linha por peça.
import { basename } from "node:path";
import { ferramentas, gravacao, lerProjeto } from "./comum.mjs";

const semExtensao = (p) => basename(p).replace(/\.[^.]+$/, "");

export default async function prints(ctx) {
  const st = ctx.state;
  if (!st.projeto) throw new Error("falta projeto no estado");
  const { ia, revisao } = ferramentas(ctx);
  const feito = [];
  const proj = await lerProjeto(ctx, st.projeto);
  const tela = gravacao(proj);
  const somDaPagina = proj.d.clips.find((c) => proj.nome(c).startsWith("som-da-pagina"));
  for (const p of st.prints ?? []) {
    const nome = semExtensao(p.arquivo);
    const asset = proj.d.assets.find((a) => a.name === nome || semExtensao(a.path ?? "") === nome);
    if (!asset) throw new Error(`o print não está na biblioteca (importe antes): ${p.arquivo}`);
    const r = await ia("place_cutaway", {
      media_id: asset.id,
      at: p.at,
      duration: p.duracao,
      track_id: tela.trackId,
      ...(somDaPagina ? { also_track_ids: [somDaPagina.trackId] } : {}),
      transition: p.transicao ?? "colorcircles",
      revision: await revisao(),
    });
    feito.push(`${nome} em ${p.at}s por ${p.duracao}s: ${r.split("\n")[0]}`);
  }
  const marcacoes = proj.d.tracks.find((t) => t.name === "Marcações");
  for (const h of st.destaques ?? []) {
    const r = await ia("add_annotation", {
      kind: "highlight",
      at: h.at,
      duration: h.duracao,
      x: h.x,
      y: h.y,
      box_width: h.w,
      box_height: h.h,
      color: "#FFD60A",
      ...(marcacoes ? { track_id: marcacoes.id } : {}),
    });
    feito.push(`destaque em ${h.at}s: ${r.split("\n")[0]}`);
  }
  await lerProjeto(ctx, st.projeto);
  return feito;
}
