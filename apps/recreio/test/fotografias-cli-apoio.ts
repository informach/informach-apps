import { type ExecFileOptionsWithStringEncoding, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Actual isolated image. Only names enter Docker argv; values stay in its
 * process environment. Cleanup addresses only this generated container. */
export async function executarImagemDeFotografias(
  env: Record<string, string>,
  expectedExit: 0 | 1 = 0,
): Promise<unknown> {
  if (
    process.platform !== "linux" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REPOSITORY !== "informach/informach-apps" ||
    process.env.RECREIO_OBJECTS_MIGRATION_OPERATIONAL_PROBE !== "1" ||
    [
      process.env.RAILWAY_PROJECT_ID,
      process.env.RAILWAY_ENVIRONMENT_ID,
      process.env.RAILWAY_SERVICE_ID,
    ].some((v) => v !== undefined) ||
    env.RECREIO_OBJECTS_SCOPE !== "qualification" ||
    env.RECREIO_OBJECTS_BUCKET !== "recreio-homologacao-c0xyqx" ||
    Object.keys(env).some(
      (k) =>
        !["CI", "GITHUB_ACTIONS", "GITHUB_REPOSITORY", "DATABASE_URL"].includes(k) &&
        !/^RECREIO_OBJECTS_(?:MODE|SCOPE|BUCKET_ID|BUCKET|ENDPOINT|REGION|PATH_STYLE|ACCESS_KEY|SECRET_KEY|ACTIVE_KEY|KEYS|MIGRATION_MODE|MIGRATION_BACKUP_ID|MIGRATION_READER_SOURCE|MIGRATION_READER_ORIGIN|MIGRATION_BATCH|MIGRATION_TIMEOUT_SECONDS)$/.test(
          k,
        ),
    )
  )
    throw new Error("SNAPSHOT_IMAGE_PROOF_BOUNDARY");
  const nome = `recreio-fotografias-prova-${randomUUID()}`;
  const opcoes: ExecFileOptionsWithStringEncoding = {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env, NODE_ENV: "production" },
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 16384,
    windowsHide: true,
    killSignal: "SIGKILL",
  };
  let resultado: { stdout: string; stderr: string } | undefined,
    falhou = false;
  try {
    try {
      const r = await exec(
        "docker",
        [
          "run",
          "--rm",
          "--name",
          nome,
          "--label",
          "informach.fixture=snapshot-migration",
          "--network",
          "host",
          "--memory",
          "512m",
          "--memory-swap",
          "512m",
          "--cpus",
          "1",
          "--pids-limit",
          "128",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          ...[...Object.keys(env), "NODE_ENV"].flatMap((k) => ["--env", k]),
          "recreio-fotografias:qualification",
        ],
        opcoes,
      );
      if (expectedExit !== 0) throw new Error("Unexpected image success");
      resultado = { stdout: r.stdout, stderr: r.stderr };
    } catch (e) {
      if (
        expectedExit === 1 &&
        e &&
        typeof e === "object" &&
        "code" in e &&
        e.code === 1 &&
        "stdout" in e &&
        typeof e.stdout === "string" &&
        "stderr" in e &&
        typeof e.stderr === "string"
      )
        resultado = { stdout: e.stdout, stderr: e.stderr };
      else falhou = true;
    }
  } finally {
    try {
      await exec("docker", ["rm", "--force", nome], { ...opcoes, timeout: 10000 });
    } catch {
      /* Already removed by --rm is legitimate; verify absence below. */
    }
    try {
      const r = await exec(
        "docker",
        ["ps", "--all", "--filter", `name=^/${nome}$`, "--format", "{{.Names}}"],
        { ...opcoes, timeout: 10000 },
      );
      if (r.stdout.trim()) falhou = true;
    } catch {
      falhou = true;
    }
  }
  if (falhou || !resultado) throw new Error("SNAPSHOT_IMAGE_EXECUTION_FAILED");
  if (expectedExit === 1) {
    if (resultado.stdout.trim()) throw new Error("SNAPSHOT_IMAGE_FAILURE_PROTOCOL");
    try {
      const r = JSON.parse(resultado.stderr);
      if (
        JSON.stringify(r) !==
        JSON.stringify({
          formato: "recreio-migracao-fotografias-v1",
          erro: "MIGRACAO_FOTOGRAFIAS_FALHOU",
        })
      )
        throw new Error();
    } catch {
      throw new Error("SNAPSHOT_IMAGE_FAILURE_PROTOCOL");
    }
    return null;
  }
  if (resultado.stderr.trim()) throw new Error("SNAPSHOT_IMAGE_STDERR");
  try {
    return JSON.parse(resultado.stdout);
  } catch {
    throw new Error("SNAPSHOT_IMAGE_SUCCESS_PROTOCOL");
  }
}
