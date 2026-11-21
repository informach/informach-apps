import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FalhaDaRecuperacaoSchema } from "../scripts/backup/diagnostico-recuperacao";
import { exigir, FalhaDaProva } from "../scripts/backup/provas-arquivos";
import {
  type RetiradaNativaDeProva,
  RetiradaNativaDeProvaSchema,
} from "../scripts/backup/retirada-nativa-prova-contrato";

const Recibo = z.strictObject({
  source: z.string().regex(/^[a-f0-9]{40}$/),
  runId: z.string().regex(/^\d+$/),
  capturaId: z.uuid(),
  ok: z.literal(true),
  freshCluster: z.literal(true),
  conteudoIdentico: z.literal(true),
  estruturaIdentica: z.literal(true),
  globaisIdenticos: z.literal(true),
  fotosAutenticadas: z.number().int().min(0),
  vinculosConferidos: z.number().int().min(0),
  clusterCleanupConfirmed: z.literal(true),
  localCleanupConfirmed: z.literal(true),
  sourceDatabaseCredentialsPresent: z.literal(false),
  backupClientOnlyBackupPrefixRead: z.literal(true),
  backupReadRequests: z.number().int().min(3),
  objectDestinationsNormalized: z.literal(true),
  inventoryComparedBeforeNormalization: z.literal(true),
  fotosEmPg: z.number().int().nonnegative(),
  sourceObjectReceiptsQuarantined: z.number().int().nonnegative(),
  backupControlsQuarantined: z.number().int().nonnegative(),
  sourceOperationsRemaining: z.literal(0),
  sourceBucketReferencesRemaining: z.literal(0),
  normalizationIdempotent: z.literal(true),
  normalizationRollbackVerified: z.literal(true),
  normalizationConnectionLossVerified: z.literal(true),
  normalizedCorruptionRefused: z.literal(true),
  manifestMismatchRefused: z.literal(true),
  temporaryCapabilitiesRemaining: z.literal(0),
  temporaryCapabilitiesRevoked: z.literal(true),
  temporaryCapabilitiesRollbackVerified: z.literal(true),
  temporaryCapabilitiesIdempotent: z.literal(true),
  invitationCapabilitiesRemaining: z.literal(0),
  pendingInvitationsRevoked: z.literal(true),
  invitationHistoryPreserved: z.literal(true),
  originalInvitationDeadlinesPreserved: z.literal(true),
  permanentTablesPreserved: z.literal(true),
  historicalSecondAssessmentVerified: z.literal(true),
  historicalSourcesImportedInPrivateCluster: z.literal(true),
  historicalSourcePreflightVerified: z.literal(true),
  historicalSourceIdempotenceVerified: z.literal(true),
  historicalSourceDivergenceRefused: z.literal(true),
  historicalSourceFixturesCleaned: z.literal(true),
  historicalNativeConnectionBound: z.literal(true),
  historicalNativeConnectionRollbackVerified: z.literal(true),
  historicalNativeConnectionClosed: z.literal(true),
  nativeBackupControlLoadedWithoutAppCredentials: z.literal(true),
  nativeSqlWorkersLoadedWithoutAppCredentials: z.literal(true),
  ordinarySqlWorkersRefusedFrozenLedger: z.literal(true),
  privateSqlCoordinationBound: z.literal(true),
  privateSqlCoordinationDivergenceRefused: z.literal(true),
  privateSqlCoordinationFullPreflightVerified: z.literal(true),
  privateSqlCoordinationCopyRefused: z.literal(true),
  privateSqlCoordinationExpired: z.literal(true),
  historicalNativeAdmissionVerified: z.literal(true),
  historicalAdmissionIdempotenceVerified: z.literal(true),
  historicalBackupGuardianPreserved: z.literal(true),
  historicalOperationScopeExpired: z.literal(true),
  nativePhotographicWorkersLoadedWithoutAppCredentials: z.literal(true),
  privatePhotographicQueuesBound: z.literal(true),
  privateChildCannotOutliveParent: z.literal(true),
  privateCoordinationCancellationVerified: z.literal(true),
  privateOperationalQueuesBound: z.literal(true),
  privateContextPreservedAfterIo: z.literal(true),
  nativePostCaptureConsentReplayed: z.literal(true),
  nativePostCapturePersonalErasureExecuted: z.literal(true),
  nativePostCaptureOtherProfilePreserved: z.literal(true),
  nativePostCaptureGlobalIdentityPreserved: z.literal(true),
  nativePostCaptureNoNewConsent: z.literal(true),
  nativePostCapturePhotographSanitized: z.literal(true),
  nativePostCaptureOtherWorldStatePreserved: z.literal(true),
  nativePostCaptureDiaryRecovered: z.literal(true),
  nativePostCaptureJournalEntriesCompacted: z.number().int().min(1).max(1000),
  nativeRightsReplayReceiptVerified: z.literal(true),
  nativeRightsReplayReceiptAuditRollbackVerified: z.literal(true),
  nativeRightsReplayScopeClosed: z.literal(true),
  nativeRightsReplayTrafficAuthorized: z.literal(false),
  nativePendingPublicationReconciled: z.literal(true),
  nativePendingPublicationAuditRollbackVerified: z.literal(true),
  nativePendingPublicationOriginAndDatesPreserved: z.literal(true),
  nativePendingPublicationNoNewConsent: z.literal(true),
  nativePendingPublicationOtherProfilePreserved: z.literal(true),
  nativePreCaptureReadinessReceiptVerified: z.literal(true),
  nativePreCaptureFreshWorkerLeasePreserved: z.literal(true),
  nativePreCaptureOperationResumed: z.literal(true),
  nativePreCaptureOriginPreserved: z.literal(true),
  nativePreCaptureDatesPreserved: z.literal(true),
  nativePreCaptureNoNewConsent: z.literal(true),
  nativePreCaptureWorkerLeaseReconciled: z.literal(true),
  nativePreCaptureIdempotenceVerified: z.literal(true),
  nativePreCapturePartialEffectsPreserved: z.literal(true),
  nativePostCaptureSecondClusterCleaned: z.literal(true),
  nativeClosureFinancialPrivateConnectionVerified: z.literal(true),
  nativeClosureFinancialRetryVerified: z.literal(true),
  nativeClosureFinancialRetryIdempotent: z.literal(true),
  nativeClosureFinancialScopeIsolationVerified: z.literal(true),
  nativeClosureFinancialOriginalConsentPreserved: z.literal(true),
  nativeClosureFinancialBookOnlyRead: z.literal(true),
  nativeClosureFinancialReadRequests: z.number().int().positive(),
  nativeClosureHistoricalConfirmationFreshlyAssessed: z.literal(true),
  nativeClosureHistoricalConfirmationUnchanged: z.literal(true),
  nativeClosureFreshAssessmentRequiresConfirmation: z.literal(true),
  nativeClosureFreshAssessmentIsNotDataAuthority: z.literal(true),
  nativeClosureFreshProviderSdkHttpVerified: z.literal(true),
  nativeClosureFreshProviderFailureRefused: z.literal(true),
  nativeClosureFreshProviderScopeMismatchRefused: z.literal(true),
  nativeClosureFreshProviderIncompletePageRefused: z.literal(true),
  nativeClosureFreshProviderCopiedEvidenceRefused: z.literal(true),
  nativeClosureFreshProviderMutationAfterReadRefused: z.literal(true),
  nativeClosureFreshProviderSourceRaceRefused: z.literal(true),
  nativeClosureProviderOriginalConfirmationUnchanged: z.literal(true),
  nativeClosureProviderReadRequests: z.number().int().positive(),
  nativeClosureFinancialAttemptPersistedBeforeIo: z.literal(true),
  nativeClosureFinancialFailedAssessmentNotCurrent: z.literal(true),
  nativeClosureFinancialCurrentReceiptAuditAtomic: z.literal(true),
  nativeClosureFinancialAssessmentAttempts: z.literal(17),
  nativeClosureFinancialStaleAssessmentRefused: z.literal(true),
  nativeClosureFinancialFutureAssessmentRefused: z.literal(true),
  nativeClosureFinancialSupersededSealRefused: z.literal(true),
  nativeClosureFinancialPersonalCopyScoped: z.literal(true),
  nativeClosureProviderRealStripeUsed: z.literal(false),
  nativeAccountClosureFullyReplayed: z.literal(false),
  nativeZeroPlayerClosureReplayed: z.literal(true),
  nativeZeroPlayerClosureGlobalRecordsPreserved: z.literal(true),
  nativeZeroPlayerClosureOriginalConsentPreserved: z.literal(true),
  nativeZeroPlayerClosureFinancialConfirmationPreserved: z.literal(true),
  nativeZeroPlayerClosureOwnPinRemoved: z.literal(true),
  nativeZeroPlayerClosureOtherAccountPreserved: z.literal(true),
  nativeZeroPlayerClosureRetryIdempotent: z.literal(true),
  nativeZeroPlayerClosureNoNewConsent: z.literal(true),
  nativeZeroPlayerClosureDataScopeExpired: z.literal(true),
  nativeZeroPlayerClosureReadinessVerified: z.literal(true),
  nativeZeroPlayerClosureVerificationIdempotent: z.literal(true),
  nativeClosureOperationVerificationAuditRollback: z.literal(true),
  nativeSelectedClosureReplayed: z.literal(true),
  nativeSelectedClosureProfilesRetired: z.literal(true),
  nativeSelectedClosureOpaqueDataRemoved: z.literal(6),
  nativeSelectedClosureResponsibilityRemoved: z.literal(true),
  nativeSelectedClosureOtherProfilesPreserved: z.literal(true),
  nativeSelectedClosureGlobalRecordsPreserved: z.literal(true),
  nativeSelectedClosureOriginalConsentPreserved: z.literal(true),
  nativeSelectedClosureFinancialConfirmationPreserved: z.literal(true),
  nativeSelectedClosureRetryIdempotent: z.literal(true),
  nativeSelectedClosureNoNewConsent: z.literal(true),
  nativeSelectedClosureReadinessVerified: z.literal(true),
  nativeSelectedClosureVerificationIdempotent: z.literal(true),
  nativeClosureReplayReceiptVerified: z.literal(true),
  nativeClosureReplayReceiptAuditRollbackVerified: z.literal(true),
  nativeClosureReplayIncompleteRunRefused: z.literal(true),
  nativeClosureWithdrawalOnlyReceiptRefused: z.literal(true),
  nativeClosureReplayOriginalConsentAndFinancePreserved: z.literal(true),
  nativeClosureReplayScopeClosed: z.literal(true),
  nativeClosureReplayTrafficAuthorized: z.literal(false),
  rightsClientOnlyRightsPrefixRead: z.literal(true),
  rightsReadRequests: z.number().int().positive(),
  nativePostCaptureSqlPasses: z.number().int().min(1).max(24),
  macFixturePersonalErasureExecuted: z.literal(false),
  macFixtureSourceEffectsExecuted: z.literal(false),
  authoritiesNormalizedForTraffic: z.literal(false),
  productionDataTouched: z.literal(false),
});
export type ReciboDoClusterFrio = z.infer<typeof Recibo>;
/** Docker no runner. Não montar arquivos nem passar URL/senha da origem.
 * Chaves sintéticas e seis credenciais restritas entram por nomes de env,
 * nunca por argumentos/arquivos/logs. Aguardar o processo antes da limpeza S3. */
