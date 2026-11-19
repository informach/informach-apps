import { type FileHandle, mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { criarCifradorDeObjetos } from "../../src/features/objetos/criptografia";
import { criarCifradorDeArquivos } from "./arquivo-cifrado";
import { criarArquivoComposto } from "./arquivo-composto";
import { criarTransporteDeArquivosS3 } from "./arquivo-s3";
import { comBancoRestaurado } from "./cluster-isolado";
import { criarIndiceDeRecuperacao } from "./indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "./indice-s3";
import { exigir, limparDiretorioDeProva } from "./provas-arquivos";

const variavel = (nome: string) => {
  const v = process.env[nome];
  exigir(v, "CONFIGURACAO_AUSENTE");
  return v;
};
function chaveiro() {
  const texto = variavel("RECREIO_BACKUP_PROBE_MASTER_KEYS");
  delete process.env.RECREIO_BACKUP_PROBE_MASTER_KEYS;
  exigir(texto.length <= 16_384, "CHAVEIRO_FORA_DO_PERFIL");
  const r = z
    .record(z.string().regex(/^[A-Za-z0-9._-]{1,64}$/), z.string().regex(/^[A-Za-z0-9+/]{43}=$/))
    .parse(JSON.parse(texto));
  exigir(Object.keys(r).length > 0 && Object.keys(r).length <= 16, "CHAVEIRO_FORA_DO_PERFIL");
  const chaves = new Map<string, Buffer>();
  for (const [id, b64] of Object.entries(r)) {
    const b = Buffer.from(b64, "base64");
    exigir(b.length === 32 && b.toString("base64") === b64, "CHAVE_INVALIDA");
    chaves.set(id, b);
  }
  return chaves;
}

/** Worker GHA de leitura: não recebe conexão da origem e só restaura no
 * cluster novo privado. Configurações para tráfego/F7 são outra etapa. */
async function main() {
  exigir(
    process.platform === "linux" &&
      process.argv.length === 2 &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      /^[a-f0-9]{40}$/.test(variavel("GITHUB_SHA")) &&
      /^\d+$/.test(variavel("GITHUB_RUN_ID")) &&
      !process.env.DATABASE_URL &&
      !process.env.RECREIO_BACKUP_DATABASE_URL &&
      !process.env.RAILWAY_ENVIRONMENT_ID &&
      !process.env.RAILWAY_PROJECT_ID &&
      !process.env.POSTGRES_PASSWORD &&
      !process.env.PGPASSWORD &&
      !process.env.RECREIO_HOST_SECRETS,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const id = z.uuid().parse(variavel("RECREIO_BACKUP_PROBE_CAPTURE_ID")),
    bucket = variavel("RECREIO_S3_TEST_BUCKET"),
    endpoint = new URL(variavel("RECREIO_S3_TEST_ENDPOINT"));
  exigir(
    bucket === "recreio-homologacao-c0xyqx" && variavel("RECREIO_S3_EXPECTED_BUCKET") === bucket,
    "BUCKET_FORA_DO_ESCOPO",
  );
  exigir(
    endpoint.origin === "https://t3.storageapi.dev" &&
      endpoint.pathname === "/" &&
      !endpoint.search &&
      !endpoint.hash &&
      !endpoint.username &&
      !endpoint.password,
    "ENDPOINT_FORA_DO_ESCOPO",
  );
  const estilo = variavel("RECREIO_S3_TEST_PATH_STYLE");
  exigir(estilo === "true" || estilo === "false", "ESTILO_INVALIDO");
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
  let leituras = 0;
  cliente.middlewareStack.add(
    (next, context) => async (args) => {
      const input = z
        .object({ Bucket: z.literal("recreio-homologacao-c0xyqx"), Key: z.string() })
        .parse(args.input);
      exigir(
        context.commandName === "GetObjectCommand" &&
          input.Key.startsWith(`recreio/v1/backup/${id}/`) &&
          /\/(manifesto\.json|retirado\.json|[a-f0-9]{64})$/.test(input.Key),
        "LEITURA_FORA_DO_BACKUP",
      );
      leituras++;
      return next(args);
    },
    { step: "initialize", name: "recreioColdRecoveryReadBoundary" },
  );
  const destino = {
      bucketId: "14cbada1-04eb-45cd-be30-94e10e4ba333",
      bucketName: bucket,
      escopo: "qualification" as const,
    },
    chaves = chaveiro(),
    ativa = variavel("RECREIO_BACKUP_PROBE_ACTIVE_KEY");
  const indice = criarIndiceDeRecuperacao({ destino, chaveAtiva: ativa, chaves }),
    codec = criarCifradorDeArquivos({
      chaveAtiva: ativa,
      chaves,
      limiteBytes: 32 * 1024 * 1024,
      tempoLimiteMs: 120_000,
    });
  for (const k of chaves.values()) k.fill(0);
  chaves.clear();
  const root = await mkdtemp(join(tmpdir(), "recreio-backup-provider-")),
    handles: FileHandle[] = [];
  let fotos = 0,
    ligadas = 0,
    removidos = false,
    clusterLimpo = false,
    resultado: unknown,
    falha = false;
  try {
    const arquivo = async (nome: string) => {
      exigir(/^[a-z-]+\.bin$/.test(nome), "ARQUIVO_FORA_DO_ESCOPO");
      const h = await open(join(root, nome), "wx+", 0o600);
      handles.push(h);
      return h;
    };
    const cifrado = await arquivo("cifrado.bin"),
      aberto = await arquivo("aberto.bin"),
      dump = await arquivo("dump.bin"),
      fotografia = await arquivo("fotografia.bin");
    const indices = criarArmazenamentoDoIndiceS3({
        cliente,
        bucket,
        indice,
        tempoLimiteMs: 30_000,
      }),
      fria = await indices.recuperar(id);
    const transporte = criarTransporteDeArquivosS3({
      cliente,
      bucket,
      cifrador: codec,
      limiteBytesCifrados: 32 * 1024 * 1024,
      tempoLimiteMs: 120_000,
    });
    await transporte.recuperar(fria.publicacao.arquivo, cifrado);
    await codec.abrir(cifrado, aberto, fria.publicacao.arquivo);
    const container = criarArquivoComposto({
        limiteBytes: 32 * 1024 * 1024,
        limiteFotografiaBytes: 4 * 1024 * 1024,
        tempoLimiteMs: 120_000,
      }),
      acesso = await container.abrir(aberto, fria.publicacao.composto);
    try {
      await acesso.copiarDump(dump);
      const inventario = await acesso.lerInventarioBanco();
      const prova = await comBancoRestaurado({ dump, inventario }, async (copia) => {
        await copia.begin("isolation level repeatable read read only", async (sql) => {
          await sql.unsafe("set local statement_timeout='5000ms'");
          await sql.unsafe("set local transaction_timeout='120000ms'");
          await acesso.comChaves(async (recuperadas, signal) => {
            const ativa = recuperadas.keys().next().value,
              abridor = ativa
                ? criarCifradorDeObjetos({
                    chaveAtiva: ativa,
                    chaves: recuperadas,
                    limiteBytes: 4 * 1024 * 1024,
                  })
                : undefined;
            for await (const item of acesso.objetos(signal)) {
              const o = item.objeto,
                r = o.referencia;
              const [vinculo] = await sql.unsafe<{ valido: boolean }[]>(
                `select exists(select 1 from recreio.space_snapshots s join recreio.snapshot_object_deliveries d on d.snapshot_id=s.id
                where s.id=$1 and s.space_id=$2 and s.storage='bucket' and s.data is null and s.sha256=$3 and s.byte_size=$4
                and d.id=$5 and d.snapshot_reference=s.id and d.space_id=s.space_id and d.plaintext_sha256=s.sha256 and d.plaintext_bytes=s.byte_size
                and d.state='verified' and d.verified_at is not null and d.bucket_id=$6 and d.bucket_name=$7 and d.storage_scope=$8
                and d.object_key=$9 and s.object_key=d.object_key and d.cipher_sha256=$10 and d.cipher_bytes=$11 and d.encryption_key_id=$12) as valido`,
                [
                  o.fotografiaId,
                  o.mundoId,
                  r.sha256,
                  r.bytes,
                  o.entregaId,
                  o.bucketId,
                  o.bucketName,
                  o.escopo,
                  o.objectKey,
                  r.sha256Cifrado,
                  r.bytesCifrados,
                  r.chaveId,
                ],
              );
              exigir(vinculo?.valido, "VINCULO_RESTAURADO_DIVERGENTE");
              ligadas++;
              await item.copiarPara(fotografia);
              exigir(abridor, "CHAVE_DA_FOTOGRAFIA_AUSENTE");
              const envelope = Buffer.alloc(r.bytesCifrados);
              try {
                let pos = 0;
                while (pos < envelope.length) {
                  const b = await fotografia.read(envelope, pos, envelope.length - pos, pos);
                  exigir(b.bytesRead > 0, "FOTOGRAFIA_TRUNCADA");
                  pos += b.bytesRead;
                }
                const plain = abridor.abrir(r, envelope);
                plain.fill(0);
                fotos++;
              } finally {
                envelope.fill(0);
                await fotografia.truncate(0);
                await fotografia.sync();
              }
            }
          });
          const [contagem] = await sql.unsafe<{ quantidade: number }[]>(
            "select count(*)::int as quantidade from recreio.space_snapshots where storage='bucket'",
          );
          exigir(
            contagem?.quantidade === fotos &&
              fotos === fria.publicacao.inventario.quantidade &&
              ligadas === fotos,
            "FOTOGRAFIAS_RESTAURADAS_DIVERGENTES",
          );
        });
      });
      clusterLimpo = prova.temporariosRemovidos;
      exigir(leituras >= 3, "LEITURAS_DO_BACKUP_INCOMPLETAS");
      resultado = {
        source: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        capturaId: id,
        ok: true,
        freshCluster: true,
        conteudoIdentico: prova.conteudoIdentico,
        estruturaIdentica: prova.estruturaIdentica,
        globaisIdenticos: prova.globaisIdenticos,
        fotosAutenticadas: fotos,
        vinculosConferidos: ligadas,
        clusterCleanupConfirmed: clusterLimpo,
        sourceDatabaseCredentialsPresent: false,
        onlyBackupPrefixRead: true,
        backupReadRequests: leituras,
        objectDestinationsNormalized: false,
        authoritiesNormalizedForTraffic: false,
        productionDataTouched: false,
      };
    } finally {
      acesso.encerrar();
    }
  } catch {
    falha = true;
  } finally {
    try {
      await limparDiretorioDeProva(root, handles, "recreio-backup-provider-");
      removidos = true;
    } catch {
      falha = true;
    }
    indice.encerrar();
    cliente.destroy();
  }
  exigir(!falha && resultado && removidos && clusterLimpo, "RECUPERACAO_FRIA_NAO_CONFIRMADA");
  console.log(
    JSON.stringify({
      ...z.record(z.string(), z.unknown()).parse(resultado),
      localCleanupConfirmed: removidos,
    }),
  );
}
main().catch(() => {
  console.error("Recuperacao fria recusada ou inconclusiva; detalhes privados nao serao exibidos.");
  process.exitCode = 1;
});
