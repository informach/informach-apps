import { type FileHandle, mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { RecreioRenewalReviewError } from "@informach/billing/providers/stripe-recreio-renewals";
import postgres from "postgres";
import { z } from "zod";
import { AppError } from "../../src/lib/errors";

import { criarCifradorDeArquivos } from "./arquivo-cifrado";
import { criarArquivoComposto } from "./arquivo-composto";
import { criarTransporteDeArquivosS3 } from "./arquivo-s3";
import { comBancoRestaurado, FalhaDoClusterIsolado } from "./cluster-isolado";
import {
  type CodigoDaRecuperacao,
  classificarRestricaoDeRecuperacao,
  type EtapaDaRecuperacao,
  FalhaDaRecuperacaoSchema,
} from "./diagnostico-recuperacao";
import { FalhaDaFerramentaNativa } from "./ferramentas-nativas";
import { criarIndiceDeRecuperacao } from "./indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "./indice-s3";
import { conferirInventarios, FalhaDeInventario, inventariarBackup } from "./inventario";
import { normalizarCapacidadesRestauradas } from "./normalizar-capacidades";
import { FalhaDaNormalizacao, normalizarFotografiasRestauradas } from "./normalizar-fotografias";
import { provarCapacidadesRecuperadas } from "./provar-capacidades-recuperadas";
import { provarCarregamentoDoControle } from "./provar-carregamento-controle";
import { provarFinanceiroRecuperado } from "./provar-financeiro-recuperado";
import { provarFontesHistoricasRecuperadas } from "./provar-fontes-historicas";
import { provarRetiradaNativaPosterior } from "./provar-retirada-nativa";
import { provarVinculosGlobaisAtuais } from "./provar-vinculos-globais";
import { exigir, FalhaDaProva, limparDiretorioDeProva } from "./provas-arquivos";
import { RetiradaNativaDeProvaSchema } from "./retirada-nativa-prova-contrato";
import { FalhaDoSchemaPrivado } from "./schema-nativo-privado";
import { FalhaDosVinculosAtuais } from "./vinculos-globais";

const variavel = (nome: string) => {
  const v = process.env[nome];
  exigir(v, "CONFIGURACAO_AUSENTE");
  return v;
};
function codigoSeguro(erro: unknown): CodigoDaRecuperacao {
  const fila: unknown[] = [erro];
  for (let i = 0; i < 8 && fila.length; i++) {
    const e = fila.shift();
    const restricao = classificarRestricaoDeRecuperacao(e);
    if (restricao) return restricao;
    if (e instanceof FalhaDoSchemaPrivado) {
      const r = FalhaDaRecuperacaoSchema.shape.codigo.safeParse(
        e.codigo === "ARQUIVO" ? `SCHEMA_ARQUIVO_${e.motivo}` : `SCHEMA_${e.codigo}`,
      );
      if (r.success) return r.data;
    }
    if (e instanceof FalhaDaFerramentaNativa && e.codigo !== "FERRAMENTA_FALHOU") {
      const r = FalhaDaRecuperacaoSchema.shape.codigo.safeParse(e.codigo);
      if (r.success) return r.data;
    }
    if (e instanceof FalhaDaFerramentaNativa && e.codigo === "FERRAMENTA_FALHOU") {
      const r = FalhaDaRecuperacaoSchema.shape.codigo.safeParse(`NATIVO_${e.motivo}`);
      if (r.success) return r.data;
    }
    if (e instanceof FalhaDosVinculosAtuais) return "PROVA_VINCULOS_GLOBAIS_DIVERGENTES";
    if (e instanceof z.ZodError) return "CONFIGURACAO_INVALIDA";
    if (e instanceof AppError || e instanceof RecreioRenewalReviewError) {
      const r = FalhaDaRecuperacaoSchema.shape.codigo.safeParse(
        `${e instanceof AppError ? "APP" : "PROVIDER"}_${e.code}`,
      );
      if (r.success) return r.data;
    }
    if (e instanceof FalhaDeInventario) return `INVENTARIO_${e.codigo}`;
    if (e instanceof FalhaDaProva) {
      const r = FalhaDaRecuperacaoSchema.shape.codigo.safeParse(`PROVA_${e.codigo}`);
      if (r.success) return r.data;
    }
    if (e instanceof FalhaDaNormalizacao) return `NORMAL_${e.codigo}`;
    if (e instanceof AggregateError) fila.push(...e.errors.slice(0, 4));
    if (e instanceof Error && e.cause) fila.push(e.cause);
    if (e && typeof e === "object" && "code" in e && typeof e.code === "string") {
      const r = FalhaDaRecuperacaoSchema.shape.codigo.safeParse(`SQL_${e.code}`);
      if (r.success) return r.data;
    }
  }
  return "EXECUTOR";
}
function perdeuConexao(erro: unknown): boolean {
  const fila: unknown[] = [erro];
  for (let i = 0; i < 8 && fila.length; i++) {
    const e = fila.shift();
    if (e instanceof AggregateError) fila.push(...e.errors.slice(0, 4));
    if (e instanceof Error && e.cause) fila.push(e.cause);
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      typeof e.code === "string" &&
      ["57P01", "CONNECTION_ENDED", "CONNECTION_CLOSED", "CONNECTION_DESTROYED"].includes(e.code)
    )
      return true;
  }
  return false;
}
function chaveiro() {
  const texto = variavel("RECREIO_BACKUP_PROBE_MASTER_KEYS");
  delete process.env.RECREIO_BACKUP_PROBE_MASTER_KEYS;
  exigir(texto.length <= 16_384, "CHAVEIRO_FORA_DO_PERFIL");
  const r = z
    .record(z.string().regex(/^[A-Za-z0-9._-]{1,64}$/), z.string().regex(/^[A-Za-z0-9+/]{43}=$/))
    .parse(JSON.parse(texto));
  exigir(Object.keys(r).length > 0 && Object.keys(r).length <= 16, "CHAVEIRO_FORA_DO_PERFIL");
  const chaves = new Map<string, Buffer>();
  for (const [id, b64] of Object.entries(r)) {
    const b = Buffer.from(b64, "base64");
    exigir(b.length === 32 && b.toString("base64") === b64, "CHAVE_INVALIDA");
    chaves.set(id, b);
  }
  return chaves;
}

