import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, ne, sql } from "@informach/db";
import {
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import {
  ErroDoRecreio,
  type EstadoDeMembro,
  type EstadoDeMundo,
  type MembroId,
  MembroIdSchema,
  type MundoId,
  MundoIdSchema,
  type PapelNoMundo,
  type PerfilId,
} from "@informach/recreio";
import { AGORA, type Transacao, travar } from "@/lib/repository";

/**
 * Mundos, membros e convites no banco. Ordem das travas em todo o app: a linha
 * da conta em `core.users` (quando entra), depois a linha do mundo em
 * `spaces`, depois o resto.
 *
 * Os eventos de auditoria entram na mesma transação da mudança. Eventos de
 * mundo não levam `targetId`: um mundo é de várias contas, e o evento só se
 * liga a uma pessoa pelo ator (a conta do perfil que agiu).
 */

/** A conta do perfil, para o ator da auditoria. `null` em perfil sem login. */
async function contaDoPerfil(tx: Transacao, perfilId: PerfilId): Promise<string | null> {
  const [perfil] = await tx
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.id, perfilId));
  if (!perfil) throw new ErroDoRecreio("SEM_PERFIL");
  return perfil.userId;
}

export type MundoDoPerfil = {
  id: MundoId;
  nome: string;
  papel: PapelNoMundo;
  estado: EstadoDeMundo;
  membros: number;
  politicaDeConteudo: string;
  abertoAgora: boolean;
  resumo: unknown;
  criadoEm: Date;
};

/** Os mundos do jogo em que o perfil é membro ativo, do mais antigo ao mais novo. */
export async function listarMundosDoPerfil(
  perfilId: PerfilId,
  jogo: string,
): Promise<MundoDoPerfil[]> {
  const linhas = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      role: members.role,
      status: spaces.status,
      contentPolicy: spaces.contentPolicy,
      summary: spaces.summary,
      createdAt: spaces.createdAt,
      membros: sql<number>`(select count(*)::int from recreio.space_members outros where outros.space_id = ${spaces.id} and outros.state = 'active')`,
      aberto: sql<boolean>`exists (select 1 from recreio.space_leases posse where posse.space_id = ${spaces.id} and posse.released_at is null and posse.expires_at > ${AGORA})`,
    })
    .from(members)
    .innerJoin(spaces, eq(spaces.id, members.spaceId))
    .where(
      and(
        eq(members.profileId, perfilId),
        eq(members.state, "active"),
        eq(spaces.gameId, jogo),
        ne(spaces.status, "deleted"),
      ),
    )
    .orderBy(spaces.createdAt, spaces.id);
  return linhas.map((linha) => ({
    id: MundoIdSchema.parse(linha.id),
    nome: linha.name,
    papel: linha.role,
    estado: linha.status,
    membros: linha.membros,
    politicaDeConteudo: linha.contentPolicy,
    abertoAgora: linha.aberto,
    resumo: linha.summary,
    criadoEm: linha.createdAt,
  }));
}

/**
 * Cria o mundo e o membro responsável numa transação. O teto de mundos
 * criados pelo perfil naquele jogo é contado sob uma trava por perfil: dois
 * pedidos ao mesmo tempo passam um de cada vez, e o que estoura o teto recebe
 * `LIMITE_DE_MUNDOS`.
 */
export async function criarMundoDoPerfil(entrada: {
  perfilId: PerfilId;
  jogo: string;
  nome: string;
  politicaDeConteudo: string;
  limite: number;
}): Promise<{ id: MundoId; nome: string; membroId: MembroId }> {
  return db.transaction(async (tx) => {
    await travar(tx, `recreio:spaces:criador:${entrada.perfilId}`);
    const conta = await contaDoPerfil(tx, entrada.perfilId);
    const [contagem] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(spaces)
      .where(
        and(
          eq(spaces.createdByProfileId, entrada.perfilId),
          eq(spaces.gameId, entrada.jogo),
          ne(spaces.status, "deleted"),
        ),
      );
    if ((contagem?.total ?? 0) >= entrada.limite) throw new ErroDoRecreio("LIMITE_DE_MUNDOS");
    const [mundo] = await tx
      .insert(spaces)
      .values({
        gameId: entrada.jogo,
        stewardProfileId: entrada.perfilId,
        createdByProfileId: entrada.perfilId,
        name: entrada.nome,
        contentPolicy: entrada.politicaDeConteudo,
        status: "hibernating",
      })
      .returning({ id: spaces.id, name: spaces.name });
    if (!mundo) throw new Error("O mundo não foi gravado.");
    const [membro] = await tx
      .insert(members)
      .values({ spaceId: mundo.id, profileId: entrada.perfilId, role: "steward", state: "active" })
      .returning({ id: members.id });
    if (!membro) throw new Error("O responsável do mundo não foi gravado.");
    await logAuditEventStrict(
      "recreio.space_created",
      conta,
      {
        app: "recreio",
        spaceId: mundo.id,
        gameId: entrada.jogo,
        profileId: entrada.perfilId,
        memberId: membro.id,
        contentPolicy: entrada.politicaDeConteudo,
      },
      { writer: tx },
    );
    return {
      id: MundoIdSchema.parse(mundo.id),
      nome: mundo.name,
      membroId: MembroIdSchema.parse(membro.id),
    };
  });
}

