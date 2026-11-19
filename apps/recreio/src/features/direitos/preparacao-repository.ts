import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioSpaceMembers as members,
  recreioRightsPreparations as preparations,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
  users,
} from "@informach/db/schema";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  lerContaNativa,
} from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  type PedidoDePreparacaoDeDireitos,
  type PlanoDeDireitos,
  PlanoDeDireitosSchema,
  type ReferenciaDaPreparacao,
} from "./preparacao-contrato";

const SHA = (plano: PlanoDeDireitos) =>
  createHash("sha256").update(JSON.stringify(plano)).digest("hex");
function ausente(valor: unknown): asserts valor {
  assertAllowed(valor, "DIREITOS", "Preparação não disponível. Faça uma nova prévia.");
}

/** Só uma prévia. Não toma posse de mundos, não congela writers, não publica
 * intenção e não consome consentimento. A confirmação terá de reconstruir e
 * comparar este plano sob as travas de execução antes de produzir efeitos. */
async function montarPlano(
  tx: Transacao,
  autor: AutorNativoRecente,
  pedido: PedidoDePreparacaoDeDireitos,
): Promise<PlanoDeDireitos> {
  await lerContaNativa(tx, autor.contaId);
  // Ordem comum da autoridade: conta → adulto próprio → alvos → responsáveis → aparelho.
  const proprios = await tx
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")))
    .for("share");
  const alvos = pedido.perfis.length
    ? await tx
        .select()
        .from(profiles)
        .where(inArray(profiles.id, pedido.perfis))
        .orderBy(profiles.id)
        .for("share")
    : [];
  const vinculos = pedido.perfis.length
    ? await tx
        .select()
        .from(guardians)
        .where(inArray(guardians.profileId, pedido.perfis))
        .orderBy(guardians.profileId)
        .for("share")
    : [];
  assertAllowed(
    alvos.length === pedido.perfis.length &&
      alvos.every((p) =>
        p.kind === "adult"
          ? p.userId === autor.contaId
          : vinculos.some((v) => v.profileId === p.id && v.guardianUserId === autor.contaId),
      ),
    "PERFIL",
    "Perfil não disponível.",
  );
  if (pedido.tipo === "encerrar_conta") {
    const responsabilidades = await tx
      .select({ id: guardians.profileId })
      .from(guardians)
      .where(eq(guardians.guardianUserId, autor.contaId))
      .orderBy(guardians.profileId)
      .limit(257);
    const esperados = [...proprios.map((p) => p.id), ...responsabilidades.map((p) => p.id)].sort();
    assertAllowed(
      esperados.length <= 256 &&
        esperados.length === pedido.perfis.length &&
        esperados.every((id, i) => id === pedido.perfis[i]),
      "ESCOPO",
      "Confira todos os perfis próprios e responsabilidades antes de encerrar o Recreio.",
    );
  }
  const linhas = pedido.perfis.length
    ? await tx
        .select({
          id: spaces.id,
          jogo: spaces.gameId,
          revisao: spaces.revision,
          diario: spaces.journalSeq,
          gestao: spaces.managementRevision,
          cerca: spaces.leaseEpoch,
          estado: spaces.status,
          outrosParticipantes: sql<number>`(select count(*) from ${members} as outros
      where outros.space_id=${spaces.id} and outros.profile_id is not null
      and outros.profile_id not in (${sql.join(
        pedido.perfis.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}))`.mapWith(Number),
        })
        .from(spaces)
        .where(
          or(
            inArray(spaces.stewardProfileId, pedido.perfis),
            inArray(spaces.createdByProfileId, pedido.perfis),
            sql`exists(select 1 from ${members} where ${members.spaceId}=${spaces.id}
      and ${inArray(members.profileId, pedido.perfis)})`,
          ),
        )
        .orderBy(spaces.id)
        .limit(513)
    : [];
  assertAllowed(linhas.length <= 512, "LIMITE", "Este pedido exige preparação pelo suporte.");
  const nativa = await autorizarContaNativa(tx, autor);
  await nativa.conferirPrazo(autor.login);
  return PlanoDeDireitosSchema.parse({
    formato: "recreio-previa-direitos-v1",
    tipo: pedido.tipo,
    contaId: autor.contaId,
    perfis: alvos.map((p) => ({
      id: p.id,
      tipo: p.kind,
      versao: p.policyVersion,
      responsabilidadeId:
        p.kind === "minor" ? vinculos.find((v) => v.profileId === p.id)?.id : null,
    })),
    mundos: linhas,
    identidadeGlobalPreservada: true,
    financeiroSeparado: true,
  });
}

