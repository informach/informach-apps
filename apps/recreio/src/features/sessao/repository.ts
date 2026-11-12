import "server-only";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  recreioProfiles as profiles,
  recreioDeviceSessions as sessions,
} from "@informach/db/schema";
import {
  type ContaId,
  ContaIdSchema,
  type PerfilId,
  PerfilIdSchema,
  type SessaoDeAparelhoId,
  SessaoDeAparelhoIdSchema,
} from "@informach/recreio";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/repository";

/** De quanto em quanto tempo uma sessão viva regrava "visto por último". */
const RENOVAR_APOS_MS = 5 * 60_000;
/** Diferença de validade que justifica regravar a linha. */
const FOLGA_DA_VALIDADE_MS = 60_000;

export type SessaoDeAparelho = {
  id: SessaoDeAparelhoId;
  perfilAtivoId: PerfilId | null;
  revogadaEm: Date | null;
};

const campos = {
  id: sessions.id,
  userId: sessions.userId,
  activeProfileId: sessions.activeProfileId,
  lastSeenAt: sessions.lastSeenAt,
  expiresAt: sessions.expiresAt,
  revokedAt: sessions.revokedAt,
};

/**
 * A sessão de aparelho da sessão de login: carrega a linha ou cria a primeira.
 * A chave é o `session.id` do Better Auth; o índice único resolve dois pedidos
 * simultâneos do mesmo navegador. Devolve `null` se a linha for de outra
 * conta, o que não deveria existir e nunca é servido.
 */
export async function carregarOuCriarSessaoDaConta(entrada: {
  authSessionId: string;
  contaId: ContaId;
  expiraEm: Date;
  agora: Date;
}): Promise<SessaoDeAparelho | null> {
  const buscar = () =>
    db.select(campos).from(sessions).where(eq(sessions.authSessionId, entrada.authSessionId));
  let [linha] = await buscar();
  if (!linha) {
    [linha] = await db
      .insert(sessions)
      .values({
        kind: "account",
        authSessionId: entrada.authSessionId,
        userId: entrada.contaId,
        lastSeenAt: entrada.agora,
        expiresAt: entrada.expiraEm,
      })
      .onConflictDoNothing({
        target: sessions.authSessionId,
        where: sql`${sessions.authSessionId} is not null`,
      })
      .returning(campos);
    // Outro pedido do mesmo navegador criou a linha primeiro.
    if (!linha) [linha] = await buscar();
  }
  if (!linha || linha.userId !== entrada.contaId) return null;
  const parada = entrada.agora.getTime() - linha.lastSeenAt.getTime() >= RENOVAR_APOS_MS;
  const validadeMudou =
    Math.abs(entrada.expiraEm.getTime() - linha.expiresAt.getTime()) > FOLGA_DA_VALIDADE_MS;
  if (linha.revokedAt === null && (parada || validadeMudou))
    await db
      .update(sessions)
      .set({ lastSeenAt: entrada.agora, expiresAt: entrada.expiraEm })
      .where(and(eq(sessions.id, linha.id), isNull(sessions.revokedAt)));
  return {
    id: SessaoDeAparelhoIdSchema.parse(linha.id),
    perfilAtivoId:
      linha.activeProfileId === null ? null : PerfilIdSchema.parse(linha.activeProfileId),
    revogadaEm: linha.revokedAt,
  };
}

/**
 * Grava o perfil escolhido. A própria escrita confere de novo que a sessão é
 * da conta, não foi revogada e que o perfil é o de login dela; se algo mudou
 * entre a conferência do serviço e este ponto, nada é gravado.
 */
export async function definirPerfilAtivo(entrada: {
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  contaId: ContaId;
  perfilId: PerfilId;
  agora?: Date;
}): Promise<boolean> {
  const linhas = await db
    .update(sessions)
    .set({ activeProfileId: entrada.perfilId, profileSelectedAt: entrada.agora ?? new Date() })
    .where(
      and(
        eq(sessions.id, entrada.sessaoDeAparelhoId),
        eq(sessions.userId, entrada.contaId),
        isNull(sessions.revokedAt),
        sql`exists (select 1 from ${profiles} where ${profiles.id} = ${entrada.perfilId} and ${profiles.userId} = ${entrada.contaId})`,
      ),
    )
    .returning({ id: sessions.id });
  return linhas.length === 1;
}

/** O perfil ativo deixou de poder ser escolhido: a sessão volta a não ter perfil. */
export async function limparPerfilAtivo(sessaoDeAparelhoId: SessaoDeAparelhoId): Promise<void> {
  await db
    .update(sessions)
    .set({ activeProfileId: null, profileSelectedAt: null })
    .where(eq(sessions.id, sessaoDeAparelhoId));
}

/**
 * Encerra a sessão de aparelho de uma sessão de login e, na mesma transação,
 * as sessões de jogo abertas por ela (`signed_out`): quem sai da conta para de
 * jogar, e a instância fica sabendo no próximo batimento. Revogada não volta:
 * um novo login cria outra linha. Devolve o id encerrado, ou `null` se não
 * havia linha viva.
 */
export async function revogarSessaoDaConta(entrada: {
  authSessionId: string;
  contaId: ContaId;
  agora: Date;
}): Promise<SessaoDeAparelhoId | null> {
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .update(sessions)
      .set({ revokedAt: entrada.agora })
      .where(
        and(
          eq(sessions.authSessionId, entrada.authSessionId),
          eq(sessions.userId, entrada.contaId),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });
    if (!linha) return null;
    await encerrarSessoesAbertas(
      tx,
      sql`${gameSessions.deviceSessionId} = ${linha.id}`,
      "signed_out",
      { porQuem: "conta" },
    );
    return SessaoDeAparelhoIdSchema.parse(linha.id);
  });
}

export type SessaoDeAparelhoLida = {
  id: SessaoDeAparelhoId;
  /** A sessão de login por trás dela; `null` em aparelho pareado. */
  authSessionId: string | null;
  contaId: ContaId | null;
  perfilAtivoId: PerfilId | null;
  expiraEm: Date;
  revogadaEm: Date | null;
};

/** A linha da sessão de aparelho, sem criar nem renovar nada. */
export async function lerSessaoDeAparelho(
  id: SessaoDeAparelhoId,
): Promise<SessaoDeAparelhoLida | null> {
  const [linha] = await db
    .select({
      id: sessions.id,
      authSessionId: sessions.authSessionId,
      userId: sessions.userId,
      activeProfileId: sessions.activeProfileId,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, id));
  if (!linha) return null;
  return {
    id: SessaoDeAparelhoIdSchema.parse(linha.id),
    authSessionId: linha.authSessionId,
    contaId: linha.userId === null ? null : ContaIdSchema.parse(linha.userId),
    perfilAtivoId:
      linha.activeProfileId === null ? null : PerfilIdSchema.parse(linha.activeProfileId),
    expiraEm: linha.expiresAt,
    revogadaEm: linha.revokedAt,
  };
}
