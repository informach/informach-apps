import { z } from "zod";
import { CoberturaDoGrupoSchema } from "@/features/grupo/regras";
import { AppError } from "@/lib/errors";

export const VERSAO_DA_TROCA = "troca-2026-11-18-v2";
export const PRAZO_DA_COTACAO_MS = 5 * 60_000;

/** Extends the native complete selection, preserving its duplicate-ID rule. */
export const PrepararTrocaSchema = CoberturaDoGrupoSchema.safeExtend({
  pedidoId: z.uuid(),
  produtoDestino: z.string().min(2).max(80),
  revisaoContrato: z.int().min(1).max(2147483645),
});
export type PrepararTroca = z.infer<typeof PrepararTrocaSchema>;

export const AceitarTrocaSchema = z.strictObject({
  pedidoId: z.uuid(),
  produtoDestino: z.string().min(2).max(80),
  revisaoContrato: z.int().min(1).max(2147483645),
  valorAgoraCentavos: z.int().min(0).max(2147483647),
  subtotalCentavos: z.int().min(0).max(2147483647),
  creditoCentavos: z.int().min(-2147483648).max(0),
  totalCentavos: z.int().min(-2147483648).max(2147483647),
  saldoAnteriorCentavos: z.int().min(-2147483648).max(2147483647),
  valorRenovacaoCentavos: z.int().positive().max(2147483647),
  intervalo: z.enum(["month", "year"]),
  moeda: z.literal("BRL"),
  vigencia: z.iso.datetime(),
  versaoDasCondicoes: z.literal(VERSAO_DA_TROCA),
  aceitoTrocaECobrancaRecorrente: z.literal(true),
});
export type AceitarTroca = z.infer<typeof AceitarTrocaSchema>;

export type CotacaoParaAceite = {
  id: string;
  toProductId: string;
  expectedContractRevision: number;
  quotedAmountCents: number;
  quotedSubtotalCents: number;
  quotedCreditCents: number;
  quotedTotalCents: number;
  quotedStartingBalanceCents: number;
  toAmountCents: number;
  toInterval: "month" | "year";
  currency: "BRL";
  effectiveAt: Date;
  quotedAt: Date;
  quoteExpiresAt: Date;
  acceptedAt: Date | null;
  policyVersion: string;
};

/** Money/date binding only. Native identity, current contract and selection
 * still belong to the transactional writer; this never charges or grants. */
export function conferirAceiteDaTroca(
  entrada: unknown,
  cotacao: CotacaoParaAceite,
  agora: Date,
): AceitarTroca {
  const pedido = AceitarTrocaSchema.parse(entrada);
  const times = [agora, cotacao.effectiveAt, cotacao.quotedAt, cotacao.quoteExpiresAt];
  if (
    times.some((d) => !Number.isFinite(d.getTime())) ||
    cotacao.quoteExpiresAt <= cotacao.quotedAt ||
    cotacao.quoteExpiresAt.getTime() - cotacao.quotedAt.getTime() > PRAZO_DA_COTACAO_MS ||
    (cotacao.acceptedAt !== null &&
      (!Number.isFinite(cotacao.acceptedAt.getTime()) ||
        cotacao.acceptedAt < cotacao.quotedAt ||
        cotacao.acceptedAt >= cotacao.quoteExpiresAt ||
        cotacao.acceptedAt > agora))
  )
    throw new AppError("CONFLITO", "A cotação exige nova conferência.");
  if (
    pedido.pedidoId !== cotacao.id ||
    pedido.produtoDestino !== cotacao.toProductId ||
    pedido.revisaoContrato !== cotacao.expectedContractRevision ||
    pedido.valorAgoraCentavos !== cotacao.quotedAmountCents ||
    pedido.subtotalCentavos !== cotacao.quotedSubtotalCents ||
    pedido.creditoCentavos !== cotacao.quotedCreditCents ||
    pedido.totalCentavos !== cotacao.quotedTotalCents ||
    pedido.saldoAnteriorCentavos !== cotacao.quotedStartingBalanceCents ||
    pedido.valorRenovacaoCentavos !== cotacao.toAmountCents ||
    pedido.intervalo !== cotacao.toInterval ||
    pedido.moeda !== cotacao.currency ||
    pedido.vigencia !== cotacao.effectiveAt.toISOString() ||
    pedido.versaoDasCondicoes !== cotacao.policyVersion
  )
    throw new AppError("CONFLITO", "Confira os termos da cotação antes de aceitar a troca.");
  // A replay never invents another acceptance timestamp or extends the quote.
  if (agora < cotacao.quotedAt || (cotacao.acceptedAt === null && agora >= cotacao.quoteExpiresAt))
    throw new AppError("COTACAO_VENCIDA", "A cotação venceu. Confira os valores novamente.");
  return pedido;
}
