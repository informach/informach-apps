// Aplica na aula aberta os comandos do montar.py (e do pecas.py): zoom, marcações, capa e peças .edisvg.
// Estado:
//   comandos   caminho do comandos.json
//   projeto    caminho do .ediaula aberto (é lido depois de salvar, para saber os ids)
//   semZoom    true: pula os add_zoom (para refazer só as marcações)
//   saida      caminho opcional de um .json com o que foi feito (aplicado.json)
// Faixas, de baixo para cima (regras de edição, 17/11/2026): a gravação da tela; "Zoom", uma faixa só, logo
// acima dela ($ZOOM); "Marcações", uma faixa só, acima do zoom ($MARCACOES). As marcações ficam fora do zoom
// e já vêm na posição da tela ampliada (montar.py).
// "_vincular" põe uma peça .edisvg vinculada (Arquivo › Importar animação do EdiSVG…): o clipe abre no
// EdiSVG com 2 cliques e se atualiza quando a peça é salva lá. A marcação vai para a faixa de marcações; a
// animação de conceito fica na faixa "Animações do EdiSVG" até o acabamento pô-la no lugar da tela; a capa
// fica nela também (é a faixa da capa). O render chega do EdiSVG do condutor (condutor.mts edisvg aberto).
import { readFileSync, writeFileSync } from "node:fs";
import {
  ferramentas,
  fimDe,
  gravacao,
  idDe,
  larguraNaTela,
  lerProjeto,
  mesmoCaminho,
} from "./comum.mjs";

const FAIXA_ZOOM = "Zoom";
const FAIXA_MARCACOES = "Marcações";

export default async function aplicar(ctx) {
  const st = ctx.state;
  if (!st.comandos || !st.projeto) throw new Error("faltam comandos e projeto no estado");
  const cmds = JSON.parse(readFileSync(st.comandos, "utf8"));
  const { ia, revisao } = ferramentas(ctx);
  const feito = { aplicados: 0, falhas: [], ancoradas: 0, pecas: [], aguardando: [] };

  // 0. A capa primeiro: o template escolhe a faixa dele, e não pode cair nas faixas do zoom e das marcações.
  // Uma aula que já tem capa (o grupo do template no começo, ou a peça vinculada) fica com ela.
  let proj = await lerProjeto(ctx, st.projeto);
  const jaTem = (c) =>
    c.tool === "add_template"
      ? proj.d.clips.some((x) => x.annotation && x.groupId && x.start < 0.05)
      : c.tool === "_vincular" &&
        proj.d.clips.some(
          (x) =>
            proj.asset(x)?.link &&
            mesmoCaminho(proj.asset(x).link.project, c.input.arquivo) &&
            Math.abs(x.start - c.input.at) < 0.05,
        );
  const capa = cmds.filter((c) => c.papel === "capa");
  const resto = cmds.filter((c) => c.papel !== "capa");
  for (const c of capa) {
    if (jaTem(c)) continue;
    try {
      if (c.tool === "_vincular") feito.pecas.push(await vincular(ctx, st, c.input, {}));
      else {
        await ia(c.tool, c.input);
        feito.aplicados++;
      }
    } catch (err) {
      feito.falhas.push(`capa (${c.nota}): ${String(err.message ?? err)}`);
    }
  }

  // 1. As faixas do zoom e das marcações, uma de cada.
  proj = await lerProjeto(ctx, st.projeto);
  const faixa = async (nome, acimaDe) => {
    const t = proj.d.tracks.find((x) => x.name === nome);
    if (t) return t.id;
    const r = await ia("add_track", {
      position: "above",
      track_id: acimaDe,
      kind: "video",
      label: nome,
      revision: await revisao(),
    });
    const id = idDe(r);
    if (!id) throw new Error(`add_track não disse o id da faixa ${nome}: ${r}`);
    proj = await lerProjeto(ctx, st.projeto);
    return id;
  };
  const tela = gravacao(proj).trackId;
  const zoom = await faixa(FAIXA_ZOOM, tela);
  const marcacoes = await faixa(FAIXA_MARCACOES, zoom);
  const faixas = { $ZOOM: zoom, $MARCACOES: marcacoes };

  // 2. Os comandos, na ordem do tempo.
  const ancorar = [];
  for (const c of resto) {
    if (st.semZoom && c.tool === "add_zoom") continue;
    if (jaTem(c)) continue;
    const input = { ...c.input };
    if (input.track_id in faixas) input.track_id = faixas[input.track_id];
    try {
      if (c.tool === "_vincular") {
        feito.pecas.push(await vincular(ctx, st, input, { marcacoes }));
        continue;
      }
      const r = await ia(c.tool, input);
      feito.aplicados++;
      if (c.ancora_esquerda !== undefined && idDe(r))
        ancorar.push({ id: idDe(r), esquerda: c.ancora_esquerda });
    } catch (err) {
      feito.falhas.push(
        `${c.input.at ?? ""}s ${c.tool} (${c.nota}): ${String(err.message ?? err)}`,
      );
    }
  }

  // 3. As caixas das categorias com a ponta na paleta: a borda esquerda no ponto calculado, com a largura de
  // verdade do desenho.
  if (ancorar.length) {
    proj = await lerProjeto(ctx, st.projeto);
    for (const { id, esquerda } of ancorar) {
      const clip = proj.d.clips.find((x) => x.id === id);
      const asset = clip && proj.asset(clip);
      if (!asset) continue;
      const x = esquerda + larguraNaTela(proj.d, clip, asset) / 2;
      await ia("set_clip_layout", { clip_ids: [id], x: Math.round(x * 10000) / 10000 });
      feito.ancoradas++;
    }
  }

  // 4. Os renders das peças: o EdiSVG do condutor faz um por peça; sem ele aberto, ficam esperando.
  proj = await lerProjeto(ctx, st.projeto);
  for (const a of proj.d.assets)
    if (a.link && !a.link.hash) feito.aguardando.push(`${a.name} (${a.link.project})`);
  if (st.saida) writeFileSync(st.saida, JSON.stringify(feito, null, 1));
  return feito;
}

