import "server-only";
import { and, eq } from "@informach/db";
import {
  type recreioPurchaseAuthorizations as purchases,
  recreioPurchaseProfiles as selections,
} from "@informach/db/schema";
import type { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { AceiteDaCompra } from "./regras";
import { conferirSelecaoDaTroca, perfisParaSelecionarNaTroca } from "./troca-selecao";

type Compra = typeof purchases.$inferSelect;
type Composicao = Pick<Awaited<ReturnType<typeof admitirGrupoDoTitular>>, "perfis" | "vinculos">;
export async function lerSelecaoDaCompraLocked(tx: Transacao, compra: Compra) {
  return tx
    .select()
    .from(selections)
    .where(
      and(
        eq(selections.purchaseId, compra.id),
        eq(selections.groupId, compra.groupId),
        eq(selections.payerUserId, compra.payerUserId),
        eq(selections.providerMode, compra.providerMode),
        eq(selections.productId, compra.productId),
      ),
    )
    .orderBy(selections.profileReference)
    .for("share");
}
export async function conferirReplayDaSelecaoDaCompra(
  tx: Transacao,
  compra: Compra,
  pedido: AceiteDaCompra,
) {
  const anteriores = await lerSelecaoDaCompraLocked(tx, compra);
  assertAllowed(
    anteriores.length === pedido.perfis.length &&
      anteriores.every((s) =>
        pedido.perfis.some(
          (p) =>
            p.perfilId === s.profileReference &&
            p.versao === s.policyVersion &&
            p.cobrir === s.coverageEnabled,
        ),
      ),
    "CONFLITO",
    "A seleção difere do pedido já registrado. Confira ou encerre o pedido anterior.",
  );
}
export function selecaoInicialDaCompra(
  grupoId: string,
  produtoId: string,
  pedido: AceiteDaCompra,
  atual: Composicao,
) {
  const selecao = pedido.perfis.map((p) => ({
    profileReference: p.perfilId,
    profileId: p.perfilId,
    groupId: grupoId,
    policyVersion: p.versao,
    coverageEnabled: p.cobrir,
  }));
  return conferirSelecaoDaTroca(
    grupoId,
    produtoId,
    selecao,
    perfisParaSelecionarNaTroca(atual.perfis, atual.vinculos),
  );
}
export async function registrarSelecaoDaCompraLocked(
  tx: Transacao,
  compra: Compra,
  pedido: AceiteDaCompra,
  atual: Composicao,
) {
  const selecao = selecaoInicialDaCompra(compra.groupId, compra.productId, pedido, atual);
  if (selecao.length)
    await tx.insert(selections).values(
      selecao.map((s) => ({
        ...s,
        purchaseId: compra.id,
        payerUserId: compra.payerUserId,
        providerMode: compra.providerMode,
        productId: compra.productId,
      })),
    );
}
export async function conferirSelecaoDaCompraNoEnvioLocked(
  tx: Transacao,
  compra: Compra,
  atual: Composicao,
) {
  const selecao = await lerSelecaoDaCompraLocked(tx, compra);
  conferirSelecaoDaTroca(
    compra.groupId,
    compra.productId,
    selecao,
    perfisParaSelecionarNaTroca(atual.perfis, atual.vinculos),
  );
}
