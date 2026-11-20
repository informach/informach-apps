import "server-only";
import { isDeepStrictEqual } from "node:util";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, inArray, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import { AGORA, travar } from "@/lib/repository";
import { type CoordenacaoDeEfeitos, dadosDaCoordenacaoPrivada } from "./coordenacao-repository";
import {
  conferirIntencaoHistoricaRecuperada,
  conferirMapaHistoricoDeMundos,
} from "./fonte-intencao-repository";
import { resumoDoRegistro } from "./livro/assinatura";
import { conferirEscopoDoPlanoExterno } from "./livro/plano-externo";
import { lerPlanoDeDireitos } from "./plano-persistido";
import {
  congelarSelecaoDeDireitos,
  inspecionarDrenagemDaSelecao,
} from "./selecao-congelamento-repository";

/** Fixed private admission, not an interactive consent or an operator login.
 * Reuses original MAC bytes/dates and native SQL preparation. Missing subjects
 * have explicit absence receipts; absent worlds remain in the complete source
 * map. Existing native-origin operations require their own reconciliation and
 * are deliberately not rewritten by this first admission profile. */
export async function admitirRetiradaHistoricaRecuperada(
  config: CoordenacaoDeEfeitos,
  entrada: string,
) {
  const operacaoId = z.uuid().parse(entrada),
    privado = dadosDaCoordenacaoPrivada(config),
    ref = config.prova.referencias.find((r) => r.operacaoId === operacaoId);
  assertAllowed(ref, "DIREITOS_LIVRO", "Operação fora do prefixo histórico.");
  const registro = await privado.storage.lerRegistroDaIntencaoReferencia(ref, privado.signal);
  try {
    const autenticada = config.assinatura.lerIntencaoAssinada(registro.bytes),
      i = autenticada.documento;
    assertAllowed(
      i.tipo === "retirar_perfil" &&
        i.operacaoId === operacaoId &&
        i.revisao === 1 &&
        autenticada.chaveId === registro.chaveId &&
        isDeepStrictEqual(i, registro.documento) &&
        resumoDoRegistro(registro.bytes) === ref.sha256,
      "DIREITOS_INTEGRIDADE",
      "Intenção histórica divergente.",
    );
    return await privado.banco.transaction(async (tx) => {
      dadosDaCoordenacaoPrivada(config);
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await travar(tx, `recreio:direitos:preparacao:${operacaoId}`);
      const [execucao] = await tx
        .select()
        .from(runs)
        .where(eq(runs.id, privado.execucaoId))
        .for("share");
      assertAllowed(
        execucao &&
          execucao.state === "replaying" &&
          execucao.frozenHeadSha256 === privado.cerca &&
          execucao.ledgerId === i.livroId,
        "DIREITOS_INTEGRIDADE",
        "A execução histórica mudou.",
      );
      const [fonte] = await tx
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.operationId, operacaoId),
            eq(sources.runId, privado.execucaoId),
            eq(sources.ledgerId, i.livroId),
          ),
        )
        .for("share");
      assertAllowed(
        fonte &&
          fonte.planSha256 === i.planoSha256 &&
          fonte.kind === i.tipo &&
          fonte.requesterReference === i.contaId,
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
      const mapa = await conferirMapaHistoricoDeMundos(tx, plano, fonte.worldMap);
      const [anterior] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, operacaoId))
        .for("update");
      if (anterior) {
        assertAllowed(
          anterior.preparationId === null && anterior.recoverySourceId === operacaoId,
          "DIREITOS_DEPENDENCIA",
          "A origem nativa existente precisa de conciliação histórica.",
        );
        const lida = await conferirIntencaoHistoricaRecuperada(tx, anterior, config.assinatura);
        assertAllowed(
          lida.execucao.id === privado.execucaoId && anterior.signedIntent.equals(registro.bytes),
          "DIREITOS_INTEGRIDADE",
          "A admissão anterior diverge do registro original.",
        );
        return { situacao: "existente" as const, operacaoId };
      }
      const ids = plano.perfis.map((p) => p.id),
        idsMundos = mapa.filter((m) => m.mundoVivoId !== null).map((m) => m.mundoReferencia);
      const idsSql = sql`array[${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]::uuid[]`,
        mundosSql = sql`array[${sql.join(
          plano.mundos.map((m) => sql`${m.id}::uuid`),
          sql`, `,
        )}]::uuid[]`;
      // Never silently widen/truncate the signed world scope when an older
      // backup contains another trace, membership or stewardship reference.
      const [extra] = await tx.execute<{ id: string }>(sql`select w.id from recreio.spaces w
        where not(w.id=any(${mundosSql})) and (
          w.steward_profile_id=any(${idsSql}) or w.created_by_profile_id=any(${idsSql}) or
          exists(select 1 from recreio.space_members m where m.space_id=w.id and m.profile_id=any(${idsSql})) or
          exists(select 1 from recreio.profile_world_traces t where t.space_id=w.id and t.profile_id=any(${idsSql})))
        order by w.id limit 1`);
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
              (s) => s.id === p.id && s.tipo === p.kind && p.policyVersion <= s.versao,
            ) &&
            (p.kind === "adult"
              ? p.userId === i.contaId
              : vinculos.some((g) => g.profileId === p.id)),
        ),
        "DIREITOS_DEPENDENCIA",
        "O cadastro do backup exige conciliação antes da retirada.",
      );
      const drenando = await inspecionarDrenagemDaSelecao(tx, ids, mundos);
      dadosDaCoordenacaoPrivada(config);
      const [op] = await tx
        .insert(operations)
        .values({
          id: operacaoId,
          preparationId: null,
          recoverySourceId: operacaoId,
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
      await congelarSelecaoDeDireitos(tx, { operacaoId, plano, alvos, mundos, drenando });
      const ausentes = plano.perfis.filter((s) => !alvos.some((p) => p.id === s.id));
      if (ausentes.length)
        await tx.insert(subjects).values(
          ausentes.map((s) => ({
            operationId: operacaoId,
            profileReference: s.id,
            liveProfileId: null,
            policyVersion: s.versao,
            guardianReference: s.responsabilidadeId,
            phase: "removed" as const,
            minimizedAt: sql`statement_timestamp()`,
            completedAt: sql`statement_timestamp()`,
            retentionPolicyVersion: "perfil-2026-11-19" as const,
          })),
        );
      await conferirIntencaoHistoricaRecuperada(tx, op, config.assinatura);
      await logAuditEventStrict(
        "recreio.rights_historical_admitted",
        i.contaId,
        {
          app: "recreio",
          operationId: operacaoId,
          kind: i.tipo,
          profileCount: ids.length,
          worldCount: mapa.length,
          absentProfileCount: ausentes.length,
          absentWorldCount: mapa.filter((m) => m.mundoVivoId === null).length,
        },
        { writer: tx },
      );
      dadosDaCoordenacaoPrivada(config);
      return { situacao: "admitida" as const, operacaoId };
    });
  } finally {
    registro.bytes.fill(0);
  }
}