export async function provarClusterFrio(
  capturaId: string,
  mestre: ReadonlyMap<string, Uint8Array>,
  chaveAtiva: string,
  retirada?: RetiradaNativaDeProva,
): Promise<ReciboDoClusterFrio | undefined> {
  const modo = process.env.RECREIO_BACKUP_FRESH_CLUSTER_PROBE;
  exigir(modo === undefined || modo === "0" || modo === "1", "MODO_FRIO_INVALIDO");
  if (modo !== "1") return undefined;
  const decisao = RetiradaNativaDeProvaSchema.parse(retirada);
  exigir(
    process.platform === "linux" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      process.env.RECREIO_BACKUP_PROVIDER_PROBE === "1" &&
      /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
      /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") &&
      z.uuid().safeParse(capturaId).success,
    "EXECUTOR_FRIO_FORA_DO_ESCOPO",
  );
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "test",
    CI: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
    GITHUB_SHA: process.env.GITHUB_SHA,
  };
  const nomes = [
    "RECREIO_S3_TEST_BUCKET",
    "RECREIO_S3_TEST_ENDPOINT",
    "RECREIO_S3_TEST_REGION",
    "RECREIO_S3_TEST_PATH_STYLE",
    "RECREIO_S3_TEST_ACCESS_KEY",
    "RECREIO_S3_TEST_SECRET_KEY",
    "RECREIO_S3_EXPECTED_BUCKET",
  ];
  for (const n of nomes) {
    const v = process.env[n];
    exigir(v, "CREDENCIAL_RESTRITA_AUSENTE");
    env[n] = v;
  }
  exigir(mestre.size > 0 && mestre.size <= 16 && mestre.has(chaveAtiva), "CHAVEIRO_FRIO_INVALIDO");
  const material = Object.fromEntries(
    [...mestre].map(([id, v]): [string, string] => {
      exigir(/^[A-Za-z0-9._-]{1,64}$/.test(id) && v.byteLength === 32, "CHAVEIRO_FRIO_INVALIDO");
      const b = Buffer.from(v);
      try {
        return [id, b.toString("base64")];
      } finally {
        b.fill(0);
      }
    }),
  );
  env.RECREIO_BACKUP_PROBE_CAPTURE_ID = capturaId;
  env.RECREIO_BACKUP_PROBE_ACTIVE_KEY = chaveAtiva;
  env.RECREIO_BACKUP_PROBE_MASTER_KEYS = JSON.stringify(material);
  env.RECREIO_BACKUP_PROBE_NATIVE_RIGHTS = JSON.stringify(decisao);
  const nome = `recreio-cold-${process.env.GITHUB_RUN_ID}-${randomUUID()}`;
  const encaminhar = [
    "NODE_ENV",
    "CI",
    "GITHUB_ACTIONS",
    "GITHUB_REPOSITORY",
    "GITHUB_RUN_ID",
    "GITHUB_SHA",
    ...nomes,
    "RECREIO_BACKUP_PROBE_CAPTURE_ID",
    "RECREIO_BACKUP_PROBE_ACTIVE_KEY",
    "RECREIO_BACKUP_PROBE_MASTER_KEYS",
    "RECREIO_BACKUP_PROBE_NATIVE_RIGHTS",
  ];
  const argumentos = [
    "run",
    "--rm",
    "--name",
    nome,
    "--label",
    "informach.fixture=recreio-cold",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=512m",
    "--memory",
    "768m",
    "--memory-swap",
    "768m",
    "--cpus",
    "2",
    "--pids-limit",
    "128",
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--cap-add",
    "CHOWN",
    "--cap-add",
    "SETUID",
    "--cap-add",
    "SETGID",
    "--cap-add",
    "DAC_OVERRIDE",
    ...encaminhar.flatMap((n) => ["--env", n]),
    "--entrypoint",
    "node",
    "recreio-backup:ci",
    "--max-old-space-size=256",
    "/opt/recreio/recuperar-captura-prova.cjs",
  ];
  const filho = spawn("docker", argumentos, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let saida = "",
    erro = false,
    excesso = false;
  const fechado = new Promise<number | null>((resolve) => {
    filho.once("error", () => {
      erro = true;
    });
    filho.once("close", resolve);
  });
  filho.stdout.on("data", (b: Buffer) => {
    if (saida.length + b.length > 16_384) {
      excesso = true;
      filho.kill("SIGTERM");
    } else saida += b.toString("utf8");
  });
  filho.stderr.on("data", () => {
    erro = true;
  });
  const prazo = setTimeout(() => {
    erro = true;
    filho.kill("SIGTERM");
  }, 150_000);
  prazo.unref();
  let codigo: number | null = null;
  try {
    codigo = await fechado;
  } finally {
    clearTimeout(prazo);
    delete env.RECREIO_BACKUP_PROBE_MASTER_KEYS;
    delete env.RECREIO_BACKUP_PROBE_NATIVE_RIGHTS;
    for (const n of nomes) delete env[n];
  }
  // SIGTERM no cliente não prova que o container parou; reconciliar o nome
  // exclusivo criado por esta chamada antes de devolver ao chamador.
  if (codigo !== 0 || erro || excesso) {
    async function controle(args: string[]) {
      const p = spawn("docker", args, {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let texto = "",
        falhou = false;
      const fim = new Promise<number | null>((resolve) => {
        p.once("error", () => {
          falhou = true;
        });
        p.once("close", resolve);
      });
      p.stdout.on("data", (b: Buffer) => {
        if (texto.length + b.length > 4096) {
          falhou = true;
          p.kill("SIGKILL");
        } else texto += b.toString("utf8");
      });
      p.stderr.on("data", () => undefined);
      const timer = setTimeout(() => {
        falhou = true;
        p.kill("SIGKILL");
      }, 15_000);
      try {
        return { codigo: await fim, texto, falhou };
      } finally {
        clearTimeout(timer);
      }
    }
    const apagar = await controle(["rm", "--force", nome]);
    if (apagar.codigo !== 0 || apagar.falhou) {
      const conferir = await controle([
        "ps",
        "--all",
        "--format",
        "{{.Names}}",
        "--filter",
        `name=^/${nome}$`,
      ]);
      exigir(
        conferir.codigo === 0 && !conferir.falhou && !conferir.texto.trim(),
        "LIMPEZA_DO_WORKER_FRIO_NAO_CONFIRMADA",
      );
    }
    let diagnostico: unknown;
    try {
      diagnostico = JSON.parse(saida.trim());
    } catch {
      diagnostico = undefined;
    }
    const falha = FalhaDaRecuperacaoSchema.safeParse(diagnostico);
    throw new FalhaDaProva(
      falha.success
        ? `CLUSTER_FRIO_${falha.data.etapa}_${falha.data.codigo}`
        : "CLUSTER_FRIO_NAO_CONFIRMADO",
    );
  }
  const recibo = Recibo.parse(JSON.parse(saida.trim()));
  exigir(
    recibo.source === process.env.GITHUB_SHA &&
      recibo.runId === process.env.GITHUB_RUN_ID &&
      recibo.capturaId === capturaId &&
      recibo.fotosAutenticadas === recibo.vinculosConferidos,
    "RECIBO_FRIO_DIVERGENTE",
  );
  return recibo;
}
