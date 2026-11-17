import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import { recreioGroupInvites as invites } from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { admitirGrupoDoTitular } from "./autoridade-repository";
import { admitirDestinatario, escopoDoDestinatario } from "./destinatario-repository";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}
async function encerrar(
  tx: Transacao,
  linha: typeof invites.$inferSelect,
  autor: AutorNativoRecente,
  origem: "emissor" | "destinatario",
  agora: Date,
) {
  if (linha.state !== "pending") return false;
  const estado = linha.expiresAt <= agora ? "expired" : "revoked";
  await tx
    .update(invites)
    .set({
      state: estado,
      recipientEmail: null,
      senderLabel: null,
      recipientUserId: null,
      finishedAt: agora,
    })
    .where(eq(invites.id, linha.id));
  const evento =
    estado === "expired"
      ? "recreio.group_invite_expired"
      : origem === "emissor"
        ? "recreio.group_invite_revoked"
        : "recreio.group_invite_declined";
  await logAuditEventStrict(
    evento,
    autor.contaId,
    {
      app: "recreio",
      groupId: linha.groupId,
      inviteId: linha.id,
    },
    { writer: tx },
  );
  return true;
}

export async function revogarConviteNoBanco(autor: AutorNativoRecente, conviteId: string) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const [pista] = await tx
      .select({ grupoId: invites.groupId })
      .from(invites)
      .where(and(eq(invites.id, conviteId), eq(invites.inviterUserId, autor.contaId)));
    assertAllowed(pista, "CONVITE", "Convite não disponível.");
    const atual = await admitirGrupoDoTitular(
      tx,
      autor,
      GrupoIdSchema.parse(pista.grupoId),
      "share",
    );
    const [linha] = await tx
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.id, conviteId),
          eq(invites.groupId, atual.grupo.id),
          eq(invites.inviterUserId, autor.contaId),
        ),
      )
      .for("update");
    assertAllowed(linha, "CONVITE", "Convite não disponível.");
    const alterado = await encerrar(
      tx,
      linha,
      autor,
      "emissor",
      await atual.nativa.conferirPrazo(autor.login),
    );
    await atual.nativa.conferirPrazo(autor.login);
    return { alterado };
  });
}

export async function recusarConviteNoBanco(autor: AutorNativoRecente, conviteId: string) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const { nativa, email } = await admitirDestinatario(tx, autor);
    const [linha] = await tx
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.id, conviteId),
          eq(invites.state, "pending"),
          escopoDoDestinatario(autor.contaId, email),
        ),
      )
      .for("update");
    assertAllowed(linha, "CONVITE", "Convite não disponível.");
    const alterado = await encerrar(
      tx,
      linha,
      autor,
      "destinatario",
      await nativa.conferirPrazo(autor.login),
    );
    await nativa.conferirPrazo(autor.login);
    return { alterado };
  });
}
