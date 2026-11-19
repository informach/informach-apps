import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, gt, lte, sql } from "@informach/db";
import {
  recreioGroupInvites as invites,
  recreioAccountParticipations as participations,
  users,
} from "@informach/db/schema";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { serializarConvitesPorEmail } from "./convites-email-repository";
import {
  LIMITE_DE_CONVITES_PENDENTES,
  LIMITE_DE_CONVITES_RECEBIDOS,
  type NovoConviteDeGrupo,
  PRAZO_DO_CONVITE_MS,
} from "./convites-regras";
import { GrupoCriadoDuranteEspera, prepararGrupoDoTitular } from "./preparar-repository";

/** Só sob a autoridade do emissor; o expurgo global será integrado ao cron. */
async function expirarPendentes(tx: Transacao, grupoId: string, autorId: string, agora: Date) {
  const vencidos = await tx
    .update(invites)
    .set({
      state: "expired",
      recipientEmail: null,
      senderLabel: null,
      recipientUserId: null,
      finishedAt: agora,
    })
    .where(
      and(
        eq(invites.groupId, grupoId),
        eq(invites.state, "pending"),
        lte(invites.expiresAt, agora),
      ),
    )
    .returning({ id: invites.id });
  for (const vencido of vencidos)
    await logAuditEventStrict(
      "recreio.group_invite_expired",
      autorId,
      {
        app: "recreio",
        groupId: grupoId,
        inviteId: vencido.id,
      },
      { writer: tx },
    );
}

async function tentarCriarConvite(autor: AutorNativoRecente, pedido: NovoConviteDeGrupo) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    assertAllowed(
      env.RECREIO_FAMILY_MODE !== "off",
      "FAMILIA_INDISPONIVEL",
      "Novos convites ainda não estão disponíveis neste acesso.",
    );
    // The recipient fence precedes every native/group lock. Closing uses the
    // same order; absence of an account is never treated as a durable opt-in.
    await serializarConvitesPorEmail(tx, pedido.email);
    const atual = await prepararGrupoDoTitular(tx, autor);
    const [emissor] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, autor.contaId));
    assertAllowed(
      emissor && emissor.email.trim().toLowerCase() !== pedido.email,
      "CONVITE",
      "Use o e-mail de outro adulto.",
    );
    const [destinatario] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, pedido.email));
    // Only the original closing-consent writer can leave active. Its address
    // fence is held here, so even a previously absent participation cannot
    // become closing before this transaction commits. No target user lock is
    // acquired late after the sender's group/profile locks.
    const [participacao] = destinatario
      ? await tx
          .select({ state: participations.state })
          .from(participations)
          .where(eq(participations.userId, destinatario.id))
      : [];
    assertAllowed(
      !participacao || participacao.state === "active",
      "CONVITE",
      "Não foi possível preparar esse convite. Confira o endereço ou tente depois.",
    );
    let agora = await atual.nativa.conferirPrazo(autor.login);
    await expirarPendentes(tx, atual.grupoId, autor.contaId, agora);
    const [existente] = await tx
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.groupId, atual.grupoId),
          eq(invites.recipientEmail, pedido.email),
          eq(invites.state, "pending"),
        ),
      )
      .for("update");
    if (existente) {
      agora = await atual.nativa.conferirPrazo(autor.login);
      assertAllowed(
        existente.expiresAt > agora,
        "CONVITE",
        "O convite venceu. Abra novamente a gestão.",
      );
      return {
        conviteId: existente.id,
        expiraEm: existente.expiresAt.toISOString(),
        criado: false,
      };
    }
    const pendentes = await tx
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.groupId, atual.grupoId),
          eq(invites.state, "pending"),
          gt(invites.expiresAt, agora),
        ),
      )
      .limit(LIMITE_DE_CONVITES_PENDENTES);
    const recebidos = await tx
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.recipientEmail, pedido.email),
          eq(invites.state, "pending"),
          gt(invites.expiresAt, agora),
        ),
      )
      .limit(LIMITE_DE_CONVITES_RECEBIDOS);
    assertAllowed(
      pendentes.length < LIMITE_DE_CONVITES_PENDENTES &&
        recebidos.length < LIMITE_DE_CONVITES_RECEBIDOS,
      "LIMITE_DE_CONVITES",
      "Não foi possível preparar outro convite agora. Aguarde ou encerre um convite pendente.",
    );
    agora = await atual.nativa.conferirPrazo(autor.login);
    const [criado] = await tx
      .insert(invites)
      .values({
        groupId: atual.grupoId,
        inviterUserId: autor.contaId,
        inviterDeclarationVersion: pedido.versaoDaDeclaracao,
        recipientEmail: pedido.email,
        senderLabel: pedido.identificacao,
        recipientUserId: destinatario?.id ?? null,
        createdAt: agora,
        expiresAt: new Date(agora.getTime() + PRAZO_DO_CONVITE_MS),
      })
      .returning({ id: invites.id, expiraEm: invites.expiresAt });
    assertAllowed(criado, "CONVITE", "Não foi possível preparar o convite.");
    await logAuditEventStrict(
      "recreio.group_invite_created",
      autor.contaId,
      {
        app: "recreio",
        groupId: atual.grupoId,
        inviteId: criado.id,
        declarationVersion: pedido.versaoDaDeclaracao,
      },
      { writer: tx },
    );
    const fim = await atual.nativa.conferirPrazo(autor.login);
    assertAllowed(criado.expiraEm > fim, "CONVITE", "O convite venceu. Abra novamente a gestão.");
    return { conviteId: criado.id, expiraEm: criado.expiraEm.toISOString(), criado: true };
  });
}

export async function criarConviteDeGrupo(autor: AutorNativoRecente, pedido: NovoConviteDeGrupo) {
  try {
    return await tentarCriarConvite(autor, pedido);
  } catch (erro) {
    if (!(erro instanceof GrupoCriadoDuranteEspera)) throw erro;
    // A transação anterior já soltou as travas. Não tomar novos mutexes fora
    // da ordem enquanto conserva uma admissão baseada na pista vazia.
    return tentarCriarConvite(autor, pedido);
  }
}