/**
 * Cria um convite de membro. Só o responsável convida nesta etapa. Mundo que
 * não existe, de outro jogo ou do qual o perfil não é membro ativo dão a mesma
 * recusa (`NAO_MEMBRO`): saber um id não diz se o mundo existe.
 */
export async function criarConviteDoMundo(entrada: {
  mundoId: MundoId;
  perfilId: PerfilId;
  /** Quando o pedido vem de uma sessão de jogo, o mundo precisa ser daquele jogo. */
  jogo: string | null;
  participacao: string | null;
  codeHash: string;
  validadeMs: number;
}): Promise<{ expiraEm: Date }> {
  return db.transaction(async (tx) => {
    const [mundo] = await tx
      .select({ id: spaces.id, gameId: spaces.gameId, status: spaces.status })
      .from(spaces)
      .where(eq(spaces.id, entrada.mundoId));
    const [membro] = mundo
      ? await tx
          .select({ id: members.id, role: members.role, state: members.state })
          .from(members)
          .where(and(eq(members.spaceId, mundo.id), eq(members.profileId, entrada.perfilId)))
      : [];
    if (
      !mundo ||
      (entrada.jogo !== null && mundo.gameId !== entrada.jogo) ||
      membro?.state !== "active"
    )
      throw new ErroDoRecreio("NAO_MEMBRO");
    if (membro.role !== "steward") throw new ErroDoRecreio("SEM_PERMISSAO");
    if (mundo.status === "archived" || mundo.status === "deleted")
      throw new ErroDoRecreio("MUNDO_INDISPONIVEL");
    const conta = await contaDoPerfil(tx, entrada.perfilId);
    const [convite] = await tx
      .insert(invites)
      .values({
        spaceId: mundo.id,
        invitedByMemberId: membro.id,
        form: "member",
        participation: entrada.participacao,
        codeHash: entrada.codeHash,
        state: "sent",
        expiresAt: sql`now() + ${`${entrada.validadeMs} milliseconds`}::interval`,
      })
      .returning({ id: invites.id, expiresAt: invites.expiresAt });
    if (!convite) throw new Error("O convite não foi gravado.");
    await logAuditEventStrict(
      "recreio.space_invite_created",
      conta,
      {
        app: "recreio",
        spaceId: mundo.id,
        inviteId: convite.id,
        memberId: membro.id,
        form: "member",
      },
      { writer: tx },
    );
    return { expiraEm: convite.expiresAt };
  });
}

/**
 * Aceita um convite para o perfil de quem pede. Código errado, vencido, já
 * usado, revogado ou de um mundo que não recebe mais ninguém dão a mesma
 * recusa (`CONVITE_INVALIDO`).
 *
 * A linha do mundo é travada antes da do convite: dois aceites do mesmo código
 * passam um de cada vez (um entra, o outro recebe `CONVITE_INVALIDO`), e a
 * contagem de membros para o teto não corre com outro aceite.
 */
