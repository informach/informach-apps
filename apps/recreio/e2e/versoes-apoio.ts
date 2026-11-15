import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { expect } from "@playwright/test";
import { esperarSaida } from "./apoio";

/** Só processos e artefatos descartáveis produzidos pelo executor de versões. */
export async function iniciarVersao(pasta: string, identificador: string): Promise<ChildProcess> {
  const filho = spawn(process.execPath, [path.join(pasta, "server.js")], {
    cwd: pasta,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: process.env.RECREIO_E2E_PORT ?? "3109",
      NEXT_DEPLOYMENT_ID: identificador,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let saida = "";
  const anotar = (trecho: Buffer) => {
    saida = (saida + trecho.toString()).slice(-12_000);
  };
  filho.stdout?.on("data", anotar);
  filho.stderr?.on("data", anotar);
  let erroDoProcesso: Error | null = null;
  filho.on("error", (erro) => {
    erroDoProcesso = erro;
  });
  try {
    await expect
      .poll(
        async () => {
          if (erroDoProcesso) throw erroDoProcesso;
          if (filho.exitCode !== null) throw new Error(`Portal encerrou no início: ${saida}`);
          try {
            const r = await fetch(
              `http://localhost:${process.env.RECREIO_E2E_PORT ?? "3109"}/api/health`,
              { signal: AbortSignal.timeout(1_000) },
            );
            return r.ok;
          } catch (erro) {
            if (
              erro instanceof TypeError ||
              (erro instanceof Error && erro.name === "TimeoutError")
            )
              return false;
            throw erro;
          }
        },
        { timeout: 30_000, message: "Aguardar o processo do portal" },
      )
      .toBe(true);
    return filho;
  } catch (erro) {
    await pararVersao(filho);
    throw erro;
  }
}

export async function pararVersao(filho: ChildProcess | null): Promise<void> {
  if (!filho || filho.exitCode !== null || filho.signalCode !== null) return;
  filho.kill("SIGTERM");
  if (!(await esperarSaida(filho, 10_000))) {
    filho.kill("SIGKILL");
    await esperarSaida(filho, 5_000);
    throw new Error("O processo do portal não encerrou com SIGTERM");
  }
}
