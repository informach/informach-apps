// Acabamento da edição automática pelas ferramentas do EdiAula, com o projeto aberto (nada de mexer no
// arquivo com o editor fechado). Estado:
//   projeto        caminho do .ediaula aberto (é lido depois de salvar, para saber os ids)
//   intervalos     [[ini, fim], ...] em que a apresentadora aparece (montar.py: <saida>-apresentadora.json)
//   apresentadora  trecho do nome da mídia da apresentadora (padrão "HeyGen")
//   musica         trecho do nome da música na biblioteca (opcional; distribui se ainda não há faixa de música)
//   cartoes        [[ini, fim], ...] dos cartões de seção (opcional; as peças secao-*.edisvg já contam)
//   abertura       segundos do plano da abertura (padrão: até o fim da capa; sem capa, 1,5)
//   emendas        [{ em, duracao }] (opcional): frases gravadas depois que entraram na voz (segundos da voz
//                  nova); o HeyGen não tem esses trechos, e a apresentadora fica fora durante cada um
// Faz, nesta ordem (regras de edição, 17/11/2026):
//   - as animações de conceito (mídia "conceito-*" ou peça conceito-*.edisvg vinculada) no lugar da tela,
//     com transição (place_cutaway);
//   - a apresentadora: recorte (esquerda, direita e topo 2%, base 45%), só nos intervalos e fora das falas
//     dos personagens (keep_ranges, com dissolve), e o plano de cada trecho: abertura, demonstração, animação
//     de conceito (do começo ao fim dela) e cartão de seção;
//   - os personagens à esquerda, grandes, com dissolve; a regra "personagem silencia a professora" ligada;
//   - as faixas, de baixo para cima: áudios, gravação (com as animações), zoom, capa, marcações,
//     apresentadora e personagens;
//   - a música distribuída (spread_music);
//   - os balões de volta em Nunito, depois da paleta (set_style).
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
// A apresentadora nunca fica com um pedaço menor que isto (segundos): um corte mais curto aparece como um
// pulo de plano ou uma piscada (a verificação antes de exportar aponta "Avatar muda de plano").
const PEDACO_MINIMO = 1;
// Animações com menos que isto de tela entre elas são um trecho só (o place_cutaway já cobre a sobra).
const SOBRA_DE_TELA = 1.5;

/** Intervalos que se encostam, ou quase, viram um só. */
const juntar = (ints, folga) =>
  [...ints]
    .sort((a, b) => a[0] - b[0])
    .reduce((acc, [a, b]) => {
      const ultimo = acc.at(-1);
      if (ultimo && a - ultimo[1] < folga) ultimo[1] = Math.max(ultimo[1], b);
      else acc.push([a, b]);
      return acc;
    }, []);
const RECORTE = { left: 0.02, right: 0.02, top: 0.02, bottom: 0.45 };

/** A peça vinculada de um papel (conceito-*.edisvg, secao-*.edisvg). */
const pecaDe = (asset, papel) =>
  !!asset?.link &&
  new RegExp(`^${papel}(-|\\.edisvg$)`).test(basename(asset.link.project).toLowerCase());

/**
 * Onde o clipe da apresentadora precisa começar para a boca acompanhar a voz: o HeyGen foi gerado
 * sobre o mesmo Áudio.wav da narração, então o segundo t do vídeo dele é o segundo t da voz. A
 * narração guiada entra na linha do tempo no segundo em que a voz começou na gravação (o
 * `narrationOffset` do guided-run.json: 0 quando a parte abre falando, 0,3 a 0,5 s quando abre com
 * uma ação, como expandir o Estúdio). A apresentadora posta no segundo 0 ficava esse tanto à frente
 * da voz (Ilha do Farol, Aulas 1 e 2, 22/11/2026). Null quando não há narração ou já está alinhada.
 */
export function inicioDaApresentadora(proj, clip) {
  const narracao = proj.d.clips.find((c) => proj.nome(c) === "narracao");
  if (!narracao) return null;
  const alvo = narracao.start - (narracao.in ?? 0) + (clip.in ?? 0);
  if (alvo < 0 || Math.abs(clip.start - alvo) <= 0.01) return null;
  return Math.round(alvo * 1000) / 1000;
}

