import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { db, sql } from "@informach/db";
import { expect, it } from "vitest";
import { z } from "zod";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { RAIZ_VAZIA } from "@/features/direitos/livro/contrato";
import { executarImagemDeDireitos } from "./rights-cli-apoio";
import { prepararEncerramentoParaImagem } from "./rights-closure-native-apoio";
import { FalhaDaFixtureDaImagem, prepararRetiradaParaImagem } from "./rights-native-apoio";

function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error("RIGHTS_IMAGE_PROOF_CONFIGURATION");
  return value;
}
const Rodada = z.strictObject({
  formato: z.literal("recreio-direitos-rodada-v1"),
  etapas: z.array(z.never()).length(0),
  publishing: z.literal(0),
  processing: z.literal(0),
  review: z.literal(0),
  processingOverdue: z.literal(0),
  retained: z.literal(0),
  purgeDue: z.literal(0),
  purgeOverdue: z.literal(0),
  leiturasLivro: z.literal(1),
  escritasLivro: z.literal(0),
  limpezaConfirmada: z.literal(true),
});
const RodadaComEfeitos = z.object({
  formato: z.literal("recreio-direitos-rodada-v1"),
  etapas: z.array(z.object({ etapa: z.string(), situacao: z.string() })).length(11),
  review: z.literal(0),
  limpezaConfirmada: z.literal(true),
  leiturasLivro: z.number().int().positive(),
  escritasLivro: z.number().int().nonnegative(),
});
const Falha = z.strictObject({
  formato: z.literal("recreio-direitos-rodada-v1"),
  erro: z.literal("DIREITOS_PROCESSAMENTO_FALHOU"),
});

