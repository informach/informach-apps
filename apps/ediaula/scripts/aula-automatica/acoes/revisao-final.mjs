// Limpeza final antes de exportar (regras de edição, 17/11/2026), com o projeto aberto. Estado:
//   projeto   caminho do .ediaula aberto (lido depois de salvar, para saber os ids)
//   edicao    pasta de edição da parte: lê comandos-revisar.json, comandos-pecas.json, acabamento.json e
//             comandos-aplicado.json, e escreve relatorio.md e as fotos em conferir/
// Faz:
//   - apaga os pedaços com menos de 3 quadros (sobras de corte);
//   - troca o "Quadro estendido" pela gravação estendida quando a gravação continua no trecho;
//   - confere os vínculos .edisvg: o arquivo existe, o render chegou, nenhuma peça ficou achatada (imagem ou
//     vídeo solto com nome de peça);
//   - fotografa cada marcação durante o zoom (get_frame composto), para conferir se cai no bloco certo;
//   - confere marcações sobrepostas, remove as faixas vazias e roda a verificação antes de exportar;
//   - escreve o relatório: peças criadas sem .edisvg e o que precisa de revisão humana.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ferramentas, fimDe, lerProjeto } from "./comum.mjs";
import { chamar } from "./ia.mjs";

const PECA = /^(capa|secao|caixa|balao|destaque|conceito|encerramento)(-|\.)/i;

