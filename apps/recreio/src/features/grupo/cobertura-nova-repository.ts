import "server-only";
import { and, eq } from "@informach/db";
import {
  recreioBillingContracts as contracts,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { ofertasParaOAdulto } from "@/features/cobranca/regras";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

/** Caller already holds the native group composition. Creating a person never
 * silently displaces the payer's selected slot in a native commercial plan. */
export async function coberturaDeNovoPerfilLocked(tx: Transacao, grupoId: string) {
  const fatos = await lerFatosDoGrupo(GrupoIdSchema.parse(grupoId), tx);
  const assinatura = fatos?.assinaturaAtiva ?? fatos?.assinaturaInativa;
  if (!assinatura) return true;
  const [contrato] = await tx
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.subscriptionId, assinatura.id),
        eq(contracts.groupId, grupoId),
        eq(contracts.providerMode, env.STRIPE_MODE),
      ),
    )
    .for("share");
  if (!contrato) return true;
  const oferta = ofertasParaOAdulto().find((p) => p.productId === contrato.currentProductId);
  assertAllowed(oferta, "OFERTA", "A cobertura comercial exige conferência.");
  const cobertos = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.groupId, grupoId), eq(profiles.coverageEnabled, true)));
  return !contrato.coverageReviewRequired && cobertos.length < oferta.perfis;
}
