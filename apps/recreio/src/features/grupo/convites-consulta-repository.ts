import "server-only";
import { and, db, eq, gt, sql } from "@informach/db";
import { recreioGroupInvites as invites } from "@informach/db/schema";
import type { IdentidadeNativa } from "@/features/account/autoridade-repository";
import type { Transacao } from "@/lib/repository";
import { LIMITE_DE_CONVITES_PENDENTES, LIMITE_DE_CONVITES_RECEBIDOS } from "./convites-regras";
import { admitirDestinatario, escopoDoDestinatario } from "./destinatario-repository";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

/** Gestão nativa permanece disponível para fatos existentes, inclusive com flag off. */
export async function listarConvitesEnviados(autor: IdentidadeNativa) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const { nativa } = await admitirDestinatario(tx, autor);
    const agora = await nativa.conferirPrazo();
    const linhas = await tx
      .select({ id: invites.id, email: invites.recipientEmail, fim: invites.expiresAt })
      .from(invites)
      .where(
        and(
          eq(invites.inviterUserId, autor.contaId),
          eq(invites.state, "pending"),
          gt(invites.expiresAt, agora),
        ),
      )
      .orderBy(invites.createdAt, invites.id)
      .limit(LIMITE_DE_CONVITES_PENDENTES);
    await nativa.conferirPrazo();
    return linhas.map((linha) => {
      if (!linha.email) throw new Error("recreio.group_invite.invalid_pending");
      return { conviteId: linha.id, email: linha.email, expiraEm: linha.fim.toISOString() };
    });
  });
}

/** Não revela grupo, perfis, login do emissor ou endereço de outro destinatário. */
export async function listarConvitesRecebidos(autor: IdentidadeNativa) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const { nativa, email } = await admitirDestinatario(tx, autor);
    const agora = await nativa.conferirPrazo();
    const linhas = await tx
      .select({ id: invites.id, fim: invites.expiresAt, identificacao: invites.senderLabel })
      .from(invites)
      .where(
        and(
          escopoDoDestinatario(autor.contaId, email),
          eq(invites.state, "pending"),
          gt(invites.expiresAt, agora),
        ),
      )
      .orderBy(invites.createdAt, invites.id)
      .limit(LIMITE_DE_CONVITES_RECEBIDOS);
    await nativa.conferirPrazo();
    return linhas.map((linha) => ({
      conviteId: linha.id,
      expiraEm: linha.fim.toISOString(),
      identificacao: linha.identificacao ?? "Convite anterior",
    }));
  });
}