/** Uma peça .edisvg vinculada no seu tempo, posição, escala e faixa. Devolve o que foi feito. */
async function vincular(ctx, st, input, { marcacoes }) {
  const { ia, revisao } = ferramentas(ctx);
  const e = await ctx.editor();
  await ia("seek", { time: input.at });
  await ctx.answer("open", [input.arquivo]);
  await e
    .locator("button.menu-trigger", { hasText: /^Arquivo$/ })
    .first()
    .click();
  await e.getByRole("menuitem", { name: "Importar animação do EdiSVG…" }).click();
  const dialogo = e.getByRole("dialog", { name: "Importar animação do EdiSVG" });
  await dialogo.waitFor({ timeout: 15000 });
  await dialogo.getByRole("button", { name: "Importar" }).click();
  await ctx.delay(2500);

  // O clipe novo: a mídia vinculada a esse arquivo, começando no tempo pedido.
  const proj = await lerProjeto(ctx, st.projeto);
  const clip = proj.d.clips
    .filter((c) => {
      const a = proj.asset(c);
      return (
        a?.link &&
        mesmoCaminho(a.link.project, input.arquivo) &&
        (!input.animacao || a.link.animationId === input.animacao) &&
        Math.abs(c.start - input.at) < 0.05
      );
    })
    .at(-1);
  if (!clip) throw new Error(`a peça ${input.arquivo} não entrou na aula`);
  const nome = proj.nome(clip);
  // O tempo da marcação: termina com ela (a animação de conceito e a capa ficam com a duração da peça).
  if (input.track_id && fimDe(clip) > input.at + input.duration + 0.01)
    await ia("trim_clip", {
      clip_id: clip.id,
      end: Math.round((input.at + input.duration) * 100) / 100,
      revision: await revisao(),
    });
  if (input.x !== undefined)
    await ia("set_clip_layout", {
      clip_ids: [clip.id],
      x: input.x,
      y: input.y,
      scale: input.scale,
    });
  if (input.track_id === marcacoes)
    await ia("place_cutaway", {
      clip_id: clip.id,
      track_id: marcacoes,
      transition: "none",
      revision: await revisao(),
    });
  return `${input.at}s ${nome} [${clip.id}]`;
}
