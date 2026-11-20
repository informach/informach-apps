import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { z } from "zod";
import { APP, esperarSaida, linhasDeJson, origemDoJogo, saiu } from "./apoio";

/** Ciclo real da instância do contador, compartilhado pelos dois gates de navegador. */
export function servidorDoContador() {
  let filho: ChildProcess | null = null;
  let saida: string[] = [];
  let medindo = false;
  async function noAr() {
    try {
      const jogo = process.env.RECREIO_CAPACITY_PROBE === "1" ? "carga-teste" : "teste";
      return (await fetch(`${origemDoJogo(jogo).http}/saude`)).ok;
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
    async medir() {
      if (medindo || !filho?.connected || process.env.RECREIO_CAPACITY_PROBE !== "1")
        throw new Error("Counter metrics require the isolated serialized load probe");
      const atual = filho;
      const id = randomUUID();
      medindo = true;
      const Schema = z.strictObject({
        tipo: z.literal("medida_contador"),
        id: z.uuid(),
        cpu: z.strictObject({
          user: z.number().int().nonnegative(),
          system: z.number().int().nonnegative(),
        }),
        rss: z.number().int().positive(),
        mundos: z.number().int().nonnegative(),
        jogadores: z.number().int().nonnegative(),
      });
      try {
        return await new Promise<z.infer<typeof Schema>>((resolve, reject) => {
          const limpar = () => {
            clearTimeout(timer);
            atual.off("message", receber);
            atual.off("exit", sair);
          };
          const sair = () => {
            limpar();
            reject(new Error("Counter exited before metric receipt"));
          };
          const receber = (mensagem: unknown) => {
            const medida = Schema.safeParse(mensagem);
            if (!medida.success || medida.data.id !== id) return;
            limpar();
            resolve(medida.data);
          };
          const timer = setTimeout(() => {
            limpar();
            reject(new Error("Counter metric timeout"));
          }, 5000);
          atual.on("message", receber);
          atual.once("exit", sair);
          try {
            atual.send({ tipo: "medir", id }, (erro) => {
              if (erro) {
                limpar();
                reject(new Error("Counter metric IPC failed"));
              }
            });
          } catch {
            limpar();
            reject(new Error("Counter metric IPC unavailable"));
          }
        });
      } finally {
        medindo = false;
      }
    },
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
