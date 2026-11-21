import "server-only";
import { isDeepStrictEqual } from "node:util";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, inArray, sql } from "@informach/db";
import {
  recreioRightsRecoveryEvaluations as evaluations,
  recreioAccountClosureFinances as finances,
  recreioGuardianLinks as guardians,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioProfiles as profiles,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  users,
} from "@informach/db/schema";
import { ContaIdSchema } from "@informach/recreio";
import { z } from "zod";
import { serializarContaNativa } from "@/features/account/serializacao-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import {
  type CoordenacaoDeEfeitos,
  conferirAdmissaoPersistidaDaCoordenacao,
  dadosDaCoordenacaoPrivada,
  reconferirCoordenacaoDeDireitos,
} from "./coordenacao-repository";
import { conferirNascimentoFinanceiroDoEncerramento } from "./encerramento-financeiro-nascimento-repository";
import { lerOrigemFinanceiraDoEncerramentoLocked } from "./encerramento-origem-financeira-repository";
import { conferirMapaHistoricoDeMundos } from "./fonte-intencao-repository";
import { resumoDoRegistro } from "./livro/assinatura";
import { conferirEscopoDoPlanoExterno } from "./livro/plano-externo";
import { lerPlanoDeDireitos } from "./plano-persistido";
import {
  congelarSelecaoDeDireitos,
  inspecionarDrenagemDaSelecao,
} from "./selecao-congelamento-repository";

/** Lost operation, authenticated consent: initial qualified profile is an
 * existing account and no local contracts or unsent requests. Does not
 * create identity/native preparation, backdate finance, mark data readiness,
 * or infer the absence of current global/provider changes. */
