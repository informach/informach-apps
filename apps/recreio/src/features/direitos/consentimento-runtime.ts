import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { configuracaoDosDireitosDoProcesso } from "@/lib/rights-environment";
import { confirmarRetiradaDePerfil } from "./consentimento-service";
import { criarArmazenamentoDoLivro } from "./livro/armazenamento";
import { criarAssinaturaDoLivro } from "./livro/assinatura";

/** Capacidade servidora separada do executor. O default preserva somente a
 * prévia. Ativar exige a mesma custódia/configuração do processamento. */
export function retiradaDisponivel() {
  return process.env.RECREIO_RIGHTS_CONSENT_MODE === "native";
}

export async function confirmarRetiradaAtual(autor: AutorNativoRecente, entrada: unknown) {
  assertAllowed(
    retiradaDisponivel(),
    "INDISPONIVEL",
    "A confirmação da retirada ainda não está disponível.",
  );
  const fonte = process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA;
  assertAllowed(
    fonte && /^[a-f0-9]{40}$/.test(fonte),
    "INDISPONIVEL",
    "A confirmação da retirada está indisponível.",
  );
  const config = configuracaoDosDireitosDoProcesso(process.env);
  assertAllowed(config, "INDISPONIVEL", "A confirmação da retirada está indisponível.");
  let cliente: S3Client | undefined,
    assinatura: ReturnType<typeof criarAssinaturaDoLivro> | undefined;
  try {
    cliente = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.pathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    assinatura = criarAssinaturaDoLivro(config);
    for (const key of config.chaves.values()) key.fill(0);
    return await confirmarRetiradaDePerfil(autor, entrada, {
      assinatura,
      storage: criarArmazenamentoDoLivro({
        cliente,
        bucket: config.bucket,
        assinatura,
        tempoLimiteMs: 10_000,
      }),
      fonte,
    });
  } finally {
    for (const key of config.chaves.values()) key.fill(0);
    assinatura?.encerrar();
    cliente?.destroy();
  }
}
