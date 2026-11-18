import "server-only";
import { stripeDestination } from "@informach/billing/destinations";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { comCicloDeCobranca } from "./lifecycle";
import { admitirPortalLocked } from "./portal-repository";

export type RuntimeDoPortal = {
  conferirCatalogo: () => Promise<void>;
  criarPortal: (paganteId: string) => Promise<{ url: string }>;
};

/** Managing an existing bill remains distinct from admitting a new purchase. */
export function criarAberturaDoPortal(obterRuntime: () => RuntimeDoPortal) {
  return async (autor: AutorNativoRecente) => {
    await limitarTentativas({
      chave: `cobranca-portal:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return comCicloDeCobranca(autor.contaId, async () => {
      const prova = await admitirPortalLocked(autor, "requested");
      const runtime = obterRuntime();
      await runtime.conferirCatalogo();
      await admitirPortalLocked(autor, "confirm", prova);
      const resposta = await runtime.criarPortal(autor.contaId);
      const destino = stripeDestination(resposta.url);
      await admitirPortalLocked(autor, "opened", prova);
      return { destino };
    });
  };
}
