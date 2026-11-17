import { faixaPermite } from "@informach/config/jogos";
import { z } from "zod";
import { ErroDoRecreio } from "./erros";
import { type FaixaDoMenor, faixasDoMenor, type MesEAno } from "./menores";

const FaixaProtegidaSchema = z.enum(["L", "6", "10", "12", "14", "16"] satisfies FaixaDoMenor[]);
export const JanelaSemanalSchema = z
  .strictObject({
    diaDaSemana: z.number().int().min(0).max(6),
    inicioMinuto: z.number().int().min(0).max(1439),
    fimMinuto: z.number().int().min(1).max(1440),
  })
  .refine((j) => j.fimMinuto > j.inicioMinuto);
export type JanelaSemanal = z.infer<typeof JanelaSemanalSchema>;
const HorariosSchema = z
  .array(JanelaSemanalSchema)
  .max(14)
  .refine((janelas) => {
    const ordenadas = [...janelas].sort(
      (a, b) => a.diaDaSemana - b.diaDaSemana || a.inicioMinuto - b.inicioMinuto,
    );
    return ordenadas.every((janela, n) => {
      const anterior = ordenadas[n - 1];
      return (
        !anterior ||
        anterior.diaDaSemana !== janela.diaDaSemana ||
        anterior.fimMinuto <= janela.inicioMinuto
      );
    });
  });
export const SupervisaoSchema = z.strictObject({
  limiteDeConteudo: FaixaProtegidaSchema.nullable(),
  multiplayer: z.boolean(),
  textoLivre: z.boolean(),
  contatos: z.boolean(),
  presenca: z.enum(["invisible", "friends"]),
  pausado: z.boolean(),
  minutosPorDia: z.number().int().min(1).max(1440).nullable(),
  horarios: HorariosSchema.nullable(),
});
export type Supervisao = z.infer<typeof SupervisaoSchema>;
export function supervisaoInicial(): Supervisao {
  return {
    limiteDeConteudo: null,
    multiplayer: true,
    textoLivre: false,
    contatos: true,
    presenca: "friends",
    pausado: false,
    minutosPorDia: null,
    horarios: null,
  };
}

/** Mesmo uma configuração histórica incompatível não amplia a faixa atual. */
export function calcularPoliticaDoMenor(nascimento: MesEAno, agora: MesEAno, entrada: Supervisao) {
  const configuracao = SupervisaoSchema.parse(entrada);
  const idade = faixasDoMenor(nascimento, agora);
  const limiteCompativel =
    configuracao.limiteDeConteudo === null ||
    faixaPermite(idade.classificacao, configuracao.limiteDeConteudo);
  const faixa =
    limiteCompativel && configuracao.limiteDeConteudo !== null
      ? configuracao.limiteDeConteudo
      : idade.classificacao;
  return {
    faixaSocial: idade.social,
    faixaDaIdade: idade.classificacao,
    faixa,
    precisaContaAdulta: idade.precisaContaAdulta,
    configuracaoPrecisaRevisao:
      !limiteCompativel || (configuracao.textoLivre && idade.social === "ate_12"),
    multiplayer: configuracao.multiplayer,
    textoLivre: idade.social === "13_17" && configuracao.textoLivre,
    contatos: !configuracao.contatos
      ? ("disabled" as const)
      : idade.social === "ate_12"
        ? ("approval" as const)
        : ("code" as const),
    presenca: configuracao.presenca,
    amigosAprovadosObrigatorios: true,
    pausado: configuracao.pausado,
    minutosPorDia: configuracao.minutosPorDia,
    horarios: configuracao.horarios,
  };
}
export type PoliticaEfetivaDoMenor = ReturnType<typeof calcularPoliticaDoMenor>;

/** Uma escrita nova recusa configuração incompatível, sem corrigir silenciosamente o formulário. */
export function validarSupervisaoDoMenor(
  nascimento: MesEAno,
  agora: MesEAno,
  entrada: unknown,
): Supervisao {
  const configuracao = SupervisaoSchema.parse(entrada);
  if (calcularPoliticaDoMenor(nascimento, agora, configuracao).configuracaoPrecisaRevisao)
    throw new ErroDoRecreio("POLITICA_INCOMPATIVEL");
  return configuracao;
}

const InstanteLocalSchema = z.strictObject({
  diaDaSemana: z.number().int().min(0).max(6),
  minuto: z.number().int().min(0).max(1439),
});
/** Relógio fornecido pelo servidor; não escolhe fuso ou dia com dados do cliente. */
export function decidirTempoDoMenor(entrada: {
  supervisao: Supervisao;
  instanteLocal: z.infer<typeof InstanteLocalSchema>;
  usadoMs: number;
}):
  | { permitido: false; motivo: "paused" | "schedule" | "daily_limit" }
  | { permitido: true; saldoMs: number | null; desdeMinutoLocal: number; ateMinutoLocal: number } {
  const supervisao = SupervisaoSchema.parse(entrada.supervisao);
  const local = InstanteLocalSchema.parse(entrada.instanteLocal);
  const usadoMs = z.number().int().min(0).max(172800000).parse(entrada.usadoMs);
  if (supervisao.pausado) return { permitido: false, motivo: "paused" };
  const janela = supervisao.horarios?.find(
    (j) =>
      j.diaDaSemana === local.diaDaSemana &&
      j.inicioMinuto <= local.minuto &&
      local.minuto < j.fimMinuto,
  );
  if (supervisao.horarios !== null && !janela) return { permitido: false, motivo: "schedule" };
  const saldoMs =
    supervisao.minutosPorDia === null
      ? null
      : Math.max(0, supervisao.minutosPorDia * 60_000 - usadoMs);
  if (saldoMs === 0) return { permitido: false, motivo: "daily_limit" };
  return {
    permitido: true,
    saldoMs,
    desdeMinutoLocal: janela?.inicioMinuto ?? 0,
    ateMinutoLocal: janela?.fimMinuto ?? 1440,
  };
}

const UsoDeConcessaoSchema = z
  .strictObject({
    usadoMs: z.number().int().min(0).max(172800000),
    contabilizadoAte: z.number().int().nonnegative(),
    concedidoAte: z.number().int().nonnegative().nullable(),
  })
  .refine((u) => u.concedidoAte === null || u.concedidoAte >= u.contabilizadoAte);
export type UsoDeConcessao = z.infer<typeof UsoDeConcessaoSchema>;
/** Acerta o intervalo admitido uma vez; nunca aceita contagem ou relógio do navegador. */
export function acertarUsoDeConcessao(
  entrada: UsoDeConcessao,
  agoraMs: number,
  fimConfirmadoEm: number | null,
): UsoDeConcessao {
  const uso = UsoDeConcessaoSchema.parse(entrada);
  z.number().int().nonnegative().parse(agoraMs);
  if (fimConfirmadoEm !== null) z.number().int().nonnegative().parse(fimConfirmadoEm);
  if (agoraMs < uso.contabilizadoAte) throw new ErroDoRecreio("INDISPONIVEL");
  if (uso.concedidoAte === null) return uso;
  const ate = Math.max(
    uso.contabilizadoAte,
    Math.min(agoraMs, uso.concedidoAte, fimConfirmadoEm ?? Infinity),
  );
  const usadoMs = uso.usadoMs + ate - uso.contabilizadoAte;
  if (usadoMs > 172800000) throw new ErroDoRecreio("INDISPONIVEL");
  return { usadoMs, contabilizadoAte: ate, concedidoAte: uso.concedidoAte };
}
