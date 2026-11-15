import { z } from "zod";
import { canonico } from "../nucleo/canonico";
import { PinturaDoMovelSchema } from "./pintura";

/** Independente dos 512 comandos genéricos e do histórico de desfazer. */
export const RESPOSTAS_DE_EDICAO = 32;
export const RESPOSTAS_DE_EDICAO_DO_MUNDO = 128;
export const AUTORES_DE_EDICAO_DO_MUNDO = 2048;
const inteiro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sequencia = inteiro.positive();
const autor = z.string().regex(/^[A-Za-z0-9_-]{1,44}$/);
const entidade = <P extends string>(prefixo: P) =>
  z.custom<`${P}_${string}`>(
    (valor) =>
      typeof valor === "string" && new RegExp(`^${prefixo}_[A-Za-z0-9_-]{1,64}$`).test(valor),
    { message: `Identidade de ${prefixo} inválida` },
  );
const mm = z.number().int().min(0).max(1_000_000);
const posicao = z.strictObject({
  pos: z.tuple([mm, mm, mm]),
  andar: inteiro.max(2),
  giro: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});
const versao = inteiro.positive();

/** O cliente indica peça/posição/revisões; dinheiro e geometria são do host. */
export const OperacaoDeEdicaoSchema = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("comprar"),
    revisaoDoEspaco: versao,
    politicaDePrecos: versao,
    catalogo: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    versaoDoCatalogo: versao,
    colocacao: posicao,
    pintura: PinturaDoMovelSchema.nullable(),
  }),
  z.strictObject({
    t: z.literal("mover"),
    objetoId: entidade("obj"),
    revisaoDoObjeto: versao,
    revisaoDoEspaco: versao,
    colocacao: posicao,
  }),
  z.strictObject({
    t: z.literal("pintar"),
    objetoId: entidade("obj"),
    revisaoDoObjeto: versao,
    pintura: PinturaDoMovelSchema.nullable(),
  }),
  z.strictObject({
    t: z.literal("vender"),
    objetoId: entidade("obj"),
    revisaoDoObjeto: versao,
    revisaoDoEspaco: versao,
    politicaDePrecos: versao,
  }),
]);
export type OperacaoDeEdicao = z.infer<typeof OperacaoDeEdicaoSchema>;

export const PedidoDeEdicaoSchema = z.strictObject({
  sequencia,
  familiaId: entidade("fam"),
  loteId: entidade("lote"),
  operacao: OperacaoDeEdicaoSchema,
});
export type PedidoDeEdicao = z.infer<typeof PedidoDeEdicaoSchema>;

export const ResultadoDeEdicaoSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), tick: inteiro, revisoes: z.record(z.string(), versao) }),
  z.strictObject({
    ok: z.literal(false),
    motivo: z.enum([
      "sem_permissao",
      "versao_antiga",
      "nao_existe",
      "saldo_insuficiente",
      "colocacao_invalida",
      "ocupado",
      "limite",
    ]),
    detalhe: z.string().min(1).max(80).optional(),
  }),
]);

export const ReciboDeEdicaoSchema = z.strictObject({
  autor,
  /** Capacidades admitidas pelo host; não fazem parte do pedido do navegador. */
  permissoes: z
    .array(z.enum(["decorar", "gastar", "gerir_financas"]))
    .min(1)
    .max(3)
    .refine((valores) => valores.includes("decorar") && new Set(valores).size === valores.length),
  pedido: PedidoDeEdicaoSchema,
  resultado: ResultadoDeEdicaoSchema,
});
export type ReciboDeEdicao = z.infer<typeof ReciboDeEdicaoSchema>;

export const RegistroDeEdicoesSchema = z
  .strictObject({
    autor,
    ultimaSequencia: inteiro,
    recentes: z.array(ReciboDeEdicaoSchema).max(RESPOSTAS_DE_EDICAO),
  })
  .superRefine((registro, ctx) => {
    const quantidade = registro.recentes.length;
    if (quantidade > registro.ultimaSequencia)
      ctx.addIssue({ code: "custom", message: "Janela maior que a sequência admitida" });
    for (const [indice, recibo] of registro.recentes.entries()) {
      if (
        recibo.autor !== registro.autor ||
        recibo.pedido.sequencia !== registro.ultimaSequencia - quantidade + indice + 1
      )
        ctx.addIssue({ code: "custom", message: "Autor ou sequência de recibo divergente" });
    }
  });
