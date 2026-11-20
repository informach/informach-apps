import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, sql } from "@informach/db";
import {
  recreioRightsRecoveryEvaluations as evaluations,
  recreioRightsOperations as operations,
  recreioRightsRecoveryRuns as runs,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { conferirReciboDaAvaliacao } from "./avaliacao-recuperada-repository";
import { conferirConclusaoDosPerfis } from "./conclusao-perfis-repository";
import {
  bancoDaCoordenacao,
  type CoordenacaoDeEfeitos,
  comOperacaoPrivadaDeDireitos,
  comVerificacaoFinalPrivada,
  conferirCoordenacaoDeDireitos,
  conferirIntencaoDaCoordenacao,
  dadosDaCoordenacaoPrivada,
} from "./coordenacao-repository";

async function limitar(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

/** Verification of one actual completed withdrawal, including its native
 * conclusion/retention checks. Never changes original operation timestamps or
 * treats a merely ready receipt as completed work. */
export async function verificarRetiradaRecuperada(
  config: CoordenacaoDeEfeitos,
  operacaoId: string,
) {
  const dados = dadosDaCoordenacaoPrivada(config);
  return comOperacaoPrivadaDeDireitos(config, operacaoId, (filha) =>
    bancoDaCoordenacao(filha).transaction(async (tx) => {
      await limitar(tx);
      const [op] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, operacaoId))
        .for("update");
      assertAllowed(
        op &&
          op.kind === "retirar_perfil" &&
          op.state === "completed" &&
          op.completedAt !== null &&
          op.leaseToken === null &&
          op.leaseUntil === null,
        "DIREITOS_DEPENDENCIA",
        "A retirada histórica ainda precisa terminar.",
      );
      await conferirIntencaoDaCoordenacao(tx, op, filha);
      const alvos = await tx
        .select()
        .from(subjects)
        .where(eq(subjects.operationId, op.id))
        .orderBy(subjects.profileReference)
        .for("share");
      await conferirConclusaoDosPerfis(tx, op, alvos);
      const [restante] = await tx.execute(sql`select 1 from recreio.rights_subjects s
        where s.operation_id=${op.id}::uuid and (
          exists(select 1 from recreio.profile_data_keys k where k.profile_id=s.profile_reference) or
          exists(select 1 from recreio.profile_data_versions v where v.profile_id=s.profile_reference) or
          exists(select 1 from recreio.profile_achievements a where a.profile_id=s.profile_reference)) limit 1`);
      assertAllowed(!restante, "DIREITOS_INTEGRIDADE", "Ainda existem dados opacos da seleção.");
      const [avaliacao] = await tx
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.runId, dados.execucaoId), eq(evaluations.operationId, op.id)))
        .for("update");
      assertAllowed(avaliacao, "DIREITOS_INTEGRIDADE", "Avaliação da retirada ausente.");
      conferirReciboDaAvaliacao(avaliacao, op);
      if (avaliacao.state === "verified")
        return { situacao: "verificada" as const, operacaoId, jaVerificada: true };
      await tx
        .update(evaluations)
        .set({ state: "verified", verifiedAt: AGORA })
        .where(
          and(
            eq(evaluations.runId, dados.execucaoId),
            eq(evaluations.operationId, op.id),
            eq(evaluations.state, "ready"),
          ),
        );
      await logAuditEventStrict(
        "recreio.rights_recovery_operation_verified",
        null,
        { app: "recreio", runId: dados.execucaoId, operationId: op.id, kind: op.kind },
        { writer: tx },
      );
      conferirCoordenacaoDeDireitos(filha);
      return { situacao: "verificada" as const, operacaoId, jaVerificada: false };
    }),
  );
}

/** Terminal receipt for rights-withdrawal replay only. It does not admit
 * traffic, settle finance, normalize current identities, rotate credentials or
 * declare the complete production recovery verified. */
