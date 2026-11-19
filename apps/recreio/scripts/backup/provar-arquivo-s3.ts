import { randomBytes, randomUUID } from "node:crypto";
import { chmod, type FileHandle, mkdtemp, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { criarCifradorDeArquivos, FalhaDoArquivoCifrado } from "./arquivo-cifrado";
import { criarTransporteDeArquivosS3, FalhaDoTransporteDeArquivo } from "./arquivo-s3";
import {
  exigir,
  FalhaDaProva,
  gravarSintetico,
  limparDiretorioDeProva,
  resumoDoArquivo,
} from "./provas-arquivos";

const TAMANHO = 64 * 1024 * 1024;
const variavel = (nome: string) => {
  const v = process.env[nome];
  if (!v) throw new FalhaDaProva("CONFIGURACAO_AUSENTE");
  return v;
};
const codigo = (e: unknown) =>
  e instanceof FalhaDaProva ||
  e instanceof FalhaDoArquivoCifrado ||
  e instanceof FalhaDoTransporteDeArquivo
    ? e.codigo
    : "PROVA_DE_ARQUIVO_INCONCLUSIVA";
type ReciboDaProva = {
  source: string;
  runId: string;
  boundary: string;
  status: "failed" | "passed";
  bucket: string;
  objectKey: string;
  plainBytes: number;
  cipherBytes: number;
  encryptMs: number;
  uploadReadbackMs: number;
  recoveryMs: number;
  replayMs: number;
  maxRssBytes: number;
  conditionalWriteVerified: boolean;
  replayVerified: boolean;
  localCipherRemoved: boolean;
  recoveredWithoutLocalCipher: boolean;
  roundtripVerified: boolean;
  anonymousReadDenied: boolean;
  oneObjectOnly: boolean;
  remoteCleanupConfirmed: boolean;
  localCleanupConfirmed: boolean;
  failure: string | null;
  remoteCleanupFailure: string | null;
  localCleanupFailure: string | null;
  productionDataTouched: false;
};
async function main() {
  exigir(
    process.platform === "linux" &&
      process.argv.length === 2 &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
      /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") &&
      process.env.RUNNER_TEMP &&
      !process.env.RAILWAY_ENVIRONMENT_ID &&
      !process.env.DATABASE_URL,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const bucket = variavel("RECREIO_S3_TEST_BUCKET"),
    endpoint = new URL(variavel("RECREIO_S3_TEST_ENDPOINT"));
  exigir(
    bucket === "recreio-homologacao-c0xyqx" && bucket === variavel("RECREIO_S3_EXPECTED_BUCKET"),
    "BUCKET_FORA_DO_ESCOPO",
  );
  exigir(
    endpoint.protocol === "https:" &&
      endpoint.hostname === "t3.storageapi.dev" &&
      endpoint.pathname === "/" &&
      !endpoint.port &&
      !endpoint.search &&
      !endpoint.hash &&
      !endpoint.username &&
      !endpoint.password,
    "ENDPOINT_FORA_DO_ESCOPO",
  );
  const estilo = variavel("RECREIO_S3_TEST_PATH_STYLE");
  exigir(estilo === "true" || estilo === "false", "ESTILO_FORA_DO_ESCOPO");
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
  const recibo: ReciboDaProva = {
    source: variavel("GITHUB_SHA"),
    runId: variavel("GITHUB_RUN_ID"),
    boundary: "private_file_provider_with_synthetic_bytes_no_database",
    status: "failed",
    bucket,
    objectKey: "",
    plainBytes: TAMANHO,
    cipherBytes: 0,
    encryptMs: 0,
    uploadReadbackMs: 0,
    recoveryMs: 0,
    replayMs: 0,
    maxRssBytes: 0,
    conditionalWriteVerified: false,
    replayVerified: false,
    localCipherRemoved: false,
    recoveredWithoutLocalCipher: false,
    roundtripVerified: false,
    anonymousReadDenied: false,
    oneObjectOnly: false,
    remoteCleanupConfirmed: false,
    localCleanupConfirmed: false,
    failure: null,
    remoteCleanupFailure: null,
    localCleanupFailure: null,
    productionDataTouched: false,
  };
  const guardarRecibo = () =>
    writeFile(
      resolve(variavel("RUNNER_TEMP"), "recreio-arquivo-provider.json"),
      `${JSON.stringify(recibo, null, 2)}\n`,
    );
  const contexto = { tipo: "backup", id: randomUUID() };
  const prefixo = `recreio/v1/backup/${contexto.id}/`;
  let root = "",
    admitida = false;
  const handles: FileHandle[] = [];
  async function limparRemoto() {
    await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: recibo.objectKey }), {
      abortSignal: AbortSignal.timeout(15_000),
    });
    const lista = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 2 }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    exigir(lista.IsTruncated === false && !lista.Contents?.length, "LIMPEZA_REMOTA_NAO_CONFIRMADA");
    let ausente = false;
    try {
      const r = await cliente.send(
        new GetObjectCommand({ Bucket: bucket, Key: recibo.objectKey }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
      if (r.Body instanceof Readable) r.Body.destroy();
    } catch (e) {
      if (
        e instanceof S3ServiceException &&
        e.name === "NoSuchKey" &&
        e.$metadata.httpStatusCode === 404
      )
        ausente = true;
      else throw e;
    }
    exigir(ausente, "ARQUIVO_AINDA_PRESENTE");
  }
  try {
    const antes = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 2 }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    exigir(antes.IsTruncated === false && !antes.Contents?.length, "PREFIXO_NAO_VAZIO");
    root = await mkdtemp(join(tmpdir(), "recreio-backup-provider-"));
    await chmod(root, 0o700);
    const arquivo = async (
      nome:
        | "origem.bin"
        | "cipher.bin"
        | "readback.bin"
        | "replay.bin"
        | "recovery.bin"
        | "opened.bin",
    ) => {
      const h = await open(join(root, nome), "wx+", 0o600);
      handles.push(h);
      return h;
    };
    const origem = await arquivo("origem.bin"),
      cipher = await arquivo("cipher.bin"),
      readback = await arquivo("readback.bin"),
      replay = await arquivo("replay.bin"),
      recovery = await arquivo("recovery.bin"),
      opened = await arquivo("opened.bin");
    const esperado = await gravarSintetico(origem, TAMANHO);
    const chave = randomBytes(32);
    const codec = criarCifradorDeArquivos({
      chaveAtiva: "prova-arquivo-descartavel",
      chaves: new Map([["prova-arquivo-descartavel", chave]]),
      limiteBytes: 128 * 1024 * 1024,
      tempoLimiteMs: 120_000,
    });
    chave.fill(0);
    const t0 = performance.now(),
      ref = await codec.cifrar(origem, cipher, contexto);
    recibo.encryptMs = Math.round(performance.now() - t0);
    recibo.cipherBytes = ref.bytesCifrados;
    exigir(ref.bytes === TAMANHO && ref.sha256 === esperado, "REFERENCIA_DIVERGENTE");
    recibo.objectKey = `${prefixo}${ref.sha256Cifrado}`;
    const transporte = criarTransporteDeArquivosS3({
      cliente,
      bucket,
      cifrador: codec,
      limiteBytesCifrados: 128 * 1024 * 1024,
      tempoLimiteMs: 120_000,
    });
    // Persistir chave/escopo técnicos antes da primeira tentativa externa.
    await guardarRecibo();
    admitida = true;
    const t1 = performance.now();
    await transporte.enviar(ref, cipher, readback);
    recibo.uploadReadbackMs = Math.round(performance.now() - t1);
    let condicao = false;
    try {
      await cliente.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: recibo.objectKey,
          Body: Buffer.from("NAO_SOBRESCREVER_ARQUIVO"),
          ContentType: "application/octet-stream",
          IfNoneMatch: "*",
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
    } catch (e) {
      if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 412) condicao = true;
      else throw e;
    }
    exigir(condicao, "ESCRITA_CONDICIONAL_NAO_RESPEITADA");
    recibo.conditionalWriteVerified = true;
    const t2 = performance.now();
    await transporte.enviar(ref, cipher, replay);
    recibo.replayMs = Math.round(performance.now() - t2);
    recibo.replayVerified = true;
    // Simular perda da cópia local após upload/readback, não reinício de chave.
    // Recuperar usa apenas a referência já persistida e a chave em custódia.
    await cipher.truncate(0);
    await cipher.sync();
    recibo.localCipherRemoved = true;
    const t3 = performance.now();
    await transporte.recuperar(ref, recovery);
    recibo.recoveryMs = Math.round(performance.now() - t3);
    recibo.recoveredWithoutLocalCipher = true;
    await codec.abrir(recovery, opened, ref);
    const voltou = await resumoDoArquivo(opened);
    exigir(voltou.bytes === TAMANHO && voltou.sha256 === esperado, "ABERTURA_DIVERGENTE");
    const original = await resumoDoArquivo(origem);
    exigir(original.bytes === TAMANHO && original.sha256 === esperado, "ORIGEM_ALTERADA");
    recibo.roundtripVerified = true;
    const lista = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 2 }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    exigir(
      lista.IsTruncated === false &&
        lista.Contents?.length === 1 &&
        lista.Contents[0]?.Key === recibo.objectKey &&
        lista.Contents[0]?.Size === ref.bytesCifrados,
      "INVENTARIO_DIVERGENTE",
    );
    recibo.oneObjectOnly = true;
    const anonima = new URL(endpoint.origin);
    if (estilo === "true") anonima.pathname = `/${bucket}/${recibo.objectKey}`;
    else {
      anonima.hostname = `${bucket}.${endpoint.hostname}`;
      anonima.pathname = `/${recibo.objectKey}`;
    }
    const resposta = await fetch(anonima, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    try {
      exigir([401, 403, 404].includes(resposta.status), "LEITURA_ANONIMA_PERMITIDA");
      recibo.anonymousReadDenied = true;
    } finally {
      await resposta.body?.cancel();
    }
    recibo.maxRssBytes = process.resourceUsage().maxRSS * 1024;
    recibo.status = "passed";
  } catch (e) {
    recibo.failure = codigo(e);
  } finally {
    if (admitida) {
      try {
        await limparRemoto();
        recibo.remoteCleanupConfirmed = true;
      } catch (e) {
        recibo.remoteCleanupFailure = codigo(e);
      }
    } else recibo.remoteCleanupConfirmed = true;
    try {
      await limparDiretorioDeProva(root, handles, "recreio-backup-provider-");
      recibo.localCleanupConfirmed = true;
    } catch (e) {
      recibo.localCleanupFailure = codigo(e);
    }
    cliente.destroy();
  }
  if (!recibo.remoteCleanupConfirmed || !recibo.localCleanupConfirmed) recibo.status = "failed";
  await guardarRecibo();
  console.log(JSON.stringify(recibo));
  if (recibo.status !== "passed") process.exitCode = 1;
}
main().catch(() => {
  console.error("Prova de arquivo recusada ou inconclusiva; nenhum detalhe privado será exibido.");
  process.exitCode = 1;
});
