import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, or } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendships as friends,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { type PerfilId, PerfilIdSchema } from "@informach/recreio";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { parSocial } from "./amizade-repository";
import type { AutorSocial, ContextoDeProtecaoSocial } from "./autoridade-repository";
import { comProtecaoSocial } from "./autoridade-repository";
import type { ProtecaoDeContato } from "./regras";

function entre(a: PerfilId, b: PerfilId) {
  return or(
    and(eq(requests.originProfileId, a), eq(requests.targetProfileId, b)),
    and(eq(requests.originProfileId, b), eq(requests.targetProfileId, a)),
  );
}

async function removerRelacao(
  tx: Transacao,
  a: PerfilId,
  b: PerfilId,
  contaId: string | null,
  conferirPrazo: () => Promise<Date>,
) {
  const [menor, maior] = parSocial(a, b);
  const [amizade] = await tx
    .select()
    .from(friends)
    .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)))
    .for("update");
  if (!amizade) return null;
  if (amizade.state !== "active") return false;
  assertAllowed(amizade.revision < 2147483646, "CONFLITO", "Não foi possível atualizar o contato.");
  await tx
    .update(friends)
    .set({
      state: "removed",
      revision: amizade.revision + 1,
      removedAt: await conferirPrazo(),
      updatedAt: await conferirPrazo(),
    })
    .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)));
  await logAuditEventStrict(
    "recreio.friendship_removed",
    contaId,
    { app: "recreio", profileId: a, targetProfileId: b, revision: amizade.revision + 1 },
    { writer: tx },
  );
  return true;
}

/** Não concede participação em mundo, nem retira dados ou titularidade de outra pessoa. */
export async function salvarProtecaoDeContato(referencia: AutorSocial, entrada: ProtecaoDeContato) {
  assertAllowed(referencia.perfilId !== entrada.perfilId, "CONTATO", "Contato não disponível.");
  return comProtecaoSocial(referencia, entrada.perfilId, (tx, atual) =>
    gravarProtecaoSobTrava(tx, atual, entrada),
  );
}

/** Chamadores constroem o contexto somente após admissão do jogador ou responsável atual. */
export async function gravarProtecaoSobTrava(
  tx: Transacao,
  atual: ContextoDeProtecaoSocial,
  entrada: ProtecaoDeContato,
) {
  assertAllowed(
    atual.perfilId !== entrada.perfilId && atual.alvoId === entrada.perfilId,
    "CONTATO",
    "Contato não disponível.",
  );
  const a = atual.perfilId,
    b = atual.alvoId;
  const [anterior] = await tx
    .select()
    .from(blocks)
    .where(and(eq(blocks.actorProfileId, a), eq(blocks.targetProfileId, b)))
    .for("update");
  if (!anterior) {
    const [menor, maior] = parSocial(a, b);
    const [conhecido] = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(entre(a, b))
      .limit(1);
    const [amizade] = await tx
      .select({ id: friends.lowerProfileId })
      .from(friends)
      .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)));
    assertAllowed(conhecido || amizade, "CONTATO", "Contato não disponível.");
    if (!entrada.bloqueado && !entrada.silenciado) return { bloqueado: false, silenciado: false };
    const existentes = await tx
      .select({ id: blocks.targetProfileId })
      .from(blocks)
      .where(eq(blocks.actorProfileId, a))
      .limit(1000);
    assertAllowed(
      existentes.length < 1000,
      "LIMITE_DE_CONTATOS",
      "O limite de proteções foi atingido. Procure o suporte.",
    );
  }
  if (anterior?.blocked === entrada.bloqueado && anterior.muted === entrada.silenciado)
    return { bloqueado: entrada.bloqueado, silenciado: entrada.silenciado };
  const agora = await atual.conferirPrazo();
  if (
    anterior &&
    ((anterior.blocked && !entrada.bloqueado) || (anterior.muted && !entrada.silenciado))
  )
    assertAllowed(
      entrada.anterior &&
        entrada.anterior.bloqueado === anterior.blocked &&
        entrada.anterior.silenciado === anterior.muted,
      "CONFLITO",
      "A proteção mudou. Atualize a tela antes de diminuir uma proteção.",
    );
  if (!entrada.bloqueado && !entrada.silenciado)
    await tx.delete(blocks).where(and(eq(blocks.actorProfileId, a), eq(blocks.targetProfileId, b)));
  else
    await tx
      .insert(blocks)
      .values({
        actorProfileId: a,
        targetProfileId: b,
        blocked: entrada.bloqueado,
        muted: entrada.silenciado,
        updatedAt: agora,
      })
      .onConflictDoUpdate({
        target: [blocks.actorProfileId, blocks.targetProfileId],
        set: {
          blocked: entrada.bloqueado,
          muted: entrada.silenciado,
          updatedAt: agora,
        },
      });
  if (entrada.bloqueado) {
    const pendentes = await tx
      .select()
      .from(requests)
      .where(and(entre(a, b), eq(requests.state, "pending")))
      .orderBy(requests.id)
      .for("update");
    for (const pedido of pendentes) {
      await tx
        .update(requests)
        .set({ state: "revoked", finishedAt: agora })
        .where(eq(requests.id, pedido.id));
      await logAuditEventStrict(
        "recreio.friend_request_revoked",
        atual.contaId,
        { app: "recreio", profileId: a, requestId: pedido.id },
        { writer: tx },
      );
    }
    await removerRelacao(tx, a, b, atual.contaId, atual.conferirPrazo);
  }
  await logAuditEventStrict(
    "recreio.social_protection_changed",
    atual.contaId,
    {
      app: "recreio",
      profileId: a,
      targetProfileId: b,
      blocked: entrada.bloqueado,
      muted: entrada.silenciado,
    },
    { writer: tx },
  );
  await atual.conferirPrazo();
  return { bloqueado: entrada.bloqueado, silenciado: entrada.silenciado };
}

