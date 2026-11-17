import "server-only";
import { and, eq, sql } from "@informach/db";
import { sessions, users } from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { verificarProvaDeModeracao } from "@informach/recreio/emissor";
import { AGORA, type Transacao } from "@/lib/repository";

export type ProvaDeModeracao = Awaited<ReturnType<typeof verificarProvaDeModeracao>>;

/** Chamador já serializou a conta da equipe antes de qualquer perfil ou mundo. */
export async function admitirEquipeDeModeracao(tx: Transacao, prova: ProvaDeModeracao) {
  const [pessoa] = await tx
    .select({
      papel: users.role,
      duasEtapas: users.twoFactorEnabled,
      confirmada: users.emailVerified,
      banida: users.banned,
      fimDoBanimento: users.banExpiresAt,
    })
    .from(users)
    .where(eq(users.id, prova.contaId))
    .for("share");
  const [sessao] = await tx
    .select({
      criadaEm: sessions.createdAt,
      expiraEm: sessions.expiresAt,
      origem: sessions.originApp,
    })
    .from(sessions)
    .where(and(eq(sessions.id, prova.authSessionId), eq(sessions.userId, prova.contaId)))
    .for("share");
  if (
    !pessoa ||
    !sessao ||
    !["owner", "admin"].includes(pessoa.papel) ||
    !pessoa.duasEtapas ||
    !pessoa.confirmada ||
    sessao.origem !== null
  )
    throw new ErroDoRecreio("SEM_PERMISSAO");
  const conferirPrazo = async () => {
    const [relogio] = await tx.execute<{ agora: Date }>(sql`select ${AGORA} as agora`);
    if (!relogio) throw new Error("Relógio da moderação indisponível.");
    const agora = new Date(relogio.agora);
    if (
      agora < prova.emitidaEm ||
      agora >= prova.expiraEm ||
      agora >= sessao.expiraEm ||
      agora.getTime() >= sessao.criadaEm.getTime() + 12 * 3_600_000 ||
      prova.emitidaEm.getTime() < Math.floor(sessao.criadaEm.getTime() / 1000) * 1000 ||
      (pessoa.banida && (!pessoa.fimDoBanimento || pessoa.fimDoBanimento > agora))
    )
      throw new ErroDoRecreio("SEM_PERMISSAO");
    return agora;
  };
  await conferirPrazo();
  return { conferirPrazo };
}
