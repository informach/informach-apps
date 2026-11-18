import { STATUS_QUE_JOGAM, type StatusDaAssinatura } from "./acesso";

/** Conferência periódica a cada cinco minutos; nenhum fato antigo cria acesso ilimitado. */
export const VALIDADE_DA_CONFERENCIA_FINANCEIRA_MS = 15 * 60_000;
export type PeriodoFinanceiro = {
  precoId: string;
  inicio: Date;
  fim: Date;
  pagoEm: Date;
  estornado: boolean;
  contestado: boolean;
};
export type FatosDoPagamento = {
  status: StatusDaAssinatura;
  precoId: string;
  inicioDoPeriodo: Date;
  fimDoPeriodo: Date;
  fimDoTeste: Date | null;
  cancelaEm: Date | null;
  origemAdmitida: boolean;
  conferidoEm: Date | null;
  emConferencia: boolean;
  periodos: readonly PeriodoFinanceiro[];
};

/** Financial facts are scoped/confirmed by the server adapter. This pure rule
 * intersects actual paid time, provider lifecycle and a bounded reconciliation.
 * Native free trials remain their own concessions, without invented invoices.
 */
export function limiteDoPagamentoConciliado(fatos: FatosDoPagamento, agora: Date): Date | null {
  const t = agora.getTime(),
    inicio = fatos.inicioDoPeriodo.getTime(),
    fim = fatos.fimDoPeriodo.getTime(),
    conferencia = fatos.conferidoEm?.getTime();
  if (
    !fatos.origemAdmitida ||
    fatos.emConferencia ||
    !STATUS_QUE_JOGAM.includes(fatos.status) ||
    !fatos.precoId ||
    !Number.isFinite(t) ||
    !Number.isFinite(inicio) ||
    !Number.isFinite(fim) ||
    inicio > t ||
    fim <= t ||
    conferencia === undefined ||
    !Number.isFinite(conferencia) ||
    conferencia > t ||
    conferencia + VALIDADE_DA_CONFERENCIA_FINANCEIRA_MS <= t
  )
    return null;
  const limites = [fim, conferencia + VALIDADE_DA_CONFERENCIA_FINANCEIRA_MS];
  if (fatos.cancelaEm !== null) limites.push(fatos.cancelaEm.getTime());
  if (fatos.status === "trialing") {
    if (fatos.fimDoTeste === null) return null;
    limites.push(fatos.fimDoTeste.getTime());
  }
  const teto = Math.min(...limites);
  if (!Number.isFinite(teto) || teto <= t) return null;
  let pagoAte: number | null = null;
  for (const periodo of fatos.periodos) {
    const comeco = periodo.inicio.getTime(),
      termino = periodo.fim.getTime(),
      pagamento = periodo.pagoEm.getTime();
    if (![comeco, termino, pagamento].every(Number.isFinite) || termino <= comeco) return null;
    // An unresolved dispute is account risk until authoritative facts clear it.
    if (periodo.contestado) return null;
    if (periodo.precoId !== fatos.precoId || comeco > t || termino <= t || pagamento > t) continue;
    if (periodo.estornado) return null;
    pagoAte = Math.max(pagoAte ?? termino, termino);
  }
  return pagoAte === null ? null : new Date(Math.min(teto, pagoAte));
}
