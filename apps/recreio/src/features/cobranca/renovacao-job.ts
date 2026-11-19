import "server-only";
import { getRuntimeDoCancelamentoDaRenovacao } from "@/lib/billing";
import { env } from "@/lib/env";
import { packageLogger } from "@/lib/observability";
import { criarProcessadorDeCancelamentoDaRenovacao } from "./renovacao-execucao-service";

type Resultado = Awaited<ReturnType<ReturnType<typeof criarProcessadorDeCancelamentoDaRenovacao>>>;
export class CancelamentoDaRenovacaoIncompleto extends Error {
  constructor(readonly resultado: Resultado) {
    super("Renewal cancellation requires review");
    this.name = "CancelamentoDaRenovacaoIncompleto";
  }
}
export function criarRotinaDeCancelamentoDaRenovacao(deps: {
  habilitada: () => boolean;
  processar: () => Promise<Resultado>;
}) {
  return async () => {
    if (!deps.habilitada())
      return {
        habilitada: false,
        reservadas: 0,
        confirmadas: 0,
        emConferencia: 0,
        falhasTecnicas: 0,
      };
    const resultado = await deps.processar();
    if (resultado.emConferencia > 0 || resultado.falhasTecnicas > 0)
      throw new CancelamentoDaRenovacaoIncompleto(resultado);
    return { habilitada: true, ...resultado };
  };
}
export const executarCancelamentoDaRenovacao = criarRotinaDeCancelamentoDaRenovacao({
  habilitada: () => env.RECREIO_RENEWAL_JOBS_MODE === "on",
  processar: criarProcessadorDeCancelamentoDaRenovacao({
    modo: env.STRIPE_MODE,
    obterRuntime: getRuntimeDoCancelamentoDaRenovacao,
    relatarFalha: ({ reasonCode }) =>
      packageLogger.error("recreio.renewal_cancellation_failed", { reasonCode }),
  }),
});
