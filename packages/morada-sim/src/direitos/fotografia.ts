import { z } from "zod";
import type { Fato } from "../dominio/fatos";
import { CONTADOR_DE_REVISOES_DOS_OBJETOS } from "../dominio/revisao-dos-objetos";
import type { EstadoDoMundo } from "../dominio/tipos";
import { restaurar } from "../execucao";
import { abrirFotografia } from "../formatos/fotografia";
import { resumoDoEstadoDoMorada } from "../formatos/resumo";
import { canonico } from "../nucleo/canonico";
import { FalhaDaRetiradaDoMorada, prepararRetiradaPessoalDoMorada } from "./retirada";

const ChavesDoEstado: Readonly<Record<keyof EstadoDoMundo, true>> = {
  formato: true,
  versao: true,
  id: true,
  semente: true,
  relogio: true,
  regras: true,
  bairros: true,
  lotes: true,
  imoveis: true,
  objetos: true,
  familias: true,
  moradores: true,
  relacoes: true,
  acoes: true,
  gravidezes: true,
  pedidos: true,
  quadro: true,
  agenda: true,
  acessos: true,
  memorias: true,
  comandos: true,
  fundacao: true,
  loja: true,
  catalogoDePinturas: true,
  edicoes: true,
  historicoDaCasa: true,
  catalogoDeAparencias: true,
  contadores: true,
  avancoDoDia: true,
};
const NOVAS_V2 = new Set(["fundacao", "catalogoDeAparencias"]);
const NOVAS_V3 = new Set(["loja", "catalogoDePinturas", "edicoes", "historicoDaCasa"]);
const Envelope = z.strictObject({
  formato: z.literal("morada.foto"),
  versao: z.literal(1),
  mundoId: z.string().min(1).max(128),
  tick: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  estado: z.record(z.string(), z.unknown()),
});
const Versao = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** Retira os campos introduzidos somente pela migração em memória. A escrita
 * conserva a versão de origem e é reaberta para provar que nada adicional foi
 * perdido. Não baixar a versão de um mundo que já estava no formato novo. */
function formatoDaOrigem(estado: EstadoDoMundo, versao: 1 | 2 | 3): Record<string, unknown> {
  if (versao === 3) return { ...estado };
  const { loja, catalogoDePinturas, edicoes, historicoDaCasa, ...anterior } = estado;
  // Estes valores têm de ser os defaults da migração: não descartar conteúdo
  // V3 que tenha surgido durante uma transformação ou composição incorreta.
  if (edicoes.length || historicoDaCasa.length || catalogoDePinturas !== null || !loja)
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  const contadores = { ...anterior.contadores };
  delete contadores[CONTADOR_DE_REVISOES_DOS_OBJETOS];
  const objetos = {
    ordem: [...anterior.objetos.ordem],
    porId: Object.fromEntries(
      Object.entries(anterior.objetos.porId).map(([id, objeto]) => {
        const { revisao, pintura, ...antigo } = objeto;
        if (revisao !== 1 || pintura !== null) throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
        return [id, antigo];
      }),
    ),
  };
  const v2 = { ...anterior, versao, contadores, objetos };
  if (versao === 2) return v2;
  const { fundacao, catalogoDeAparencias, ...v1 } = v2;
  if (fundacao !== null || catalogoDeAparencias !== null)
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  return v1;
}

/** Adapter de fotografia V1/V2/V3, sem I/O. A chave de formato é preservada;
 * o coordenador ainda deve conferir bytes/SHA, cerca, diário e todas as cópias
 * históricas. Este resultado isolado não conclui exclusão ou restauração. */
export function prepararRetiradaNaFotografiaDoMorada(
  bruto: unknown,
  perfilId: string,
  politica: { retirarTextosDaFundacao: boolean },
) {
  return prepararFotografiaEResumoPessoaisDoMorada(bruto, perfilId, politica).fotografia;
}

export function prepararFotografiaEResumoPessoaisDoMorada(
  bruto: unknown,
  perfilId: string,
  politica: { retirarTextosDaFundacao: boolean },
) {
  const { origem, aberta, versao } = conferirOrigem(bruto);
  const retirada = prepararRetiradaPessoalDoMorada(aberta.estado, perfilId, politica);
  const foto = { ...origem, estado: formatoDaOrigem(retirada, versao) };
  const reaberta = abrirFotografia(foto);
  if (canonico(reaberta.estado) !== canonico(retirada))
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  return { fotografia: foto, resumo: resumoDoEstadoDoMorada(retirada) };
}

function conferirOrigem(bruto: unknown) {
  const lido = Envelope.safeParse(bruto);
  if (!lido.success) throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  const origem = lido.data;
  const v = Versao.safeParse(origem.estado.versao);
  if (!v.success) throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  const versao = v.data;
  const esperadas = Object.keys(ChavesDoEstado).filter(
    (k) => !(versao < 3 && NOVAS_V3.has(k)) && !(versao < 2 && NOVAS_V2.has(k)),
  );
  if (
    Object.keys(origem.estado).length !== esperadas.length ||
    esperadas.some((k) => !Object.hasOwn(origem.estado, k))
  )
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  const aberta = abrirFotografia(origem);
  if (aberta.estado.id !== origem.mundoId || aberta.estado.relogio.tick !== origem.tick)
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  if (canonico(formatoDaOrigem(aberta.estado, versao)) !== canonico(origem.estado))
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  return { origem, aberta, versao };
}
/** Recuperação de fatos já confirmados, sem avançar a simulação nem converter
 * o formato persistido. Uma mudança incompatível exige revisão explícita. */
export function prepararRecuperacaoNaFotografiaDoMorada(bruto: unknown, fatos: readonly Fato[]) {
  const { origem, aberta, versao } = conferirOrigem(bruto);
  const recuperada = restaurar(aberta, fatos).fotografar();
  const foto = {
    ...origem,
    tick: recuperada.tick,
    estado: formatoDaOrigem(recuperada.estado, versao),
  };
  const reaberta = abrirFotografia(foto);
  if (canonico(reaberta.estado) !== canonico(recuperada.estado))
    throw new FalhaDaRetiradaDoMorada("INTEGRIDADE");
  return { fotografia: foto, resumo: resumoDoEstadoDoMorada(recuperada.estado) };
}