export async function prepararEncerramentoAusenteRecuperado(
  config: CoordenacaoDeEfeitos,
  entrada: string,
) {
  const id = z.uuid().parse(entrada),
    privado = dadosDaCoordenacaoPrivada(config);
  const ref = config.prova.referencias.find((r) => r.operacaoId === id);
  assertAllowed(ref, "DIREITOS_LIVRO", "Operação fora do prefixo histórico.");
  const registro = await privado.storage.lerRegistroDaIntencaoReferencia(ref, privado.signal);
  try {
    const assinada = config.assinatura.lerIntencaoAssinada(registro.bytes),
      i = assinada.documento;
    assertAllowed(
      i.tipo === "encerrar_conta" &&
        i.operacaoId === id &&
        i.revisao === 1 &&
        assinada.chaveId === registro.chaveId &&
        isDeepStrictEqual(i, registro.documento) &&
        resumoDoRegistro(registro.bytes) === ref.sha256,
      "DIREITOS_INTEGRIDADE",
      "Intenção histórica divergente.",
    );
    const resultado = await privado.banco.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      await tx.execute(sql`set local transaction_timeout='15s'`);
      const [run] = await tx
        .select()
        .from(runs)
        .where(and(eq(runs.id, privado.execucaoId), eq(runs.ledgerId, i.livroId)))
        .for("share");
      assertAllowed(
        run?.state === "replaying" && run.frozenHeadSha256 === privado.cerca,
        "DIREITOS_INTEGRIDADE",
        "A execução histórica mudou.",
      );
      const [fonte] = await tx
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.operationId, id),
            eq(sources.ledgerId, i.livroId),
            eq(sources.requesterReference, i.contaId),
            eq(sources.kind, "encerrar_conta"),
            eq(sources.planSha256, i.planoSha256),
          ),
        )
        .for("share");
      const [avaliacao] = await tx
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.runId, run.id), eq(evaluations.operationId, id)))
        .for("update");
      assertAllowed(
        fonte &&
          avaliacao &&
          avaliacao.kind === "encerrar_conta" &&
          avaliacao.planSha256 === i.planoSha256 &&
          avaliacao.requesterReference === i.contaId &&
          avaliacao.ledgerId === i.livroId,
        "DIREITOS_INTEGRIDADE",
        "Fonte histórica fora do escopo.",
      );
      const plano = lerPlanoDeDireitos(
        {
          requesterUserId: fonte.requesterReference,
          kind: fonte.kind,
          planSha256: fonte.planSha256,
          plan: fonte.plan,
        },
        i.contaId,
      );
      conferirEscopoDoPlanoExterno(i, plano);
      assertAllowed(
        plano.formato === "recreio-previa-encerramento-v2" &&
          plano.financeiro.comprasNaoEnviadas.length === 0 &&
          plano.financeiro.trocasNaoEnviadas.length === 0,
        "DIREITOS_DEPENDENCIA",
        "O encerramento ausente exige conciliação fora deste perfil.",
      );
      const mapa = await conferirMapaHistoricoDeMundos(tx, plano, avaliacao.worldMap);
      await serializarContaNativa(tx, ContaIdSchema.parse(i.contaId));
      const [conta] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, i.contaId))
        .for("update");
      assertAllowed(conta, "DIREITOS_DEPENDENCIA", "A identidade ausente exige conciliação atual.");
      const [anterior] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, id))
        .for("update");
      if (anterior) {
        assertAllowed(
          anterior.preparationId === null &&
            anterior.recoverySourceId === id &&
            anterior.signedIntent.equals(registro.bytes),
          "DIREITOS_INTEGRIDADE",
          "A operação existente não nasceu desta recuperação.",
        );
        await conferirAdmissaoPersistidaDaCoordenacao(tx, config, anterior);
        const [financeiro] = await tx
          .select()
          .from(finances)
          .where(eq(finances.operationId, id))
          .for("share");
        const [participacao] = await tx
          .select()
          .from(participations)
          .where(and(eq(participations.userId, i.contaId), eq(participations.operationId, id)))
          .for("share");
        assertAllowed(
          financeiro && participacao,
          "DIREITOS_INTEGRIDADE",
          "A preparação recuperada exige revisão.",
        );
        await conferirNascimentoFinanceiroDoEncerramento(tx, anterior, financeiro);
        return { operacaoId: id, jaPreparada: true, dadosAdmitidos: false as const };
      }
      assertAllowed(
        fonte.runId === run.id && avaliacao.state === "staged" && avaliacao.readyAt === null,
        "DIREITOS_INTEGRIDADE",
        "Avaliação histórica fora da preparação inicial.",
      );
      const [participacao] = await tx
        .select()
        .from(participations)
        .where(eq(participations.userId, i.contaId))
        .for("update");
      assertAllowed(
        participacao
          ? participacao.state === "active" && participacao.revision === plano.revisaoDaParticipacao
          : plano.revisaoDaParticipacao === 0,
        "DIREITOS_DEPENDENCIA",
        "A participação do backup exige conciliação.",
      );
      const ids = plano.perfis.map((p) => p.id),
        idsMundos = mapa.filter((m) => m.mundoVivoId !== null).map((m) => m.mundoReferencia);
      const perfisSql = sql`array[${sql.join(
        ids.map((p) => sql`${p}::uuid`),
        sql`, `,
      )}]::uuid[]`;
      const mundosSql = sql`array[${sql.join(
        plano.mundos.map((m) => sql`${m.id}::uuid`),
        sql`, `,
      )}]::uuid[]`;
      const [perfil] = await tx.execute(
        sql`select 1 from recreio.profiles p where not(p.id=any(${perfisSql})) and (p.user_id=${i.contaId} or exists(select 1 from recreio.guardian_links g where g.profile_id=p.id and g.guardian_user_id=${i.contaId})) limit 1`,
      );
      assertAllowed(
        !perfil,
        "DIREITOS_DEPENDENCIA",
        "O backup contém perfis pessoais fora da seleção histórica.",
      );
      const [extra] = await tx.execute(
        sql`select 1 from recreio.spaces w where not(w.id=any(${mundosSql})) and (w.steward_profile_id=any(${perfisSql}) or w.created_by_profile_id=any(${perfisSql}) or exists(select 1 from recreio.space_members m where m.space_id=w.id and m.profile_id=any(${perfisSql})) or exists(select 1 from recreio.profile_world_traces t where t.space_id=w.id and t.profile_id=any(${perfisSql}))) limit 1`,
      );
      assertAllowed(
        !extra,
        "DIREITOS_DEPENDENCIA",
        "O backup contém mundo pessoal fora da seleção histórica.",
      );
      const mundos = idsMundos.length
        ? await tx
            .select()
            .from(spaces)
            .where(inArray(spaces.id, idsMundos))
            .orderBy(spaces.id)
            .for("update")
        : [];
      const alvos = ids.length
        ? await tx
            .select()
            .from(profiles)
            .where(inArray(profiles.id, ids))
            .orderBy(profiles.id)
            .for("update")
        : [];
      const vinculos = ids.length
        ? await tx
            .select()
            .from(guardians)
            .where(inArray(guardians.profileId, ids))
            .orderBy(guardians.profileId)
            .for("share")
        : [];
      assertAllowed(
        alvos.every(
          (p) =>
            p.rightsOperationId === null &&
            plano.perfis.some(
              (s) =>
                s.id === p.id &&
                s.tipo === p.kind &&
                p.policyVersion <= s.versao &&
                (p.kind === "adult"
                  ? p.userId === i.contaId
                  : vinculos.some(
                      (g) =>
                        g.profileId === p.id &&
                        g.id === s.responsabilidadeId &&
                        g.guardianUserId === i.contaId,
                    )),
            ),
        ),
        "DIREITOS_DEPENDENCIA",
        "O cadastro do backup exige conciliação antes da retirada.",
      );
      assertAllowed(
        mundos.every((m) => !ids.some((p) => p === m.stewardProfileId)),
        "DIREITOS_DEPENDENCIA",
        "A responsabilidade pelo mundo exige conciliação e aceite próprios.",
      );
      const drenando = await inspecionarDrenagemDaSelecao(tx, ids, mundos);
      const origem = await lerOrigemFinanceiraDoEncerramentoLocked(tx, plano);
      assertAllowed(
        !origem.checkout && origem.assinaturas.length === 0,
        "DIREITOS_DEPENDENCIA",
        "O financeiro do backup exige conciliação.",
      );
      const [op] = await tx
        .insert(operations)
        .values({
          id,
          preparationId: null,
          recoverySourceId: id,
          requesterUserId: i.contaId,
          planSha256: i.planoSha256,
          kind: i.tipo,
          revision: i.revisao,
          ledgerId: i.livroId,
          ledgerEpoch: i.epoca,
          signingKeyId: registro.chaveId,
          source: i.fonte,
          signedIntent: registro.bytes,
          intentSha256: ref.sha256,
          authenticatedAt: new Date(i.autenticadaEm),
          consentedAt: new Date(i.consentidaEm),
          createdAt: new Date(i.consentidaEm),
          updatedAt: AGORA,
          nextAttemptAt: AGORA,
          state: "admitted",
          admittedHeadSha256: privado.cerca,
          admittedAt: AGORA,
        })
        .returning();
      assertAllowed(op, "DIREITOS_INTEGRIDADE", "Admissão histórica indisponível.");
      await congelarSelecaoDeDireitos(tx, { operacaoId: id, plano, alvos, mundos, drenando });
      const ausentes = plano.perfis.filter((s) => !alvos.some((p) => p.id === s.id));
      if (ausentes.length)
        await tx.insert(subjects).values(
          ausentes.map((s) => ({
            operationId: id,
            profileReference: s.id,
            liveProfileId: null,
            policyVersion: s.versao,
            guardianReference: s.responsabilidadeId,
            phase: "removed" as const,
            minimizedAt: AGORA,
            completedAt: AGORA,
            retentionPolicyVersion: "perfil-2026-11-19" as const,
          })),
        );
      const [relogio] = await tx.execute<{ agora: string }>(
        sql`select clock_timestamp()::text as agora`,
      );
      assertAllowed(
        relogio && typeof relogio.agora === "string",
        "DIREITOS_INTEGRIDADE",
        "Relógio financeiro indisponível.",
      );
      const agora = sql`${relogio.agora}::timestamptz`;
      const cliente = plano.financeiro.clientes[0];
      await tx.insert(finances).values({
        operationId: id,
        requesterUserId: i.contaId,
        providerMode: plano.financeiro.modo,
        customerId: cliente?.id ?? null,
        providerCustomerId: cliente?.referenciaStripe ?? null,
        policyVersion: "encerramento-financeiro-2026-11-19-v1",
        state: "pending",
        attempts: 0,
        createdAt: agora,
        updatedAt: agora,
        nextAttemptAt: agora,
      });
      const [iniciada] = await tx
        .insert(participations)
        .values({
          userId: i.contaId,
          state: "closing",
          revision: 2,
          operationId: id,
          closingAt: agora,
          updatedAt: agora,
        })
        .onConflictDoUpdate({
          target: participations.userId,
          set: {
            state: "closing",
            revision: 2,
            operationId: id,
            closingAt: agora,
            closedAt: null,
            updatedAt: agora,
          },
          setWhere: and(
            eq(participations.state, "active"),
            eq(participations.revision, plano.revisaoDaParticipacao),
          ),
        })
        .returning();
      assertAllowed(iniciada, "DIREITOS_INTEGRIDADE", "A participação mudou durante a preparação.");
      await conferirAdmissaoPersistidaDaCoordenacao(tx, config, op);
      await logAuditEventStrict(
        "recreio.account_participation_closing",
        i.contaId,
        { app: "recreio", operationId: id, state: "closing", revision: 2 },
        { writer: tx },
      );
      await logAuditEventStrict(
        "recreio.rights_historical_admitted",
        i.contaId,
        {
          app: "recreio",
          operationId: id,
          kind: i.tipo,
          profileCount: ids.length,
          worldCount: mapa.length,
          absentProfileCount: ausentes.length,
          absentWorldCount: mapa.filter((m) => m.mundoVivoId === null).length,
        },
        { writer: tx },
      );
      dadosDaCoordenacaoPrivada(config);
      return { operacaoId: id, jaPreparada: false, dadosAdmitidos: false as const };
    });
    await reconferirCoordenacaoDeDireitos(config, privado.storage);
    return resultado;
  } finally {
    registro.bytes.fill(0);
  }
}
