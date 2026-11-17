// Acabamento da edição automática pelas ferramentas do EdiAula, com o projeto aberto (nada de mexer no
// arquivo com o editor fechado). Estado:
//   projeto        caminho do .ediaula aberto (é lido depois de salvar, para saber os ids)
//   intervalos     [[ini, fim], ...] em que a apresentadora aparece (montar.py: <saida>-apresentadora.json)
//   apresentadora  trecho do nome da mídia da apresentadora (padrão "HeyGen")
//   musica         trecho do nome da música na biblioteca (opcional; distribui se ainda não há faixa de música)
// Faz, nesta ordem:
//   - as animações "conceito-*" no lugar da tela, com transição (place_cutaway);
//   - a apresentadora só nos intervalos, fora das falas dos personagens (keep_ranges);
//   - a voz da professora calada nas falas dos personagens (set_volume);
//   - as caixas das categorias menores, encostadas na paleta (set_clip_layout);
//   - as faixas: personagens, apresentadora e zoom no alto (move_track);
//   - a música distribuída (spread_music).
// Cada passo é um passo de desfazer. Devolve o que fez.
import { readFileSync } from "node:fs";
import { chamar } from "./ia.mjs";

const PALETA = 232; // borda esquerda da caixa: a ponta cai nas linhas da paleta do Estúdio (x ~246 em 1920)

export default async function acabamento(ctx) {
  const st = ctx.state;
  const feito = [];
  const ia = async (name, input) => {
    const r = await chamar(ctx, name, input);
    if (!r.ok) throw new Error(`${name}: ${r.text}`);
    return r.text;
  };
  const revisao = async () => {
    const r = await chamar(ctx, "get_overview", {});
    const m = /Revisão do projeto: (\d+)/.exec(r.text ?? "");
    if (!m) throw new Error("get_overview não disse a revisão");
    return Number(m[1]);
  };
  const ler = async () => {
    const e = await ctx.editor();
    await e.keyboard.press("Control+s").catch(() => {});
    await ctx.delay(2000);
    const d = JSON.parse(readFileSync(st.projeto, "utf8"));
    const A = new Map(d.assets.map((a) => [a.id, a]));
    return { d, nome: (c) => A.get(c.assetId)?.name ?? "", asset: (c) => A.get(c.assetId) };
  };
  const fim = (c) => c.start + c.duration;
  const apres = st.apresentadora ?? "HeyGen";

  // 1. Animações no lugar da tela.
  let { d, nome, asset } = await ler();
  const tela = d.clips.find((c) => nome(c).startsWith("Tela"));
  if (!tela) throw new Error("não achei a gravação da tela (mídia 'Tela …')");
  const somTracks = [
    ...new Set(d.clips.filter((c) => nome(c).startsWith("som-da")).map((c) => c.trackId)),
  ];
  for (const c of d.clips.filter(
    (x) => nome(x).startsWith("conceito-") && x.trackId !== tela.trackId,
  )) {
    if (asset(c)?.key) await ia("set_background_removal", { media: nome(c), enabled: false });
    feito.push(
      await ia("place_cutaway", {
        clip_id: c.id,
        track_id: tela.trackId,
        also_track_ids: somTracks,
        revision: await revisao(),
      }),
    );
  }

  // 2. Apresentadora nos intervalos, fora das falas dos personagens.
  ({ d, nome, asset } = await ler());
  const personagens = d.clips.filter(
    (c) => asset(c)?.origin === "presenter" && !nome(c).includes(apres),
  );
  const falas = personagens.map((c) => [c.start, fim(c)]);
  const pres = d.clips.filter((c) => nome(c).includes(apres));
  if (st.intervalos && pres.length === 1) {
    let trechos = st.intervalos;
    for (const [p0, p1] of falas)
      trechos = trechos.flatMap(([a, b]) =>
        p1 <= a || p0 >= b
          ? [[a, b]]
          : [
              [a, p0 - 0.05],
              [p1 + 0.05, b],
            ].filter(([x, y]) => y - x >= 1.5),
      );
    feito.push(
      await ia("keep_ranges", { clip_id: pres[0].id, ranges: trechos, revision: await revisao() }),
    );
  } else if (st.intervalos) {
    feito.push(`apresentadora: ${pres.length} clipes, esperava 1; os trechos ficaram como estavam`);
  }

  // 3. Voz da professora calada nas falas dos personagens.
  for (const [p0, p1] of falas) {
    const narr = d.clips.filter(
      (c) => nome(c).startsWith("narracao") && c.start < p1 && fim(c) > p0,
    );
    if (narr.length)
      feito.push(
        await ia("set_volume", { clip_ids: narr.map((c) => c.id), volume: 0, from: p0, to: p1 }),
      );
  }

  // 4. Caixas das categorias: 55% do tamanho padrão, ponta na paleta.
  for (const c of d.clips.filter(
    (x) => x.annotation?.kind === "box" && x.transform?.scale > 0.13,
  )) {
    const scale = Math.round(c.transform.scale * 0.55 * 10000) / 10000;
    await ia("set_clip_layout", {
      clip_ids: [c.id],
      scale,
      x: Math.round(((PALETA + (scale * 1920) / 2) / 1920) * 10000) / 10000,
    });
  }

  // 5. Faixas: personagens no alto, a apresentadora logo abaixo, o zoom logo abaixo dela.
  ({ d, nome, asset } = await ler());
  const trackDe = (clips) => [...new Set(clips.map((c) => c.trackId))];
  const presTrack = trackDe(d.clips.filter((c) => nome(c).includes(apres)))[0];
  if (presTrack) {
    const topo = d.tracks[0].id;
    if (topo !== presTrack)
      await ia("move_track", { track_id: presTrack, position: "above", reference_track_id: topo });
    for (const t of trackDe(
      d.clips.filter((c) => asset(c)?.origin === "presenter" && !nome(c).includes(apres)),
    ))
      if (t !== presTrack)
        await ia("move_track", { track_id: t, position: "above", reference_track_id: presTrack });
    let ref = presTrack;
    for (const t of trackDe(d.clips.filter((c) => c.zoomLayer))) {
      await ia("move_track", { track_id: t, position: "below", reference_track_id: ref });
      ref = t;
    }
    feito.push("faixas: personagens, apresentadora e zoom no alto");
  }

  // 6. Música distribuída.
  if (st.musica && !d.tracks.some((t) => t.music)) {
    const m = d.assets.find((a) => a.name.includes(st.musica));
    if (m) feito.push(await ia("spread_music", { media_id: m.id }));
    else feito.push(`música "${st.musica}" não está na biblioteca: importe antes`);
  }
  await ler();
  return feito;
}
