import { type ChildProcess, spawn } from "node:child_process";
import { expect } from "@playwright/test";
import { APP, esperarSaida, linhasDeJson, origemDoJogo, saiu } from "./apoio";

/** Ciclo real da instância do contador, compartilhado pelos dois gates de navegador. */
export function servidorDoContador() {
  let filho: ChildProcess | null = null;
  let saida: string[] = [];
  async function noAr() {
    try {
      return (await fetch(`${origemDoJogo("teste").http}/saude`)).ok;
    } catch {
      return false;
    }
  }
  return {
    limparLog() {
      saida = [];
    },
    log: () => saida.join(""),
    registros: (mensagem: string) => linhasDeJson(saida).filter((r) => r.mensagem === mensagem),
    async iniciar() {
      if (filho) throw new Error("Já existe um servidor do contador em execução");
      filho = spawn(process.execPath, ["--import", "tsx", "e2e/servidor/main.ts"], {
        cwd: APP,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
      });
      filho.stdout?.on("data", (parte: Buffer) => saida.push(parte.toString()));
      filho.stderr?.on("data", (parte: Buffer) => saida.push(parte.toString()));
      await expect
        .poll(noAr, { timeout: 60_000, message: "o servidor do contador não subiu" })
        .toBe(true);
    },
    async matar() {
      const atual = filho;
      filho = null;
      if (!atual) return;
      const fim = saiu(atual);
      atual.kill("SIGKILL");
      await fim;
      await expect.poll(noAr, { timeout: 15_000 }).toBe(false);
    },
    async parar() {
      const atual = filho;
      filho = null;
      if (!atual) return;
      if (atual.connected) atual.send("descer");
      await esperarSaida(atual, 15_000);
    },
  };
}
