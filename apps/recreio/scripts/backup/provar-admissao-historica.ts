import { randomUUID } from "node:crypto";
import { type Database, eq } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import type postgres from "postgres";
import { admitirRetiradaHistoricaRecuperada } from "../../src/features/direitos/admissao-recuperada-repository";
import {
  autoridadeDoPerfilCongelado,
  type CoordenacaoDeEfeitos,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { minimizarProximoPerfil } from "../../src/features/direitos/minimizacao-repository";
import { PlanoDeDireitosSchema } from "../../src/features/direitos/preparacao-contrato";
import { AppError } from "../../src/lib/errors";
import { exigir, FalhaDaProva } from "./provas-arquivos";

/** Qualification fixture: a real child already in the backup, a later signed
 * responsibility reference and a requester absent from that backup. The MAC
 * fixture is not a native adult consent. Only freeze/admission is exercised;
 * no personal eraser runs and no guardian or account is created/reassigned. */
export async function prepararProvaDeAdmissaoHistorica(copia: postgres.Sql, solicitante: string) {
  const [original] = await copia.unsafe<
    {
      id: string;
      policy_version: number;
      status: string;
      updated_at: string;
      guardian_id: string;
      guardian_user_id: string;
    }[]
  >(`select
    p.id,p.policy_version,p.status,p.updated_at::text as updated_at,
    g.id as guardian_id,g.guardian_user_id from recreio.profiles p
    join recreio.guardian_links g on g.profile_id=p.id
    where p.kind='minor' and p.rights_operation_id is null and
      not exists(select 1 from recreio.space_members m where m.profile_id=p.id) and
      not exists(select 1 from recreio.profile_world_traces t where t.profile_id=p.id) and
      not exists(select 1 from recreio.spaces w where w.steward_profile_id=p.id or w.created_by_profile_id=p.id)
    order by p.id limit 1`);
  if (!original) throw new FalhaDaProva("PERFIL_HISTORICO_SEM_MUNDO_AUSENTE");
  const responsabilidadeHistorica = randomUUID();
  exigir(original.guardian_user_id !== solicitante, "RESPONSAVEL_HISTORICO_JA_PRESENTE");
  const plano = PlanoDeDireitosSchema.parse({
    formato: "recreio-previa-direitos-v1",
    tipo: "retirar_perfil",
    contaId: solicitante,
    perfis: [
      {
        id: original.id,
        tipo: "minor",
        versao: original.policy_version + 1,
        responsabilidadeId: responsabilidadeHistorica,
      },
    ],
    mundos: [],
    identidadeGlobalPreservada: true,
    financeiroSeparado: true,
  });
  let operacao: { id: string; livro: string } | undefined;
  return {
    plano,
    async verificar(banco: Database, coordenacao: CoordenacaoDeEfeitos, operacaoId: string) {
      operacao = { id: operacaoId, livro: coordenacao.assinatura.livroId };
      const primeira = await admitirRetiradaHistoricaRecuperada(coordenacao, operacaoId),
        repetida = await admitirRetiradaHistoricaRecuperada(coordenacao, operacaoId);
      exigir(
        primeira.situacao === "admitida" && repetida.situacao === "existente",
        "ADMISSAO_HISTORICA_NAO_REPETIVEL",
      );
      const [op] = await banco.select().from(operations).where(eq(operations.id, operacaoId));
      exigir(
        op &&
          op.preparationId === null &&
          op.recoverySourceId === operacaoId &&
          op.requesterUserId === solicitante &&
          op.signingKeyId !== coordenacao.assinatura.chaveAtiva,
        "ADMISSAO_HISTORICA_DIVERGENTE",
      );
      const documento = coordenacao.assinatura.lerIntencao(op.signedIntent);
      exigir(
        op.createdAt.toISOString() === documento.consentidaEm &&
          op.consentedAt.toISOString() === documento.consentidaEm &&
          op.authenticatedAt.toISOString() === documento.autenticadaEm,
        "ADMISSAO_HISTORICA_DIVERGENTE",
      );
      exigir(
        (await minimizarProximoPerfil(coordenacao)).situacao === "ociosa",
        "EXECUCAO_SEM_ESCOPO_DA_OPERACAO",
      );
      const encerrada = await comOperacaoPrivadaDeDireitos(
        coordenacao,
        operacaoId,
        async (filha) => {
          const [p] = await banco.select().from(profiles).where(eq(profiles.id, original.id)),
            [g] = await banco.select().from(guardians).where(eq(guardians.profileId, original.id)),
            [s] = await banco.select().from(subjects).where(eq(subjects.operationId, operacaoId));
          exigir(
            p &&
              g &&
              s &&
              g.id === original.guardian_id &&
              g.guardianUserId === original.guardian_user_id &&
              s.guardianReference === responsabilidadeHistorica &&
              s.guardianReference !== g.id &&
              autoridadeDoPerfilCongelado(filha, op, p, g, s),
            "AUTORIDADE_HISTORICA_DIVERGENTE",
          );
          let recusou = false;
          try {
            autoridadeDoPerfilCongelado({ ...filha }, op, p, g, s);
          } catch (e) {
            if (!(e instanceof AppError) || e.code !== "DIREITOS_LIVRO") throw e;
            recusou = true;
          }
          exigir(recusou, "COPIA_DE_ESCOPO_HISTORICO_ADMITIDA");
          return filha;
        },
      );
      let expirou = false;
      try {
        await minimizarProximoPerfil(encerrada);
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== "DIREITOS_LIVRO") throw e;
        expirou = true;
      }
      exigir(expirou, "ESCOPO_HISTORICO_NAO_EXPIROU");
      const [auditoria] = await copia.unsafe<{ quantidade: number }[]>(
        `select count(*)::int as quantidade
        from audit.events where actor_id=$1 and event_type='recreio.rights_historical_admitted'
        and payload->>'app'='recreio' and payload->>'operationId'=$2`,
        [solicitante, operacaoId],
      );
      exigir(auditoria?.quantidade === 1, "AUDITORIA_HISTORICA_DIVERGENTE");
    },
    async limpar() {
      const alvo = operacao;
      if (!alvo) return;
      await copia.begin(async (tx) => {
        const [op] = await tx.unsafe<
          { recovery_source_id: string | null; preparation_id: string | null }[]
        >(
          "select recovery_source_id,preparation_id from recreio.rights_operations where id=$1 and ledger_id=$2 for update",
          [alvo.id, alvo.livro],
        );
        if (!op) return;
        exigir(
          op.recovery_source_id === alvo.id && op.preparation_id === null,
          "ADMISSAO_HISTORICA_DIVERGENTE",
        );
        // No eraser was invoked. Undo only this synthetic freeze, preserving
        // the PG timestamp's original microseconds rather than using JS Date.
        const restauradas = await tx.unsafe(
          `update recreio.profiles set status=$1,policy_version=$2,
          updated_at=$3::text::timestamptz,rights_operation_id=null,rights_frozen_state=null
          where id=$4 and rights_operation_id=$5 returning id`,
          [original.status, original.policy_version, original.updated_at, original.id, alvo.id],
        );
        exigir(restauradas.length === 1, "PERFIL_HISTORICO_NAO_RESTAURADO");
        await tx.unsafe("delete from recreio.rights_subjects where operation_id=$1", [alvo.id]);
        await tx.unsafe(
          `delete from audit.events where event_type='recreio.rights_historical_admitted'
          and actor_id=$1 and payload->>'app'='recreio' and payload->>'operationId'=$2`,
          [solicitante, alvo.id],
        );
        await tx.unsafe("delete from recreio.rights_operations where id=$1 and ledger_id=$2", [
          alvo.id,
          alvo.livro,
        ]);
      });
    },
  };
}
