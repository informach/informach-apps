import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import type { LeitorDeFotografiasPrivadas } from "@/features/posse/armazenamento";
import { env } from "@/lib/env";
import { configuracaoDosObjetos } from "@/lib/object-environment";
import { criarCifradorDeObjetos } from "./criptografia";
import { criarArmazenamentoPrivadoS3 } from "./s3";

let leitor: LeitorDeFotografiasPrivadas | null | undefined;
/** Singleton servidor, desligado por padrão. Não expõe escrita nem credenciais. */
export function leitorDeFotografias(): LeitorDeFotografiasPrivadas | null {
  if (leitor !== undefined) return leitor;
  const config = configuracaoDosObjetos(env);
  if (!config) {
    leitor = null;
    return leitor;
  }
  const cliente = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.pathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const cifrador = criarCifradorDeObjetos({
    chaveAtiva: config.chaveAtiva,
    chaves: config.chaves,
    limiteBytes: 256 * 1024 * 1024,
  });
  const storage = criarArmazenamentoPrivadoS3({
    cliente,
    bucket: config.bucketName,
    cifrador,
    tempoLimiteMs: 10_000,
  });
  leitor = Object.freeze({
    bucketId: config.bucketId,
    bucketName: config.bucketName,
    escopo: config.escopo,
    ler: storage.recuperar,
  });
  return leitor;
}
