import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { exigir, FalhaDaProva } from "../scripts/backup/provas-arquivos";
import { conexao } from "./backup-arquivos-apoio";
import type { ReciboDoClusterFrio } from "./backup-cluster-frio-apoio";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

/** Porta exclusiva de qualificação. Sem flag explícita usa HTTP fechado; a
 * prova externa só aceita o bucket já autorizado e banco descartável do CI. */
export async function criarBucketDaMontagem() {
  const modo = process.env.RECREIO_BACKUP_PROVIDER_PROBE;
  exigir(modo === undefined || modo === "1", "MODO_DE_PROVA_INVALIDO");
  const externa = modo === "1";
  conexao();
  const variavel = (nome: string) => {
    const v = process.env[nome];
    exigir(v, "CONFIGURACAO_AUSENTE");
    return v;
  };
  let fixture: Awaited<ReturnType<typeof criarBucketS3DeTeste>> | undefined;
  let endpoint: URL | undefined,
    estilo = false;
  if (externa) {
    exigir(
      process.platform === "linux" &&
        process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
        !process.env.RAILWAY_ENVIRONMENT_ID &&
        /^\d+$/.test(variavel("GITHUB_RUN_ID")) &&
        /^[a-f0-9]{40}$/.test(variavel("GITHUB_SHA")) &&
        process.env.RUNNER_TEMP,
      "EXECUTOR_FORA_DO_ESCOPO",
    );
    exigir(
      variavel("RECREIO_S3_TEST_BUCKET") === "recreio-homologacao-c0xyqx" &&
        variavel("RECREIO_S3_EXPECTED_BUCKET") === "recreio-homologacao-c0xyqx",
      "BUCKET_FORA_DO_ESCOPO",
    );
    endpoint = new URL(variavel("RECREIO_S3_TEST_ENDPOINT"));
    exigir(
      endpoint.origin === "https://t3.storageapi.dev" &&
        endpoint.pathname === "/" &&
        !endpoint.search &&
        !endpoint.hash &&
        !endpoint.username &&
        !endpoint.password,
      "ENDPOINT_FORA_DO_ESCOPO",
    );
    exigir(["true", "false"].includes(variavel("RECREIO_S3_TEST_PATH_STYLE")), "ESTILO_INVALIDO");
    estilo = variavel("RECREIO_S3_TEST_PATH_STYLE") === "true";
  } else fixture = await criarBucketS3DeTeste();
  const destino = {
    bucketId: externa ? "14cbada1-04eb-45cd-be30-94e10e4ba333" : randomUUID(),
    bucketName: externa ? "recreio-homologacao-c0xyqx" : "recreio-fixture",
    escopo: "qualification" as const,
  };
  const cliente =
    fixture?.cliente ??
    new S3Client({
      endpoint: endpoint?.origin,
      region: variavel("RECREIO_S3_TEST_REGION"),
      forcePathStyle: estilo,
      credentials: {
        accessKeyId: variavel("RECREIO_S3_TEST_ACCESS_KEY"),
        secretAccessKey: variavel("RECREIO_S3_TEST_SECRET_KEY"),
      },
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  const prefixos = new Set<string>(),
    chaves = new Set<string>(),
    pedidos: { metodo: string; url: string }[] = [];
  const recibo = {
    source: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    boundary:
      process.env.RECREIO_BACKUP_FRESH_CLUSTER_PROBE === "1"
        ? "synthetic_native_capture_stored_composite_fresh_cluster_restore"
        : "synthetic_native_capture_sql_photo_signed_index_same_cluster_restore",
    status: "failed",
    externalProvider: externa,
    productionDataTouched: false,
    bucket: destino.bucketName,
    objectKeys: [] as string[],
    nativeRecoveryVerified: false,
    retirementVerified: false,
    anonymousReadDenied: false,
    cleanupConfirmed: false,
    failure: null as string | null,
    cleanupFailure: null as string | null,
    freshCluster: false,
    objectDestinationsNormalized: false,
    authoritiesNormalizedForTraffic: false,
    durableCaptureFinalized: false,
    nativeCollectionVerified: false,
    durableArchiveRetirementVerified: false,
    archiveAnonymousReadDenied: false,
  };
  let frio: ReciboDoClusterFrio | undefined;
  const guardar = async () => {
    if (externa)
      await writeFile(
        resolve(variavel("RUNNER_TEMP"), "recreio-captura-provider.json"),
        `${JSON.stringify({ ...recibo, coldRecovery: frio ?? null }, null, 2)}\n`,
      );
  };
  await guardar();
  cliente.middlewareStack.add(
    (next, context) => async (args) => {
      const input = z
        .object({ Bucket: z.string(), Key: z.string().optional(), Prefix: z.string().optional() })
        .parse(args.input);
      exigir(input.Bucket === destino.bucketName, "BUCKET_DIVERGENTE");
      const key = input.Key ?? input.Prefix ?? "";
      exigir(
        [...prefixos].some((p) => key.startsWith(p)),
        "CHAVE_FORA_DO_ESCOPO",
      );
      const metodo =
        context.commandName === "PutObjectCommand"
          ? "PUT"
          : context.commandName === "DeleteObjectCommand"
            ? "DELETE"
            : "GET";
      if (metodo === "PUT") {
        exigir(
          /^recreio\/v1\/(fotografia|backup)\/[a-f0-9-]{36}\/(?:[a-f0-9]{64}|manifesto\.json|retirado\.json)$/.test(
            key,
          ),
          "CHAVE_INVALIDA",
        );
        chaves.add(key);
        recibo.objectKeys = [...chaves];
        await guardar();
      }
      pedidos.push({ metodo, url: key });
      try {
        return await next(args);
      } catch (e) {
        // Não deixar mensagens/campos do provedor imprimirem credenciais em falhas do Vitest.
        if (e instanceof S3ServiceException)
          throw new S3ServiceException({
            name: ["NoSuchKey", "NoSuchBucket", "AccessDenied", "PreconditionFailed"].includes(
              e.name,
            )
              ? e.name
              : "ProviderError",
            $fault: e.$fault,
            $metadata: { httpStatusCode: e.$metadata.httpStatusCode },
            message: "recreio.capture_provider.failure",
          });
        throw new FalhaDaProva("PROVEDOR_INCONCLUSIVO");
      }
    },
    { step: "initialize", name: "recreioCaptureQualificationBoundary" },
  );
  async function admitirPrefixo(tipo: "fotografia" | "backup", id: string) {
    exigir(z.uuid().safeParse(id).success, "CONTEXTO_INVALIDO");
    const prefixo = `recreio/v1/${tipo}/${id}/`;
    exigir(prefixos.size < 2 && !prefixos.has(prefixo), "PREFIXO_JA_ADMITIDO");
    prefixos.add(prefixo);
    const lista = await cliente.send(
      new ListObjectsV2Command({ Bucket: destino.bucketName, Prefix: prefixo, MaxKeys: 2 }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    exigir(lista.IsTruncated === false && !lista.Contents?.length, "PREFIXO_NAO_VAZIO");
  }
  async function ausencia(key: string) {
    try {
      const r = await cliente.send(new GetObjectCommand({ Bucket: destino.bucketName, Key: key }), {
        abortSignal: AbortSignal.timeout(15_000),
      });
      if (r.Body instanceof Readable) r.Body.destroy();
      throw new FalhaDaProva("OBJETO_AINDA_PRESENTE");
    } catch (e) {
      if (
        !(
          e instanceof S3ServiceException &&
          e.name === "NoSuchKey" &&
          e.$metadata.httpStatusCode === 404
        )
      )
        throw e;
    }
  }
  async function confirmarAusenciaDaFoto(key: string) {
    exigir(
      chaves.has(key) && key.startsWith("recreio/v1/fotografia/"),
      "FOTOGRAFIA_FORA_DO_ESCOPO",
    );
    await ausencia(key);
    recibo.nativeCollectionVerified = true;
    await guardar();
  }
  async function confirmarPublicacaoDuravel(id: string) {
    exigir(prefixos.has(`recreio/v1/backup/${id}/`), "PUBLICACAO_FORA_DO_ESCOPO");
    recibo.durableCaptureFinalized = true;
    await guardar();
  }
  function arquivoDaCaptura(id: string) {
    exigir(z.uuid().safeParse(id).success, "CAPTURA_INVALIDA");
    const lista = [...chaves].filter(
      (k) =>
        k.startsWith(`recreio/v1/backup/${id}/`) &&
        /^[a-f0-9]{64}$/.test(k.split("/").at(-1) ?? ""),
    );
    exigir(lista.length === 1 && lista[0], "ARQUIVO_FORA_DO_ESCOPO");
    return lista[0];
  }
  async function negativaAnonima(key: string) {
    exigir(chaves.has(key), "CHAVE_FORA_DO_ESCOPO");
    if (!externa || !endpoint) return;
    const url = new URL(endpoint.origin);
    if (estilo) url.pathname = `/${destino.bucketName}/${key}`;
    else {
      url.hostname = `${destino.bucketName}.${endpoint.hostname}`;
      url.pathname = `/${key}`;
    }
    const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    try {
      exigir([401, 403, 404].includes(r.status), "LEITURA_ANONIMA_PERMITIDA");
    } finally {
      await r.body?.cancel();
    }
  }
  async function confirmarArquivoPrivado(id: string) {
    const key = arquivoDaCaptura(id),
      r = await cliente.send(new GetObjectCommand({ Bucket: destino.bucketName, Key: key }), {
        abortSignal: AbortSignal.timeout(15000),
      }),
      body = r.Body;
    exigir(body instanceof Readable, "ARQUIVO_SEM_CORPO");
    const fim = finished(body).catch(() => undefined);
    body.destroy();
    await fim;
    exigir(r.$metadata.httpStatusCode === 200, "ARQUIVO_NAO_PRESENTE");
    await negativaAnonima(key);
    recibo.archiveAnonymousReadDenied = externa;
    await guardar();
  }
  async function confirmarRetiradaDuravel(id: string) {
    await ausencia(arquivoDaCaptura(id));
    recibo.durableArchiveRetirementVerified = true;
    await guardar();
  }
  async function registrarFalhaControlada(codigo: string) {
    exigir(/^[A-Z0-9_]{1,100}$/.test(codigo), "CLASSIFICADOR_INVALIDO");
    recibo.failure = codigo;
    recibo.status = "failed";
    await guardar();
  }
  async function concluir() {
    exigir(recibo.durableCaptureFinalized, "PUBLICACAO_DURAVEL_AUSENTE");
    exigir(recibo.nativeCollectionVerified, "COLETA_NATIVA_AUSENTE");
    exigir(recibo.durableArchiveRetirementVerified, "RETIRADA_DURAVEL_AUSENTE");
    exigir(!externa || recibo.archiveAnonymousReadDenied, "PRIVACIDADE_DO_ARQUIVO_AUSENTE");
    exigir(process.env.RECREIO_BACKUP_FRESH_CLUSTER_PROBE !== "1" || frio, "CLUSTER_FRIO_AUSENTE");
    exigir(chaves.size === 4 && prefixos.size === 2, "INVENTARIO_DA_PROVA_DIVERGENTE");
    if (externa) {
      for (const key of chaves)
        if (key.startsWith("recreio/v1/backup/")) await negativaAnonima(key);
      recibo.anonymousReadDenied = true;
    }
    recibo.nativeRecoveryVerified = true;
    recibo.retirementVerified = true;
    recibo.status = "passed";
    await guardar();
  }
  async function confirmarClusterFrio(r: ReciboDoClusterFrio | undefined) {
    if (!r) {
      exigir(process.env.RECREIO_BACKUP_FRESH_CLUSTER_PROBE !== "1", "CLUSTER_FRIO_AUSENTE");
      return;
    }
    exigir(
      externa &&
        r.source === process.env.GITHUB_SHA &&
        r.runId === process.env.GITHUB_RUN_ID &&
        prefixos.has(`recreio/v1/backup/${r.capturaId}/`) &&
        r.ok &&
        r.clusterCleanupConfirmed &&
        r.localCleanupConfirmed,
      "RECIBO_FRIO_DIVERGENTE",
    );
    frio = r;
    recibo.freshCluster = true;
    recibo.objectDestinationsNormalized = r.objectDestinationsNormalized;
    await guardar();
  }
  async function fechar() {
    try {
      for (const key of chaves) {
        await cliente.send(new DeleteObjectCommand({ Bucket: destino.bucketName, Key: key }), {
          abortSignal: AbortSignal.timeout(15_000),
        });
        await ausencia(key);
      }
      for (const prefixo of prefixos) {
        const r = await cliente.send(
          new ListObjectsV2Command({ Bucket: destino.bucketName, Prefix: prefixo, MaxKeys: 2 }),
          { abortSignal: AbortSignal.timeout(15_000) },
        );
        exigir(r.IsTruncated === false && !r.Contents?.length, "LIMPEZA_NAO_CONFIRMADA");
      }
      recibo.cleanupConfirmed = true;
    } catch {
      recibo.status = "failed";
      recibo.cleanupFailure = "LIMPEZA_INCONCLUSIVA";
    } finally {
      if (!recibo.nativeRecoveryVerified) recibo.failure = "PROVA_INCONCLUSIVA";
      try {
        await guardar();
      } finally {
        if (fixture) await fixture.fechar();
        else cliente.destroy();
      }
    }
    exigir(recibo.status === "passed" && recibo.cleanupConfirmed, "CAPTURA_PROVIDER_INCONCLUSIVA");
  }
  return {
    cliente,
    destino,
    pedidos,
    admitirPrefixo,
    confirmarAusenciaDaFoto,
    confirmarClusterFrio,
    confirmarPublicacaoDuravel,
    confirmarArquivoPrivado,
    confirmarRetiradaDuravel,
    registrarFalhaControlada,
    concluir,
    fechar,
  };
}