export default async function acabamento(ctx) {
  const st = ctx.state;
  const feito = [];
  const revisar = [];
  const { ia, revisao } = ferramentas(ctx);
  const ler = () => lerProjeto(ctx, st.projeto);
  // O nome da mídia (o estado pode trazer o caminho do vídeo, como o config.py dá: fica o nome sem extensão).
  const apres = st.apresentadora ? basename(st.apresentadora).replace(/\.[^.]+$/, "") : "HeyGen";
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
  // Personagem: vídeo de apresentador que não é a professora, ou mídia com o nome de um personagem (o
  // EdiAula reconhece Debinha e Dedé pelo nome, como na regra de voz; a importação pelo botão não marca
  // a origem).
  // Só o vídeo: o .wav da voz dele (quando o vídeo veio sem som, editar-parte.sh) fica onde está, sem layout.
  const ehPersonagem = (c) =>
    !proj.nome(c).includes(apres) &&
    proj.asset(c)?.kind !== "audio" &&
    (proj.asset(c)?.origin === "presenter" ||
      /(^|[^a-zà-ú])(debinha|ded[eé])([^a-zà-ú]|$)/i.test(proj.nome(c)));
  const falas = proj.d.clips.filter(ehPersonagem).map((c) => [c.start, fimDe(c)]);
  let pres = proj.d.clips.filter((c) => proj.nome(c).includes(apres));
  // A boca acompanha a voz: o clipe único da apresentadora começa onde a narração começa.
  const inicio = pres.length === 1 ? inicioDaApresentadora(proj, pres[0]) : null;
  if (inicio !== null) {
    await ia("move_clips", { clip_ids: [pres[0].id], start: inicio, revision: await revisao() });
    feito.push(`apresentadora alinhada com a narração: começa em ${inicio} s`);
    proj = await ler();
    pres = proj.d.clips.filter((c) => proj.nome(c).includes(apres));
  }
  // Emendas na voz: uma frase gravada depois entrou no Áudio.wav, e o HeyGen não tem esse trecho. O clipe é
  // cortado no ponto da emenda e o que vem depois anda a duração da frase: a boca continua acompanhando a
  // voz, e durante a frase nova não há apresentadora (Ilha A3P4, 23/11/2026: a pergunta que o não traz).
  const emendas = inicio !== null ? [...(st.emendas ?? [])].sort((a, b) => a.em - b.em) : [];
  for (const { em, duracao } of emendas) {
    const t = Math.round((inicio + em) * 100) / 100;
    proj = await ler();
    const c = proj.d.clips.find(
      (x) => proj.nome(x).includes(apres) && x.start + 0.05 < t && t < fimDe(x) - 0.05,
    );
    if (!c) {
      revisar.push(`emenda em ${em} s: a apresentadora não passa por esse ponto`);
      continue;
    }
    await ia("split_clip", { clip_id: c.id, at: t, revision: await revisao() });
    proj = await ler();
    const depois = proj.d.clips
      .filter((x) => proj.nome(x).includes(apres) && x.start >= t - 0.01)
      .sort((a, b) => b.start - a.start);
    for (const x of depois)
      await ia("move_clips", {
        clip_ids: [x.id],
        start: Math.round((x.start + duracao) * 100) / 100,
        revision: await revisao(),
      });
    feito.push(`emenda em ${em} s: apresentadora cortada e o resto adiantado ${duracao} s`);
  }
  if (emendas.length) {
    proj = await ler();
    pres = proj.d.clips.filter((c) => proj.nome(c).includes(apres));
  }
  if (pres.length) await ia("set_crop", { clip_ids: pres.map((c) => c.id), ...RECORTE });
  if (st.intervalos && pres.length === 1 + emendas.length) {
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
    // Cada pedaço (um só, sem emenda) fica com os trechos que caem dentro dele.
    for (const c of pres) {
      const dele = trechos
        .map(([a, b]) => [Math.max(a, c.start), Math.min(b, fimDe(c))])
        .filter(([a, b]) => b - a >= 0.3);
      feito.push(
        dele.length
          ? await ia("keep_ranges", { clip_id: c.id, ranges: dele, revision: await revisao() })
          : await ia("remove_clips", { clip_ids: [c.id], revision: await revisao() }),
      );
    }
  } else if (st.intervalos) {
    feito.push(
      `apresentadora: ${pres.length} clipes, esperava ${1 + emendas.length}; os trechos ficaram como estavam`,
    );
  }
  proj = await ler();
  // Animações seguidas são um trecho só: um corte entre elas deixaria a apresentadora com um pedaço curto
  // entre dois planos iguais.
  const animacoes = juntar(
    proj.d.clips
      .filter((c) => c.trackId === tela.trackId && conceito(proj, c))
      .map((c) => [c.start, fimDe(c)]),
    SOBRA_DE_TELA,
  );
  const cartoes = [
    ...(st.cartoes ?? []),
    ...proj.d.clips.filter((c) => pecaDe(proj.asset(c), "secao")).map((c) => [c.start, fimDe(c)]),
  ];
  // O plano da abertura dura o que a capa dura: trocar de plano com a capa ainda na tela pula a apresentadora
  // do lado da capa para o canto.
  const fimCapa = Math.max(
    0,
    ...proj.d.clips.filter((c) => proj.nome(c).startsWith("Capa ·")).map((c) => fimDe(c)),
  );
  const abertura = st.abertura ?? (fimCapa > 0.5 ? fimCapa : 1.5);
  // Cada mudança de plano é um corte no clipe dela (o pedaço de cada lado fica com o seu plano).
  // Nunca dois cortes a menos de PEDACO_MINIMO um do outro: fica o primeiro.
  const cortes = [abertura, ...animacoes.flat(), ...cartoes.flat()]
    .sort((a, b) => a - b)
    .reduce((acc, t) => (acc.length && t - acc.at(-1) < PEDACO_MINIMO ? acc : [...acc, t]), []);
  for (const t of cortes) {
    proj = await ler();
    const c = proj.d.clips.find(
      (x) =>
        proj.nome(x).includes(apres) &&
        x.start + PEDACO_MINIMO <= t &&
        t <= fimDe(x) - PEDACO_MINIMO,
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
  // A capa é o primeiro quadro, com a apresentadora inteira já no segundo 0: o pedaço que abre a aula entra
  // sem esmaecer (o avatar chega com dissolve quando é posto na linha do tempo).
  const primeiro = pedacos.filter((c) => c.start < 0.05).map((c) => c.id);
  if (primeiro.length) await ia("set_clip_layout", { clip_ids: primeiro, fade_in: 0 });
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
    // Pedaços seguidos contam como um (a troca de plano corta o clipe dela).
    let ate = a + 0.05;
    for (const c of pedacos) if (c.start <= ate + 0.05 && fimDe(c) > ate) ate = fimDe(c);
    const cobre = ate >= b - 0.05;
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
  // A música vai até o finalzinho da aula e some aos poucos, até o silêncio, bem no fim (Helena, 28/11/2026):
  // a última cópia termina no último quadro com fade (o spread_music põe 3 s; a exportação garante 1,5 s).
  proj = await ler();
  {
    const musica = new Set(proj.d.tracks.filter((t) => t.music).map((t) => t.id));
    const fimMusica = Math.max(0, ...proj.d.clips.filter((c) => musica.has(c.trackId)).map(fimDe));
    const fimAula = Math.max(0, ...proj.d.clips.map(fimDe));
    if (musica.size && fimAula - fimMusica > 0.1)
      revisar.push(
        `a música acaba em ${fimMusica.toFixed(1)} s e a aula em ${fimAula.toFixed(1)} s: ela tem de ir até o fim, sumindo aos poucos`,
      );
  }

  // 6. Balões em Nunito (pedido dela, 22/11/2026). A paleta com as fontes do tema põe Baloo 2 em todas as
  // anotações, inclusive nos balões que o montar.py pediu em Nunito 28; o tamanho e a ponta ficam.
  proj = await ler();
  const baloes = proj.d.clips.filter((c) => c.annotation?.kind === "balloon").map((c) => c.id);
  if (baloes.length) feito.push(await ia("set_style", { clip_ids: baloes, font: "Nunito" }));

  // 7. Cursor e clique (Helena, 28/11/2026): sem zoom o cursor ficava pequeno demais; o zoom já o
  // aumenta, então ele é maior na tela inteira (2,2) e fica com o tamanho de antes dentro dos zooms
  // (1,6, que vira 2,6 num zoom de 1,6x), passando aos poucos de um para o outro. Os trechos seguem
  // os zooms e os clipes de agora, por isso vem no fim. E o som de clique do EdiAula em cada clique.
  proj = await ler();
  const telaClipe = proj.d.clips.find((c) => proj.nome(c).startsWith("Tela"));
  if (telaClipe) {
    const media = proj.asset(telaClipe)?.name ?? proj.nome(telaClipe);
    feito.push(await ia("set_cursor", { media, size: 2.2, size_in_zoom: 1.6 }));
    feito.push(await ia("set_click_sound", { media, enabled: true }));
  }
  await ler();
  return { feito, revisar };
}
