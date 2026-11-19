import { spawn } from "node:child_process";
import { type FileHandle, mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { limparDiretorioDeProva } from "../scripts/backup/provas-arquivos";

export function conexao() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.CI !== "true" ||
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("Dump qualification requires disposable GitHub database");
  url.searchParams.set("sslmode", "disable");
  return url;
}
export async function temporarios<T>(
  fn: (arquivo: (nome: string) => Promise<FileHandle>) => Promise<T>,
) {
  const root = await mkdtemp(join(tmpdir(), "recreio-dump-prova-")),
    handles: FileHandle[] = [];
  try {
    return await fn(async (nome) => {
      if (!/^[a-z-]+\.bin$/.test(nome)) throw new Error("Invalid fixture file");
      const h = await open(join(root, nome), "wx+", 0o600);
      handles.push(h);
      return h;
    });
  } finally {
    await limparDiretorioDeProva(root, handles, "recreio-dump-prova-");
  }
}
/** Só restaura neste teste, em nome aleatório previamente criado. Stderr nunca
 * é exibido; o processo fecha antes da remoção do destino. */
export async function restaurar(url: URL, entrada: FileHandle) {
  const filho = spawn(
    "pg_restore",
    ["--no-password", "--exit-on-error", "--dbname", url.pathname.slice(1)],
    {
      env: {
        NODE_ENV: "production",
        PATH: process.env.PATH,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: "disable",
        PGCONNECT_TIMEOUT: "15",
        PGPASSFILE: "/dev/null",
        PGSERVICEFILE: "/dev/null",
        LANG: "C",
        TZ: "UTC",
      },
      stdio: [entrada.fd, "ignore", "pipe"],
    },
  );
  let erro = false;
  const fechado = new Promise<number | null>((resolve) => {
    filho.once("error", () => {
      erro = true;
    });
    filho.once("close", resolve);
  });
  const avisos = filho.stderr;
  if (!avisos) {
    filho.kill("SIGKILL");
    await fechado;
    throw new Error("Native fixture stderr unavailable");
  }
  avisos.on("data", () => {
    erro = true;
  });
  const timer = setTimeout(() => filho.kill("SIGKILL"), 60_000);
  try {
    if ((await fechado) !== 0 || erro) throw new Error("Native fixture restore failed");
  } finally {
    clearTimeout(timer);
  }
}
