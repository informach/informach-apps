import { z } from "zod";
import { AlvoSchema } from "../comandos/intencao";
import { verificarInvariantes } from "../dominio/invariantes";
import { inserir, listar, obter, tabelaVazia } from "../dominio/tabela";
import type { EstadoDoMundo } from "../dominio/tipos";
import { copiar } from "../nucleo/canonico";

const inteiro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const mm = z.number().int().min(-1_000_000).max(1_000_000);
const ponto = z.tuple([mm, mm]);
const idDe = <P extends string>(prefixo: P) =>
  z.custom<`${P}_${string}`>(
    (valor) =>
      typeof valor === "string" && new RegExp(`^${prefixo}_[A-Za-z0-9_-]{1,64}$`).test(valor),
    { message: `Identidade de ${prefixo} inválida` },
  );
const moradorId = idDe("mor");
const objetoId = idDe("obj");
const acaoId = idDe("aca");
const loteId = idDe("lote");
const local = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("lote"),
    loteId,
    andar: inteiro,
    pos: ponto,
    frente: inteiro.max(359),
  }),
  z.strictObject({ t: z.literal("objeto"), loteId, objetoId, ponto: z.string().min(1).max(64) }),
  z.strictObject({ t: z.literal("colo"), de: moradorId }),
  z.strictObject({ t: z.literal("fora"), motivo: z.enum(["avulso", "visita_encerrada"]) }),
]);
const acao = z.strictObject({
  id: acaoId,
  moradorId,
  interacao: z.string().min(1).max(64),
  alvo: AlvoSchema,
  origem: z.enum(["jogador", "autonomia", "quadro", "resposta"]),
  autor: z.string().min(1).max(64).nullable(),
  comandoId: z.string().min(1).max(64).nullable(),
  estado: z.enum(["na_fila", "indo", "esperando", "executando"]),
  reserva: z.strictObject({ objetoId, ponto: z.string().min(1).max(64) }).nullable(),
  par: acaoId.nullable(),
  inicioTick: inteiro.nullable(),
  fimTick: inteiro.nullable(),
  tarefaId: idDe("tar").nullable(),
});

/** Dados espaciais do instante da edição, sem necessidades, finanças ou identidade familiar. */
export const ContinuidadeEspacialSchema = z.strictObject({
  tick: inteiro,
  contadorDeAcao: inteiro,
  moradores: z
    .array(
      z.strictObject({
        id: moradorId,
        versao: inteiro.positive(),
        local,
        movimento: z
          .strictObject({
            rota: z.array(ponto).min(1).max(8192),
            inicioTick: inteiro,
            mmPorTick: inteiro,
            v: inteiro,
          })
          .nullable(),
        acaoAtual: acaoId.nullable(),
        fila: z.array(acaoId).max(64),
      }),
    )
    .max(2048),
  acoes: z.array(acao).max(16384),
  ocupacoes: z
    .array(
      z.strictObject({
        objetoId,
        ocupacao: z.record(z.string().min(1).max(64), moradorId),
      }),
    )
    .max(2048),
});
export type ContinuidadeEspacial = z.infer<typeof ContinuidadeEspacialSchema>;

export function capturarContinuidadeEspacial(estado: EstadoDoMundo): ContinuidadeEspacial {
  return ContinuidadeEspacialSchema.parse({
    tick: estado.relogio.tick,
    contadorDeAcao: estado.contadores.aca ?? 0,
    moradores: listar(estado.moradores).map(
      ({ id, versao, local, movimento, acaoAtual, fila }) => ({
        id,
        versao,
        local,
        movimento,
        acaoAtual,
        fila,
      }),
    ),
    acoes: listar(estado.acoes),
    ocupacoes: listar(estado.objetos).map(({ id, ocupacao }) => ({ objetoId: id, ocupacao })),
  });
}

/**
 * Prepara uma cópia válida. O redutor só publica essa cópia junto do efeito e
 * recibo, depois de conferir o fato inteiro; nenhuma aplicação parcial no mundo.
 */
export function comContinuidadeEspacial(estado: EstadoDoMundo, bruto: unknown): EstadoDoMundo {
  const dados = ContinuidadeEspacialSchema.parse(bruto);
  if (dados.tick < estado.relogio.tick) throw new Error("Continuidade anterior ao estado");
  if (
    dados.moradores.length !== estado.moradores.ordem.length ||
    new Set(dados.moradores.map((m) => m.id)).size !== dados.moradores.length ||
    dados.ocupacoes.length !== estado.objetos.ordem.length ||
    new Set(dados.ocupacoes.map((o) => o.objetoId)).size !== dados.ocupacoes.length
  )
    throw new Error("Continuidade incompleta ou repetida");
  const novo = copiar(estado);
  novo.relogio.tick = dados.tick;
  for (const espacial of dados.moradores) {
    const morador = obter(novo.moradores, espacial.id);
    if (!morador) throw new Error("Morador da continuidade não existe");
    if (espacial.versao < morador.versao) throw new Error("Versão espacial não pode regredir");
    Object.assign(morador, espacial);
  }
  for (const espacial of dados.ocupacoes) {
    const objeto = obter(novo.objetos, espacial.objetoId);
    if (!objeto) throw new Error("Objeto da continuidade não existe");
    objeto.ocupacao = espacial.ocupacao;
  }
  novo.acoes = tabelaVazia();
  for (const item of dados.acoes) {
    const numero = Number(item.id.slice(4));
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > dados.contadorDeAcao)
      throw new Error("Contador de ações divergente");
    inserir(novo.acoes, item.id, item);
  }
  if (dados.contadorDeAcao < (estado.contadores.aca ?? 0))
    throw new Error("Contador de ações não pode regredir");
  if (dados.contadorDeAcao > 0 || Object.hasOwn(novo.contadores, "aca"))
    novo.contadores.aca = dados.contadorDeAcao;
  const problemas = verificarInvariantes(novo);
  if (problemas.length)
    throw new Error(`Continuidade inválida: ${problemas.slice(0, 3).join("; ")}`);
  return novo;
}
