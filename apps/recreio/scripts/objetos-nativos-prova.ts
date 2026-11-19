import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as esperar } from "node:timers/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { criarCifradorDeObjetos } from "../src/features/objetos/criptografia";
import {
  criarArmazenamentoPrivadoS3,
  FalhaDoArmazenamentoPrivado,
} from "../src/features/objetos/s3";

class FalhaDaProva extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}
function exigir(sim: unknown, codigo: string): asserts sim {
  if (!sim) throw new FalhaDaProva(codigo);
}
const variavel = (nome: string): string => {
  const v = process.env[nome];
  if (!v) throw new FalhaDaProva("CONFIGURACAO_AUSENTE");
  return v;
};
const codigo = (e: unknown) => (e instanceof FalhaDaProva ? e.codigo : "PROVA_NATIVA_INCONCLUSIVA");
const BUCKET_ID = "14cbada1-04eb-45cd-be30-94e10e4ba333";
type ReciboDaProva = {
  source: string;
  runId: string;
  boundary: string;
  status: "failed" | "passed";
  bucket: string;
  worldLeaseFixture: true;
  objectKey: string;
  preparationVerified: boolean;
  responseLossRecovered: boolean;
  retryDelayRespected: boolean;
  atomicPublicationVerified: boolean;
  nativeRuntimeReadVerified: boolean;
  revokedLeaseDenied: boolean;
  anonymousReadDenied: boolean;
  cleanupConfirmed: boolean;
  failure: string | null;
  cleanupFailure: string | null;
  productionDataTouched: false;
};

/** Só GHA, Postgres local descartável e o único bucket autorizado de homologação.
 * Mundo/posse são fixtures técnicas; não é jornada de família, compra ou jogo. */