const lerJson = (arq, padrao) => {
  try {
    return JSON.parse(readFileSync(arq, "utf8"));
  } catch {
    return padrao;
  }
};
const tempo = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export default async function revisaoFinal(ctx) {
  const st = ctx.state;
  if (!st.projeto || !st.edicao) throw new Error("faltam projeto e edicao no estado");
  const { ia, revisao } = ferramentas(ctx);
  const ler = () => lerProjeto(ctx, st.projeto);
  const feito = [];
  const revisar = [];

  // 1. Pedaços com menos de 3 quadros.
  let proj = await ler();
  const quadro = 1 / (proj.d.settings.fps || 30);
  const migalhas = proj.d.clips.filter((c) => c.duration < 3 * quadro - 1e-6);
  if (migalhas.length) {
    await ia("remove_clips", { clip_ids: migalhas.map((c) => c.id), revision: await revisao() });
    feito.push(
      `apagados ${migalhas.length} pedaços com menos de 3 quadros: ${migalhas.map((c) => `${proj.nome(c)} em ${tempo(c.start)}`).join("; ")}`,
    );
  }

  // 2. Quadro estendido -> a gravação estendida, quando ela continua no trecho.
  proj = await ler();
  for (const s of proj.d.clips.filter((c) => proj.asset(c)?.generated === "still")) {
    const origem = proj.asset(s).still?.assetId;
    const antes = proj.d.clips.find(
      (c) => c.trackId === s.trackId && c.assetId === origem && Math.abs(fimDe(c) - s.start) < 0.02,
    );
    const midia = antes && proj.d.assets.find((a) => a.id === antes.assetId);
    const precisa = antes ? antes.in + (fimDe(s) - antes.start) * (antes.speed ?? 1) : Infinity;
    if (!midia || precisa > midia.duration - 0.01) {
      revisar.push(
        `${tempo(s.start)}: quadro estendido mantido (${antes ? "a gravação acaba antes" : "não há a gravação logo antes dele"})`,
      );
      continue;
    }
    await ia("remove_clips", { clip_ids: [s.id], revision: await revisao() });
    await ia("trim_clip", {
      clip_id: antes.id,
      end: Math.round(fimDe(s) * 1000) / 1000,
      revision: await revisao(),
    });
    feito.push(`${tempo(s.start)}: quadro estendido trocado pela gravação`);
  }

  // 3. Vínculos .edisvg.
  proj = await ler();
  const usados = new Set(proj.d.clips.map((c) => c.assetId));
  for (const a of proj.d.assets.filter((x) => usados.has(x.id))) {
    if (a.link) {
      if (!existsSync(a.link.project))
        revisar.push(
          `${a.name}: o arquivo ${a.link.project} não existe (o clipe mostra o último render)`,
        );
      else if (!a.link.animationId || !a.link.hash)
        revisar.push(
          `${a.name}: o render do EdiSVG ainda não chegou (abra o condutor do EdiSVG e salve a peça)`,
        );
    } else if (PECA.test(basename(a.path ?? "")) || PECA.test(a.name)) {
      revisar.push(
        `${a.name}: peça sem vínculo (imagem ou vídeo achatado); ponha o .edisvg vinculado no lugar`,
      );
    }
  }

  // 4. Marcações: nunca duas ao mesmo tempo, e a foto de cada uma durante o zoom.
  const marcacoes = proj.d.tracks.find((t) => t.name === "Marcações")?.id;
  const marca = proj.d.clips
    .filter((c) => c.annotation || (c.trackId === marcacoes && proj.asset(c)?.link))
    .filter((c) => !(c.annotation && c.groupId))
    .sort((a, b) => a.start - b.start);
  for (let k = 1; k < marca.length; k++)
    if (marca[k].start < fimDe(marca[k - 1]) - 0.01)
      revisar.push(
        `${tempo(marca[k].start)}: marcações sobrepostas (${proj.nome(marca[k - 1])} e ${proj.nome(marca[k])})`,
      );
  const zooms = proj.d.clips.filter((c) => c.zoomLayer);
  const fotos = [];
  const pasta = join(st.edicao, "conferir");
  mkdirSync(pasta, { recursive: true });
  for (const c of marca) {
    const meio = (c.start + fimDe(c)) / 2;
    if (!zooms.some((z) => z.start <= meio && meio <= fimDe(z))) continue;
    const r = await chamar(ctx, "get_frame", { time: meio, composited: true, max_width: 960 });
    const img = r?.images?.[0];
    const b64 = typeof img === "string" ? img : (img?.data ?? img?.base64);
    if (!b64) continue;
    const arq = join(pasta, `marcacao-${meio.toFixed(1)}.jpg`);
    writeFileSync(arq, Buffer.from(b64.replace(/^data:[^,]+,/, ""), "base64"));
    fotos.push(`${tempo(meio)} ${proj.nome(c)}: ${basename(arq)}`);
  }

  // 5. Faixas vazias (menos a dos cliques: removê-la desliga o som de clique).
  proj = await ler();
  const ocupadas = new Set(proj.d.clips.map((c) => c.trackId));
  for (const t of proj.d.tracks.filter((x) => !ocupadas.has(x.id) && x.name !== "Cliques")) {
    try {
      await ia("remove_track", { track_id: t.id, revision: await revisao() });
      feito.push(`faixa vazia removida: ${t.name}`);
    } catch (err) {
      revisar.push(`faixa vazia ${t.name}: ${String(err.message ?? err)}`);
    }
  }

  // 6. Verificação antes de exportar.
  const verif = await chamar(ctx, "check_before_export", { measure_volume: true });
  const pontos = String(verif.text ?? "")
    .split("\n")
    .filter((l) => l.startsWith("- "));
  await ler();

  // 7. Relatório.
  const ed = st.edicao;
  const pecas = lerJson(join(ed, "comandos-pecas.json"), {
    criadas_sem_edisvg: [],
    revisar: [],
    vinculadas: [],
  });
  const montar = lerJson(join(ed, "comandos-revisar.json"), []);
  const acab = lerJson(join(ed, "acabamento.json"), {});
  const aplicado = lerJson(join(ed, "comandos-aplicado.json"), {});
  const lista = (itens) => (itens?.length ? itens.map((x) => `- ${x}`).join("\n") : "- nada");
  const md = `# Relatório da edição automática

Projeto: ${basename(st.projeto)}

## Peças criadas sem .edisvg

${lista(pecas.criadas_sem_edisvg)}

## Peças vinculadas ao EdiSVG

${lista(pecas.vinculadas)}

## Para revisão humana

${lista([
  ...montar,
  ...pecas.revisar,
  ...(aplicado.falhas ?? []).map((f) => `falhou ao aplicar: ${f}`),
  ...(acab.revisar ?? []),
  ...revisar,
])}

## Verificação antes de exportar

${pontos.length ? pontos.join("\n") : "- nada a corrigir"}

## Marcações durante o zoom (conferir se caem no bloco certo)

Fotos em \`conferir/\`:

${lista(fotos)}

## Limpeza feita

${lista(feito)}
`;
  writeFileSync(join(ed, "relatorio.md"), md);
  return { relatorio: join(ed, "relatorio.md"), feito, revisar, verificacao: pontos };
}