export type RegistroDeEdicoes = z.infer<typeof RegistroDeEdicoesSchema>;

/** Ordem de atividade: o autor da última admissão fica no fim da lista. */
export function compactarRespostasDeEdicao(
  registros: readonly RegistroDeEdicoes[],
): RegistroDeEdicoes[] {
  if (registros.length > AUTORES_DE_EDICAO_DO_MUNDO)
    throw new Error("Limite de autores no histórico de edição");
  let restantes = RESPOSTAS_DE_EDICAO_DO_MUNDO;
  const saida: RegistroDeEdicoes[] = [];
  for (let indice = registros.length - 1; indice >= 0; indice--) {
    const registro = registros[indice];
    if (!registro) continue;
    const quantidade = Math.min(registro.recentes.length, restantes);
    restantes -= quantidade;
    saida.push(
      RegistroDeEdicoesSchema.parse({
        ...registro,
        recentes: quantidade > 0 ? registro.recentes.slice(-quantidade) : [],
      }),
    );
  }
  return saida.reverse();
}

export function iniciarRegistroDeEdicoes(perfilId: string): RegistroDeEdicoes {
  return { autor: autor.parse(perfilId), ultimaSequencia: 0, recentes: [] };
}

export function comandoDeEdicao(perfilId: string, numero: number): string {
  return `obra:${sequencia.parse(numero).toString(36)}:${autor.parse(perfilId)}`;
}

export type ConsultaDeEdicao =
  | { t: "nova" }
  | { t: "repetida"; recibo: ReciboDeEdicao }
  | { t: "recusada"; motivo: "identidade" | "conflito" | "antiga" | "salto" };

/** Só consultar depois de conferir sessão e autorização atuais do autor. */
export function consultarEdicao(
  registro: RegistroDeEdicoes,
  perfilId: string,
  comandoId: string,
  pedido: PedidoDeEdicao,
): ConsultaDeEdicao {
  if (perfilId !== registro.autor || comandoId !== comandoDeEdicao(perfilId, pedido.sequencia))
    return { t: "recusada", motivo: "identidade" };
  if (pedido.sequencia > registro.ultimaSequencia + 1) return { t: "recusada", motivo: "salto" };
  if (pedido.sequencia === registro.ultimaSequencia + 1) return { t: "nova" };
  const recibo = registro.recentes.find((item) => item.pedido.sequencia === pedido.sequencia);
  if (!recibo) return { t: "recusada", motivo: "antiga" };
  return canonico(recibo.pedido) === canonico(pedido)
    ? { t: "repetida", recibo: ReciboDeEdicaoSchema.parse(recibo) }
    : { t: "recusada", motivo: "conflito" };
}

/**
 * O redutor só aplica saldos/entidades quando `aplicar` for verdadeiro.
 * Nunca mover o controle de sequência para depois desses efeitos.
 */
export function admitirReciboDeEdicao(
  registro: RegistroDeEdicoes,
  bruto: unknown,
): { aplicar: boolean; registro: RegistroDeEdicoes } {
  const recibo = ReciboDeEdicaoSchema.parse(bruto);
  if (recibo.autor !== registro.autor) throw new Error("Recibo de outro autor");
  const numero = recibo.pedido.sequencia;
  if (numero <= registro.ultimaSequencia) {
    const anterior = registro.recentes.find((item) => item.pedido.sequencia === numero);
    if (anterior && canonico(anterior) !== canonico(recibo))
      throw new Error("Recibo já reduzido com conteúdo divergente");
    return { aplicar: false, registro };
  }
  if (numero !== registro.ultimaSequencia + 1) throw new Error("Salto de sequência no diário");
  return {
    aplicar: true,
    registro: {
      autor: registro.autor,
      ultimaSequencia: numero,
      recentes: [...registro.recentes, recibo].slice(-RESPOSTAS_DE_EDICAO),
    },
  };
}
