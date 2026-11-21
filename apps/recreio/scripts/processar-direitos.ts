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
    { configuracaoDosObjetosDoProcesso },
    { criarLeitorDeFotografiasDoProcesso },
    { db, checkSchemaReadiness, recordJobRun },
    { criarRuntimeFinanceiroDoEncerramento },
  ] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("../src/features/direitos/livro/assinatura"),
    import("../src/features/direitos/livro/armazenamento"),
    import("./direitos/rodada"),
    import("../src/lib/object-environment"),
    import("../src/features/objetos/runtime-factory"),
    import("@informach/db"),
    import("../src/features/direitos/financeiro-runtime"),
  ]);
  const databaseClient = db.$client;
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
  let fotografias: ReturnType<typeof criarLeitorDeFotografiasDoProcesso> | undefined;
  let financeiro: ReturnType<typeof criarRuntimeFinanceiroDoEncerramento> | undefined;
  let resultado: Awaited<ReturnType<typeof processarRodadaDeDireitos>> | undefined;
  let falha: { erro: unknown } | undefined;
  try {
    if (!(await checkSchemaReadiness()).ok) throw new Error("RIGHTS_SCHEMA_NOT_READY");
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
    fotografias = criarLeitorDeFotografiasDoProcesso(configuracaoDosObjetosDoProcesso(process.env));
    const coordenacao = {
      assinatura,
      storage,
      leitor: fotografias.leitor,
      politica: { retirarTextosDaFundacao: true },
      obterFinanceiro: () => (financeiro ??= criarRuntimeFinanceiroDoEncerramento(process.env)),
    };
    resultado = await recordJobRun({ app: "recreio", job: "direitos" }, () =>
      processarRodadaDeDireitos(coordenacao),
    );
  } catch (erro) {
    falha = { erro };
  }
  const encerramentos = await Promise.allSettled([
    databaseClient.end({ timeout: 5 }),
    Promise.resolve().then(() => fotografias?.encerrar()),
    Promise.resolve().then(() => assinatura?.encerrar()),
    Promise.resolve().then(() => cliente.destroy()),
  ]);
  const erros = encerramentos.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
  if (falha || erros.length)
    throw new AggregateError([...erros, ...(falha ? [falha.erro] : [])], "Rights process failed");
  if (!resultado) throw new Error("Missing rights process result");
  console.log(JSON.stringify({ ...resultado, limpezaConfirmada: true }));
}
main().catch(() => {
  // Drizzle/S3 podem anexar parâmetros, bytes, endpoint e credenciais ao erro.
  // A fronteira operacional publica só o código fixo; exit != 0 é falha do job.
  console.error(
    JSON.stringify({
      formato: "recreio-direitos-rodada-v1",
      erro: "DIREITOS_PROCESSAMENTO_FALHOU",
    }),
  );
  process.exitCode = 1;
});
