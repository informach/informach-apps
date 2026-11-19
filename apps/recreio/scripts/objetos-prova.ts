import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { criarCifradorDeObjetos, FalhaDoObjetoPrivado } from "../src/features/objetos/criptografia";
import {
  criarArmazenamentoPrivadoS3,
  FalhaDoArmazenamentoPrivado,
} from "../src/features/objetos/s3";

class FalhaDaProva extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}
const exigir = (sim: unknown, codigo: string): void => {
  if (!sim) throw new FalhaDaProva(codigo);
};
function variavel(nome: string) {
  const valor = process.env[nome];
  if (!valor) throw new FalhaDaProva("CONFIGURACAO_AUSENTE");
  return valor;
}
function codigo(erro: unknown) {
  return erro instanceof FalhaDaProva ||
    erro instanceof FalhaDoArmazenamentoPrivado ||
    erro instanceof FalhaDoObjetoPrivado
    ? erro.codigo
    : "PROVA_INCONCLUSIVA";
}
type ReciboDaProva = {
  source: string;
  runId: string;
  boundary: string;
  status: "failed" | "passed";
  bucket: string;
  objectKey: string;
  conditionalWriteVerified: boolean;
  cipherIntegrityVerified: boolean;
  replayVerified: boolean;
  anonymousReadDenied: boolean;
  cleanupConfirmed: boolean;
  failure: string | null;
  cleanupFailure: string | null;
  productionDataTouched: false;
};
async function main() {
  exigir(
    process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
      process.env.RUNNER_TEMP,
    "EXECUTOR_NAO_AUTORIZADO",
  );
  const recibo: ReciboDaProva = {
    source: variavel("GITHUB_SHA"),
    runId: variavel("GITHUB_RUN_ID"),
    boundary: "isolated_provider_object",
    status: "failed",
    bucket: "",
    objectKey: "",
    conditionalWriteVerified: false,
    cipherIntegrityVerified: false,
    replayVerified: false,
    anonymousReadDenied: false,
    cleanupConfirmed: false,
    failure: null,
    cleanupFailure: null,
    productionDataTouched: false,
  };
  try {
    const bucket = variavel("RECREIO_S3_TEST_BUCKET"),
      endpoint = new URL(variavel("RECREIO_S3_TEST_ENDPOINT"));
    exigir(
      /^recreio-homologacao-[a-z0-9-]+$/.test(bucket) &&
        bucket === variavel("RECREIO_S3_EXPECTED_BUCKET"),
      "BUCKET_FORA_DO_ESCOPO",
    );
    exigir(
      endpoint.protocol === "https:" &&
        endpoint.pathname === "/" &&
        !endpoint.search &&
        !endpoint.hash &&
        !endpoint.username &&
        !endpoint.password &&
        (endpoint.hostname === "storageapi.dev" || endpoint.hostname.endsWith(".storageapi.dev")),
      "ENDPOINT_FORA_DO_ESCOPO",
    );
    const estilo = variavel("RECREIO_S3_TEST_PATH_STYLE");
    exigir(estilo === "true" || estilo === "false", "ESTILO_NAO_CONFIGURADO");
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
    const cifrador = criarCifradorDeObjetos({
      chaveAtiva: "prova-descartavel",
      chaves: new Map([["prova-descartavel", randomBytes(32)]]),
      limiteBytes: 4096,
    });
    const storage = criarArmazenamentoPrivadoS3({
      cliente,
      bucket,
      cifrador,
      tempoLimiteMs: 10_000,
    });
    const contexto = { tipo: "exportacao", id: randomUUID() } as const;
    const aberto = Buffer.from("RECREIO_PROVA_SINTETICA_SEM_DADOS_DE_USUARIO");
    const preparado = cifrador.cifrar(contexto, aberto);
    const prefixo = `recreio/v1/exportacao/${contexto.id}/`,
      key = `${prefixo}${preparado.referencia.sha256Cifrado}`;
    recibo.bucket = bucket;
    recibo.objectKey = key;
    async function limparObjetoProprio() {
      await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
      const depois = await cliente.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 2 }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      exigir(depois.IsTruncated === false && !depois.Contents?.length, "LIMPEZA_NAO_CONFIRMADA");
      let ausente = false;
      try {
        const inesperado = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(10_000),
        });
        if (inesperado.Body instanceof Readable) inesperado.Body.destroy();
      } catch (erro) {
        if (
          erro instanceof S3ServiceException &&
          erro.name === "NoSuchKey" &&
          erro.$metadata.httpStatusCode === 404
        )
          ausente = true;
        else throw erro;
      }
      exigir(ausente, "OBJETO_AINDA_PRESENTE");
    }
    let admitida = false;
    try {
      const antes = await cliente.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 2 }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      exigir(antes.IsTruncated === false && !antes.Contents?.length, "PREFIXO_NAO_VAZIO");
      // Preparo durável antes da primeira escrita. Só contém IDs/digests sintéticos.
      await writeFile(
        resolve(variavel("RUNNER_TEMP"), "recreio-objetos-provider.json"),
        JSON.stringify(recibo),
      );
      admitida = true;
      await storage.enviar(preparado);
      const voltou = await storage.recuperar(preparado.referencia);
      exigir(voltou.equals(aberto), "CONTEUDO_DIVERGENTE");
      voltou.fill(0);
      recibo.cipherIntegrityVerified = true;
      await storage.enviar(preparado);
      recibo.replayVerified = true;
      let condicao = false;
      try {
        await cliente.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: Buffer.from("NAO_SOBRESCREVER"),
            ContentType: "application/octet-stream",
            IfNoneMatch: "*",
          }),
          { abortSignal: AbortSignal.timeout(10_000) },
        );
      } catch (erro) {
        if (erro instanceof S3ServiceException && erro.$metadata.httpStatusCode === 412)
          condicao = true;
        else throw erro;
      }
      exigir(condicao, "CONDICAO_NAO_RESPEITADA");
      recibo.conditionalWriteVerified = true;
      const intacto = await storage.recuperar(preparado.referencia);
      exigir(intacto.equals(aberto), "REPLAY_ALTEROU_OBJETO");
      intacto.fill(0);
      const anonima = new URL(endpoint.origin);
      if (estilo === "true") anonima.pathname = `/${bucket}/${key}`;
      else {
        anonima.hostname = `${bucket}.${endpoint.hostname}`;
        anonima.pathname = `/${key}`;
      }
      const resposta = await fetch(anonima, {
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      try {
        exigir([401, 403, 404].includes(resposta.status), "LEITURA_ANONIMA_PERMITIDA");
        recibo.anonymousReadDenied = true;
      } finally {
        await resposta.body?.cancel();
      }
      recibo.status = "passed";
    } catch (erro) {
      recibo.failure = codigo(erro);
    } finally {
      if (admitida) {
        try {
          await limparObjetoProprio();
          recibo.cleanupConfirmed = true;
        } catch (erro) {
          recibo.cleanupFailure = codigo(erro);
        }
      } else recibo.cleanupConfirmed = true;
      cliente.destroy();
    }
  } catch (erro) {
    recibo.failure = codigo(erro);
    recibo.status = "failed";
  }
  if (!recibo.cleanupConfirmed) recibo.status = "failed";
  await writeFile(
    resolve(variavel("RUNNER_TEMP"), "recreio-objetos-provider.json"),
    `${JSON.stringify(recibo, null, 2)}\n`,
  );
  console.log(JSON.stringify(recibo));
  if (recibo.status !== "passed") process.exitCode = 1;
}
await main();