async function limitarTransacao(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

export function prepararDireitosNoBanco(
  autor: AutorNativoRecente,
  pedido: PedidoDePreparacaoDeDireitos,
) {
  return db.transaction(async (tx) => {
    await limitarTransacao(tx);
    const plano = await montarPlano(tx, autor, pedido);
    const [{ quantidade } = { quantidade: 3 }] = await tx
      .select({ quantidade: sql<number>`count(*)`.mapWith(Number) })
      .from(preparations)
      .where(
        and(
          eq(preparations.requesterUserId, autor.contaId),
          isNull(preparations.cancelledAt),
          sql`${preparations.expiresAt}>${AGORA}`,
        ),
      );
    assertAllowed(quantidade < 3, "LIMITE", "Cancele uma prévia anterior antes de preparar outra.");
    const [relogio] = await tx
      .select({ instante: sql<Date>`${AGORA}`.mapWith(preparations.createdAt) })
      .from(users)
      .where(eq(users.id, autor.contaId));
    ausente(relogio);
    const criadoEm = new Date(relogio.instante);
    const planoSha256 = SHA(plano);
    assertAllowed(
      Buffer.byteLength(JSON.stringify(plano)) <= 200_000,
      "LIMITE",
      "Pedido muito grande.",
    );
    const [linha] = await tx
      .insert(preparations)
      .values({
        requesterUserId: autor.contaId,
        kind: pedido.tipo,
        plan: plano,
        planSha256: planoSha256,
        createdAt: criadoEm,
        expiresAt: new Date(criadoEm.getTime() + 30 * 60_000),
      })
      .returning({ id: preparations.id, expiresAt: preparations.expiresAt });
    ausente(linha);
    await logAuditEventStrict(
      "recreio.rights_prepared",
      autor.contaId,
      {
        app: "recreio",
        preparationId: linha.id,
        kind: pedido.tipo,
        profileCount: plano.perfis.length,
        worldCount: plano.mundos.length,
      },
      { writer: tx },
    );
    const nativa = await autorizarContaNativa(tx, autor);
    await nativa.conferirPrazo(autor.login);
    return {
      preparacaoId: linha.id,
      planoSha256,
      expiraEm: linha.expiresAt.toISOString(),
      plano,
    };
  });
}

/** Cancelamento só da prévia. Nenhuma intenção externa ou exclusão é produzida
 * por este repositório; não usar esta operação para desfazer consentimento. */
export function cancelarPreparacaoNoBanco(
  autor: AutorNativoRecente,
  referencia: ReferenciaDaPreparacao,
) {
  return db.transaction(async (tx) => {
    await limitarTransacao(tx);
    await lerContaNativa(tx, autor.contaId);
    const [linha] = await tx
      .select()
      .from(preparations)
      .where(
        and(
          eq(preparations.id, referencia.preparacaoId),
          eq(preparations.requesterUserId, autor.contaId),
          eq(preparations.planSha256, referencia.planoSha256),
        ),
      )
      .for("update");
    ausente(linha);
    const plano = PlanoDeDireitosSchema.parse(linha.plan);
    ausente(
      plano.contaId === autor.contaId &&
        plano.tipo === linha.kind &&
        SHA(plano) === linha.planSha256,
    );
    const nativa = await autorizarContaNativa(tx, autor);
    const agora = await nativa.conferirPrazo(autor.login);
    if (linha.cancelledAt !== null) return { cancelada: true as const };
    await tx.update(preparations).set({ cancelledAt: agora }).where(eq(preparations.id, linha.id));
    await logAuditEventStrict(
      "recreio.rights_preparation_cancelled",
      autor.contaId,
      { app: "recreio", preparationId: linha.id, kind: linha.kind },
      { writer: tx },
    );
    await nativa.conferirPrazo(autor.login);
    return { cancelada: true as const };
  });
}
