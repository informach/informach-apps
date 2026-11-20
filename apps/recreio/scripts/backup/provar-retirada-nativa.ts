import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { gunzipSync } from "node:zlib";
import type { S3Client } from "@aws-sdk/client-s3";
import { abrirFotografia } from "@informach/morada-sim/formatos";
import type postgres from "postgres";
import { z } from "zod";
import { admitirRetiradaHistoricaRecuperada } from "../../src/features/direitos/admissao-recuperada-repository";
import { concluirProximaRetirada } from "../../src/features/direitos/conclusao-repository";
import {
  comCoordenacaoPrivadaDeDireitos,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { retirarProximosDadosPessoais } from "../../src/features/direitos/dados-retirada-repository";
import { concluirProximaDrenagem } from "../../src/features/direitos/drenagem-repository";
import { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "../../src/features/direitos/livro/assinatura";
import { minimizarProximoPerfil } from "../../src/features/direitos/minimizacao-repository";
import { expurgarProximaReferencia } from "../../src/features/direitos/referencias-retidas-repository";
import { processarFotografiaNaCoordenacao } from "../direitos/fotografias";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { importarFontesHistoricasDeDireitos } from "./importar-fontes-direitos";
import { inventariarBackup } from "./inventario";
import { exigir, FalhaDaProva } from "./provas-arquivos";
import { RetiradaNativaDeProvaSchema } from "./retirada-nativa-prova-contrato";

/** Second disposable cluster only. The real native consent was published AFTER
 * capture, on the independent bucket. No decision is synthesized here, no
 * original credentials are received, and erased data is never put back. */
export async function provarRetiradaNativaPosterior(config: {
  copia: postgres.Sql;
  cliente: S3Client;
  bucket: string;
  capturaSha256: string;
  entrada: unknown;
}) {
  exigir(
    process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      !process.env.DATABASE_URL &&
      !process.env.BETTER_AUTH_SECRET &&
      !process.env.STRIPE_SECRET_KEY,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const dado = RetiradaNativaDeProvaSchema.parse(config.entrada),
    chaves = new Map(
      Object.entries(dado.chaves).map(([id, b64]) => {
        const bytes = Buffer.from(b64, "base64");
        exigir(bytes.length === 32 && bytes.toString("base64") === b64, "CHAVE_INVALIDA");
        return [id, bytes] as const;
      }),
    ),
    assinatura = criarAssinaturaDoLivro({
      livroId: dado.livroId,
      chaveAtiva: "native-next",
      chaves,
    });
  for (const chave of chaves.values()) chave.fill(0);
  let leituras = 0;
  config.cliente.middlewareStack.add(
    (next, contexto) => async (args) => {
      const input = z.object({ Bucket: z.string(), Key: z.string() }).parse(args.input);
      exigir(
        contexto.commandName === "GetObjectCommand" &&
          input.Bucket === config.bucket &&
          input.Key.startsWith(`recreio/v1/direitos/${dado.livroId}/`) &&
          /\/(?:cabecalho\.json|historico\/[0-9]{16}-[a-f0-9]{64}\.json|planos\/[a-f0-9]{64}\.json|intencoes\/[a-f0-9-]{36}-1\.json)$/.test(
            input.Key,
          ),
        "LEITURA_FORA_DO_LIVRO",
      );
      leituras++;
      return next(args);
    },
    { step: "initialize", name: "recreioColdNativeRightsReadBoundary" },
  );
  const storage = criarArmazenamentoDoLivro({
    cliente: config.cliente,
    bucket: config.bucket,
    assinatura,
    tempoLimiteMs: 15000,
  });
  try {
    const copia = config.copia;
    const [antes] = await copia.unsafe<{ perfil: boolean; operacao: boolean; dados: number }[]>(
      `select exists(select 1 from recreio.profiles where id=$1 and rights_operation_id is null) as perfil,
       exists(select 1 from recreio.rights_operations where id=$2) as operacao,
       (select count(*)::int from recreio.profile_data_versions where profile_id=$1) as dados`,
      [dado.perfilId, dado.operacaoId],
    );
    exigir(
      antes?.perfil && !antes.operacao && antes.dados === 1,
      "CAPTURA_ANTERIOR_NAO_COMPROVADA",
    );
    const inventarioAntes = await copia.begin(
      "isolation level repeatable read read only",
      inventariarBackup,
    );
    const lerAuditoriaAnterior = () =>
      copia.unsafe(
        `select count(*)::int as quantidade,
        encode(sha256(convert_to(coalesce(string_agg(
          encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex'),'' order by id),''),'UTF8')),'hex') as sha256
       from audit.events e where payload->>'operationId' is distinct from $1`,
        [dado.operacaoId],
      );
    const auditoriaAnterior = await lerAuditoriaAnterior();
    const lerAparelhos = () =>
      copia.unsafe<{ id: string; perfil: string | null; controle: string }[]>(
        `select id,active_profile_id as perfil,
        encode(sha256(convert_to((to_jsonb(d)-'active_profile_id')::text,'UTF8')),'hex') as controle
       from recreio.device_sessions d order by id`,
      );
    const aparelhosAntes = await lerAparelhos();
    const lerFoto = async () => {
      const [foto] = await copia.unsafe<{ data: Buffer; sha256: string; meta: unknown }[]>(
        `select data,sha256,jsonb_build_array(id,revision,fence,schema_version,journal_seq,tick,kind) as meta
         from recreio.space_snapshots where space_id=$1 and revision=1 and storage='pg'`,
        [dado.mundoId],
      );
      exigir(
        foto?.data && createHash("sha256").update(foto.data).digest("hex") === foto.sha256,
        "FOTOGRAFIA_NATIVA_DIVERGENTE",
      );
      let aberto: Buffer | undefined;
      try {
        aberto = gunzipSync(foto.data, { maxOutputLength: 8 * 1024 * 1024 });
        const texto = aberto.toString("utf8");
        const documento = abrirFotografia(JSON.parse(texto));
        exigir(documento.estado.familias.ordem.length > 0, "AUTORIA_NATIVA_AUSENTE");
        return { texto, familias: documento.estado.familias, meta: foto.meta };
      } finally {
        foto.data.fill(0);
        aberto?.fill(0);
      }
    };
    const fotoAntes = await lerFoto();
    exigir(
      fotoAntes.texto.includes(dado.perfilId) && fotoAntes.texto.includes(dado.preservadoId),
      "AUTORIA_NATIVA_AUSENTE",
    );
    const lerMundoPreservado = () =>
      copia.unsafe(
        `select game_id,steward_profile_id,created_by_profile_id,name,status,revision,journal_seq,schema_version,
        (select jsonb_agg(to_jsonb(m) order by m.id) from recreio.space_members m
          where m.space_id=s.id and m.profile_id=$2) as outro_membro
       from recreio.spaces s where s.id=$1`,
        [dado.mundoId, dado.preservadoId],
      );
    const mundoAntes = await lerMundoPreservado();
    const preservado = await copia.unsafe(
      `select to_jsonb(p) as perfil,
        (select jsonb_agg(to_jsonb(v) order by v.id) from recreio.profile_data_versions v where v.profile_id=p.id) as dados,
        (select jsonb_agg(to_jsonb(a) order by a.id) from recreio.profile_achievements a where a.profile_id=p.id) as conquistas
       from recreio.profiles p where p.id=$1`,
      [dado.preservadoId],
    );
    exigir(preservado.length === 1, "TERCEIRO_PRESERVADO_AUSENTE");
    const comum = {
      storage,
      assinatura,
      capturaSha256: config.capturaSha256,
      fonte: process.env.GITHUB_SHA ?? "",
      maxEntradas: 10,
      maxBytesPlanos: 65536,
      tempoLimiteMs: 30000,
    };
    const importacao = await importarFontesHistoricasDeDireitos({ ...comum, copia });
    exigir(importacao.fontesConferidas === 1, "CONSENTIMENTO_NATIVO_DIVERGENTE");
    let passos = 0,
      dadosApagados = 0,
      fotosProcessadas = 0;
    await comConexaoPrivadaDeDireitos(copia, async (banco) => {
      await comCoordenacaoPrivadaDeDireitos({
        ...comum,
        banco,
        execucaoId: importacao.execucaoId,
        executar: async (pai) => {
          const admissao = await admitirRetiradaHistoricaRecuperada(pai, dado.operacaoId);
          exigir(admissao.situacao === "admitida", "ADMISSAO_HISTORICA_DIVERGENTE");
          await comOperacaoPrivadaDeDireitos(pai, dado.operacaoId, async (filha) => {
            for (let i = 0; i < 24; i++) {
              await concluirProximaDrenagem(filha);
              const foto = await processarFotografiaNaCoordenacao(filha, {
                storage,
                leitor: null,
                politica: { retirarTextosDaFundacao: true },
              });
              if (foto.situacao === "fotografia_processada") fotosProcessadas++;
              const dados = await retirarProximosDadosPessoais(filha);
              if (dados.situacao === "dados_removidos") dadosApagados += dados.quantidade;
              await minimizarProximoPerfil(filha);
              await expurgarProximaReferencia(filha);
              passos++;
              const fim = await concluirProximaRetirada(filha);
              if (fim.situacao === "retirada_concluida") return;
            }
            throw new FalhaDaProva("RETIRADA_NATIVA_NAO_CONCLUIDA");
          });
        },
      });
    });
    const [fim] = await copia.unsafe<
      {
        concluida: boolean;
        perfil: boolean;
        dados: number;
        conquistas: number;
        conta: boolean;
        consentimentos: number;
      }[]
    >(
      `select exists(select 1 from recreio.rights_operations where id=$1 and state='completed' and completed_at is not null) as concluida,
        exists(select 1 from recreio.profiles where id=$2) as perfil,
        (select count(*)::int from recreio.profile_data_versions where profile_id=$2) as dados,
        (select count(*)::int from recreio.profile_achievements where profile_id=$2) as conquistas,
        exists(select 1 from core.users where id=$3) as conta,
        (select count(*)::int from audit.events where actor_id=$3 and event_type='recreio.rights_consented') as consentimentos`,
      [dado.operacaoId, dado.perfilId, dado.contaId],
    );
    exigir(
      fim?.concluida &&
        !fim.perfil &&
        fim.dados === 0 &&
        fim.conquistas === 0 &&
        fim.conta &&
        fim.consentimentos === 0 &&
        dadosApagados === 3,
      "RETIRADA_NATIVA_DIVERGENTE",
    );
    const preservadoDepois = await copia.unsafe(
      `select to_jsonb(p) as perfil,
        (select jsonb_agg(to_jsonb(v) order by v.id) from recreio.profile_data_versions v where v.profile_id=p.id) as dados,
        (select jsonb_agg(to_jsonb(a) order by a.id) from recreio.profile_achievements a where a.profile_id=p.id) as conquistas
       from recreio.profiles p where p.id=$1`,
      [dado.preservadoId],
    );
    exigir(isDeepStrictEqual([...preservado], [...preservadoDepois]), "TERCEIRO_ALTERADO");
    const fotoDepois = await lerFoto();
    exigir(
      fotosProcessadas === 1 &&
        !fotoDepois.texto.includes(dado.perfilId) &&
        fotoDepois.texto.includes(dado.preservadoId) &&
        isDeepStrictEqual(fotoAntes.meta, fotoDepois.meta) &&
        isDeepStrictEqual(fotoAntes.familias, fotoDepois.familias),
      "FOTOGRAFIA_NATIVA_DIVERGENTE",
    );
    exigir(
      isDeepStrictEqual([...mundoAntes], [...(await lerMundoPreservado())]),
      "MUNDO_ALHEIO_ALTERADO",
    );
    exigir(
      isDeepStrictEqual([...auditoriaAnterior], [...(await lerAuditoriaAnterior())]),
      "AUDITORIA_ANTERIOR_ALTERADA",
    );
    const aparelhosDepois = await lerAparelhos();
    exigir(
      aparelhosAntes.length === aparelhosDepois.length &&
        aparelhosAntes.every((a, i) => {
          const depois = aparelhosDepois[i];
          return (
            depois?.id === a.id &&
            depois.controle === a.controle &&
            depois.perfil === (a.perfil === dado.perfilId ? null : a.perfil)
          );
        }),
      "APARELHO_ALHEIO_ALTERADO",
    );
    const inventarioDepois = await copia.begin(
      "isolation level repeatable read read only",
      inventariarBackup,
    );
    const alteradas = new Set([
      "profiles",
      "device_sessions",
      "minor_profiles",
      "guardian_links",
      "profile_creation_requests",
      "paired_credentials",
      "pairing_requests",
      "minor_policies",
      "minor_protection",
      "minor_daily_usage",
      "social_preferences",
      "profile_world_traces",
      "spaces",
      "space_snapshots",
      "rights_worlds",
      "profile_data_keys",
      "profile_data_versions",
      "profile_achievements",
      "rights_recovery_runs",
      "rights_recovery_sources",
      "rights_operations",
      "rights_subjects",
    ]);
    for (const antes of inventarioAntes.tabelas) {
      if (
        (antes.schema === "recreio" && alteradas.has(antes.nome)) ||
        (antes.schema === "audit" && antes.nome === "events")
      )
        continue;
      const depois = inventarioDepois.tabelas.find(
        (t) => t.schema === antes.schema && t.nome === antes.nome,
      );
      exigir(isDeepStrictEqual(antes, depois), "TABELA_ALHEIA_ALTERADA");
    }
    exigir(leituras > 0, "LEITURAS_DO_LIVRO_INCOMPLETAS");
    return {
      nativePostCaptureConsentReplayed: true as const,
      nativePostCapturePersonalErasureExecuted: true as const,
      nativePostCaptureOtherProfilePreserved: true as const,
      nativePostCaptureGlobalIdentityPreserved: true as const,
      nativePostCaptureNoNewConsent: true as const,
      nativePostCapturePhotographSanitized: true as const,
      nativePostCaptureOtherWorldStatePreserved: true as const,
      rightsClientOnlyRightsPrefixRead: true as const,
      rightsReadRequests: leituras,
      nativePostCaptureSqlPasses: passos,
    };
  } finally {
    assinatura.encerrar();
  }
}
