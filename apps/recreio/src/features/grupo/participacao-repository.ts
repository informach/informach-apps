import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import { recreioGameSessions as games, recreioProfiles as profiles } from "@informach/db/schema";
import { PerfilIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { admitirGrupoDaParticipacaoPropria, admitirGrupoDoTitular } from "./autoridade-repository";
import type { RetiradaDeAdulto, SaidaDoGrupo } from "./participacao-regras";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

async function desvincularAdulto(
  tx: Transacao,
  autor: AutorNativoRecente,
  perfil: typeof profiles.$inferSelect,
  versao: number,
  origem: "proprio" | "titular",
  agora: Date,
) {
  assertAllowed(
    perfil.kind === "adult" && perfil.userId && perfil.groupId,
    "PERFIL",
    "Perfil não disponível.",
  );
  assertAllowed(
    perfil.policyVersion === versao && versao < 2147483646,
    "CONFLITO",
    "O perfil mudou. Reabra a gestão antes de continuar.",
  );
  const [atualizado] = await tx
    .update(profiles)
    .set({ groupId: null, coverageEnabled: false, policyVersion: versao + 1, updatedAt: agora })
    .where(
      and(
        eq(profiles.id, perfil.id),
        eq(profiles.groupId, perfil.groupId),
        eq(profiles.policyVersion, versao),
      ),
    )
    .returning({ id: profiles.id });
  assertAllowed(atualizado, "CONFLITO", "O perfil mudou. Reabra a gestão antes de continuar.");
  const perfilId = PerfilIdSchema.parse(perfil.id);
  await invalidarIngressosDoPerfil(tx, perfilId);
  await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
    porQuem: "recreio",
  });
  await logAuditEventStrict(
    origem === "proprio" ? "recreio.group_member_left" : "recreio.group_member_removed",
    autor.contaId,
    { app: "recreio", groupId: perfil.groupId, profileId: perfilId, revision: versao + 1 },
    { writer: tx },
  );
  return { alterado: true as const, perfilId, versao: versao + 1 };
}

/** Sair do grupo não cancela contrato, apaga identidade ou transfere poderes de mundo. */
export async function sairDoGrupoNoBanco(autor: AutorNativoRecente, pedido: SaidaDoGrupo) {
  const [pista] = await db
    .select({ grupoId: profiles.groupId })
    .from(profiles)
    .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")));
  if (pista?.grupoId !== pedido.grupoId)
    return db.transaction(async (tx) => {
      await limites(tx);
      const nativa = await autorizarContaNativa(tx, autor);
      const [atual] = await tx
        .select({ grupoId: profiles.groupId })
        .from(profiles)
        .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")));
      assertAllowed(
        atual?.grupoId !== pedido.grupoId,
        "CONFLITO",
        "O grupo mudou. Reabra a gestão antes de continuar.",
      );
      await nativa.conferirPrazo(autor.login);
      return { alterado: false as const };
    });
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDaParticipacaoPropria(tx, autor, pedido.grupoId);
    const proprio = atual.perfis.find((p) => p.userId === autor.contaId && p.kind === "adult");
    assertAllowed(proprio, "PERFIL", "Perfil não disponível.");
    const resultado = await desvincularAdulto(
      tx,
      autor,
      proprio,
      pedido.versao,
      "proprio",
      await atual.nativa.conferirPrazo(autor.login),
    );
    await atual.nativa.conferirPrazo(autor.login);
    return resultado;
  });
}

/** O titular retira somente o vínculo comercial de um adulto, nunca seus dados. */
export async function retirarAdultoDoGrupoNoBanco(
  autor: AutorNativoRecente,
  pedido: RetiradaDeAdulto,
) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, pedido.grupoId, "update");
    const alvo = atual.perfis.find((p) => p.id === pedido.perfilId);
    if (!alvo) {
      await atual.nativa.conferirPrazo(autor.login);
      return { alterado: false as const };
    }
    assertAllowed(alvo.kind === "adult", "PERFIL", "Perfil não disponível.");
    const resultado = await desvincularAdulto(
      tx,
      autor,
      alvo,
      pedido.versao,
      "titular",
      await atual.nativa.conferirPrazo(autor.login),
    );
    await atual.nativa.conferirPrazo(autor.login);
    return resultado;
  });
}
