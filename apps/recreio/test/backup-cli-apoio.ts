import { type ExecFileOptionsWithStringEncoding, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);
/** A real isolated image, not a mock of the worker. Values are inherited via
 * --env NAME, never command arguments or diagnostic output. */
export async function executarImagemDeBackup(env: Record<string, string>) {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.CI !== "true" ||
    process.env.RECREIO_BACKUP_OPERATIONAL_PROBE !== "1" ||
    process.env.RECREIO_BACKUP_OPERATIONAL_DOCKER_IMAGE !== "recreio-backup-operacional:ci" ||
    Object.keys(env).some((k) => !/^[A-Z][A-Z0-9_]*$/.test(k))
  )
    throw new Error("BACKUP_CLI_PROOF_BOUNDARY");
  const name = `recreio-backup-cli-${randomBytes(12).toString("hex")}`;
  const label = "recreio-backup-cli",
    path = process.env.PATH;
  const ambienteDocker: NodeJS.ProcessEnv = { PATH: path, NODE_ENV: "production" };
  const args = [
    "run",
    "--rm",
    "--name",
    name,
    "--label",
    `informach.fixture=${label}`,
    "--network",
    "host",
    "--memory",
    "1g",
    "--memory-swap",
    "1g",
    "--cpus",
    "2",
    "--pids-limit",
    "128",
    ...Object.keys(env).flatMap((key) => ["--env", key]),
    "recreio-backup-operacional:ci",
  ];
  let resultado: { ok: true; rows: unknown[] } | { ok: false; error: unknown };
  try {
    const saida = await new Promise<{
      code: number | null;
      stdout: Buffer;
      stderr: Buffer;
      timeout: boolean;
      overflow: boolean;
    }>((resolve, reject) => {
      const child = spawn("docker", args, {
        env: { ...env, ...ambienteDocker },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const stdout: Buffer[] = [],
        stderr: Buffer[] = [];
      let bytes = 0,
        timeout = false;
      const timer = setTimeout(() => {
        timeout = true;
        child.kill("SIGTERM");
      }, 180000);
      const receber = (destino: Buffer[]) => (b: Buffer) => {
        bytes += b.length;
        if (bytes > 1024 * 1024) {
          child.kill("SIGTERM");
          return;
        }
        destino.push(b);
      };
      child.stdout.on("data", receber(stdout));
      child.stderr.on("data", receber(stderr));
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        resolve({
          code,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          timeout,
          overflow: bytes > 1024 * 1024,
        });
      });
    });
    if (saida.timeout || saida.overflow || saida.code !== 0) {
      let phase = "unknown";
      for (const line of `${saida.stdout.toString("utf8")}\n${saida.stderr.toString("utf8")}`.split(
        "\n",
      )) {
        try {
          const r = JSON.parse(line);
          if (
            r?.ok === false &&
            [
              "configuracao",
              "schema",
              "recursos",
              "fila",
              "captura",
              "arquivo",
              "restauracao",
              "encerramento",
            ].includes(r.fase)
          )
            phase = r.fase;
        } catch {}
      }
      throw new Error(`BACKUP_CLI_PROCESS_FAILED_${phase}`);
    }
    // Both entry points promise JSONL; a raw notice/error is not ignored.
    const rows = `${saida.stdout.toString("utf8")}\n${saida.stderr.toString("utf8")}`
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    resultado = { ok: true, rows };
  } catch (error) {
    resultado = { ok: false, error };
  }
  // Inspect by exact name before removing only our own labelled container.
  const options: ExecFileOptionsWithStringEncoding = {
    env: ambienteDocker,
    timeout: 15000,
    maxBuffer: 65536,
    encoding: "utf8",
  };
  const listar = () =>
    exec(
      "docker",
      [
        "container",
        "ls",
        "--all",
        "--filter",
        `name=^/${name}$`,
        "--format",
        '{{.ID}}\t{{.Label "informach.fixture"}}',
      ],
      options,
    );
  const found = (await listar()).stdout.trim();
  if (found) {
    const [id, owner] = found.split("\t");
    if (!id || !/^[a-f0-9]{12,64}$/.test(id) || owner !== label)
      throw new Error("BACKUP_CLI_CONTAINER_NOT_OWNED");
    await exec("docker", ["rm", "--force", "--volumes", id], options);
    if ((await listar()).stdout.trim())
      throw new Error("BACKUP_CLI_CONTAINER_CLEANUP_NOT_CONFIRMED");
  }
  if (!resultado.ok) throw resultado.error;
  return resultado.rows;
}
