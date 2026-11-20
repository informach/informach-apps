import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { db, sql } from "@informach/db";
import postgres from "postgres";
import { expect, it } from "vitest";
import { z } from "zod";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { criarArmazenamentoPrivadoS3 } from "@/features/objetos/s3";
import { criarIndiceDeRecuperacao } from "../scripts/backup/indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "../scripts/backup/indice-s3";
import { novoJogador } from "./apoio";
import { conexao } from "./backup-arquivos-apoio";
import { executarImagemDeBackup } from "./backup-cli-apoio";
import { mundoDe } from "./jogo-apoio";

const required = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error("OPERATIONAL_PROOF_CONFIGURATION");
  return v;
};
const CaptureResult = z.object({
  formato: z.literal("recreio-backup-rodada-v1"),
  ok: z.literal(true),
  capturaCriada: z.boolean(),
  capturaId: z.uuid().optional(),
  limpezaConfirmada: z.literal(true),
});
const RestoreResult = z.object({
  formato: z.literal("recreio-backup-recuperacao-v1"),
  ok: z.literal(true),
  localCleanupConfirmed: z.literal(true),
  resultado: z.object({
    capturaId: z.uuid(),
    sourceDatabaseCredentialsPresent: z.literal(false),
    backupClientOnlySelectedCaptureRead: z.literal(true),
    trafficAuthorized: z.literal(false),
    backupReadRequests: z.number().int().min(3),
    rodadas: z
      .array(
        z.object({
          indice: z.number().int(),
          recibosAntes: z.number().int(),
          recibosDepois: z.number().int(),
          migrationsAplicadas: z.number().int(),
          recibosOriginaisPreservados: z.literal(true),
          inventarioConferidoAntesDoUpgrade: z.literal(true),
          clusterRemovido: z.literal(true),
        }),
      )
      .length(2),
  }),
});