export async function removerAmizadeNoBanco(referencia: AutorSocial, alvo: PerfilId) {
  assertAllowed(referencia.perfilId !== alvo, "CONTATO", "Contato não disponível.");
  return comProtecaoSocial(referencia, alvo, removerContatoSobTrava);
}

export async function removerContatoSobTrava(tx: Transacao, atual: ContextoDeProtecaoSocial) {
  const removida = await removerRelacao(
    tx,
    atual.perfilId,
    atual.alvoId,
    atual.contaId,
    atual.conferirPrazo,
  );
  assertAllowed(removida !== null, "CONTATO", "Contato não disponível.");
  return { removida: true };
}

export async function encerrarPedidoNoBanco(
  referencia: AutorSocial,
  pedidoId: string,
  acao: "recusar" | "revogar",
) {
  const [pista] = await db
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.id, pedidoId),
        eq(
          acao === "recusar" ? requests.targetProfileId : requests.originProfileId,
          referencia.perfilId,
        ),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Pedido não disponível.");
  const alvo = PerfilIdSchema.parse(
    acao === "recusar" ? pista.originProfileId : pista.targetProfileId,
  );
  return comProtecaoSocial(referencia, alvo, async (tx, atual) => {
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, pedidoId), entre(atual.perfilId, alvo)))
      .for("update");
    const estado = acao === "recusar" ? "rejected" : "revoked";
    assertAllowed(
      pedido && (pedido.state === "pending" || pedido.state === estado),
      "PEDIDO",
      "Pedido não disponível.",
    );
    if (pedido.state === "pending") {
      await tx
        .update(requests)
        .set({ state: estado, finishedAt: await atual.conferirPrazo() })
        .where(eq(requests.id, pedido.id));
      await logAuditEventStrict(
        acao === "recusar" ? "recreio.friend_request_rejected" : "recreio.friend_request_revoked",
        atual.contaId,
        { app: "recreio", profileId: atual.perfilId, requestId: pedido.id },
        { writer: tx },
      );
    }
    return { pedidoId, estado };
  });
}