export async function aceitarConviteDoMundo(entrada: {
  codeHash: string;
  perfilId: PerfilId;
  /** Teto de membros ativos do jogo do mundo. */
  tetoDeMembros: (jogo: string) => number;
}): Promise<{ mundoId: MundoId; nome: string; jogo: string; membroId: MembroId }> {
  return db.transaction(async (tx) => {
    const [achado] = await tx
      .select({ id: invites.id, spaceId: invites.spaceId })
      .from(invites)
      .where(eq(invites.codeHash, entrada.codeHash));
    if (!achado) throw new ErroDoRecreio("CONVITE_INVALIDO");
    const [mundo] = await tx
      .select({ id: spaces.id, gameId: spaces.gameId, status: spaces.status, name: spaces.name })
      .from(spaces)
      .where(eq(spaces.id, achado.spaceId))
      .for("update");
    const [convite] = await tx
      .select({
        id: invites.id,
        participation: invites.participation,
        invitedByMemberId: invites.invitedByMemberId,
      })
      .from(invites)
      .where(
        and(
          eq(invites.id, achado.id),
          eq(invites.state, "sent"),
          eq(invites.form, "member"),
          sql`${invites.expiresAt} > ${AGORA}`,
        ),
      )
      .for("update");
    if (!mundo || !convite || mundo.status === "archived" || mundo.status === "deleted")
      throw new ErroDoRecreio("CONVITE_INVALIDO");

    const conta = await contaDoPerfil(tx, entrada.perfilId);
    const [existente] = await tx
      .select({ id: members.id, state: members.state })
      .from(members)
      .where(and(eq(members.spaceId, mundo.id), eq(members.profileId, entrada.perfilId)));
    if (existente && existente.state !== "former") throw new ErroDoRecreio("JA_MEMBRO");
    const [contagem] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(members)
      .where(and(eq(members.spaceId, mundo.id), eq(members.state, "active")));
    if ((contagem?.total ?? 0) >= entrada.tetoDeMembros(mundo.gameId))
      throw new ErroDoRecreio("MUNDO_CHEIO");

    const dados = {
      role: "member" as const,
      state: "active" as const,
      participation: convite.participation,
      invitedByMemberId: convite.invitedByMemberId,
    };
    // Quem já saiu do mundo volta na mesma linha: a participação é por mundo e perfil.
    const [membro] = existente
      ? await tx
          .update(members)
          .set({ ...dados, joinedAt: AGORA, leftAt: null })
          .where(eq(members.id, existente.id))
          .returning({ id: members.id })
      : await tx
          .insert(members)
          .values({ spaceId: mundo.id, profileId: entrada.perfilId, ...dados })
          .returning({ id: members.id });
    if (!membro) throw new Error("O membro não foi gravado.");
    await tx
      .update(invites)
      .set({ state: "accepted", acceptedAt: AGORA, acceptedByProfileId: entrada.perfilId })
      .where(eq(invites.id, convite.id));

    await logAuditEventStrict(
      "recreio.space_invite_accepted",
      conta,
      {
        app: "recreio",
        spaceId: mundo.id,
        inviteId: convite.id,
        profileId: entrada.perfilId,
        memberId: membro.id,
      },
      { writer: tx },
    );
    await logAuditEventStrict(
      "recreio.space_member_joined",
      conta,
      {
        app: "recreio",
        spaceId: mundo.id,
        memberId: membro.id,
        profileId: entrada.perfilId,
        role: "member",
        invitedByMemberId: convite.invitedByMemberId,
      },
      { writer: tx },
    );
    return {
      mundoId: MundoIdSchema.parse(mundo.id),
      nome: mundo.name,
      jogo: mundo.gameId,
      membroId: MembroIdSchema.parse(membro.id),
    };
  });
}

export type MembroDoMundo = {
  membroId: MembroId;
  apelido: string | null;
  avatar: string | null;
  papel: PapelNoMundo;
  estado: EstadoDeMembro;
};

export type MundoDoMembro = {
  id: MundoId;
  nome: string;
  jogo: string;
  estado: EstadoDeMundo;
  papel: PapelNoMundo;
  membros: MembroDoMundo[];
};

/**
 * O mundo como um membro ativo o vê no portal: nome, situação e quem
 * participa. Para quem não é membro ativo devolve `null`, igual a um mundo que
 * não existe.
 */
export async function lerMundoDoMembro(
  mundoId: MundoId,
  perfilId: PerfilId,
): Promise<MundoDoMembro | null> {
  const [mundo] = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      gameId: spaces.gameId,
      status: spaces.status,
      role: members.role,
    })
    .from(members)
    .innerJoin(spaces, eq(spaces.id, members.spaceId))
    .where(
      and(
        eq(members.spaceId, mundoId),
        eq(members.profileId, perfilId),
        eq(members.state, "active"),
        ne(spaces.status, "deleted"),
      ),
    );
  if (!mundo) return null;
  const linhas = await db
    .select({
      id: members.id,
      role: members.role,
      state: members.state,
      nickname: profiles.nickname,
      avatar: profiles.avatar,
    })
    .from(members)
    .leftJoin(profiles, eq(profiles.id, members.profileId))
    .where(and(eq(members.spaceId, mundoId), ne(members.state, "former")))
    .orderBy(members.joinedAt, members.id);
  return {
    id: MundoIdSchema.parse(mundo.id),
    nome: mundo.name,
    jogo: mundo.gameId,
    estado: mundo.status,
    papel: mundo.role,
    membros: linhas.map((linha) => ({
      membroId: MembroIdSchema.parse(linha.id),
      apelido: linha.nickname,
      avatar: linha.avatar,
      papel: linha.role,
      estado: linha.state,
    })),
  };
}
