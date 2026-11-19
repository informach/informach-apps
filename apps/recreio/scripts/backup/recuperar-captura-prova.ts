import { type FileHandle, mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";

import { criarCifradorDeArquivos } from "./arquivo-cifrado";
import { criarArquivoComposto } from "./arquivo-composto";
import { criarTransporteDeArquivosS3 } from "./arquivo-s3";
import { comBancoRestaurado, FalhaDoClusterIsolado } from "./cluster-isolado";
import { type CodigoDaRecuperacao, FalhaDaRecuperacaoSchema } from "./diagnostico-recuperacao";
import { criarIndiceDeRecuperacao } from "./indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "./indice-s3";
import { conferirInventarios, inventariarBackup } from "./inventario";
import { FalhaDaNormalizacao, normalizarFotografiasRestauradas } from "./normalizar-fotografias";
import { exigir, limparDiretorioDeProva } from "./provas-arquivos";

const variavel = (nome: string) => {
  const v = process.env[nome];
  exigir(v, "CONFIGURACAO_AUSENTE");
  return v;
};
function codigoSeguro(erro: unknown): CodigoDaRecuperacao {
  const fila: unknown[] = [erro];
  for (let i = 0; i < 8 && fila.length; i++) {
    const e = fila.shift();
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
      ["57P01", "CONNECTION_ENDED", "CONNECTION_CLOSED", "CONNECTION_DESTROYED"].includes(
        String(e.code),
      )
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
  const cliente = new S3Client({
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
  });
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
    falha = false,
    codigoDaFalha: CodigoDaRecuperacao = "EXECUTOR";
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
      const prova = await comBancoRestaurado({ dump, inventario }, async (copia) => {
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
        await copia.unsafe(`create function recreio.normalization_loss_probe() returns trigger language plpgsql as $$
          begin if new.protocol_version=0 and old.protocol_version<>0 then perform pg_catalog.pg_terminate_backend(pg_catalog.pg_backend_pid()); end if; return new; end $$`);
        let perdeu = false;
        try {
          await copia.unsafe(
            `create trigger normalization_loss_probe before update on recreio.backup_captures for each row execute function recreio.normalization_loss_probe()`,
          );
          try {
            await normalizarFotografiasRestauradas({
              copia,
              acesso,
              fotografia,
              inventario: fria.publicacao.inventario,
            });
          } catch (e) {
            perdeu = perdeuConexao(e);
          }
        } finally {
          await copia.unsafe(
            "drop trigger if exists normalization_loss_probe on recreio.backup_captures",
          );
          await copia.unsafe("drop function recreio.normalization_loss_probe()");
        }
        exigir(perdeu, "QUEDA_DE_CONEXAO_NAO_EXERCITADA");
        conferirInventarios(
          inventario,
          await copia.begin("isolation level repeatable read read only", inventariarBackup),
        );
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
        exigir(fotografiaId, "PROVA_SEM_FOTOGRAFIA");
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
        let recusou = false;
        try {
          await copia.unsafe("update recreio.space_snapshots set data=$1 where id=$2", [
            ruim,
            fotografiaId,
          ]);
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
            exigir(recusou && mantida?.data.equals(ruim), "CORRUPCAO_SOBRESCRITA");
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
      });
      exigir(normalizacao, "NORMALIZACAO_AUSENTE");
      clusterLimpo = prova.temporariosRemovidos;
      exigir(leituras >= 3, "LEITURAS_DO_BACKUP_INCOMPLETAS");
      resultado = {
        source: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        capturaId: id,
        ok: true,
        freshCluster: true,
        conteudoIdentico: prova.conteudoIdentico,
        estruturaIdentica: prova.estruturaIdentica,
        globaisIdenticos: prova.globaisIdenticos,
        fotosAutenticadas: fotos,
        vinculosConferidos: ligadas,
        clusterCleanupConfirmed: clusterLimpo,
        sourceDatabaseCredentialsPresent: false,
        onlyBackupPrefixRead: true,
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
    }
    indice.encerrar();
    cliente.destroy();
  }
  if (falha || !resultado || !removidos || !clusterLimpo)
    console.log(
      JSON.stringify(
        FalhaDaRecuperacaoSchema.parse({
          ok: false,
          codigo: codigoDaFalha,
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
