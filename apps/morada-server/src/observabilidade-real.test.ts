import { createServer, type ServerResponse } from "node:http";
import * as Sentry from "@sentry/node";
import { expect, it } from "vitest";
import { concluirObservabilidade, iniciarObservabilidade, registrarFalha } from "./observabilidade";

/** Transporte HTTP local real do SDK; não usa DSN ou conta de produção. */
async function receptor(bloqueado: boolean) {
  const corpos: string[] = [];
  const pendentes = new Set<ServerResponse>();
  const servidor = createServer((pedido, resposta) => {
    let corpo = "";
    pedido.on("data", (parte: Buffer) => {
      corpo += parte.toString("utf8");
    });
    pedido.on("end", () => {
      corpos.push(corpo);
      if (bloqueado) pendentes.add(resposta);
      else resposta.writeHead(200).end("{}");
    });
  });
  await new Promise<void>((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  const endereco = servidor.address();
  if (!endereco || typeof endereco === "string") throw new Error("Porta HTTP ausente no teste.");
  return {
    dsn: `http://public@127.0.0.1:${endereco.port}/1`,
    corpos,
    async fechar() {
      for (const resposta of pendentes) resposta.writeHead(200).end("{}");
      try {
        await Sentry.close(1000);
      } finally {
        Sentry.setCurrentClient(undefined);
        servidor.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          servidor.close((erro) => (erro ? reject(erro) : resolve())),
        );
      }
    },
  };
}

it("sem cliente configurado, o encerramento não exige envio de telemetria", async () => {
  expect(Sentry.getClient()).toBeUndefined();
  await expect(concluirObservabilidade()).resolves.toBeUndefined();
});

it("conclui o envio pelo SDK real e conserva somente o evento sanitizado", async () => {
  const http = await receptor(false);
  try {
    iniciarObservabilidade(http.dsn, "commit-de-teste", "test");
    registrarFalha(new Error("detalhe reservado pessoa@example.test"), "encerrar");
    await expect(concluirObservabilidade()).resolves.toBeUndefined();
    expect(http.corpos).toHaveLength(1);
    expect(http.corpos[0]).toContain("morada.server_failure");
    expect(http.corpos[0]).not.toContain("detalhe reservado");
    expect(http.corpos[0]).not.toContain("pessoa@example.test");
  } finally {
    await http.fechar();
  }
});

it("timeout real do transporte não é confirmado como flush concluído", async () => {
  const http = await receptor(true);
  try {
    iniciarObservabilidade(http.dsn, "commit-de-teste", "test");
    registrarFalha(new Error("detalhe reservado"), "encerrar");
    await expect.poll(() => http.corpos.length).toBe(1);
    await expect(concluirObservabilidade()).rejects.toThrow("envio da observabilidade");
  } finally {
    await http.fechar();
  }
});
