import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { criarCifradorDeObjetos } from "./criptografia";
import { criarArmazenamentoPrivadoS3 } from "./s3";

async function fixture(tempoLimiteMs = 2000, maxAttempts = 1) {
  const objetos = new Map<string, Buffer>();
  const pedidos: { metodo: string; url: string; condicao?: string; assinado: boolean }[] = [];
  const erros: unknown[] = [],
    timers = new Set<ReturnType<typeof setTimeout>>();
  const estado = {
    perderPut: false,
    corromper: false,
    parcial: false,
    semTamanho: false,
    demorar: false,
    leituraIniciada: false,
  };
  function xml(res: ServerResponse, status: number, code: string) {
    res.writeHead(status, { "content-type": "application/xml" });
    res.end(
      `<Error><Code>${code}</Code><Message>closed test</Message><RequestId>fixture</RequestId></Error>`,
    );
  }
  async function atender(req: IncomingMessage, res: ServerResponse) {
    const url = req.url ?? "/";
    const path = url.split("?")[0] ?? "/";
    pedidos.push({
      metodo: req.method ?? "",
      url,
      condicao: req.headers["if-none-match"],
      assinado: req.headers.authorization?.includes("Credential=fixture-key/") ?? false,
    });
    if (req.method === "PUT") {
      const partes: Buffer[] = [];
      for await (const parte of req) partes.push(Buffer.from(parte));
      if (objetos.has(path) && req.headers["if-none-match"] === "*") {
        xml(res, 412, "PreconditionFailed");
        return;
      }
      objetos.set(path, Buffer.concat(partes));
      if (estado.perderPut) {
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { etag: '"fixture"' });
      res.end();
      return;
    }
    if (req.method !== "GET") {
      xml(res, 405, "MethodNotAllowed");
      return;
    }
    const bytes = objetos.get(path);
    if (!bytes) {
      xml(res, 404, "NoSuchKey");
      return;
    }
    const corpo = Buffer.from(bytes);
    if (estado.corromper) corpo[corpo.length - 1] = (corpo.at(-1) ?? 0) ^ 1;
    res.statusCode = estado.parcial ? 206 : 200;
    res.setHeader("content-type", "application/octet-stream");
    if (!estado.semTamanho) res.setHeader("content-length", corpo.length);
    estado.leituraIniciada = true;
    if (estado.demorar) {
      res.flushHeaders();
      res.write(corpo.subarray(0, 1));
      const timer = setTimeout(() => {
        timers.delete(timer);
        res.end(corpo.subarray(1));
      }, 5000);
      timers.add(timer);
      return;
    }
    if (estado.semTamanho) {
      res.write(corpo);
      res.end();
    } else res.end(corpo);
  }
  const server = createServer((req, res) => {
    void atender(req, res).catch((erro: unknown) => {
      erros.push(erro);
      res.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Closed endpoint absent");
  const cliente = new S3Client({
    endpoint: `http://127.0.0.1:${address.port}`,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: "fixture-key", secretAccessKey: "fixture-secret-never-real" },
    maxAttempts,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const cifrador = criarCifradorDeObjetos({
    chaveAtiva: "fixture",
    chaves: new Map([["fixture", randomBytes(32)]]),
    limiteBytes: 4096,
  });
  const storage = criarArmazenamentoPrivadoS3({
    cliente,
    bucket: "recreio-fixture",
    cifrador,
    tempoLimiteMs,
  });
  const conteudo = Buffer.from("PRIVADO-NAO-PUBLICAR-EM-LOG");
  const preparado = cifrador.cifrar({ tipo: "exportacao", id: randomUUID() }, conteudo);
  const path = `/recreio-fixture/recreio/v1/exportacao/${preparado.referencia.contexto.id}/${preparado.referencia.sha256Cifrado}`;
  async function fechar() {
    for (const timer of timers) clearTimeout(timer);
    cliente.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((erro) => (erro ? reject(erro) : resolve())),
    );
    expect(erros).toEqual([]);
  }
  return { storage, preparado, conteudo, objetos, path, estado, pedidos, fechar };
}

describe("objetos privados pelo SDK S3 real em HTTP fechado", () => {
  it("confirma escrita somente após reabrir, sem texto aberto na rede; replay 412 relê o mesmo objeto", async () => {
    const f = await fixture();
    try {
      expect(await f.storage.enviar(f.preparado)).toEqual(f.preparado.referencia);
      expect(f.objetos.size).toBe(1);
      expect(f.objetos.get(f.path)).toEqual(f.preparado.bytes);
      expect(f.objetos.get(f.path)?.includes(f.conteudo)).toBe(false);
      expect(await f.storage.enviar(f.preparado)).toEqual(f.preparado.referencia);
      expect(await f.storage.recuperar(f.preparado.referencia)).toEqual(f.conteudo);
      expect(f.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET", "PUT", "GET", "GET"]);
      expect(f.pedidos.every((p) => p.assinado)).toBe(true);
      expect(f.pedidos.filter((p) => p.metodo === "PUT").every((p) => p.condicao === "*")).toBe(
        true,
      );
    } finally {
      await f.fechar();
    }
  });
  it("resposta perdida permanece inconclusiva, não repete PUT e permite recuperação íntegra do recibo", async () => {
    const f = await fixture();
    try {
      f.estado.perderPut = true;
      await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({ codigo: "INCONCLUSIVO" });
      expect(f.pedidos.filter((p) => p.metodo === "PUT")).toHaveLength(1);
      expect(await f.storage.recuperar(f.preparado.referencia)).toEqual(f.conteudo);
    } finally {
      await f.fechar();
    }
  });
  it.each(["corromper", "parcial", "semTamanho"] as const)(
    "recusa leitura %s, inclusive depois de PUT confirmado",
    async (caso) => {
      const f = await fixture();
      try {
        f.estado[caso] = true;
        await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        expect(f.objetos.size).toBe(1);
      } finally {
        await f.fechar();
      }
    },
  );
  it("não considera 412 confirmação de um objeto corrompido", async () => {
    const f = await fixture();
    try {
      f.objetos.set(f.path, Buffer.alloc(f.preparado.bytes.length));
      await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(f.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
    } finally {
      await f.fechar();
    }
  });
  it("ausência não cria outro objeto; referência não admite chave ou URL fornecida pelo cliente", async () => {
    const f = await fixture();
    try {
      await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
        codigo: "NAO_ENCONTRADO",
      });
      await expect(
        f.storage.recuperar({
          ...f.preparado.referencia,
          key: "outro",
          url: "https://example.test",
        }),
      ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(f.pedidos).toHaveLength(1);
      expect(f.objetos.size).toBe(0);
    } finally {
      await f.fechar();
    }
  });
  it("envelope alterado antes de enviar não sai para a rede", async () => {
    const f = await fixture();
    try {
      f.preparado.bytes[f.preparado.bytes.length - 1] = 0;
      // Alteração garantida, independente do valor aleatório da tag.
      f.preparado.bytes[0] = 0;
      await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(f.pedidos).toEqual([]);
    } finally {
      await f.fechar();
    }
  });
  it("recusa cliente com repetição automática habilitada", async () => {
    const f = await fixture(2000, 2);
    try {
      await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      expect(f.pedidos).toEqual([]);
    } finally {
      await f.fechar();
    }
  });
  it("o prazo inclui corpo iniciado que parou de chegar e encerra o socket", async () => {
    const f = await fixture(500);
    try {
      f.objetos.set(f.path, f.preparado.bytes);
      f.estado.demorar = true;
      await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
        codigo: "INCONCLUSIVO",
      });
      expect(f.estado.leituraIniciada).toBe(true);
      expect(f.pedidos).toHaveLength(1);
    } finally {
      await f.fechar();
    }
  });
});
