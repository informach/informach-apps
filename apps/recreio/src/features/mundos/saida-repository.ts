import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, ne, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import type { ContaId, MundoId, PerfilId, SessaoDeAparelhoId } from "@informach/recreio";
import { encerrarSessoesAbertas, travarEncerramentos } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { prepararRevogacaoDeConvites } from "./convites-revogacao-repository";
import { travarMundoAntesDosPerfis } from "./ordem-de-travas-repository";
import { revogarPropostasDoMembro } from "./responsabilidade-repository";

export type AutorDaSaida = {
  contaId: ContaId;
  perfilId: PerfilId;
  sessaoDeAparelhoId: SessaoDeAparelhoId;
};

export async function registrarSaida(autor: AutorDaSaida, mundoId: MundoId) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    await tx.execute(sql`set local transaction_timeout = '15s'`);
    await travarMundoAntesDosPerfis(tx, autor.perfilId, mundoId, "update");
    // A autoridade fica estável; SHARE conserva as FKs e os demais leitores disponíveis.
    const [perfil] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.id, autor.perfilId),
          eq(profiles.userId, autor.contaId),
          eq(profiles.kind, "adult"),
          eq(profiles.status, "active"),
        ),
      )
      .for("share");
    assertAllowed(perfil, "AUTH", "Entre no seu perfil adulto para continuar.");
    const [aparelho] = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.id, autor.sessaoDeAparelhoId),
          eq(devices.userId, autor.contaId),
          eq(devices.kind, "account"),
          eq(devices.activeProfileId, perfil.id),
          isNull(devices.revokedAt),
        ),
      )
      .for("share");
    assertAllowed(aparelho, "AUTH", "Entre novamente para continuar.");
    const exigirPrazo = async () => {
      const [prazo] = await tx
        .select({ valido: sql<boolean>`${devices.expiresAt} > ${AGORA}` })
        .from(devices)
        .where(eq(devices.id, aparelho.id));
      assertAllowed(prazo?.valido, "AUTH", "Entre novamente para continuar.");
    };
    await exigirPrazo();
    // Não disputar a trava de um mundo alheio; a participação será relida sob a trava.
    const [participacao] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.spaceId, mundoId), eq(members.profileId, perfil.id)));
    assertAllowed(participacao, "MUNDO", "Mundo indisponível.");
    const [mundo] = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, mundoId), ne(spaces.status, "deleted")))
      .for("update");
    assertAllowed(mundo, "MUNDO", "Mundo indisponível.");
    const [membro] = await tx
      .select({ id: members.id, papel: members.role, estado: members.state })
      .from(members)
      .where(and(eq(members.spaceId, mundo.id), eq(members.profileId, perfil.id)))
      .for("update");
    assertAllowed(membro, "MUNDO", "Mundo indisponível.");
    if (membro.estado === "former") {
      await exigirPrazo();
      return { saiu: false };
    }
    assertAllowed(
      membro.papel !== "steward",
      "RESPONSAVEL",
      "Você é responsável por este mundo. Transfira a responsabilidade e espere a outra pessoa aceitar antes de sair.",
    );
    const filtro = sql`${games.profileId} = ${perfil.id} and ${games.spaceId} = ${mundo.id}`;
    await revogarPropostasDoMembro(tx, mundo.id, membro.id, autor.contaId);
    const revogarConvites = await prepararRevogacaoDeConvites(tx, mundo.id, membro.id);
    await travarEncerramentos(tx);
    await tx
      .select({ id: games.id })
      .from(games)
      .where(and(isNull(games.endedAt), filtro))
      .for("update");
    // Reler o relógio depois de todas as travas disputáveis, antes da mudança.
    await exigirPrazo();
    await revogarConvites(autor.contaId, "member_left");
    await tx
      .update(members)
      .set({ state: "former", leftAt: AGORA })
      .where(eq(members.id, membro.id));
    await encerrarSessoesAbertas(tx, filtro, "left", { porQuem: "conta" });
    await logAuditEventStrict(
      "recreio.space_member_left",
      autor.contaId,
      { app: "recreio", spaceId: mundo.id, profileId: perfil.id, memberId: membro.id },
      { writer: tx },
    );
    return { saiu: true };
  });
}
