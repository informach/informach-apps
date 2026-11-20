import { randomUUID } from "node:crypto";
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

/** The source really published the native consent, then strict audit rolled
 * back SQL confirmation before capture. This worker never reconstructs that
 * decision, writes the book, or receives the original database credentials. */
export async function provarPublicacaoNativaPendente(config: {
  copia: postgres.Sql;
  pendente: RetiradaNativaDeProva["publicacaoPendente"];
  preservadoId: string;
  coordenar: (executar: (pai: CoordenacaoDeEfeitos) => Promise<void>) => Promise<void>;
}) {
  const { copia, pendente } = config;
  const ler = async () => {
    const [r] = await copia.unsafe<
      {
        imutavel: string;
        completo: string;
        state: string;
        preparation_id: string | null;
        recovery_source_id: string | null;
        admitted_head_sha256: string | null;
        admitted_at: string | null;
        completed_at: string | null;
        perfil: boolean;
        conta: boolean;
        versoes: number;
        chaves: number;
        conquistas: number;
      }[]
    >(
      `select
      encode(sha256(convert_to((to_jsonb(o)-array['state','admitted_head_sha256','admitted_at',
        'lease_token','lease_until','attempts','next_attempt_at','updated_at','completed_at'])::text,'UTF8')),'hex') as imutavel,
      encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex') as completo,
      state,preparation_id,recovery_source_id,admitted_head_sha256,admitted_at::text,completed_at::text,
      exists(select 1 from recreio.profiles where id=$2) as perfil,
      exists(select 1 from core.users where id=$3) as conta,
      (select count(*)::int from recreio.profile_data_versions where profile_id=$2) as versoes,
      (select count(*)::int from recreio.profile_data_keys where profile_id=$2) as chaves,
      (select count(*)::int from recreio.profile_achievements where profile_id=$2) as conquistas
      from recreio.rights_operations o where id=$1 and requester_user_id=$3`,
      [pendente.operacaoId, pendente.perfilId, pendente.contaId],
    );
    exigir(r, "PUBLICACAO_PENDENTE_AUSENTE");
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
    original.state === "publishing" &&
      original.preparation_id &&
      original.recovery_source_id === null &&
      original.admitted_head_sha256 === null &&
      original.admitted_at === null &&
      original.completed_at === null &&
      original.perfil &&
      original.conta &&
      original.versoes === 1 &&
      original.chaves === 1 &&
      original.conquistas === 1 &&
      terceiro.length === 1,
    "PUBLICACAO_PENDENTE_DIVERGENTE",
  );
  await config.coordenar(async (pai) => {
    let copiaRecusada = false;
    try {
      await admitirRetiradaHistoricaRecuperada({ ...pai }, pendente.operacaoId);
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== "DIREITOS_LIVRO") throw e;
      copiaRecusada = true;
    }
    exigir(copiaRecusada, "PUBLICACAO_COPIADA_ADMITIDA");
    let filhoRecusado = false;
    try {
      await comOperacaoPrivadaDeDireitos(pai, pendente.operacaoId, async () => {
        throw new FalhaDaProva("PUBLICACAO_PENDENTE_EXECUTOU_SEM_CONFIRMACAO");
      });
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== "DIREITOS_INTEGRIDADE") throw e;
      filhoRecusado = true;
    }
    exigir(filhoRecusado, "PUBLICACAO_PENDENTE_EXECUTOU_SEM_CONFIRMACAO");

    const nome = `fixture_pending_${randomUUID().replaceAll("-", "")}`;
    await copia.unsafe(`create function recreio.${nome}() returns trigger language plpgsql as $fixture$
      begin if NEW.event_type='recreio.rights_admitted' then raise exception 'fixture recovered publication strict audit';
      end if; return NEW; end $fixture$`);
    let recusou = false;
    try {
      await copia.unsafe(
        `create trigger ${nome} before insert on audit.events for each row execute function recreio.${nome}()`,
      );
      try {
        await admitirRetiradaHistoricaRecuperada(pai, pendente.operacaoId);
      } catch (erro) {
        let atual: unknown = erro;
        for (let n = 0; n < 5 && atual; n++) {
          if (
            typeof atual === "object" &&
            "code" in atual &&
            atual.code === "P0001" &&
            "message" in atual &&
            atual.message === "fixture recovered publication strict audit"
          )
            recusou = true;
          atual = atual instanceof Error ? atual.cause : undefined;
        }
        if (!recusou) throw erro;
      }
    } finally {
      try {
        await copia.unsafe(`drop trigger if exists ${nome} on audit.events`);
      } finally {
        await copia.unsafe(`drop function recreio.${nome}()`);
      }
    }
    const [avaliacao] = await copia.unsafe<{ state: string; ready_at: string | null }[]>(
      "select state,ready_at::text from recreio.rights_recovery_evaluations where operation_id=$1 and state='staged'",
      [pendente.operacaoId],
    );
    exigir(
      recusou &&
        (await ler()).completo === original.completo &&
        avaliacao?.state === "staged" &&
        avaliacao.ready_at === null,
      "PUBLICACAO_AUDITORIA_NAO_REVERTEU",
    );
    exigir(
      (await admitirRetiradaHistoricaRecuperada(pai, pendente.operacaoId)).situacao ===
        "existente_nativa",
      "PUBLICACAO_PENDENTE_NAO_RECONCILIADA",
    );
    const admitida = await ler();
    exigir(
      admitida.imutavel === original.imutavel &&
        admitida.state === "admitted" &&
        admitida.admitted_head_sha256 === pai.prova.cabecalho.sha256 &&
        admitida.admitted_at !== null,
      "PUBLICACAO_PENDENTE_DIVERGENTE",
    );
    await admitirRetiradaHistoricaRecuperada(pai, pendente.operacaoId);
    exigir((await ler()).completo === admitida.completo, "PUBLICACAO_RECONCILIADA_REESCRITA");
    let removidos = 0;
    await comOperacaoPrivadaDeDireitos(pai, pendente.operacaoId, async (filha) => {
      for (let n = 0; n < 12; n++) {
        const lote = await retirarProximosDadosPessoais(filha);
        if (lote.situacao === "dados_removidos") removidos += lote.quantidade;
        await minimizarProximoPerfil(filha);
        await liberarProximoMundoDeDireitos(filha);
        await expurgarProximaReferencia(filha);
        if ((await concluirProximaRetirada(filha)).situacao === "retirada_concluida") return;
      }
      throw new FalhaDaProva("PUBLICACAO_PENDENTE_NAO_CONCLUIDA");
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
        removidos === 3,
      "PUBLICACAO_PENDENTE_DIVERGENTE",
    );
    await admitirRetiradaHistoricaRecuperada(pai, pendente.operacaoId);
    exigir((await ler()).completo === concluida.completo, "PUBLICACAO_CONCLUIDA_REESCRITA");
  });
  const [audit] = await copia.unsafe<
    { consentimentos: number; admissoes: number; retomadas: number; historicas: number }[]
  >(
    `select count(*) filter(where event_type='recreio.rights_consented')::int as consentimentos,
    count(*) filter(where event_type='recreio.rights_admitted')::int as admissoes,
    count(*) filter(where event_type='recreio.rights_historical_resumed')::int as retomadas,
    count(*) filter(where event_type='recreio.rights_historical_admitted')::int as historicas
    from audit.events where actor_id=$1 and payload->>'operationId'=$2`,
    [pendente.contaId, pendente.operacaoId],
  );
  const terceiroDepois = await lerTerceiro();
  exigir(
    audit?.consentimentos === 1 &&
      audit.admissoes === 1 &&
      audit.retomadas === 1 &&
      audit.historicas === 0 &&
      terceiroDepois.length === 1 &&
      terceiroDepois[0]?.sha256 === terceiro[0]?.sha256,
    "PUBLICACAO_AUDITORIA_DIVERGENTE",
  );
  return {
    nativePendingPublicationReconciled: true as const,
    nativePendingPublicationAuditRollbackVerified: true as const,
    nativePendingPublicationOriginAndDatesPreserved: true as const,
    nativePendingPublicationNoNewConsent: true as const,
    nativePendingPublicationOtherProfilePreserved: true as const,
  };
}
