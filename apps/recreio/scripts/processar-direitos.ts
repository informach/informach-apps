/** Executor operacional: uma rodada delimitada, sem consentimento implícito,
 * bootstrap do livro ou acesso a perfis escolhidos por argumento. As intenções
 * vêm exclusivamente da fila nativa consentida e do livro conferido. */
import { configuracaoDosDireitosDoProcesso } from "../src/lib/rights-environment";

async function main() {
  if (process.argv.length !== 2) throw new Error("Invalid executor arguments");
  const config = configuracaoDosDireitosDoProcesso(process.env);
  if (!config) {
    console.log(JSON.stringify({ formato: "recreio-direitos-rodada-v1", modo: "off" }));
    return;
  }
  try {
    await executar(config);
  } finally {
    for (const key of config.chaves.values()) key.fill(0);
  }
}
async function executar(config: NonNullable<ReturnType<typeof configuracaoDosDireitosDoProcesso>>) {
  const [
    { S3Client },
    { criarAssinaturaDoLivro },
    { criarArmazenamentoDoLivro },
    { processarRodadaDeDireitos },
    { leitorDeFotografias },
    { recordJobRun },
  ] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("../src/features/direitos/livro/assinatura"),
    import("../src/features/direitos/livro/armazenamento"),
    import("./direitos/rodada"),
    import("../src/features/objetos/runtime"),
    import("@informach/db"),
  ]);
  const cliente = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.pathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  let assinatura: ReturnType<typeof criarAssinaturaDoLivro> | undefined;
  try {
    assinatura = criarAssinaturaDoLivro(config);
    // O codec possui sua própria cópia derivada; os buffers de entrada já
    // podem ser apagados. Segredos nunca fazem parte da saída ou do erro.
    for (const key of config.chaves.values()) key.fill(0);
    const storage = criarArmazenamentoDoLivro({
      cliente,
      bucket: config.bucket,
      assinatura,
      tempoLimiteMs: 10_000,
    });
    const coordenacao = {
      assinatura,
      storage,
      leitor: leitorDeFotografias(),
      politica: { retirarTextosDaFundacao: true },
    };
    const resultado = await recordJobRun({ app: "recreio", job: "direitos" }, () =>
      processarRodadaDeDireitos(coordenacao),
    );
    console.log(JSON.stringify(resultado));
  } finally {
    for (const key of config.chaves.values()) key.fill(0);
    assinatura?.encerrar();
    cliente.destroy();
  }
}
main()
  .then(() => process.exit(0))
  .catch(() => {
    // Drizzle/S3 podem anexar parâmetros, bytes, endpoint e credenciais ao erro.
    // A fronteira operacional publica só o código fixo; exit != 0 é falha do job.
    console.error(
      JSON.stringify({
        formato: "recreio-direitos-rodada-v1",
        erro: "DIREITOS_PROCESSAMENTO_FALHOU",
      }),
    );
    process.exit(1);
  });
