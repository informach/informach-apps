import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { isAbsolute, join } from "node:path";
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { db, eq, sql } from "@informach/db";
import { recreioSpaceSnapshots as snapshots, recreioSpaces as spaces } from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import { expect, it } from "vitest";
import { z } from "zod";
import { GET } from "@/app/api/objetos/configuracao/route";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { criarArmazenamentoPrivadoS3 } from "@/features/objetos/s3";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { confirmarPublicacao } from "../scripts/backup/publicacao-repository";
import { pronta } from "./backup-publicacao-apoio";
import { executarImagemDeFotografias } from "./fotografias-cli-apoio";

function required(k: string) {
  const v = process.env[k];
  if (!v) throw new Error("SNAPSHOT_IMAGE_FIXTURE_CONFIGURATION");
  return v;
}
const Rodada = z.strictObject({
  formato: z.literal("recreio-migracao-fotografias-v1"),
  modo: z.literal("process"),
  resultado: z.union([
    z.strictObject({ ocupada: z.literal(true) }),
    z.strictObject({
      ocupada: z.literal(false),
      selecionadas: z.number().int().nonnegative(),
      concluidas: z.number().int().nonnegative(),
      aguardando: z.number().int().nonnegative(),
    }),
  ]),
  limpezaConfirmada: z.literal(true),
});

