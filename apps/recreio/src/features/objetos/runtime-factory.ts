import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import type { LeitorDeFotografiasPrivadas } from "@/features/posse/armazenamento";
import type { configuracaoDosObjetosDoProcesso } from "@/lib/object-environment";
import { criarCifradorDeObjetos } from "./criptografia";
import { criarArmazenamentoPrivadoS3 } from "./s3";

type Config = ReturnType<typeof configuracaoDosObjetosDoProcesso>;
/** Ownership belongs to the composing host: web keeps it for its lifetime;
 * an operational process closes it after all work has settled. */
export function criarLeitorDeFotografiasDoProcesso(config: Config) {
  if (!config) return { leitor: null, encerrar: () => undefined };
  const cliente = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.pathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  let cifrador: ReturnType<typeof criarCifradorDeObjetos> | undefined;
  try {
    cifrador = criarCifradorDeObjetos({
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
    const leitor: LeitorDeFotografiasPrivadas = Object.freeze({
      bucketId: config.bucketId,
      bucketName: config.bucketName,
      escopo: config.escopo,
      ler: storage.recuperar,
    });
    return {
      leitor,
      encerrar() {
        cifrador?.encerrar();
        cliente.destroy();
      },
    };
  } catch (erro) {
    cifrador?.encerrar();
    cliente.destroy();
    throw erro;
  } finally {
    for (const key of config.chaves.values()) key.fill(0);
  }
}