export async function verificarReaplicacaoDeRetiradas(config: CoordenacaoDeEfeitos) {
  return comVerificacaoFinalPrivada(config, async (dados) => {
    const head = await dados.storage.lerCabecalho(dados.signal);
    assertAllowed(
      head.sha256 === dados.cerca && head.documento.estado === "congelado",
      "DIREITOS_LIVRO",
      "A cerca mudou antes da verificação final.",
    );
    const recibo = await dados.banco.transaction(async (tx) => {
      await limitar(tx);
      const [run] = await tx.select().from(runs).where(eq(runs.id, dados.execucaoId)).for("update");
      assertAllowed(
        run &&
          run.state === "replaying" &&
          run.frozenHeadSha256 === dados.cerca &&
          run.ledgerId === config.assinatura.livroId,
        "DIREITOS_INTEGRIDADE",
        "Execução fora da cerca atual.",
      );
      // Another private pool may already own a worker reservation. Lock the
      // complete current selection in deterministic order before its final
      // assessment; a completed row's original dates are never updated here.
      await tx.execute(sql`select count(*) from (
        select o.id from recreio.rights_operations o join recreio.rights_recovery_evaluations e
          on e.operation_id=o.id where e.run_id=${run.id}::uuid order by o.id for update of o
        ) locked`);
      const [pendente] = await tx.execute(sql`select 1 from recreio.rights_recovery_evaluations e
        left join recreio.rights_operations o on o.id=e.operation_id
        where e.run_id=${run.id}::uuid and (e.kind<>'retirar_perfil' or e.state<>'verified' or
          e.verified_at is null or o.id is null or o.kind<>e.kind or o.ledger_id<>e.ledger_id or
          o.requester_user_id<>e.requester_reference or o.plan_sha256<>e.plan_sha256 or
          o.state<>'completed' or o.completed_at is null or o.lease_token is not null or o.lease_until is not null or
          o.intent_sha256 is distinct from e.intent_sha256 or
          o.admitted_head_sha256 is distinct from e.admitted_head_sha256 or
          o.preparation_id is distinct from e.preparation_reference or
          o.recovery_source_id is distinct from e.recovery_source_reference or
          exists(select 1 from recreio.rights_subjects s where s.operation_id=o.id and
            (s.phase not in ('removed','minimized') or (s.phase='minimized' and s.retained_until<=statement_timestamp()))) or
          exists(select 1 from recreio.rights_worlds w where w.operation_id=o.id and w.phase<>'completed')) limit 1`);
      assertAllowed(
        !pendente,
        "DIREITOS_DEPENDENCIA",
        "Ainda existem decisões ou retenções pendentes.",
      );
      const [resumo] = await tx.execute<{
        quantidade: number;
        sha256: string;
      }>(sql`select count(*)::int as quantidade,
        encode(sha256(convert_to(jsonb_build_object('runId',${run.id}::text,'capture',${run.captureSha256}::text,
          'fence',${run.frozenHeadSha256}::text,'source',${run.source}::text,'scope','withdrawals',
          'evaluations',coalesce(jsonb_agg(jsonb_build_array(e.operation_id,e.ledger_id,e.requester_reference,
            e.kind,e.plan_sha256,e.origin,e.preparation_reference,e.recovery_source_reference,e.admitted_head_sha256,
            e.intent_sha256,e.ready_at,e.verified_at,encode(sha256(convert_to(e.world_map::text,'UTF8')),'hex'))
            order by e.operation_id),'[]'::jsonb))::text,'UTF8')),'hex') as sha256
        from recreio.rights_recovery_evaluations e where e.run_id=${run.id}::uuid`);
      assertAllowed(
        resumo &&
          resumo.quantidade === config.prova.referencias.length &&
          /^[a-f0-9]{64}$/.test(resumo.sha256),
        "DIREITOS_INTEGRIDADE",
        "Avaliações fora do prefixo completo.",
      );
      await tx
        .update(runs)
        .set({ state: "verified", receiptSha256: resumo.sha256, verifiedAt: AGORA })
        .where(and(eq(runs.id, run.id), eq(runs.state, "replaying")));
      await logAuditEventStrict(
        "recreio.rights_recovery_verified",
        null,
        { app: "recreio", runId: run.id, operationCount: resumo.quantidade, state: "verified" },
        { writer: tx },
      );
      conferirCoordenacaoDeDireitos(config);
      return {
        execucaoId: run.id,
        reciboSha256: resumo.sha256,
        operacoesVerificadas: resumo.quantidade,
        escopo: "retiradas" as const,
        trafegoAutorizado: false as const,
      };
    });
    const atual = await dados.storage.lerCabecalho(dados.signal);
    assertAllowed(
      atual.sha256 === dados.cerca,
      "DIREITOS_LIVRO",
      "A cerca mudou após a verificação final.",
    );
    return recibo;
  });
}