async function main() {
  exigir(
    process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
      process.env.RUNNER_TEMP &&
      !process.env.RAILWAY_ENVIRONMENT_ID,
    "EXECUTOR_NAO_AUTORIZADO",
  );
  const database = new URL(variavel("DATABASE_URL"));
  exigir(
    ["postgres:", "postgresql:"].includes(database.protocol) &&
      database.hostname === "127.0.0.1" &&
      database.pathname === "/recreio_object_probe" &&
      database.port === "5432" &&
      !database.search &&
      !database.hash,
    "BANCO_FORA_DO_ESCOPO",
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
  const chave = randomBytes(32),
    chaveId = "prova-nativa-descartavel";
  Object.assign(process.env, {
    RECREIO_OBJECTS_MODE: "read",
    RECREIO_OBJECTS_SCOPE: "qualification",
    RECREIO_OBJECTS_BUCKET_ID: BUCKET_ID,
    RECREIO_OBJECTS_BUCKET: bucket,
    RECREIO_OBJECTS_ENDPOINT: endpoint.origin,
    RECREIO_OBJECTS_REGION: variavel("RECREIO_S3_TEST_REGION"),
    RECREIO_OBJECTS_PATH_STYLE: estilo === "true" ? "1" : "0",
    RECREIO_OBJECTS_ACCESS_KEY: variavel("RECREIO_S3_TEST_ACCESS_KEY"),
    RECREIO_OBJECTS_SECRET_KEY: variavel("RECREIO_S3_TEST_SECRET_KEY"),
    RECREIO_OBJECTS_ACTIVE_KEY: chaveId,
    RECREIO_OBJECTS_KEYS: JSON.stringify({ [chaveId]: chave.toString("base64") }),
  });
  const cifrador = criarCifradorDeObjetos({
    chaveAtiva: chaveId,
    chaves: new Map([[chaveId, chave]]),
    limiteBytes: 4096,
  });
  const storage = criarArmazenamentoPrivadoS3({ cliente, bucket, cifrador, tempoLimiteMs: 10_000 });
  const mundoId = randomUUID(),
    prefixo = `recreio/v1/fotografia/${mundoId}/`;
  let key = "",
    admitida = false;
  const recibo: ReciboDaProva = {
    source: variavel("GITHUB_SHA"),
    runId: variavel("GITHUB_RUN_ID"),
    boundary: "disposable_postgres_and_private_qualification_bucket",
    status: "failed",
    bucket,
    worldLeaseFixture: true,
    objectKey: "",
    preparationVerified: false,
    responseLossRecovered: false,
    retryDelayRespected: false,
    atomicPublicationVerified: false,
    nativeRuntimeReadVerified: false,
    revokedLeaseDenied: false,
    anonymousReadDenied: false,
    cleanupConfirmed: false,
    failure: null,
    cleanupFailure: null,
    productionDataTouched: false,
  };
  const guardarRecibo = () =>
    writeFile(
      resolve(variavel("RUNNER_TEMP"), "recreio-objetos-nativos-provider.json"),
      `${JSON.stringify(recibo, null, 2)}\n`,
    );
  async function limpar() {
    await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
    const lista = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 2 }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    exigir(lista.IsTruncated === false && !lista.Contents?.length, "PREFIXO_NAO_LIMPO");
    let ausente = false;
    try {
      const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
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
    exigir(ausente, "OBJETO_AINDA_PRESENTE");
  }
  try {
    const lista = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 2 }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    exigir(lista.IsTruncated === false && !lista.Contents?.length, "PREFIXO_NAO_VAZIO");
    const { db, eq, sql } = await import("@informach/db");
    const {
      recreioSpaces: spaces,
      recreioSpaceSnapshots: snapshots,
      recreioSnapshotObjectDeliveries: deliveries,
      recreioGameInstances: instances,
      recreioSpaceLeases: leases,
    } = await import("@informach/db/schema");
    const { MundoIdSchema, InstanciaIdSchema } = await import("@informach/recreio");
    const { prepararEntregaDaFotografia } = await import(
      "../src/features/objetos/fotografias-repository"
    );
    const { executarEntregaDaFotografia } = await import("../src/features/objetos/entregas");
    const bytes = Buffer.from("RECREIO_FOTOGRAFIA_SINTETICA_SEM_DADOS_DE_USUARIO");
    await db.insert(spaces).values({
      id: mundoId,
      gameId: "morada",
      name: "Prova técnica sintética",
      contentPolicy: "L",
      status: "hibernating",
      revision: 1,
      journalSeq: 0,
      schemaVersion: 1,
    });
    const [foto] = await db
      .insert(snapshots)
      .values({
        spaceId: mundoId,
        revision: 1,
        fence: 0,
        schemaVersion: 1,
        journalSeq: 0,
        tick: 0,
        kind: "checkpoint",
        storage: "pg",
        data: bytes,
        byteSize: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      })
      .returning({ id: snapshots.id });
    exigir(foto, "FOTOGRAFIA_AUSENTE");
    const destino = { bucketId: BUCKET_ID, bucketName: bucket, escopo: "qualification" as const };
    const id = await prepararEntregaDaFotografia(
      { mundoId: MundoIdSchema.parse(mundoId), jogo: "morada", revisao: 1 },
      destino,
      cifrador,
    );
    const lerEntrega = async () => {
      const [e] = await db.select().from(deliveries).where(eq(deliveries.id, id));
      if (!e) throw new FalhaDaProva("ENTREGA_AUSENTE");
      return e;
    };
    const preparada = await lerEntrega();
    const envelopeGuardado = preparada.envelope;
    key = preparada.objectKey;
    exigir(
      key === `${prefixo}${preparada.cipherSha256}` &&
        /^[a-f0-9]{64}$/.test(preparada.cipherSha256) &&
        preparada.state === "prepared" &&
        envelopeGuardado &&
        !preparada.verifiedAt,
      "PREPARO_DIVERGENTE",
    );
    recibo.objectKey = key;
    recibo.preparationVerified = true;
    // Recibo técnico salvo antes de admitir qualquer PUT.
    await guardarRecibo();
    admitida = true;
    let envios = 0;
    const respostaPerdida = {
      ...storage,
      enviar: async (p: Parameters<typeof storage.enviar>[0]) => {
        envios++;
        await storage.enviar(p);
        throw new FalhaDoArmazenamentoPrivado("INCONCLUSIVO");
      },
    };
    exigir(
      (await executarEntregaDaFotografia(id, destino, respostaPerdida)) === "aguardando",
      "RESPOSTA_PERDIDA_NAO_PRESERVADA",
    );
    const pendente = await lerEntrega();
    exigir(
      pendente.state === "prepared" &&
        pendente.envelope?.equals(envelopeGuardado) &&
        !pendente.verifiedAt &&
        pendente.attemptCount === 1 &&
        !pendente.leaseToken,
      "TENTATIVA_NAO_DURAVEL",
    );
    const [pg] = await db
      .select({ storage: snapshots.storage, data: snapshots.data })
      .from(snapshots)
      .where(eq(snapshots.id, foto.id));
    exigir(pg?.storage === "pg" && pg.data?.equals(bytes), "PG_RETIRADO_ANTES_DA_CONFIRMACAO");
    exigir(
      (await executarEntregaDaFotografia(id, destino, respostaPerdida)) === "aguardando" &&
        envios === 1,
      "ATRASO_NAO_RESPEITADO",
    );
    const [relogio] = await db
      .select({
        espera:
          sql<number>`greatest(0,ceil(extract(epoch from (${deliveries.nextAttemptAt}-clock_timestamp()))*1000))`.mapWith(
            Number,
          ),
      })
      .from(deliveries)
      .where(eq(deliveries.id, id));
    exigir(relogio && relogio.espera > 0 && relogio.espera <= 300_000, "PRAZO_DIVERGENTE");
    console.log(
      "Prova nativa: aguardando o prazo persistido de recuperação, sem alterar o relógio ou o recibo.",
    );
    await esperar(relogio.espera + 50);
    recibo.retryDelayRespected = true;
    exigir(
      (await executarEntregaDaFotografia(id, destino, storage)) === "concluida",
      "RECUPERACAO_NAO_CONFIRMADA",
    );
    const confirmada = await lerEntrega();
    exigir(
      confirmada.state === "verified" &&
        confirmada.verifiedAt &&
        !confirmada.envelope &&
        !confirmada.leaseToken &&
        confirmada.attemptCount === 2 &&
        confirmada.objectKey === key &&
        confirmada.cipherSha256 === preparada.cipherSha256,
      "PUBLICACAO_DIVERGENTE",
    );
    recibo.responseLossRecovered = true;
    const [bucketFoto] = await db
      .select({ storage: snapshots.storage, data: snapshots.data, objectKey: snapshots.objectKey })
      .from(snapshots)
      .where(eq(snapshots.id, foto.id));
    exigir(
      bucketFoto?.storage === "bucket" && bucketFoto.data === null && bucketFoto.objectKey === key,
      "PONTEIRO_NAO_PUBLICADO",
    );
    recibo.atomicPublicationVerified = true;
    const [instancia] = await db
      .insert(instances)
      .values({
        gameId: "morada",
        publicUrl: "ws://127.0.0.1:1",
        version: "qualification-fixture",
        capacity: 1,
      })
      .returning({ id: instances.id });
    exigir(instancia, "INSTANCIA_AUSENTE");
    await db.transaction(async (tx) => {
      await tx
        .update(spaces)
        .set({ status: "active", leaseEpoch: 1 })
        .where(eq(spaces.id, mundoId));
      await tx.insert(leases).values({
        spaceId: mundoId,
        fence: 1,
        holderKind: "server",
        instanceId: instancia.id,
        state: "held",
        claimedAt: sql`clock_timestamp()`,
        expiresAt: sql`clock_timestamp()+interval '45 seconds'`,
      });
    });
    const { leitorDeFotografias } = await import("../src/features/objetos/runtime");
    const { lerFotografiaDoMundo } = await import("../src/features/posse/repository");
    const pedido = {
      mundoId: MundoIdSchema.parse(mundoId),
      jogo: "morada",
      instanciaId: InstanciaIdSchema.parse(instancia.id),
      cerca: 1,
    };
    const lida = await lerFotografiaDoMundo(pedido, leitorDeFotografias());
    exigir(lida && Buffer.from(lida.bytes).equals(bytes), "LEITURA_NATIVA_DIVERGENTE");
    lida.bytes.fill(0);
    recibo.nativeRuntimeReadVerified = true;
    await db
      .update(leases)
      .set({ state: "released", releasedAt: sql`clock_timestamp()`, endReason: "error" })
      .where(eq(leases.spaceId, mundoId));
    let recusada = false;
    try {
      await lerFotografiaDoMundo(pedido, leitorDeFotografias());
    } catch (e) {
      const { ErroDoRecreio } = await import("@informach/recreio");
      if (e instanceof ErroDoRecreio && e.codigo === "POSSE_PERDIDA") recusada = true;
      else throw e;
    }
    exigir(recusada, "POSSE_REVOGADA_ACEITA");
    recibo.revokedLeaseDenied = true;
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
  } catch (e) {
    recibo.failure = codigo(e);
  } finally {
    if (admitida) {
      try {
        await limpar();
        recibo.cleanupConfirmed = true;
      } catch (e) {
        recibo.cleanupFailure = codigo(e);
      }
    } else recibo.cleanupConfirmed = true;
    chave.fill(0);
    delete process.env.RECREIO_OBJECTS_KEYS;
    cliente.destroy();
  }
  if (!recibo.cleanupConfirmed) recibo.status = "failed";
  await guardarRecibo();
  console.log(JSON.stringify(recibo));
  return recibo.status === "passed" ? 0 : 1;
}
main()
  .then((codigo) => process.exit(codigo))
  .catch(() => {
    console.error("Prova nativa recusada ou inconclusiva; nenhum detalhe privado será exibido.");
    process.exit(1);
  });
