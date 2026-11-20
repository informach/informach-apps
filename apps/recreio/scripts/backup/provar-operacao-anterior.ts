import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { admitirRetiradaHistoricaRecuperada } from "../../src/features/direitos/admissao-recuperada-repository";
import { concluirProximaRetirada } from "../../src/features/direitos/conclusao-repository";
import {
  type CoordenacaoDeEfeitos,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { retirarProximosDadosPessoais } from "../../src/features/direitos/dados-retirada-repository";
import { liberarProximoMundoDeDireitos } from "../../src/features/direitos/liberacao-mundo-repository";
import { minimizarProximoPerfil } from "../../src/features/direitos/minimizacao-repository";
import { expurgarProximaReferencia } from "../../src/features/direitos/referencias-retidas-repository";
import { AppError } from "../../src/lib/errors";
import { exigir, FalhaDaProva } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Real native admission and first durable effect already belong to the
 * authenticated dump. Only the inherited worker lease is a crash fixture.
 * No original preparation/consent/admission is manufactured in this worker. */
export async function provarOperacaoNativaAnterior(config: {
  copia: postgres.Sql;
  anterior: RetiradaNativaDeProva["anterior"];
  preservadoId: string;
  coordenar: (executar: (pai: CoordenacaoDeEfeitos) => Promise<void>) => Promise<void>;
}) {
  const { copia, anterior, coordenar } = config;
  const ler = async () => {
    const [r] = await copia.unsafe<
      {
        imutavel: string;
        completo: string;
        preparation_id: string | null;
        recovery_source_id: string | null;
        admitted_head_sha256: string | null;
        state: string;
        completed_at: string | null;
        reservada: boolean;
        perfil: boolean;
        conta: boolean;
        versoes: number;
        chaves: number;
        conquistas: number;
      }[]
    >(
      `select
      encode(sha256(convert_to((to_jsonb(o)-array['state','lease_token','lease_until','attempts','next_attempt_at','updated_at','completed_at'])::text,'UTF8')),'hex') as imutavel,
      encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex') as completo,
      preparation_id,recovery_source_id,admitted_head_sha256,state,completed_at::text,
      lease_token is not null as reservada,
      exists(select 1 from recreio.profiles where id=$2) as perfil,
      exists(select 1 from core.users where id=$3) as conta,
      (select count(*)::int from recreio.profile_data_versions where profile_id=$2) as versoes,
      (select count(*)::int from recreio.profile_data_keys where profile_id=$2) as chaves,
      (select count(*)::int from recreio.profile_achievements where profile_id=$2) as conquistas
      from recreio.rights_operations o where id=$1 and requester_user_id=$3`,
      [anterior.operacaoId, anterior.perfilId, anterior.contaId],
    );
    exigir(r, "OPERACAO_ANTERIOR_AUSENTE");
    return r;
  };
  const lerTerceiro = () =>
    copia.unsafe(
      `select
    encode(sha256(convert_to(jsonb_build_array(to_jsonb(p),
      (select jsonb_agg(to_jsonb(v) order by v.id) from recreio.profile_data_versions v where v.profile_id=p.id),
      (select jsonb_agg(to_jsonb(k) order by k.id) from recreio.profile_data_keys k where k.profile_id=p.id),
      (select jsonb_agg(to_jsonb(a) order by a.id) from recreio.profile_achievements a where a.profile_id=p.id))::text,'UTF8')),'hex') as sha256
    from recreio.profiles p where p.id=$1`,
      [config.preservadoId],
    );
  const original = await ler(),
    terceiro = await lerTerceiro();
  exigir(
    original.preparation_id &&
      original.recovery_source_id === null &&
      original.admitted_head_sha256 &&
      original.state === "running" &&
      original.completed_at === null &&
      original.reservada &&
      original.perfil &&
      original.conta &&
      original.versoes === 0 &&
      original.chaves === 1 &&
      original.conquistas === 1 &&
      terceiro.length === 1,
    "OPERACAO_ANTERIOR_DIVERGENTE",
  );
  let removidos = 0;
  await coordenar(async (pai) => {
    exigir(
      pai.prova.cabecalho.sha256 !== original.admitted_head_sha256,
      "CABECALHO_ANTERIOR_NAO_ANCESTRAL",
    );
    let semReciboRecusado = false;
    try {
      await comOperacaoPrivadaDeDireitos(pai, anterior.operacaoId, async () => {
        throw new FalhaDaProva("RECIBO_ANTERIOR_DIVERGENTE");
      });
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== "DIREITOS_INTEGRIDADE") throw e;
      semReciboRecusado = true;
    }
    exigir(semReciboRecusado, "RECIBO_ANTERIOR_DIVERGENTE");
    exigir(
      (await admitirRetiradaHistoricaRecuperada(pai, anterior.operacaoId)).situacao ===
        "existente_nativa",
      "OPERACAO_ANTERIOR_NAO_RECONCILIADA",
    );
    const retomada = await ler();
    exigir(
      retomada.imutavel === original.imutavel &&
        !retomada.reservada &&
        retomada.completed_at === null,
      "OPERACAO_ANTERIOR_DIVERGENTE",
    );
    exigir(
      (await admitirRetiradaHistoricaRecuperada(pai, anterior.operacaoId)).situacao ===
        "existente_nativa" && (await ler()).completo === retomada.completo,
      "RETOMADA_ANTERIOR_NAO_IDEMPOTENTE",
    );
    const lerRecibo = () =>
      copia.unsafe(
        `select encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') as sha256
      from recreio.rights_recovery_evaluations e where operation_id=$1 and state='ready'`,
        [anterior.operacaoId],
      );
    const recibo = await lerRecibo();
    exigir(recibo.length === 1, "RECIBO_ANTERIOR_DIVERGENTE");
    // A fresh worker reservation/backoff fixture, after the durable ready receipt.
    // Re-admission must preserve all fields, rather than steal this reservation.
    const token = randomUUID();
    await copia.unsafe(
      `update recreio.rights_operations set lease_token=$2,lease_until=statement_timestamp()+interval '2 minutes',
      next_attempt_at=statement_timestamp()+interval '90 seconds' where id=$1 and lease_token is null`,
      [anterior.operacaoId, token],
    );
    const novaReserva = await ler();
    exigir(novaReserva.reservada, "NOVA_RESERVA_ANTERIOR_ALTERADA");
    await admitirRetiradaHistoricaRecuperada(pai, anterior.operacaoId);
    exigir(
      (await ler()).completo === novaReserva.completo &&
        isDeepStrictEqual(recibo, await lerRecibo()),
      "NOVA_RESERVA_ANTERIOR_ALTERADA",
    );
    const liberada = await copia.unsafe(
      `update recreio.rights_operations set lease_token=null,lease_until=null,
      next_attempt_at=statement_timestamp() where id=$1 and lease_token=$2 returning id`,
      [anterior.operacaoId, token],
    );
    exigir(liberada.length === 1, "NOVA_RESERVA_ANTERIOR_ALTERADA");
    await comOperacaoPrivadaDeDireitos(pai, anterior.operacaoId, async (filha) => {
      for (let n = 0; n < 12; n++) {
        const lote = await retirarProximosDadosPessoais(filha);
        if (lote.situacao === "dados_removidos") removidos += lote.quantidade;
        await minimizarProximoPerfil(filha);
        await liberarProximoMundoDeDireitos(filha);
        await expurgarProximaReferencia(filha);
        if ((await concluirProximaRetirada(filha)).situacao === "retirada_concluida") return;
      }
      throw new FalhaDaProva("OPERACAO_ANTERIOR_NAO_CONCLUIDA");
    });
    const concluida = await ler();
    exigir(
      concluida.imutavel === original.imutavel &&
        concluida.state === "completed" &&
        concluida.completed_at !== null &&
        !concluida.perfil &&
        concluida.conta &&
        concluida.versoes === 0 &&
        concluida.chaves === 0 &&
        concluida.conquistas === 0 &&
        removidos === 2,
      "OPERACAO_ANTERIOR_DIVERGENTE",
    );
    await admitirRetiradaHistoricaRecuperada(pai, anterior.operacaoId);
    exigir((await ler()).completo === concluida.completo, "CONCLUSAO_ANTERIOR_REESCRITA");
  });
  const [auditoria] = await copia.unsafe<
    { consentimentos: number; retomadas: number; admissoes: number }[]
  >(
    `select count(*) filter(where event_type='recreio.rights_consented')::int as consentimentos,
      count(*) filter(where event_type='recreio.rights_historical_resumed')::int as retomadas,
      count(*) filter(where event_type='recreio.rights_historical_admitted')::int as admissoes
      from audit.events where actor_id=$1 and payload->>'operationId'=$2`,
    [anterior.contaId, anterior.operacaoId],
  );
  exigir(
    auditoria?.consentimentos === 1 &&
      auditoria.retomadas === 1 &&
      auditoria.admissoes === 0 &&
      isDeepStrictEqual([...terceiro], [...(await lerTerceiro())]),
    "AUDITORIA_ANTERIOR_NATIVA_DIVERGENTE",
  );
  return {
    nativePreCaptureReadinessReceiptVerified: true as const,
    nativePreCaptureFreshWorkerLeasePreserved: true as const,
    nativePreCaptureOperationResumed: true as const,
    nativePreCaptureOriginPreserved: true as const,
    nativePreCaptureDatesPreserved: true as const,
    nativePreCaptureNoNewConsent: true as const,
    nativePreCaptureWorkerLeaseReconciled: true as const,
    nativePreCaptureIdempotenceVerified: true as const,
    nativePreCapturePartialEffectsPreserved: true as const,
  };
}
