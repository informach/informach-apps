import { configuracaoDaMigracaoDeFotografias } from "../src/lib/object-migration-environment";

/** No CLI selectors or application credentials: scope comes from reviewed
 * server configuration and the native queue. Off imports no SQL/S3 runtime. */
async function main() {
  if (process.argv.length !== 2) throw new Error("Invalid migration arguments");
  const config = configuracaoDaMigracaoDeFotografias(process.env);
  if (!config) {
    console.log(JSON.stringify({ formato: "recreio-migracao-fotografias-v1", modo: "off" }));
    return;
  }
  try {
    if (process.platform !== "linux") throw new Error("Unsupported migration runtime");
    await executar(config);
  } finally {
    for (const key of config.objetos.chaves.values()) key.fill(0);
  }
}
async function executar(
  config: NonNullable<ReturnType<typeof configuracaoDaMigracaoDeFotografias>>,
) {
  process.env.DATABASE_URL = config.databaseUrl;
  const [
    { S3Client },
    { db, checkSchemaReadiness, recordJobRun },
    { criarCifradorDeObjetos },
    { criarArmazenamentoPrivadoS3 },
    { prepararEntregaDaFotografia },
    { executarEntregaDaFotografia },
    { listarFotografiasParaMigracao },
    { conferirLeitorPublicado },
  ] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@informach/db"),
    import("../src/features/objetos/criptografia"),
    import("../src/features/objetos/s3"),
    import("../src/features/objetos/fotografias-repository"),
    import("../src/features/objetos/entregas"),
    import("../src/features/objetos/migracao-repository"),
    import("../src/features/objetos/leitor-publicado"),
  ]);
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), config.timeoutSeconds * 1000);
  timer.unref();
  let cliente: InstanceType<typeof S3Client> | undefined;
  let cifrador: ReturnType<typeof criarCifradorDeObjetos> | undefined;
  let resultado: unknown,
    falhou = false;
  let conexao: Awaited<ReturnType<typeof db.$client.reserve>> | undefined;
  let obtida = false;
  try {
    conexao = await db.$client.reserve();
    await conexao.unsafe("set statement_timeout='3000ms'");
    const [lock] = await conexao<
      { obtida: boolean }[]
    >`select pg_try_advisory_lock(hashtextextended('recreio:snapshot-migration:v1',0)) as obtida`;
    obtida = lock?.obtida === true;
    if (!obtida) resultado = { ocupada: true };
    else {
      if (!(await checkSchemaReadiness()).ok)
        throw new Error("Snapshot migration schema not ready");
      await conferirLeitorPublicado(config, ctl.signal);
      cliente = new S3Client({
        endpoint: config.objetos.endpoint,
        region: config.objetos.region,
        forcePathStyle: config.objetos.pathStyle,
        credentials: {
          accessKeyId: config.objetos.accessKeyId,
          secretAccessKey: config.objetos.secretAccessKey,
        },
        maxAttempts: 1,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
      cifrador = criarCifradorDeObjetos({
        chaveAtiva: config.objetos.chaveAtiva,
        chaves: config.objetos.chaves,
        limiteBytes: 4 * 1024 * 1024,
      });
      const transporte = criarArmazenamentoPrivadoS3({
        cliente,
        bucket: config.objetos.bucketName,
        cifrador,
        tempoLimiteMs: 10000,
      });
      const destino = {
        bucketId: config.objetos.bucketId,
        bucketName: config.objetos.bucketName,
        escopo: config.objetos.escopo,
      };
      const cifradorAtual = cifrador;
      resultado = await recordJobRun({ app: "recreio", job: "migracao-fotografias" }, async () => {
        const fila = await listarFotografiasParaMigracao(config);
        let concluidas = 0,
          aguardando = 0;
        for (const foto of fila) {
          ctl.signal.throwIfAborted();
          // Recheck reader before every pointer change; each delivery also
          // rechecks world/lease/token/source after external I/O.
          await conferirLeitorPublicado(config, ctl.signal);
          const id = await prepararEntregaDaFotografia(
            { mundoId: foto.mundoId, jogo: foto.jogo, revisao: foto.revisao },
            destino,
            cifradorAtual,
          );
          const estado = await executarEntregaDaFotografia(id, destino, transporte, ctl.signal);
          if (estado === "revisao" || estado === "retirada")
            throw new Error("Snapshot migration requires review");
          if (estado === "concluida") concluidas++;
          else aguardando++;
        }
        return { ocupada: false, selecionadas: fila.length, concluidas, aguardando };
      });
    }
  } catch {
    falhou = true;
  }
  const limpeza = await Promise.allSettled([
    Promise.resolve().then(async () => {
      if (obtida && conexao) {
        const [r] = await conexao<
          { liberada: boolean }[]
        >`select pg_advisory_unlock(hashtextextended('recreio:snapshot-migration:v1',0)) as liberada`;
        if (r?.liberada !== true) throw new Error("Snapshot migration lock lost");
      }
    }),
    Promise.resolve().then(() => cifrador?.encerrar()),
    Promise.resolve().then(() => cliente?.destroy()),
  ]);
  const liberou = await Promise.allSettled([Promise.resolve().then(() => conexao?.release())]);
  clearTimeout(timer);
  const fechou = await Promise.allSettled([db.$client.end({ timeout: 5 })]);
  if (falhou || [...limpeza, ...liberou, ...fechou].some((r) => r.status === "rejected"))
    throw new Error("Snapshot migration failed");
  console.log(
    JSON.stringify({
      formato: "recreio-migracao-fotografias-v1",
      modo: "process",
      resultado,
      limpezaConfirmada: true,
    }),
  );
}
main().catch(() => {
  console.error(
    JSON.stringify({
      formato: "recreio-migracao-fotografias-v1",
      erro: "MIGRACAO_FOTOGRAFIAS_FALHOU",
    }),
  );
  process.exitCode = 1;
});
