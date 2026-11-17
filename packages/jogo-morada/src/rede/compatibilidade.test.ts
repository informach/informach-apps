import { type ChildProcess, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FECHAMENTO } from "@informach/morada-sim/protocolo";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Conexao } from "./conexao";

const ProntoSchema = z.strictObject({
  t: z.literal("pronto"),
  endereco: z.url(),
  mundoId: z.string(),
  sessao: z.string(),
  protocolo: z.union([z.literal(1), z.literal(2)]),
});
const MedidasSchema = z.strictObject({
  t: z.literal("medidas"),
  mundos: z.number().int().nonnegative(),
});
const processos: ChildProcess[] = [];
const conexoes: Conexao[] = [];
const soquetes: WebSocket[] = [];
const evidencias: { caso: string; protocolo: number; fotografias: number; passou: true }[] = [];
const atual = fileURLToPath(new URL("../../../..", import.meta.url));

async function subir(pasta: string) {
  const filho = spawn(
    process.execPath,
    ["--import", "tsx", join(pasta, "apps/morada-server/test/compatibilidade-executor.ts")],
    {
      cwd: pasta,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    },
  );
  processos.push(filho);
  let pronto: z.infer<typeof ProntoSchema> | null = null;
  let mundos: number | null = null;
  let erro: Error | null = null;
  let stderr = "";
  filho.stderr?.on("data", (trecho: Buffer) => {
    stderr = (stderr + trecho.toString()).slice(-4000);
  });
  filho.on("error", (e) => {
    erro = e;
  });
  filho.on("message", (mensagem: unknown) => {
    const inicio = ProntoSchema.safeParse(mensagem);
    if (inicio.success) pronto = inicio.data;
    const medida = MedidasSchema.safeParse(mensagem);
    if (medida.success) mundos = medida.data.mundos;
  });
  await vi.waitFor(
    () => {
      if (erro) throw erro;
      if (filho.exitCode !== null) throw new Error(`Host terminou durante o início: ${stderr}`);
      expect(pronto).not.toBeNull();
    },
    { timeout: 10_000 },
  );
  const alvo = ProntoSchema.parse(pronto);
  return {
    ...alvo,
    medir: async () => {
      mundos = null;
      filho.send("medir");
      await vi.waitFor(() => expect(mundos).not.toBeNull());
      return mundos;
    },
  };
}

afterEach(async () => {
  for (const conexao of conexoes.splice(0)) conexao.largar();
  for (const ws of soquetes.splice(0)) ws.close();
  for (const filho of processos.splice(0)) {
    if (filho.exitCode !== null || filho.signalCode !== null) continue;
    filho.kill("SIGTERM");
    try {
      await vi.waitFor(() => expect(filho.exitCode).toBe(0), { timeout: 5000 });
    } catch (erro) {
      filho.kill("SIGKILL");
      throw erro;
    }
  }
  if (process.env.MORADA_COMPATIBILIDADE_RELATORIO) {
    await writeFile(
      process.env.MORADA_COMPATIBILIDADE_RELATORIO,
      `${JSON.stringify(
        {
          hostAnterior: process.env.MORADA_HOST_ANTERIOR_SHA,
          casos: evidencias,
          escopo:
            "Conexao e servidor reais em processos/soquetes reais; plataforma e identidades sintéticas; sem arte licenciada",
        },
        null,
        2,
      )}\n`,
    );
  }
});

describe.skipIf(!process.env.MORADA_HOST_ANTERIOR_DIR)("versões reais do host", () => {
  it.each(["anterior", "atual"] as const)(
    "cliente novo entra e sai no host %s",
    async (versao) => {
      const pasta =
        versao === "atual" ? atual : resolve(process.env.MORADA_HOST_ANTERIOR_DIR ?? "");
      const host = await subir(pasta);
      expect(host.protocolo).toBe(versao === "anterior" ? 1 : 2);
      let fotografias = 0;
      let protocolo = 0;
      let temLoja = false;
      let aberturas = 0;
      const conexao = new Conexao({
        fonte: {
          token: () => host.sessao,
          abrir: async () => {
            aberturas++;
            return host;
          },
        },
        ouvintes: {
          estado: () => {},
          bemVindo: (mensagem) => {
            protocolo = mensagem.v;
          },
          fotografia: ({ visao }) => {
            fotografias++;
            temLoja = Object.hasOwn(visao, "loja");
          },
          passo: () => {},
          resultado: () => {},
          pulso: () => {},
        },
      });
      conexoes.push(conexao);
      conexao.iniciar();
      await vi.waitFor(() => expect(conexao.estado.fase).toBe("pronto"), { timeout: 10_000 });
      expect(protocolo).toBe(host.protocolo);
      expect(fotografias).toBe(1);
      expect(aberturas).toBe(1);
      expect(temLoja).toBe(versao === "atual");
      expect(await conexao.sair()).toBe(true);
      expect(conexao.estado).toEqual({ fase: "encerrado", motivo: "saiu" });
      evidencias.push({
        caso: `cliente novo/host ${versao}`,
        protocolo,
        fotografias,
        passou: true,
      });
    },
    20_000,
  );

  it("entrada da aba antiga no host novo recebe atualização antes de qualquer fotografia ou ator", async () => {
    const host = await subir(atual);
    const ws = new WebSocket(host.endereco, "morada.v1.json");
    soquetes.push(ws);
    const quadros: unknown[] = [];
    let fechamento: number | null = null;
    ws.onopen = () =>
      ws.send(JSON.stringify({ t: "entrar", v: 1, sessao: host.sessao, mundoId: host.mundoId }));
    ws.onmessage = (evento) => quadros.push(evento.data);
    ws.onclose = (evento) => {
      fechamento = evento.code;
    };
    await vi.waitFor(() => expect(fechamento).toBe(FECHAMENTO.protocolo), { timeout: 10_000 });
    expect(quadros).toEqual([]);
    expect(await host.medir()).toBe(0);
    evidencias.push({
      caso: "aba antiga/host novo recusada antes da admissão",
      protocolo: 1,
      fotografias: 0,
      passou: true,
    });
  }, 20_000);
});
