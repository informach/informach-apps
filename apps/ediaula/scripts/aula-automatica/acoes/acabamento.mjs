// Acabamento da edição automática pelas ferramentas do EdiAula, com o projeto aberto (nada de mexer no
// arquivo com o editor fechado). Estado:
//   projeto        caminho do .ediaula aberto (é lido depois de salvar, para saber os ids)
//   intervalos     [[ini, fim], ...] em que a apresentadora aparece (montar.py: <saida>-apresentadora.json)
//   apresentadora  trecho do nome da mídia da apresentadora (padrão "HeyGen")
//   musica         trecho do nome da música na biblioteca (opcional; distribui se ainda não há faixa de música)
//   cartoes        [[ini, fim], ...] dos cartões de seção (opcional; as peças secao-*.edisvg já contam)
//   abertura       segundos do plano da abertura (padrão 1,5)
// Faz, nesta ordem (regras de edição, 17/11/2026):
//   - as animações de conceito (mídia "conceito-*" ou peça conceito-*.edisvg vinculada) no lugar da tela,
//     com transição (place_cutaway);
//   - a apresentadora: recorte (esquerda, direita e topo 2%, base 45%), só nos intervalos e fora das falas
//     dos personagens (keep_ranges, com dissolve), e o plano de cada trecho: abertura, demonstração, animação
//     de conceito (do começo ao fim dela) e cartão de seção;
//   - os personagens à esquerda, grandes, com dissolve; a regra "personagem silencia a professora" ligada;
//   - as faixas, de baixo para cima: áudios, gravação (com as animações), zoom, capa, marcações,
//     apresentadora e personagens;
//   - a música distribuída (spread_music).
// Cada passo é um passo de desfazer. Devolve o que fez e o que precisa de revisão.
import { basename } from "node:path";
import { ferramentas, fimDe, gravacao, lerProjeto } from "./comum.mjs";

const PLANOS = {
  abertura: { x: 0.81, y: 1.08, scale: 1.96 },
  demonstracao: { x: 0.86, y: 1.34, scale: 1.58 },
  conceito: { x: 0.8, y: 1.13, scale: 1.97 },
  secao: { x: 0.53, y: 1.67, scale: 3.36 },
};
const PERSONAGEM = { x: 0.24, y: 0.83, scale: 1.18, fade_in: 0.3, fade_out: 0.3 };
const RECORTE = { left: 0.02, right: 0.02, top: 0.02, bottom: 0.45 };

/** A peça vinculada de um papel (conceito-*.edisvg, secao-*.edisvg). */
const pecaDe = (asset, papel) =>
  !!asset?.link &&
  new RegExp(`^${papel}(-|\\.edisvg$)`).test(basename(asset.link.project).toLowerCase());