it("runs the exact rights image against native SQL and S3, with fresh custody checks and no implicit bootstrap", async () => {
  const url = new URL(required("DATABASE_URL"));
  if (
    process.platform !== "linux" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REPOSITORY !== "informach/informach-apps" ||
    required("RECREIO_S3_TEST_BUCKET") !== "recreio-homologacao-c0xyqx" ||
    process.env.RECREIO_S3_EXPECTED_BUCKET !== process.env.RECREIO_S3_TEST_BUCKET ||
    required("RECREIO_S3_TEST_ENDPOINT") !== "https://t3.storageapi.dev" ||
    url.hostname !== "127.0.0.1" ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("RIGHTS_IMAGE_PROOF_BOUNDARY");
  const temp = required("RUNNER_TEMP");
  if (!isAbsolute(temp)) throw new Error("RIGHTS_IMAGE_REPORT_DIRECTORY");
  const bucket = required("RECREIO_S3_TEST_BUCKET"),
    livroId = randomUUID(),
    missingId = randomUUID();
  const prefix = `recreio/v1/direitos/${livroId}/`,
    missingPrefix = `recreio/v1/direitos/${missingId}/`;
  const key = randomBytes(32),
    kid = "image-proof-v1";
  const cliente = new S3Client({
    endpoint: required("RECREIO_S3_TEST_ENDPOINT"),
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
  const assinatura = criarAssinaturaDoLivro({
    livroId,
    chaveAtiva: kid,
    chaves: new Map([[kid, key]]),
  });
  const storage = criarArmazenamentoDoLivro({ cliente, bucket, assinatura, tempoLimiteMs: 10000 });
  const env = {
    DATABASE_URL: url.href,
    RECREIO_RIGHTS_MODE: "process",
    RECREIO_RIGHTS_SCOPE: "qualification",
    RECREIO_RIGHTS_LEDGER_ID: livroId,
    RECREIO_RIGHTS_BUCKET: bucket,
    RECREIO_RIGHTS_ENDPOINT: required("RECREIO_S3_TEST_ENDPOINT"),
    RECREIO_RIGHTS_REGION: required("RECREIO_S3_TEST_REGION"),
    RECREIO_RIGHTS_PATH_STYLE: required("RECREIO_S3_TEST_PATH_STYLE") === "true" ? "1" : "0",
    RECREIO_RIGHTS_ACCESS_KEY: required("RECREIO_S3_TEST_ACCESS_KEY"),
    RECREIO_RIGHTS_SECRET_KEY: required("RECREIO_S3_TEST_SECRET_KEY"),
    RECREIO_RIGHTS_ACTIVE_KEY: kid,
    RECREIO_RIGHTS_KEYRING: JSON.stringify([[kid, key.toString("base64")]]),
    RECREIO_RIGHTS_POLICY: "retirar-textos-fundacao-v1",
    RECREIO_OBJECTS_MODE: "off",
  };
  const report: Record<string, unknown> = {
    source: required("GITHUB_SHA"),
    runId: required("GITHUB_RUN_ID"),
    status: "failed",
    syntheticDataOnly: true,
    productionDataTouched: false,
    productionCredentialsUsed: false,
    trafficAuthorized: false,
    nativeEffectsProven: false,
    cleanupConfirmed: false,
  };
  let phase = "initialization",
    primary: unknown;
  const cleanupErrors: unknown[] = [];
  async function list(ownedPrefix: string) {
    if (![prefix, missingPrefix].includes(ownedPrefix)) throw new Error("RIGHTS_IMAGE_PREFIX");
    const result = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: ownedPrefix, MaxKeys: 12 }),
    );
    if (result.IsTruncated || (result.Contents?.length ?? 0) > 11)
      throw new Error("RIGHTS_IMAGE_INVENTORY");
    return (result.Contents ?? [])
      .map((o) => {
        if (
          !o.Key?.startsWith(ownedPrefix) ||
          !/^(?:cabecalho\.json|historico\/[0-9]{16}-[a-f0-9]{64}\.json|planos\/[a-f0-9]{64}\.json|intencoes\/[a-f0-9-]{36}-[0-9]{1,16}\.json)$/.test(
            o.Key.slice(ownedPrefix.length),
          )
        )
          throw new Error("RIGHTS_IMAGE_UNEXPECTED_OBJECT");
        return o.Key;
      })
      .sort();
  }
  try {
    expect(await list(prefix)).toEqual([]);
    expect(await list(missingPrefix)).toEqual([]);
    const first = await storage.iniciarCabecalho(
      assinatura.assinarCabecalho({
        formato: "recreio-livro-direitos-v1",
        livroId,
        estado: "aberto",
        epoca: 0,
        chavesUtilizadas: [kid],
        retomada: null,
        geracao: 0,
        entradas: 0,
        raizSha256: RAIZ_VAZIA,
        anteriorSha256: null,
        ultimaIntencao: null,
        atualizadoEm: new Date().toISOString(),
      }),
    );
    const before = await list(prefix);
    expect(before).toHaveLength(2);
    phase = "idle";
    for (let i = 0; i < 2; i++) {
      const rows = await executarImagemDeDireitos(env);
      expect(rows).toHaveLength(1);
      Rodada.parse(rows[0]);
      expect((await storage.lerCabecalho()).sha256).toBe(first.sha256);
      expect(await list(prefix)).toEqual(before);
    }
    report.nativeIdleProcessingVerified = true;
    report.freshHeaderReads = 2;
    report.idleWrites = 0;
    phase = "native_effect";
    const withdrawal = await prepararRetiradaParaImagem({
      assinatura,
      storage,
      fonte: required("GITHUB_SHA"),
    });
    let effectRounds = 0;
    const observedRounds: {
      etapas: { etapa: string; situacao: string }[];
      state: string | null;
    }[] = [];
    report.nativeRounds = observedRounds;
    for (; effectRounds < 6; ) {
      phase = "native_round";
      const rows = await executarImagemDeDireitos(env);
      expect(rows).toHaveLength(1);
      const result = RodadaComEfeitos.parse(rows[0]);
      expect(result.etapas.every((e) => !["revisao", "falhou"].includes(e.situacao))).toBe(true);
      effectRounds++;
      const state = (await withdrawal.estado())?.state ?? null;
      observedRounds.push({ etapas: result.etapas, state });
      if (state === "completed") break;
    }
    phase = "native_verification";
    await withdrawal.verificar();
    expect((await storage.lerCabecalho()).documento.entradas).toBe(1);
    report.nativeEffectsProven = true;
    report.nativeConsentProfileWithdrawalVerified = true;
    report.otherProfileAndProgressPreserved = true;
    report.globalIdentitiesPreserved = true;
    report.nativeCompletionAuditVerified = true;
    report.nativeEffectRounds = effectRounds;
    phase = "closure_preparation";
    const closure = await prepararEncerramentoParaImagem({
      assinatura,
      storage,
      fonte: required("GITHUB_SHA"),
    });
    let closureRounds = 0;
    const closureObserved: {
      etapas: { etapa: string; situacao: string }[];
      state: string | null;
    }[] = [];
    report.nativeClosureRounds = closureObserved;
    for (; closureRounds < 6; ) {
      phase = "closure_round";
      const rows = await executarImagemDeDireitos(env);
      expect(rows).toHaveLength(1);
      const result = RodadaComEfeitos.parse(rows[0]);
      expect(result.etapas.every((e) => !["revisao", "falhou"].includes(e.situacao))).toBe(true);
      closureRounds++;
      const state = (await closure.estado())?.state ?? null;
      closureObserved.push({ etapas: result.etapas, state });
      if (state === "completed") break;
    }
    phase = "closure_verification";
    await closure.verificar();
    await withdrawal.verificar();
    expect((await storage.lerCabecalho()).documento.entradas).toBe(2);
    report.nativeAccountClosureWithoutCustomerVerified = true;
    report.nativeAccountClosureGlobalIdentityPreserved = true;
    report.nativeAccountClosureOwnPinRemoved = true;
    report.nativeAccountClosureAuditVerified = true;
    report.financialProviderCredentialsPresent = false;
    report.nativeAccountClosureEffectRounds = closureRounds;
    const beforeFreeze = await list(prefix);
    phase = "missing";
    const missing = await executarImagemDeDireitos(
      { ...env, RECREIO_RIGHTS_LEDGER_ID: missingId },
      1,
    );
    expect(missing).toHaveLength(1);
    Falha.parse(missing[0]);
    expect(await list(missingPrefix)).toEqual([]);
    report.absentBookRefusedWithoutBootstrap = true;
    phase = "frozen";
    const frozen = await storage.congelarCabecalho(
      await storage.lerCabecalho(),
      new Date().toISOString(),
    );
    const frozenInventory = await list(prefix);
    expect(frozenInventory).toHaveLength(beforeFreeze.length + 1);
    const refused = await executarImagemDeDireitos(env, 1);
    expect(refused).toHaveLength(1);
    Falha.parse(refused[0]);
    expect((await storage.lerCabecalho()).sha256).toBe(frozen.sha256);
    expect(await list(prefix)).toEqual(frozenInventory);
    report.frozenBookRefusedWithoutWrites = true;
    phase = "telemetry";
    const runs = await db.execute<{
      ok: boolean;
      finished: boolean;
      summary: Record<string, number | boolean>;
    }>(sql`
      select ok,finished_at is not null as finished,summary from ops.job_runs
      where app='recreio' and job='direitos' order by started_at,id`);
    expect(runs).toHaveLength(4 + effectRounds + closureRounds);
    expect(runs.map((r) => r.ok)).toEqual([
      ...Array.from({ length: 2 + effectRounds + closureRounds }, () => true),
      false,
      false,
    ]);
    expect(runs.every((r) => r.finished)).toBe(true);
    for (const run of runs.slice(0, 2))
      expect(run.summary).toMatchObject({
        leiturasLivro: 1,
        escritasLivro: 0,
        publishing: 0,
        processing: 0,
        review: 0,
      });
    report.nativeJobOutcomesVerified = true;
    report.nativeJobCount = runs.length;
    phase = "anonymous";
    const anonymous = await fetch(
      `${required("RECREIO_S3_TEST_ENDPOINT")}/${bucket}/${prefix}cabecalho.json`,
      { signal: AbortSignal.timeout(10000) },
    );
    await anonymous.body?.cancel();
    expect(anonymous.status).toBe(403);
    report.anonymousReadDenied = true;
    report.status = "passed";
  } catch (error) {
    if (error instanceof FalhaDaFixtureDaImagem) {
      report.nativeFailureStage = error.etapa;
      report.nativeFailureCode = error.codigo;
    }
    primary = error;
  }
  for (const owned of [prefix, missingPrefix]) {
    try {
      for (const object of await list(owned))
        await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: object }));
      expect(await list(owned)).toEqual([]);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  assinatura.encerrar();
  key.fill(0);
  cliente.destroy();
  report.cleanupConfirmed = cleanupErrors.length === 0;
  if (primary || cleanupErrors.length) report.status = "failed";
  await writeFile(
    join(temp, "recreio-direitos-operacional.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  if (primary || cleanupErrors.length) throw new Error(`RIGHTS_IMAGE_PROOF_FAILED_${phase}`);
  expect(report.status).toBe("passed");
});