it("uses the exact image to capture/cadence, lose source capabilities and restore two private copies from S3", async () => {
  const source = conexao();
  if (
    process.env.RECREIO_BACKUP_OPERATIONAL_PROBE !== "1" ||
    process.env.GITHUB_REPOSITORY !== "informach/informach-apps" ||
    required("RECREIO_S3_TEST_BUCKET") !== "recreio-homologacao-c0xyqx" ||
    process.env.RECREIO_S3_EXPECTED_BUCKET !== process.env.RECREIO_S3_TEST_BUCKET ||
    process.env.RECREIO_S3_TEST_ENDPOINT !== "https://t3.storageapi.dev"
  )
    throw new Error("OPERATIONAL_PROOF_BOUNDARY");
  const temp = required("RUNNER_TEMP");
  if (!isAbsolute(temp)) throw new Error("OPERATIONAL_REPORT_DIRECTORY");
  const bucket = required("RECREIO_S3_TEST_BUCKET"),
    endpoint = required("RECREIO_S3_TEST_ENDPOINT"),
    region = required("RECREIO_S3_TEST_REGION"),
    accessKeyId = required("RECREIO_S3_TEST_ACCESS_KEY"),
    secretAccessKey = required("RECREIO_S3_TEST_SECRET_KEY");
  const pathStyle = required("RECREIO_S3_TEST_PATH_STYLE");
  if (region !== "auto" || !["true", "false"].includes(pathStyle))
    throw new Error("OPERATIONAL_PROOF_STORAGE_BOUNDARY");
  const cliente = new S3Client({
    endpoint,
    region,
    forcePathStyle: pathStyle === "true",
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const fotoKey = randomBytes(32),
    archiveKey = randomBytes(32),
    archiveId = `ops-${required("GITHUB_RUN_ID")}`;
  const target = {
    bucketId: "14cbada1-04eb-45cd-be30-94e10e4ba333",
    bucketName: bucket,
    escopo: "qualification" as const,
  };
  const indice = criarIndiceDeRecuperacao({
    destino: target,
    chaveAtiva: archiveId,
    chaves: new Map([[archiveId, archiveKey]]),
  });
  const indices = criarArmazenamentoDoIndiceS3({ cliente, bucket, indice, tempoLimiteMs: 10000 });
  const adminUrl = new URL(source);
  adminUrl.pathname = "/ci";
  const admin = postgres(adminUrl.href, { max: 1, prepare: false, connect_timeout: 5 });
  const dbName = source.pathname.slice(1);
  if (!/^recreio_review_[a-f0-9]{32}$/.test(dbName)) throw new Error("SOURCE_DATABASE_NOT_OWNED");
  const ownedKeys = new Set<string>(),
    errors: unknown[] = [];
  const report: Record<string, unknown> = {
    source: required("GITHUB_SHA"),
    runId: required("GITHUB_RUN_ID"),
    status: "failed",
    syntheticDataOnly: true,
    productionDataTouched: false,
    gameContentValidated: false,
    sourceDatabaseUnavailableVerified: false,
    sourceObjectAbsenceVerified: false,
    sourceDatabaseReenabled: false,
    cleanupConfirmed: false,
    trafficAuthorized: false,
  };
  let phase = "seed",
    primary: unknown;
  const absent = async (key: string) => {
    try {
      const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (r.Body instanceof Readable) r.Body.destroy();
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404 &&
        error.name === "NoSuchKey"
      )
        return;
      throw error;
    }
    throw new Error("OWNED_SYNTHETIC_OBJECT_STILL_EXISTS");
  };
  try {
    const jogador = await novoJogador(),
      world = await mundoDe(jogador),
      snapshot = randomUUID(),
      delivery = randomUUID();
    const bytes = Buffer.from("OPAQUE_SYNTHETIC_OPERATIONAL_PHOTOGRAPH");
    const codecFoto = criarCifradorDeObjetos({
      chaveAtiva: "foto-v1",
      chaves: new Map([["foto-v1", fotoKey]]),
      limiteBytes: 4 * 1024 ** 2,
    });
    const foto = codecFoto.cifrar({ tipo: "fotografia", id: world }, bytes),
      r = foto.referencia;
    const photoPath = `recreio/v1/fotografia/${world}/${r.sha256Cifrado}`;
    ownedKeys.add(photoPath);
    const storage = criarArmazenamentoPrivadoS3({
      cliente,
      bucket,
      cifrador: codecFoto,
      tempoLimiteMs: 10000,
    });
    await storage.enviar(foto);
    foto.bytes.fill(0);
    bytes.fill(0);
    await db.execute(sql`insert into recreio.space_snapshots(id,space_id,revision,fence,schema_version,journal_seq,tick,kind,storage,data,object_key,byte_size,sha256)
      values(${snapshot},${world},1,0,1,0,0,'checkpoint','bucket',null,${photoPath},${r.bytes},${r.sha256})`);
    await db.execute(
      sql`update recreio.spaces set revision=1,schema_version=1,journal_seq=0 where id=${world}`,
    );
    await db.execute(sql`insert into recreio.snapshot_object_deliveries(id,snapshot_reference,snapshot_id,space_id,plaintext_sha256,plaintext_bytes,storage_scope,bucket_id,bucket_name,object_key,cipher_sha256,cipher_bytes,encryption_key_id,state,verified_at)
      values(${delivery},${snapshot},${snapshot},${world},${r.sha256},${r.bytes},'qualification',${target.bucketId},${bucket},${photoPath},${r.sha256Cifrado},${r.bytesCifrados},${r.chaveId},'verified',clock_timestamp())`);
    await db.execute(sql`create schema backup_operational_sentinel`);
    await db.execute(
      sql`create table backup_operational_sentinel.data(id int primary key,body jsonb,bytes bytea,at timestamptz)`,
    );
    await db.execute(
      sql`insert into backup_operational_sentinel.data values(1,'{"synthetic":true}',decode('0001ff','hex'),'2026-11-20T01:02:03.123456Z')`,
    );
    const archiveEnv = {
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_SHA: required("GITHUB_SHA"),
      NODE_ENV: "production",
      RECREIO_BACKUP_SCOPE: "qualification",
      RECREIO_BACKUP_BUCKET_ID: target.bucketId,
      RECREIO_BACKUP_BUCKET: bucket,
      RECREIO_BACKUP_ENDPOINT: endpoint,
      RECREIO_BACKUP_REGION: region,
      RECREIO_BACKUP_PATH_STYLE: pathStyle === "true" ? "1" : "0",
      RECREIO_BACKUP_ACCESS_KEY: accessKeyId,
      RECREIO_BACKUP_SECRET_KEY: secretAccessKey,
      RECREIO_BACKUP_ACTIVE_KEY: archiveId,
      RECREIO_BACKUP_KEYS: JSON.stringify({ [archiveId]: archiveKey.toString("base64") }),
      RECREIO_BACKUP_TIMEOUT_MS: "120000",
      RECREIO_BACKUP_MAX_BYTES: String(32 * 1024 ** 2),
      RECREIO_BACKUP_PHOTOGRAPH_MAX_BYTES: String(4 * 1024 ** 2),
    };
    const captureEnv = {
      ...archiveEnv,
      RECREIO_BACKUP_MODE: "native",
      DATABASE_URL: source.href,
      RECREIO_BACKUP_MIN_INTERVAL_SECONDS: "18000",
      RECREIO_BACKUP_RETENTION_DAYS: "28",
      RECREIO_OBJECTS_MODE: "read",
      RECREIO_OBJECTS_SCOPE: "qualification",
      RECREIO_OBJECTS_BUCKET_ID: target.bucketId,
      RECREIO_OBJECTS_BUCKET: bucket,
      RECREIO_OBJECTS_ENDPOINT: endpoint,
      RECREIO_OBJECTS_REGION: region,
      RECREIO_OBJECTS_PATH_STYLE: archiveEnv.RECREIO_BACKUP_PATH_STYLE,
      RECREIO_OBJECTS_ACCESS_KEY: accessKeyId,
      RECREIO_OBJECTS_SECRET_KEY: secretAccessKey,
      RECREIO_OBJECTS_ACTIVE_KEY: "foto-v1",
      RECREIO_OBJECTS_KEYS: JSON.stringify({ "foto-v1": fotoKey.toString("base64") }),
    };
    phase = "capture";
    const captured = CaptureResult.parse((await executarImagemDeBackup(captureEnv)).at(-1));
    expect(captured.capturaCriada).toBe(true);
    if (!captured.capturaId) throw new Error("CAPTURE_RECEIPT_MISSING");
    const id = captured.capturaId;
    const signed = await indices.recuperar(id);
    expect(signed.publicacao.inventario.quantidade).toBe(1);
    expect(signed.publicacao.source).toBe(required("GITHUB_SHA"));
    report.captureId = id;
    report.captureVerified = true;
    report.archiveBytes = signed.publicacao.arquivo.bytesCifrados;
    phase = "cadence";
    const repeated = CaptureResult.parse((await executarImagemDeBackup(captureEnv)).at(-1));
    expect(repeated.capturaCriada).toBe(false);
    const [count] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from recreio.backup_captures where encryption_key_id=${archiveId}`,
    );
    expect(count?.n).toBe(1);
    report.cadenceVerified = true;
    phase = "source_loss";
    await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: photoPath }));
    await absent(photoPath);
    report.sourceObjectAbsenceVerified = true;
    // Only the generated, regex-checked CI review database is disabled.
    await admin.unsafe(`alter database "${dbName}" allow_connections false`);
    await admin`select pg_terminate_backend(pid,5000) from pg_stat_activity where datname=${dbName}`;
    const [stopped] = await admin<
      { unavailable: boolean }[]
    >`select not datallowconn and not exists(
      select 1 from pg_stat_activity where datname=${dbName}) as unavailable from pg_database where datname=${dbName}`;
    expect(stopped?.unavailable).toBe(true);
    report.sourceDatabaseUnavailableVerified = true;
    phase = "restore";
    const recovered = RestoreResult.parse(
      (
        await executarImagemDeBackup({
          ...archiveEnv,
          RECREIO_BACKUP_MODE: "restore",
          RECREIO_BACKUP_CAPTURE_ID: id,
          RECREIO_BACKUP_RESTORE_ROUNDS: "2",
        })
      ).at(-1),
    );
    expect(recovered.resultado.capturaId).toBe(id);
    expect(
      recovered.resultado.rodadas.every(
        (v) => v.recibosAntes === 244 && v.recibosDepois === 244 && v.migrationsAplicadas === 0,
      ),
    ).toBe(true);
    report.recovery = recovered;
    report.status = "passed";
  } catch (error) {
    primary = error;
    report.failurePhase = phase;
    report.failureCode =
      error instanceof Error &&
      /^BACKUP_CLI_PROCESS_FAILED_(unknown|configuracao|schema|recursos|fila|captura|arquivo|restauracao|encerramento)$/.test(
        error.message,
      )
        ? error.message
        : "PROOF_STEP_FAILED";
  }
  // Re-enable before any test-source query, even when the recovery child fails.
  try {
    await admin.unsafe(`alter database "${dbName}" allow_connections true`);
    const [enabled] = await admin<
      { enabled: boolean }[]
    >`select datallowconn as enabled from pg_database where datname=${dbName}`;
    if (!enabled?.enabled) throw new Error("SOURCE_DATABASE_NOT_REENABLED");
    report.sourceDatabaseReenabled = true;
    // The durable reference precedes PUT, so cleanup can recover an ID even
    // when the native CLI did not return its final JSON receipt.
    const archives = await db.execute<{
      id: string;
      object_key: string | null;
      cipher_sha256: string | null;
    }>(sql`
      select id,object_key,cipher_sha256 from recreio.backup_captures where encryption_key_id=${archiveId}`);
    for (const a of archives) {
      z.uuid().parse(a.id);
      if (
        !a.cipher_sha256 ||
        !/^[a-f0-9]{64}$/.test(a.cipher_sha256) ||
        a.object_key !== `recreio/v1/backup/${a.id}/${a.cipher_sha256}`
      )
        throw new Error("OWNED_ARCHIVE_REFERENCE_INVALID");
      ownedKeys.add(a.object_key);
      ownedKeys.add(`recreio/v1/backup/${a.id}/manifesto.json`);
      ownedKeys.add(`recreio/v1/backup/${a.id}/retirado.json`);
    }
  } catch (error) {
    errors.push(error);
  }
  for (const key of ownedKeys) {
    try {
      await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      await absent(key);
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await admin.end({ timeout: 5 });
  } catch (error) {
    errors.push(error);
  }
  indice.encerrar();
  cliente.destroy();
  fotoKey.fill(0);
  archiveKey.fill(0);
  report.ownedObjectCount = ownedKeys.size;
  report.cleanupConfirmed = errors.length === 0;
  if (errors.length) report.status = "failed";
  await writeFile(
    join(temp, "recreio-backup-operacional.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  if (primary || errors.length) throw new Error(`OPERATIONAL_BACKUP_PROOF_FAILED_${phase}`);
  expect(report.status).toBe("passed");
  expect(report.cleanupConfirmed).toBe(true);
});