/** Worker GHA de leitura: não recebe conexão da origem e só restaura no
 * cluster novo privado. Configurações para tráfego/F7 são outra etapa. */
async function main() {
  exigir(
    process.platform === "linux" &&
      process.argv.length === 2 &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      /^[a-f0-9]{40}$/.test(variavel("GITHUB_SHA")) &&
      /^\d+$/.test(variavel("GITHUB_RUN_ID")) &&
      !process.env.DATABASE_URL &&
      !process.env.RECREIO_BACKUP_DATABASE_URL &&
      !process.env.RAILWAY_ENVIRONMENT_ID &&
      !process.env.RAILWAY_PROJECT_ID &&
      !process.env.POSTGRES_PASSWORD &&
      !process.env.PGPASSWORD &&
      !process.env.RECREIO_HOST_SECRETS,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const id = z.uuid().parse(variavel("RECREIO_BACKUP_PROBE_CAPTURE_ID")),
    bucket = variavel("RECREIO_S3_TEST_BUCKET"),
    endpoint = new URL(variavel("RECREIO_S3_TEST_ENDPOINT"));
  exigir(
    bucket === "recreio-homologacao-c0xyqx" && variavel("RECREIO_S3_EXPECTED_BUCKET") === bucket,
    "BUCKET_FORA_DO_ESCOPO",
  );
  exigir(
    endpoint.origin === "https://t3.storageapi.dev" &&
      endpoint.pathname === "/" &&
      !endpoint.search &&
      !endpoint.hash &&
      !endpoint.username &&
      !endpoint.password,
    "ENDPOINT_FORA_DO_ESCOPO",
  );
  const estilo = variavel("RECREIO_S3_TEST_PATH_STYLE");
  exigir(estilo === "true" || estilo === "false", "ESTILO_INVALIDO");
  const configS3 = {
    endpoint: endpoint.origin,
    region: variavel("RECREIO_S3_TEST_REGION"),
    forcePathStyle: estilo === "true",
    credentials: {
      accessKeyId: variavel("RECREIO_S3_TEST_ACCESS_KEY"),
      secretAccessKey: variavel("RECREIO_S3_TEST_SECRET_KEY"),
    },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  } satisfies S3ClientConfig;
  const cliente = new S3Client(configS3),
    clienteDireitos = new S3Client(configS3),
    clienteFinanceiro = new S3Client(configS3);
  const textoDireitos = variavel("RECREIO_BACKUP_PROBE_NATIVE_RIGHTS");
  delete process.env.RECREIO_BACKUP_PROBE_NATIVE_RIGHTS;
  // Eight typed synthetic decisions now include the original paid contract's
  // coordinates. This CI-only payload is still bounded and strictly parsed.
  exigir(textoDireitos.length <= 8192, "CONFIGURACAO_INVALIDA");
  const retiradaNativa = RetiradaNativaDeProvaSchema.parse(JSON.parse(textoDireitos));
  let leituras = 0;
  cliente.middlewareStack.add(
    (next, context) => async (args) => {
      const input = z
        .object({ Bucket: z.literal("recreio-homologacao-c0xyqx"), Key: z.string() })
        .parse(args.input);
      exigir(
        context.commandName === "GetObjectCommand" &&
          input.Key.startsWith(`recreio/v1/backup/${id}/`) &&
          /\/(manifesto\.json|retirado\.json|[a-f0-9]{64})$/.test(input.Key),
        "LEITURA_FORA_DO_BACKUP",
      );
      leituras++;
      return next(args);
    },
    { step: "initialize", name: "recreioColdRecoveryReadBoundary" },
  );
  const destino = {
      bucketId: "14cbada1-04eb-45cd-be30-94e10e4ba333",
      bucketName: bucket,
      escopo: "qualification" as const,
    },
    chaves = chaveiro(),
    ativa = variavel("RECREIO_BACKUP_PROBE_ACTIVE_KEY");
  const indice = criarIndiceDeRecuperacao({ destino, chaveAtiva: ativa, chaves }),
    codec = criarCifradorDeArquivos({
      chaveAtiva: ativa,
      chaves,
      limiteBytes: 32 * 1024 * 1024,
      tempoLimiteMs: 120_000,
    });
  for (const k of chaves.values()) k.fill(0);
  chaves.clear();
  const root = await mkdtemp(join(tmpdir(), "recreio-backup-provider-")),
    handles: FileHandle[] = [];
  let fotos = 0,
    ligadas = 0,
    removidos = false,
    clusterLimpo = false,
    resultado: unknown,
    normalizacao: Awaited<ReturnType<typeof normalizarFotografiasRestauradas>> | undefined,
    capacidades: Awaited<ReturnType<typeof provarCapacidadesRecuperadas>> | undefined,
    fontesHistoricas: Awaited<ReturnType<typeof provarFontesHistoricasRecuperadas>> | undefined,
    falha = false,
    codigoDaFalha: CodigoDaRecuperacao = "EXECUTOR",
    etapa: EtapaDaRecuperacao = "LEITURA";
  try {
    const arquivo = async (nome: string) => {
      exigir(/^[a-z-]+\.bin$/.test(nome), "ARQUIVO_FORA_DO_ESCOPO");
      const h = await open(join(root, nome), "wx+", 0o600);
      handles.push(h);
      return h;
    };
    const cifrado = await arquivo("cifrado.bin"),
      aberto = await arquivo("aberto.bin"),
      dump = await arquivo("dump.bin"),
      fotografia = await arquivo("fotografia.bin");
    const indices = criarArmazenamentoDoIndiceS3({
        cliente,
        bucket,
        indice,
        tempoLimiteMs: 30_000,
      }),
      fria = await indices.recuperar(id);
    const transporte = criarTransporteDeArquivosS3({
      cliente,
      bucket,
      cifrador: codec,
      limiteBytesCifrados: 32 * 1024 * 1024,
      tempoLimiteMs: 120_000,
    });
    await transporte.recuperar(fria.publicacao.arquivo, cifrado);
    await codec.abrir(cifrado, aberto, fria.publicacao.arquivo);
    const container = criarArquivoComposto({
        limiteBytes: 32 * 1024 * 1024,
        limiteFotografiaBytes: 4 * 1024 * 1024,
        tempoLimiteMs: 120_000,
      }),
      acesso = await container.abrir(aberto, fria.publicacao.composto);
    try {
      await acesso.copiarDump(dump);
      const inventario = await acesso.lerInventarioBanco();
      const prova = await comBancoRestaurado({ dump, inventario }, async (conexaoInicial) => {
        // Somente esta prova injeta FATAL. A inspeção posterior possui uma
        // conexão nova ao mesmo socket privado; nunca repete escritas incertas.
        etapa = "CONEXAO_DE_INSPECAO";
        const opcoes = z
          .object({
            host: z.tuple([z.string().regex(/^\/tmp\/recreio-backup-[A-Za-z0-9]+$/)]),
            port: z.tuple([z.literal(55432)]),
            database: z.string().regex(/^recreio_restore_[a-f0-9]{24}$/),
            user: z.string().min(1).max(63),
            pass: z.string().min(1),
          })
          .parse(conexaoInicial.options);
        let copia = conexaoInicial;
        let inspecao: postgres.Sql | undefined;
        try {
          etapa = "MANIFESTO";
          let divergencia = false;
          try {
            await normalizarFotografiasRestauradas({
              copia,
              acesso,
              fotografia,
              inventario: {
                ...fria.publicacao.inventario,
                sha256: `${fria.publicacao.inventario.sha256.startsWith("0") ? "1" : "0"}${fria.publicacao.inventario.sha256.slice(1)}`,
              },
            });
          } catch (e) {
            divergencia = e instanceof FalhaDaNormalizacao && e.codigo === "INVENTARIO";
          }
          exigir(divergencia, "MANIFESTO_DIVERGENTE_ADMITIDO");
          // Exclusivo desta CLI sintética: matar o backend depois das alterações
          // de foto/recibo, antes do controle, deve reverter a transação inteira.
          etapa = "INJETAR_QUEDA";
          await copia.unsafe(`create function recreio.normalization_loss_probe() returns trigger language plpgsql as $$
          begin if new.protocol_version=0 and old.protocol_version<>0 then perform pg_catalog.pg_terminate_backend(pg_catalog.pg_backend_pid()); end if; return new; end $$`);
          await copia.unsafe(
            `create trigger normalization_loss_probe before update on recreio.backup_captures for each row execute function recreio.normalization_loss_probe()`,
          );
          let perdeu = false;
          try {
            await normalizarFotografiasRestauradas({
              copia,
              acesso,
              fotografia,
              inventario: fria.publicacao.inventario,
            });
          } catch (e) {
            if (!perdeuConexao(e)) throw e;
            perdeu = true;
          }
          exigir(perdeu, "QUEDA_DE_CONEXAO_NAO_EXERCITADA");
          etapa = "ENCERRAR_CLIENTE";
          await conexaoInicial.end({ timeout: 5 });
          inspecao = postgres({
            host: opcoes.host[0],
            port: opcoes.port[0],
            database: opcoes.database,
            username: opcoes.user,
            password: opcoes.pass,
            ssl: false,
            max: 1,
            prepare: false,
            connect_timeout: 15,
            idle_timeout: 1,
          });
          copia = inspecao;
          etapa = "REMOVER_SONDA";
          await copia.unsafe("drop trigger normalization_loss_probe on recreio.backup_captures");
          await copia.unsafe("drop function recreio.normalization_loss_probe()");
          etapa = "CONFERIR_ROLLBACK";
          conferirInventarios(
            inventario,
            await copia.begin("isolation level repeatable read read only", inventariarBackup),
          );
          etapa = "NORMALIZAR";
          normalizacao = await normalizarFotografiasRestauradas({
            copia,
            acesso,
            fotografia,
            inventario: fria.publicacao.inventario,
          });
          let fotografiaId: string | undefined;
          for await (const item of acesso.objetos()) {
            fotografiaId = item.objeto.fotografiaId;
            break;
          }
          exigir(fotografiaId, "SEM_FOTOGRAFIA");
          const [foto] = await copia.unsafe<{ data: Buffer }[]>(
            "select data from recreio.space_snapshots where id=$1 and storage='pg'",
            [fotografiaId],
          );
          exigir(
            foto && Buffer.isBuffer(foto.data) && foto.data.length > 0,
            "FOTOGRAFIA_NORMALIZADA_AUSENTE",
          );
          const original = Buffer.from(foto.data),
            ruim = Buffer.from(foto.data);
          foto.data.fill(0);
          ruim.writeUInt8(ruim.readUInt8(0) ^ 1, 0);
          etapa = "CORROMPER_FOTO";
          let recusou = false;
          try {
            await copia.unsafe("update recreio.space_snapshots set data=$1 where id=$2", [
              ruim,
              fotografiaId,
            ]);
            etapa = "RECUSAR_CORRUPCAO";
            try {
              await normalizarFotografiasRestauradas({
                copia,
                acesso,
                fotografia,
                inventario: fria.publicacao.inventario,
              });
            } catch (e) {
              recusou = e instanceof FalhaDaNormalizacao && e.codigo === "INTEGRIDADE";
            }
            const [mantida] = await copia.unsafe<{ data: Buffer }[]>(
              "select data from recreio.space_snapshots where id=$1",
              [fotografiaId],
            );
            try {
              exigir(recusou, "CORRUPCAO_NAO_CLASSIFICADA");
              exigir(mantida?.data.equals(ruim), "CORRUPCAO_SOBRESCRITA");
            } finally {
              mantida?.data.fill(0);
            }
          } finally {
            try {
              await copia.unsafe("update recreio.space_snapshots set data=$1 where id=$2", [
                original,
                fotografiaId,
              ]);
            } finally {
              original.fill(0);
              ruim.fill(0);
            }
          }
          etapa = "REPETIR";
          const repetida = await normalizarFotografiasRestauradas({
            copia,
            acesso,
            fotografia,
            inventario: fria.publicacao.inventario,
          });
          exigir(
            JSON.stringify(normalizacao) === JSON.stringify(repetida),
            "NORMALIZACAO_NAO_REPETIVEL",
          );
          fotos = normalizacao.fotosAutenticadas;
          ligadas = normalizacao.vinculosConferidos;
          etapa = "CAPACIDADES";
          capacidades = await provarCapacidadesRecuperadas(copia);
          etapa = "FONTES_HISTORICAS";
          fontesHistoricas = await provarFontesHistoricasRecuperadas(
            copia,
            fria.publicacao.composto.sha256,
          );
        } finally {
          await inspecao?.end({ timeout: 5 });
        }
      });
      exigir(normalizacao, "NORMALIZACAO_AUSENTE");
      exigir(capacidades, "CAPACIDADES_SINTETICAS_AUSENTES");
      exigir(fontesHistoricas, "CAPACIDADES_SINTETICAS_AUSENTES");
      clusterLimpo = prova.temporariosRemovidos;
      etapa = "RETIRADA_NATIVA";
      let retirada: Awaited<ReturnType<typeof provarRetiradaNativaPosterior>> | undefined;
      let financeiro: Awaited<ReturnType<typeof provarFinanceiroRecuperado>> | undefined;
      let vinculosAtuais: Awaited<ReturnType<typeof provarVinculosGlobaisAtuais>> | undefined;
      // Reopen the authenticated dump in a separate fresh cluster. Never undo
      // an erasure to make the metadata/idempotence proof above appear intact.
      const segunda = await comBancoRestaurado(
        { dump, inventario },
        async (copia, ferramentasDaFonte) => {
          await normalizarFotografiasRestauradas({
            copia,
            acesso,
            fotografia,
            inventario: fria.publicacao.inventario,
          });
          await normalizarCapacidadesRestauradas(copia);
          etapa = "FINANCEIRO_NATIVO";
          financeiro = await provarFinanceiroRecuperado({
            copia,
            cliente: clienteFinanceiro,
            bucket,
            capturaSha256: fria.publicacao.composto.sha256,
            entrada: retiradaNativa.financeiro,
          });
          etapa = "RETIRADA_NATIVA";
          retirada = await provarRetiradaNativaPosterior({
            copia,
            cliente: clienteDireitos,
            bucket,
            capturaSha256: fria.publicacao.composto.sha256,
            entrada: retiradaNativa,
          });
          etapa = "VINCULOS_ATUAIS";
          const terceiro = await comBancoRestaurado(
            { dump, inventario },
            async (atual, ferramentasDoAtual) => {
              vinculosAtuais = await provarVinculosGlobaisAtuais(
                copia,
                atual,
                retiradaNativa.financeiro,
                { fonte: ferramentasDaFonte, atual: ferramentasDoAtual },
              );
            },
          );
          exigir(terceiro.temporariosRemovidos && vinculosAtuais, "VINCULOS_GLOBAIS_DIVERGENTES");
        },
      );
      exigir(
        financeiro && retirada && vinculosAtuais && segunda.temporariosRemovidos,
        "RETIRADA_NATIVA_NAO_CONCLUIDA",
      );
      clusterLimpo = clusterLimpo && segunda.temporariosRemovidos;
      exigir(leituras >= 3, "LEITURAS_DO_BACKUP_INCOMPLETAS");
      resultado = {
        source: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        capturaId: id,
        ok: true,
        freshCluster: true,
        ...provarCarregamentoDoControle(),
        conteudoIdentico: prova.conteudoIdentico,
        estruturaIdentica: prova.estruturaIdentica,
        globaisIdenticos: prova.globaisIdenticos,
        fotosAutenticadas: fotos,
        vinculosConferidos: ligadas,
        clusterCleanupConfirmed: clusterLimpo,
        sourceDatabaseCredentialsPresent: false,
        backupClientOnlyBackupPrefixRead: true,
        backupReadRequests: leituras,
        objectDestinationsNormalized: true,
        inventoryComparedBeforeNormalization: true,
        fotosEmPg: normalizacao.fotosEmPg,
        sourceObjectReceiptsQuarantined: normalizacao.recibosQuarentenados,
        backupControlsQuarantined: normalizacao.controlesQuarentenados,
        sourceOperationsRemaining: normalizacao.operacoesDeOrigemRestantes,
        sourceBucketReferencesRemaining: normalizacao.referenciasBucketRestantes,
        normalizationIdempotent: true,
        normalizationRollbackVerified: true,
        normalizationConnectionLossVerified: true,
        normalizedCorruptionRefused: true,
        manifestMismatchRefused: true,
        ...capacidades,
        ...fontesHistoricas,
        ...retirada,
        ...financeiro,
        ...vinculosAtuais,
        nativePostCaptureSecondClusterCleaned: true,
        authoritiesNormalizedForTraffic: false,
        productionDataTouched: false,
      };
    } finally {
      acesso.encerrar();
    }
  } catch (e) {
    falha = true;
    codigoDaFalha = codigoSeguro(e);
    if (e instanceof FalhaDoClusterIsolado) clusterLimpo = e.temporariosRemovidos;
  } finally {
    try {
      await limparDiretorioDeProva(root, handles, "recreio-backup-provider-");
      removidos = true;
    } catch {
      falha = true;
      codigoDaFalha = "LIMPEZA";
      etapa = "LIMPEZA";
    }
    indice.encerrar();
    cliente.destroy();
    clienteDireitos.destroy();
    clienteFinanceiro.destroy();
  }
  if (falha || !resultado || !removidos || !clusterLimpo)
    console.log(
      JSON.stringify(
        FalhaDaRecuperacaoSchema.parse({
          ok: false,
          codigo: codigoDaFalha,
          etapa,
          localCleanupConfirmed: removidos,
          clusterCleanupConfirmed: clusterLimpo,
        }),
      ),
    );
  exigir(!falha && resultado && removidos && clusterLimpo, "RECUPERACAO_FRIA_NAO_CONFIRMADA");
  console.log(
    JSON.stringify({
      ...z.record(z.string(), z.unknown()).parse(resultado),
      localCleanupConfirmed: removidos,
    }),
  );
}
main().catch(() => {
  console.error("Recuperacao fria recusada ou inconclusiva; detalhes privados nao serao exibidos.");
  process.exitCode = 1;
});
