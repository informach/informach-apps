import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import type { CapturaAberta } from "../../src/features/backup/captura-repository";

export class FalhaDoDump extends Error {
  constructor(
    readonly codigo: "CONFIGURACAO" | "FERRAMENTA" | "LIMITE" | "INTERROMPIDO" | "INTEGRIDADE",
  ) {
    super(`recreio.backup_dump.${codigo}`);
  }
}
function exigir(sim: unknown, codigo: FalhaDoDump["codigo"]): asserts sim {
  if (!sim) throw new FalhaDoDump(codigo);
}

/** Configuração privada já autorizada pelo executor. Não autoriza origem,
 * restauração, upload ou release de reservas. O chamador mantém a captura
 * aberta até o retorno e conserva a posse do FileHandle vazio e privado. */
export function criarGravadorDeDump(config: {
  conexao: string;
  limiteBytes: number;
  tempoLimiteMs: number;
}) {
  const { limiteBytes, tempoLimiteMs } = config;
  exigir(process.platform === "linux", "CONFIGURACAO");
  exigir(
    Number.isSafeInteger(limiteBytes) && limiteBytes >= 5 && limiteBytes <= 64 * 1024 ** 3,
    "CONFIGURACAO",
  );
  exigir(
    Number.isSafeInteger(tempoLimiteMs) && tempoLimiteMs > 0 && tempoLimiteMs <= 900_000,
    "CONFIGURACAO",
  );
  let url: URL;
  try {
    url = new URL(config.conexao);
  } catch {
    throw new FalhaDoDump("CONFIGURACAO");
  }
  exigir(
    ["postgres:", "postgresql:"].includes(url.protocol) &&
      url.username &&
      url.password &&
      url.pathname.length > 1 &&
      !url.hash,
    "CONFIGURACAO",
  );
  exigir(
    [...url.searchParams.keys()].every((k) => k === "sslmode"),
    "CONFIGURACAO",
  );
  const ssl = url.searchParams.get("sslmode");
  exigir(ssl === "require" || ssl === "disable", "CONFIGURACAO");
  const ambiente: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    PATH: process.env.PATH,
    LANG: "C",
    TZ: "UTC",
    PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: ssl,
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "recreio-backup-dump",
    PGPASSFILE: "/dev/null",
    PGSERVICEFILE: "/dev/null",
    PGOPTIONS: "-c default_transaction_read_only=on -c lock_timeout=5000",
  };
  exigir(
    Object.values(ambiente).every((v) => v === undefined || !v.includes("\0")),
    "CONFIGURACAO",
  );

  async function gravar(captura: Pick<CapturaAberta, "snapshot" | "signal">, destino: FileHandle) {
    exigir(/^[a-fA-F0-9]{8}-[a-fA-F0-9]{8}-[1-9][0-9]*$/.test(captura.snapshot), "CONFIGURACAO");
    const s = await destino.stat({ bigint: true });
    exigir(
      s.isFile() && s.nlink === 1n && s.size === 0n && (s.mode & 0o077n) === 0n,
      "CONFIGURACAO",
    );
    exigir(!captura.signal.aborted, "INTERROMPIDO");
    const filho = spawn(
      "pg_dump",
      ["--no-password", "--format=custom", `--snapshot=${captura.snapshot}`],
      {
        env: ambiente,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let falhou = false,
      aviso = false,
      interrompido = false;
    const encerrado = new Promise<number | null>((resolve) => {
      filho.once("error", () => {
        falhou = true;
      });
      filho.once("close", resolve);
    });
    filho.stderr.on("data", () => {
      aviso = true;
    }); // Nunca armazenar/imprimir stderr privado.
    const cancelar = () => {
      interrompido = true;
      filho.kill("SIGKILL");
    };
    captura.signal.addEventListener("abort", cancelar, { once: true });
    const timer = setTimeout(cancelar, tempoLimiteMs);
    timer.unref();
    if (captura.signal.aborted) cancelar();
    let erro: unknown;
    const hash = createHash("sha256"),
      prefixo = Buffer.alloc(5);
    let bytes = 0;
    try {
      for await (const parte of filho.stdout) {
        exigir(!interrompido, "INTERROMPIDO");
        exigir(parte instanceof Uint8Array, "INTEGRIDADE");
        exigir(bytes + parte.byteLength <= limiteBytes, "LIMITE");
        if (bytes < 5) prefixo.set(parte.subarray(0, 5 - bytes), bytes);
        let pos = 0;
        while (pos < parte.byteLength) {
          exigir(!interrompido, "INTERROMPIDO");
          const r = await destino.write(parte, pos, parte.byteLength - pos, bytes + pos);
          exigir(r.bytesWritten > 0, "INTEGRIDADE");
          pos += r.bytesWritten;
        }
        hash.update(parte);
        bytes += parte.byteLength;
      }
    } catch (e) {
      erro = e;
      filho.kill("SIGKILL");
    }
    const codigo = await encerrado;
    try {
      exigir(!interrompido && !captura.signal.aborted, "INTERROMPIDO");
      if (erro) throw erro instanceof FalhaDoDump ? erro : new FalhaDoDump("FERRAMENTA");
      exigir(!falhou && codigo === 0 && !aviso, "FERRAMENTA");
      exigir(bytes >= 5 && prefixo.toString("ascii") === "PGDMP", "INTEGRIDADE");
      await destino.sync();
      exigir(!captura.signal.aborted, "INTERROMPIDO");
      const final = await destino.stat({ bigint: true });
      exigir(!interrompido && !captura.signal.aborted, "INTERROMPIDO");
      exigir(
        final.dev === s.dev &&
          final.ino === s.ino &&
          final.nlink === 1n &&
          final.size === BigInt(bytes),
        "INTEGRIDADE",
      );
      return { bytes, sha256: hash.digest("hex") };
    } catch (e) {
      try {
        await destino.truncate(0);
        await destino.sync();
      } catch {
        throw new AggregateError([e, new FalhaDoDump("INTEGRIDADE")], "backup_dump.cleanup_failed");
      }
      throw e;
    } finally {
      clearTimeout(timer);
      captura.signal.removeEventListener("abort", cancelar);
      prefixo.fill(0);
    }
  }
  return Object.freeze({ gravar });
}
