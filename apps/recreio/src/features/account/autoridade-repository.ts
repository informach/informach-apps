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
import { AGORA, type Transacao } from "@/lib/repository";

export type IdentidadeNativa = { contaId: ContaId; sessaoDeAparelhoId: SessaoDeAparelhoId };
/** Somente o adapter servidor lê essas datas do login autenticado. */
export type ProvaDeLoginNativo = { authSessionId: string; criadoEm: Date; expiraEm: Date };
export type AutorNativoRecente = IdentidadeNativa & { login: ProvaDeLoginNativo };
const LOGIN_RECENTE_MS = 10 * 60_000;

/** Conta → perfil próprio opcional → aparelho. Pagar ou escolher um menor não concede gestão. */
export async function autorizarContaNativa(tx: Transacao, ator: IdentidadeNativa) {
  const [conta] = await tx.select().from(users).where(eq(users.id, ator.contaId)).for("share");
  assertAllowed(conta?.emailVerified, "AUTH", "Entre novamente para continuar.");
  const [perfil] = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.userId, ator.contaId), eq(profiles.kind, "adult")))
    .for("share");
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
    .for("share");
  assertAllowed(
    atual &&
      (atual.activeProfileId === null || atual.activeProfileId === perfil?.id) &&
      atual.revokedAt === null &&
      atual.authSessionId,
    "AUTH",
    "Entre novamente para continuar.",
  );
  const authSessionId = atual.authSessionId;
  const conferirPrazo = async (prova?: ProvaDeLoginNativo): Promise<Date> => {
    assertAllowed(
      await sessaoDeLoginViva({ authSessionId, contaId: ator.contaId }),
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
  };
  await conferirPrazo();
  return {
    perfilId: atual.activeProfileId && perfil ? PerfilIdSchema.parse(perfil.id) : null,
    aparelho: { id: atual.id, criadoEm: atual.createdAt, vistoEm: atual.lastSeenAt },
    conferirPrazo,
  };
}