export default async function acabamento(ctx) {
  const st = ctx.state;
  const feito = [];
  const revisar = [];
  const { ia, revisao } = ferramentas(ctx);
  const ler = () => lerProjeto(ctx, st.projeto);
  const apres = st.apresentadora ?? "HeyGen";
  const conceito = (proj, c) =>
    proj.nome(c).startsWith("conceito-") || pecaDe(proj.asset(c), "conceito");

  // 1. Animações no lugar da tela.
  let proj = await ler();
  let tela = gravacao(proj);
  const somTracks = [
    ...new Set(proj.d.clips.filter((c) => proj.nome(c).startsWith("som-da")).map((c) => c.trackId)),
  ];
  for (const c of proj.d.clips.filter((x) => conceito(proj, x) && x.trackId !== tela.trackId)) {
    if (proj.asset(c)?.key)
      await ia("set_background_removal", { media: proj.nome(c), enabled: false });
    feito.push(
      await ia("place_cutaway", {
        clip_id: c.id,
        track_id: tela.trackId,
        also_track_ids: somTracks,
        revision: await revisao(),
      }),
    );
  }

  // 2. Apresentadora: recorte, trechos e o plano de cada trecho.
  proj = await ler();
  tela = gravacao(proj);
  const ehPersonagem = (c) =>
    proj.asset(c)?.origin === "presenter" && !proj.nome(c).includes(apres);
  const falas = proj.d.clips.filter(ehPersonagem).map((c) => [c.start, fimDe(c)]);
  const pres = proj.d.clips.filter((c) => proj.nome(c).includes(apres));
  if (pres.length) await ia("set_crop", { clip_ids: pres.map((c) => c.id), ...RECORTE });
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
  proj = await ler();
  const animacoes = proj.d.clips
    .filter((c) => c.trackId === tela.trackId && conceito(proj, c))
    .map((c) => [c.start, fimDe(c)]);
  const cartoes = [
    ...(st.cartoes ?? []),
    ...proj.d.clips.filter((c) => pecaDe(proj.asset(c), "secao")).map((c) => [c.start, fimDe(c)]),
  ];
  const abertura = st.abertura ?? 1.5;
  // Cada mudança de plano é um corte no clipe dela (o pedaço de cada lado fica com o seu plano).
  const cortes = [abertura, ...animacoes.flat(), ...cartoes.flat()].sort((a, b) => a - b);
  for (const t of cortes) {
    proj = await ler();
    const c = proj.d.clips.find(
      (x) => proj.nome(x).includes(apres) && x.start + 0.3 < t && t < fimDe(x) - 0.3,
    );
    if (c)
      await ia("split_clip", {
        clip_id: c.id,
        at: Math.round(t * 100) / 100,
        revision: await revisao(),
      });
  }
  proj = await ler();
  const pedacos = proj.d.clips
    .filter((c) => proj.nome(c).includes(apres))
    .sort((a, b) => a.start - b.start);
  const dentro = (c, ints) =>
    ints.some(
      ([a, b]) => a - 0.05 <= (c.start + fimDe(c)) / 2 && (c.start + fimDe(c)) / 2 <= b + 0.05,
    );
  const plano = (c) =>
    c.start < abertura - 0.05 && fimDe(c) <= abertura + 0.05
      ? "abertura"
      : dentro(c, animacoes)
        ? "conceito"
        : dentro(c, cartoes)
          ? "secao"
          : "demonstracao";
  for (const [nome, valores] of Object.entries(PLANOS)) {
    const ids = pedacos.filter((c) => plano(c) === nome).map((c) => c.id);
    if (ids.length) await ia("set_clip_layout", { clip_ids: ids, ...valores });
  }
  // Troca de plano sem sair: dissolve entre os dois pedaços.
  const emSeguida = pedacos.filter(
    (c, k) => k > 0 && Math.abs(fimDe(pedacos[k - 1]) - c.start) < 0.02,
  );
  if (emSeguida.length)
    await ia("set_transition", {
      clip_ids: emSeguida.map((c) => c.id),
      kind: "dissolve",
      duration: 0.3,
    });
  feito.push(
    `apresentadora: ${pedacos.length} trechos (${Object.keys(PLANOS)
      .map((k) => `${k} ${pedacos.filter((c) => plano(c) === k).length}`)
      .join(", ")})`,
  );
  // Toda animação de conceito tem a apresentadora por cima, do começo ao fim.
  for (const [a, b] of animacoes) {
    const cobre = pedacos.some((c) => c.start <= a + 0.05 && fimDe(c) >= b - 0.05);
    if (!cobre)
      revisar.push(
        `${a.toFixed(1)}s: a apresentadora não cobre a animação inteira (${a.toFixed(1)}–${b.toFixed(1)}s)`,
      );
  }

  // 3. Personagens: à esquerda, grandes, com dissolve; nunca dois ao mesmo tempo; nunca duas vozes.
  const pers = proj.d.clips.filter(ehPersonagem).sort((a, b) => a.start - b.start);
  if (pers.length) await ia("set_clip_layout", { clip_ids: pers.map((c) => c.id), ...PERSONAGEM });
  for (let k = 1; k < pers.length; k++)
    if (pers[k].start < fimDe(pers[k - 1]) - 0.01)
      revisar.push(
        `${pers[k].start.toFixed(1)}s: ${proj.nome(pers[k])} entra com ${proj.nome(pers[k - 1])} ainda na tela`,
      );
  feito.push(await ia("set_voice_rule", { enabled: true, picture: "fade" }));

  // 4. Faixas, de baixo para cima: áudios, gravação, zoom, capa, marcações, apresentadora e personagens.
  proj = await ler();
  const trackDe = (clips) => [...new Set(clips.map((c) => c.trackId))];
  const porNome = (nome) => proj.d.tracks.find((t) => t.name === nome)?.id;
  const zoom = porNome("Zoom") ?? trackDe(proj.d.clips.filter((c) => c.zoomLayer))[0];
  const marcacoes = porNome("Marcações");
  const presTrack = trackDe(proj.d.clips.filter((c) => proj.nome(c).includes(apres)))[0];
  const persTracks = trackDe(proj.d.clips.filter(ehPersonagem)).filter((t) => t !== presTrack);
  // A capa: as camadas do template de abertura (o grupo que começa em 0:00) e a peça capa-*.edisvg.
  const gruposCapa = new Set(
    proj.d.clips.filter((c) => c.annotation && c.groupId && c.start < 0.05).map((c) => c.groupId),
  );
  const pessoas = [presTrack, ...persTracks];
  const clipesCapa = proj.d.clips.filter(
    (c) => (c.groupId && gruposCapa.has(c.groupId)) || pecaDe(proj.asset(c), "capa"),
  );
  for (const c of clipesCapa.filter((x) => pessoas.includes(x.trackId)))
    revisar.push(
      `${proj.nome(c)}: camada da capa na faixa ${proj.trilha(c.trackId)?.name} (de pessoa); mova para a faixa da capa`,
    );
  const capa = trackDe(clipesCapa).filter(
    (t) => ![zoom, marcacoes, tela.trackId, ...pessoas].includes(t),
  );
  const pilha = [zoom, ...new Set(capa), marcacoes, presTrack, ...persTracks].filter(Boolean);
  let ref = tela.trackId;
  for (const t of pilha) {
    if (t === ref) continue;
    await ia("move_track", { track_id: t, position: "above", reference_track_id: ref });
    ref = t;
  }
  // Os áudios ficam embaixo da gravação.
  proj = await ler();
  const posTela = proj.d.tracks.findIndex((t) => t.id === tela.trackId);
  const audiosAcima = proj.d.tracks.slice(0, posTela).filter((t) => t.kind === "audio");
  for (const t of audiosAcima.reverse())
    await ia("move_track", { track_id: t.id, position: "below", reference_track_id: tela.trackId });
  feito.push("faixas: áudios, gravação, zoom, capa, marcações, apresentadora e personagens");

  // 5. Música distribuída.
  if (st.musica && !proj.d.tracks.some((t) => t.music)) {
    const m = proj.d.assets.find((a) => a.name.includes(st.musica));
    if (m) feito.push(await ia("spread_music", { media_id: m.id }));
    else feito.push(`música "${st.musica}" não está na biblioteca: importe antes`);
  }
  await ler();
  return { feito, revisar };
}