it("executa imagem real, migra e relê objetos sintéticos, repete e recusa leitor/backup/concorrência incorretos", async () => {
  const bucket = required("RECREIO_S3_TEST_BUCKET"),
    endpoint = required("RECREIO_S3_TEST_ENDPOINT");
  if (
    bucket !== "recreio-homologacao-c0xyqx" ||
    endpoint !== "https://t3.storageapi.dev" ||
    process.env.RECREIO_OBJECTS_MIGRATION_OPERATIONAL_PROBE !== "1" ||
    process.env.GITHUB_ACTIONS !== "true"
  )
    throw new Error("SNAPSHOT_IMAGE_FIXTURE_BOUNDARY");
  const temp = required("RUNNER_TEMP");
  if (!isAbsolute(temp)) throw new Error("SNAPSHOT_IMAGE_REPORT_DIRECTORY");
  const mundoId = randomUUID(),
    ativoId = randomUUID(),
    bucketId = randomUUID(),
    key = randomBytes(32),
    kid = "snapshot-image-v1";
  const autorizados = new Set<string>();
  const owned = [`recreio/v1/fotografia/${mundoId}/`, `recreio/v1/fotografia/${ativoId}/`];
  const cliente = new S3Client({
    endpoint,
    region: required("RECREIO_S3_TEST_REGION"),
    forcePathStyle: required("RECREIO_S3_TEST_PATH_STYLE") === "true",
    credentials: {
      accessKeyId: required("RECREIO_S3_TEST_ACCESS_KEY"),
      secretAccessKey: required("RECREIO_S3_TEST_SECRET_KEY"),
    },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const cifrador = criarCifradorDeObjetos({
    chaveAtiva: kid,
    chaves: new Map([[kid, key]]),
    limiteBytes: 4096,
  });
  const storage = criarArmazenamentoPrivadoS3({ cliente, bucket, cifrador, tempoLimiteMs: 10000 });
  const env: Record<string, string> = {
    CI: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: required("GITHUB_REPOSITORY"),
    DATABASE_URL: required("DATABASE_URL"),
    RECREIO_OBJECTS_MODE: "read",
    RECREIO_OBJECTS_SCOPE: "qualification",
    RECREIO_OBJECTS_BUCKET_ID: bucketId,
    RECREIO_OBJECTS_BUCKET: bucket,
    RECREIO_OBJECTS_ENDPOINT: endpoint,
    RECREIO_OBJECTS_REGION: required("RECREIO_S3_TEST_REGION"),
    RECREIO_OBJECTS_PATH_STYLE: required("RECREIO_S3_TEST_PATH_STYLE") === "true" ? "1" : "0",
    RECREIO_OBJECTS_ACCESS_KEY: required("RECREIO_S3_TEST_ACCESS_KEY"),
    RECREIO_OBJECTS_SECRET_KEY: required("RECREIO_S3_TEST_SECRET_KEY"),
    RECREIO_OBJECTS_ACTIVE_KEY: kid,
    RECREIO_OBJECTS_KEYS: JSON.stringify({ [kid]: key.toString("base64") }),
    RECREIO_OBJECTS_MIGRATION_MODE: "process",
    RECREIO_OBJECTS_MIGRATION_READER_SOURCE: required("GITHUB_SHA"),
    RECREIO_OBJECTS_MIGRATION_BATCH: "10",
    RECREIO_OBJECTS_MIGRATION_TIMEOUT_SECONDS: "60",
  };
  const report: Record<string, unknown> = {
    source: required("GITHUB_SHA"),
    runId: required("GITHUB_RUN_ID"),
    status: "failed",
    syntheticDataOnly: true,
    productionDataTouched: false,
    productionCredentialsUsed: false,
    backupMetadataFixtures: true,
    actualBackupRecoveryProven: false,
    realGameServerReadVerified: false,
    cleanupConfirmed: false,
  };
  let phase = "seed",
    falhou = false,
    pedidos = 0;
  const anteriores = new Map(
    [
      ...Object.keys(env).filter((k) => k.startsWith("RECREIO_OBJECTS_")),
      "NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA",
    ].map((k) => [k, process.env[k]]),
  );
  for (const [k, v] of Object.entries(env))
    if (k.startsWith("RECREIO_OBJECTS_")) process.env[k] = v;
  process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA = required("GITHUB_SHA");
  const servidor = createServer(async (pedido, resposta) => {
    pedidos++;
    if (
      pedido.method !== "GET" ||
      pedido.url !== "/api/objetos/configuracao" ||
      pedido.headers.authorization ||
      pedido.headers.cookie
    ) {
      resposta.writeHead(400);
      resposta.end();
      return;
    }
    try {
      const r = await GET();
      resposta.writeHead(r.status, Object.fromEntries(r.headers));
      resposta.end(await r.text());
    } catch {
      resposta.writeHead(503);
      resposta.end();
    }
  });
  let f: Awaited<ReturnType<typeof pronta>> | undefined;
  async function listar(prefix: string) {
    if (!owned.includes(prefix)) throw new Error("SNAPSHOT_IMAGE_PREFIX");
    const r = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 4 }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (r.IsTruncated || (r.Contents?.length ?? 0) > 2) throw new Error("SNAPSHOT_IMAGE_INVENTORY");
    return (r.Contents ?? [])
      .map((o) => {
        if (!o.Key || !new RegExp(`^${prefix}[a-f0-9]{64}$`).test(o.Key))
          throw new Error("SNAPSHOT_IMAGE_OBJECT");
        return o.Key;
      })
      .sort();
  }
  try {
    for (const prefix of owned) {
      expect(await listar(prefix)).toEqual([]);
      autorizados.add(prefix);
    }
    const agora = Date.now();
    const mundos: { id: string; status: "hibernating" | "active"; n: number }[] = [
      { id: mundoId, status: "hibernating", n: 2 },
      { id: ativoId, status: "active", n: 1 },
    ];
    for (const { id, status, n } of mundos) {
      await db.insert(spaces).values({
        id,
        gameId: "morada",
        name: "Imagem sintética",
        contentPolicy: "L",
        status,
        revision: n,
        journalSeq: 0,
        schemaVersion: 1,
      });
      for (let revision = 1; revision <= n; revision++) {
        const bytes = Buffer.from(`SNAPSHOT_IMAGE_SYNTHETIC_${revision}`);
        await db.insert(snapshots).values({
          spaceId: id,
          revision,
          fence: 0,
          schemaVersion: 1,
          journalSeq: 0,
          tick: 0,
          kind: "checkpoint",
          storage: "pg",
          data: bytes,
          byteSize: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          createdAt: new Date(agora - 10000 + revision),
        });
      }
    }
    f = await pronta(0, {
      foto: { bucketId, bucketName: bucket, escopo: "qualification" },
      createdAt: new Date(agora - 1000),
      capturedAt: new Date(agora - 500),
    });
    await confirmarPublicacao(f.t, f.bytes);
    env.RECREIO_OBJECTS_MIGRATION_BACKUP_ID = f.id;
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");
    const endereco = servidor.address();
    if (!endereco || typeof endereco === "string") throw new Error("SNAPSHOT_IMAGE_HTTP_FIXTURE");
    env.RECREIO_OBJECTS_MIGRATION_READER_ORIGIN = `http://127.0.0.1:${endereco.port}`;
    phase = "key-material";
    process.env.RECREIO_OBJECTS_KEYS = JSON.stringify({
      [kid]: randomBytes(32).toString("base64"),
    });
    try {
      await executarImagemDeFotografias(env, 1);
    } finally {
      process.env.RECREIO_OBJECTS_KEYS = env.RECREIO_OBJECTS_KEYS;
    }
    report.keyMaterialMismatchRefused = true;
    phase = "process";
    const primeira = Rodada.parse(await executarImagemDeFotografias(env));
    expect(primeira.resultado).toEqual({
      ocupada: false,
      selecionadas: 2,
      concluidas: 2,
      aguardando: 0,
    });
    report.nativePointerPublicationVerified = true;
    report.nativeImagesProcessed = 1;
    phase = "read";
    for (let revision = 1; revision <= 2; revision++) {
      const foto = await db.transaction((tx) =>
        armazenamentoPg.prepararLeituraDaFotografia(
          tx,
          MundoIdSchema.parse(mundoId),
          4096,
          revision,
        ),
      );
      if (foto?.origem.tipo !== "bucket") throw new Error("SNAPSHOT_IMAGE_POINTER");
      const bytes = await storage.recuperar(foto.origem.objeto);
      try {
        expect(Buffer.from(bytes)).toEqual(Buffer.from(`SNAPSHOT_IMAGE_SYNTHETIC_${revision}`));
      } finally {
        bytes.fill(0);
      }
    }
    report.nativeStoredPointerAndSdkReadsVerified = true;
    const objetos = await listar(owned[0] ?? "");
    expect(objetos).toHaveLength(2);
    expect(await listar(owned[1] ?? "")).toEqual([]);
    const anon = new URL(endpoint);
    const first = objetos[0];
    if (!first) throw new Error("SNAPSHOT_IMAGE_OBJECT");
    if (env.RECREIO_OBJECTS_PATH_STYLE === "1") anon.pathname = `/${bucket}/${first}`;
    else {
      anon.hostname = `${bucket}.${anon.hostname}`;
      anon.pathname = `/${first}`;
    }
    const negativa = await fetch(anon, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    try {
      expect(negativa.status).toBe(403);
    } finally {
      await negativa.body?.cancel();
    }
    report.anonymousReadDenied = true;
    phase = "repeat";
    const repetida = Rodada.parse(await executarImagemDeFotografias(env));
    expect(repetida.resultado).toEqual({
      ocupada: false,
      selecionadas: 0,
      concluidas: 0,
      aguardando: 0,
    });
    expect(await listar(owned[0] ?? "")).toEqual(objetos);
    report.nativeRepeatWithoutDuplicationVerified = true;
    const [ativo] = await db
      .select({ storage: snapshots.storage, data: snapshots.data })
      .from(snapshots)
      .where(eq(snapshots.spaceId, ativoId));
    expect(ativo?.storage).toBe("pg");
    expect(ativo?.data).toEqual(Buffer.from("SNAPSHOT_IMAGE_SYNTHETIC_1"));
    report.activeWorldPreserved = true;
    phase = "negative";
    process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA = "b".repeat(40);
    await executarImagemDeFotografias(env, 1);
    process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA = required("GITHUB_SHA");
    await executarImagemDeFotografias(
      { ...env, RECREIO_OBJECTS_MIGRATION_BACKUP_ID: randomUUID() },
      1,
    );
    report.changedReaderAndAbsentBackupRefused = true;
    const conexao = await db.$client.reserve();
    let travou = false;
    try {
      const [lock] = await conexao<
        { obtida: boolean }[]
      >`select pg_try_advisory_lock(hashtextextended('recreio:snapshot-migration:v1',0)) as obtida`;
      travou = lock?.obtida === true;
      expect(travou).toBe(true);
      const antes = pedidos;
      const ocupada = Rodada.parse(await executarImagemDeFotografias(env));
      expect(ocupada.resultado).toEqual({ ocupada: true });
      expect(pedidos).toBe(antes);
    } finally {
      try {
        if (travou) {
          const [unlock] = await conexao<
            { liberada: boolean }[]
          >`select pg_advisory_unlock(hashtextextended('recreio:snapshot-migration:v1',0)) as liberada`;
          expect(unlock?.liberada).toBe(true);
        }
      } finally {
        conexao.release();
      }
    }
    report.concurrentExecutorRefusedBeforeExternalIo = true;
    const jobs = await db.execute<{ ok: boolean; finished: boolean }>(
      sql`select ok,finished_at is not null as finished from ops.job_runs where app='recreio' and job='migracao-fotografias' order by started_at,id`,
    );
    expect(jobs.map((j) => j.ok)).toEqual([true, true, false]);
    expect(jobs.every((j) => j.finished)).toBe(true);
    const [audit] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from audit.events where payload->>'app'='recreio' and event_type='recreio.snapshot_object_confirmed'`,
    );
    expect(audit?.n).toBe(2);
    report.nativeJobAndAuditOutcomesVerified = true;
    report.readerRequests = pedidos;
  } catch {
    falhou = true;
    report.failureStage = phase;
  } finally {
    const errors: unknown[] = [];
    for (const prefix of autorizados) {
      try {
        for (const Key of await listar(prefix))
          await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key }), {
            abortSignal: AbortSignal.timeout(10000),
          });
        expect(await listar(prefix)).toEqual([]);
      } catch (e) {
        errors.push(e);
      }
    }
    try {
      servidor.closeAllConnections();
      if (servidor.listening)
        await new Promise<void>((resolve, reject) =>
          servidor.close((e) => (e ? reject(e) : resolve())),
        );
    } catch (e) {
      errors.push(e);
    }
    for (const [k, v] of anteriores) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      f?.indice.encerrar();
      cifrador.encerrar();
      key.fill(0);
      cliente.destroy();
    } catch (e) {
      errors.push(e);
    }
    report.cleanupConfirmed = errors.length === 0;
    report.status = !falhou && errors.length === 0 ? "passed" : "failed";
    await writeFile(
      join(temp, "recreio-fotografias-operacional.json"),
      JSON.stringify(report, null, 2),
    );
  }
  expect(report.status).toBe("passed");
});
