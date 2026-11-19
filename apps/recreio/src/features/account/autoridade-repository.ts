import "server-only";
import { and, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import { type ContaId, PerfilIdSchema, type SessaoDeAparelhoId } from "@informach/recreio";
import { sessaoDeLoginViva } from "@/features/sessao/login";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao, travar } from "@/lib/repository";
import {
  exigirParticipacaoAtivaLocked,
  lerParticipacaoDoRecreioLocked,
} from "./participacao-repository";

export type IdentidadeNativa = { contaId: ContaId; sessaoDeAparelhoId: SessaoDeAparelhoId };
/** Somente o adapter servidor lê essas datas do login autenticado. */
export type ProvaDeLoginNativo = { authSessionId: string; criadoEm: Date; expiraEm: Date };
export type AutorNativoRecente = IdentidadeNativa & { login: ProvaDeLoginNativo };
export type FinalidadeDaContaNativa = "participacao" | "direitos" | "financeiro";
const LOGIN_RECENTE_MS = 10 * 60_000;

export async function serializarContaNativa(tx: Transacao, contaId: ContaId) {
  await travar(tx, `recreio:autoridade-nativa:${contaId}`);
}

export async function lerContaNativa(tx: Transacao, contaId: ContaId) {
  await serializarContaNativa(tx, contaId);
  const [conta] = await tx.select().from(users).where(eq(users.id, contaId)).for("share");
  assertAllowed(conta?.emailVerified, "AUTH", "Entre novamente para continuar.");
  return conta;
}

/** Somente identidade sob trava. A gestão também exige contexto irrestrito em autorizarContaNativa. */
export async function validarIdentidadeDaSessaoNativa(
  tx: Transacao,
  ator: IdentidadeNativa,
  conta: typeof users.$inferSelect,
  atual: typeof devices.$inferSelect,
  prova?: ProvaDeLoginNativo,
): Promise<Date> {
  assertAllowed(
    conta.id === ator.contaId &&
      conta.emailVerified &&
      atual.id === ator.sessaoDeAparelhoId &&
      atual.userId === ator.contaId &&
      atual.kind === "account" &&
      atual.revokedAt === null &&
      atual.authSessionId,
    "AUTH",
    "Entre novamente para continuar.",
  );
  const authSessionId = atual.authSessionId;
  assertAllowed(
    await sessaoDeLoginViva({ authSessionId, contaId: ator.contaId }, tx),
    "AUTH",
    "Entre novamente para continuar.",
  );
  const [linha] = await tx
    .select({ agora: sql<Date>`${AGORA}`.mapWith(users.createdAt) })
    .from(users)
    .where(eq(users.id, ator.contaId));
  assertAllowed(linha, "AUTH", "Entre novamente para continuar.");
  const agora = linha.agora;
  assertAllowed(
    atual.expiresAt > agora &&
      !(conta.banned && (!conta.banExpiresAt || conta.banExpiresAt > agora)),
    "AUTH",
    "Entre novamente para continuar.",
  );
  if (prova) {
    assertAllowed(
      prova.authSessionId === authSessionId && prova.expiraEm > agora,
      "AUTH",
      "Entre novamente para continuar.",
    );
    assertAllowed(
      Number.isFinite(prova.criadoEm.getTime()) &&
        prova.criadoEm <= agora &&
        agora.getTime() - prova.criadoEm.getTime() < LOGIN_RECENTE_MS,
      "LOGIN_RECENTE",
      "Entre novamente para confirmar esta alteração na família.",
    );
  }
  return agora;
}

/** Conta → perfil próprio opcional → aparelho. Pagar ou escolher um menor não concede gestão. */
export async function autorizarContaNativa(
  tx: Transacao,
  ator: IdentidadeNativa,
  travaDoPerfil: "share" | "update" = "share",
  travaDoAparelho: "share" | "update" = "share",
  finalidade: FinalidadeDaContaNativa = "participacao",
) {
  const conta = await lerContaNativa(tx, ator.contaId);
  const participacao =
    finalidade === "participacao"
      ? await exigirParticipacaoAtivaLocked(tx, ator.contaId)
      : await lerParticipacaoDoRecreioLocked(tx, ator.contaId);
  const [perfil] = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.userId, ator.contaId), eq(profiles.kind, "adult")))
    .for(travaDoPerfil);
  const [atual] = await tx
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.id, ator.sessaoDeAparelhoId),
        eq(devices.userId, ator.contaId),
        eq(devices.kind, "account"),
      ),
    )
    .for(travaDoAparelho);
  assertAllowed(
    atual &&
      atual.minorContextGeneration === null &&
      (atual.activeProfileId === null || atual.activeProfileId === perfil?.id) &&
      atual.revokedAt === null &&
      atual.authSessionId,
    "AUTH",
    "Entre novamente para continuar.",
  );
  const conferirPrazo = (prova?: ProvaDeLoginNativo) =>
    validarIdentidadeDaSessaoNativa(tx, ator, conta, atual, prova);
  await conferirPrazo();
  return {
    participacao,
    perfilId: atual.activeProfileId && perfil ? PerfilIdSchema.parse(perfil.id) : null,
    aparelho: { id: atual.id, criadoEm: atual.createdAt, vistoEm: atual.lastSeenAt },
    conferirPrazo,
  };
}

/** Direitos pessoais continuam acessíveis durante e depois do encerramento.
 * Não concede criação de perfis, teste, compras ou gameplay. */
export function autorizarContaNativaParaDireitos(tx: Transacao, ator: IdentidadeNativa) {
  return autorizarContaNativa(tx, ator, "share", "share", "direitos");
}
