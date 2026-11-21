import {
  configuracaoDoBackupDoProcesso,
  FalhaDoAmbienteDeBackup,
} from "../../src/lib/backup-environment";

let fase: "configuracao" | "schema" | "recursos" | "fila" | "captura" | "encerramento" =
  "configuracao";

async function main() {
  if (process.argv.length !== 2) throw new FalhaDoAmbienteDeBackup();
  const config = configuracaoDoBackupDoProcesso(process.env);
  if (!config) {
    console.log(JSON.stringify({ formato: "recreio-backup-rodada-v1", modo: "off" }));
    return;
  }
  try {
    if (process.platform !== "linux") throw new FalhaDoAmbienteDeBackup();
    await executar(config);
  } finally {
    for (const c of [config.fotografias, config.arquivo])
      for (const key of c.chaves.values()) key.fill(0);
  }
}

async function executar(config: NonNullable<ReturnType<typeof configuracaoDoBackupDoProcesso>>) {
  const [
    { S3Client },
    { db, checkSchemaReadiness, recordJobRun },
    { criarCifradorDeObjetos },
    { criarArmazenamentoPrivadoS3 },
    { criarCifradorDeArquivos },
    { criarArquivoComposto },
    { criarTransporteDeArquivosS3 },
    { criarIndiceDeRecuperacao },
    { criarArmazenamentoDoIndiceS3 },
    { criarRetiradaDoBackupS3 },
    { criarMontadorDaCaptura },
    { comArquivosPrivadosDoBackup },
    { comExecucaoExclusivaDoBackup },
    { reconciliarFilaDoBackup },
    { capturarEPublicarBackup },
  ] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@informach/db"),
    import("../../src/features/objetos/criptografia"),
    import("../../src/features/objetos/s3"),
    import("./arquivo-cifrado"),
    import("./arquivo-composto"),
    import("./arquivo-s3"),
    import("./indice-recuperacao"),
    import("./indice-s3"),
    import("./retirada-s3"),
    import("./montar-captura"),
    import("./arquivos-privados"),
    import("./execucao-exclusiva"),
    import("./reconciliar-fila"),
    import("./capturar-e-publicar"),
  ]);
  // This standalone process owns its application pool. It is not the pool of
  // the portal, and it is closed after all coordinated work has settled.
  const databaseClient = db.$client;
  let clienteFotos: InstanceType<typeof S3Client> | undefined,
    clienteArquivo: InstanceType<typeof S3Client> | undefined,
    indice: ReturnType<typeof criarIndiceDeRecuperacao> | undefined;
  let resultado:
    | { ok: true; valor: Record<string, string | number | boolean | null | undefined> }
    | { ok: false; erro: unknown; fase: typeof fase };
  try {
    fase = "schema";
    if (!(await checkSchemaReadiness()).ok) throw new Error("BACKUP_SCHEMA_NOT_READY");
    fase = "recursos";
    const cliente = (c: typeof config.arquivo) =>
      new S3Client({
        endpoint: c.endpoint,
        region: c.region,
        forcePathStyle: c.pathStyle,
        credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
        maxAttempts: 1,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    clienteFotos = cliente(config.fotografias);
    clienteArquivo = cliente(config.arquivo);
    const fotografias = {
        bucketId: config.fotografias.bucketId,
        bucketName: config.fotografias.bucketName,
        escopo: config.fotografias.escopo,
      },
      destino = {
        bucketId: config.arquivo.bucketId,
        bucketName: config.arquivo.bucketName,
        escopo: config.arquivo.escopo,
      },
      limites = {
        limiteBytes: config.limiteBytes,
        limiteFotografiaBytes: config.limiteFotografiaBytes,
        tempoLimiteMs: config.tempoLimiteMs,
      };
    const fotos = criarArmazenamentoPrivadoS3({
      cliente: clienteFotos,
      bucket: fotografias.bucketName,
      cifrador: criarCifradorDeObjetos({
        chaveAtiva: config.fotografias.chaveAtiva,
        chaves: config.fotografias.chaves,
        limiteBytes: config.limiteFotografiaBytes,
      }),
      tempoLimiteMs: 10000,
    });
    const cifrador = criarCifradorDeArquivos({
      ...limites,
      chaveAtiva: config.arquivo.chaveAtiva,
      chaves: config.arquivo.chaves,
    });
    const composto = criarArquivoComposto(limites);
    indice = criarIndiceDeRecuperacao({
      destino,
      chaveAtiva: config.arquivo.chaveAtiva,
      chaves: config.arquivo.chaves,
    });
    const indices = criarArmazenamentoDoIndiceS3({
      cliente: clienteArquivo,
      bucket: destino.bucketName,
      indice,
      tempoLimiteMs: 10000,
    });
    const transporte = criarTransporteDeArquivosS3({
      cliente: clienteArquivo,
      bucket: destino.bucketName,
      cifrador,
      limiteBytesCifrados: config.limiteBytes + 65536,
      tempoLimiteMs: 10000,
    });
    const retirada = criarRetiradaDoBackupS3({
      cliente: clienteArquivo,
      destino,
      indice,
      tempoLimiteMs: 10000,
    });
    const montador = criarMontadorDaCaptura({
      ...limites,
      conexao: config.conexao,
      leitor: {
        destino: fotografias,
        carregar: (objeto, signal) => fotos.recuperarEnvelope(objeto.referencia, signal),
      },
    });
    const publicacao = { destino, cifrador, composto, indice, indices, transporte };
    const valor = await recordJobRun({ app: "recreio", job: "backup" }, async () => {
      const exclusiva = await comExecucaoExclusivaDoBackup(
        { conexao: config.conexao, tempoLimiteMs: config.tempoLimiteMs },
        async (execucao) => {
          fase = "fila";
          const fila = await reconciliarFilaDoBackup({
            execucao,
            fotografias,
            publicacao,
            retirada,
            politica: {
              intervaloSegundos: config.intervaloSegundos,
              retencaoDias: config.retencaoDias,
            },
          });
          if (typeof fila.capturaNecessaria !== "boolean")
            throw new Error("BACKUP_CADENCE_NOT_CONFIRMED");
          const base = {
            observadas: fila.observadas,
            abandonadas: fila.abandonadas,
            publicadas: fila.publicadas,
            retiradas: fila.retiradas,
            reservasLiberadas: fila.reservasLiberadas,
            retencoesPendentes: fila.retencoesPendentes ?? 0,
          };
          if (!fila.capturaNecessaria) return { ...base, capturaCriada: false };
          fase = "captura";
          const captura = await comArquivosPrivadosDoBackup((arquivos) =>
            capturarEPublicarBackup({
              execucao,
              origemObjetos: fotografias,
              destinoArquivo: destino,
              source: config.source,
              chavesFotografias: config.fotografias.chaves,
              montador,
              cifrador,
              composto,
              transporte,
              indice: publicacao.indice,
              indices,
              arquivos,
            }),
          );
          return {
            ...base,
            capturaCriada: true,
            capturaId: captura.capturaId,
            reservasLiberadas: base.reservasLiberadas + captura.reservasLiberadas,
          };
        },
      );
      // The shared recorder intentionally retains only top-level counters and
      // booleans. Unwrap here so the native backup has an operational summary;
      // keep archive IDs and all other text outside ops.job_runs.
      return exclusiva.situacao === "ocupada"
        ? { ocupada: true, capturaCriada: false }
        : exclusiva.valor;
    });
    resultado = { ok: true, valor };
  } catch (erro) {
    resultado = { ok: false, erro, fase };
  }
  fase = "encerramento";
  const encerramentos = await Promise.allSettled([
    databaseClient.end({ timeout: 5 }),
    Promise.resolve().then(() => clienteFotos?.destroy()),
    Promise.resolve().then(() => clienteArquivo?.destroy()),
    Promise.resolve().then(() => indice?.encerrar()),
  ]);
  const falhas = encerramentos.filter((r) => r.status === "rejected");
  if (falhas.length)
    throw new AggregateError(
      [...falhas.map((r) => r.reason), ...(!resultado.ok ? [resultado.erro] : [])],
      "BACKUP_PROCESS_CLEANUP_FAILED",
    );
  if (!resultado.ok) {
    fase = resultado.fase;
    throw resultado.erro;
  }
  console.log(
    JSON.stringify({
      formato: "recreio-backup-rodada-v1",
      modo: "native",
      ok: true,
      source: config.source,
      ...resultado.valor,
      limpezaConfirmada: true,
    }),
  );
}

void main().catch((erro: unknown) => {
  // Drivers may attach SQL, connection strings and body bytes to their errors.
  console.error(
    JSON.stringify({
      formato: "recreio-backup-rodada-v1",
      ok: false,
      fase,
      codigo: erro instanceof FalhaDoAmbienteDeBackup ? erro.codigo : "BACKUP_PROCESSAMENTO_FALHOU",
    }),
  );
  process.exitCode = 1;
});
