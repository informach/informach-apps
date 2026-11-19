import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { S3Client } from "@aws-sdk/client-s3";
import { expect } from "vitest";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { criarArmazenamentoPrivadoS3 } from "@/features/objetos/s3";

export async function criarBucketS3DeTeste(tempoLimiteMs = 2000, maxAttempts = 1) {
  const objetos = new Map<string, Buffer>();
  const tipos = new Map<string, string>();
  const pedidos: { metodo: string; url: string; condicao?: string; assinado: boolean }[] = [];
  const erros: unknown[] = [],
    timers = new Set<ReturnType<typeof setTimeout>>();
  const estado = {
    perderPut: false,
    perderDelete: false,
    preservarDelete: false,
    silenciar: false,
    corromper: false,
    parcial: false,
    semTamanho: false,
    demorar: false,
    leituraIniciada: false,
    negar: false,
    bucketAusente: false,
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
    if (estado.silenciar) return;
    if (estado.negar) {
      xml(res, 403, "AccessDenied");
      return;
    }
    if (estado.bucketAusente) {
      xml(res, 404, "NoSuchBucket");
      return;
    }
    if (req.method === "PUT") {
      const partes: Buffer[] = [];
      for await (const parte of req) partes.push(Buffer.from(parte));
      if (objetos.has(path) && req.headers["if-none-match"] === "*") {
        xml(res, 412, "PreconditionFailed");
        return;
      }
      objetos.set(path, Buffer.concat(partes));
      tipos.set(path, req.headers["content-type"] ?? "application/octet-stream");
      if (estado.perderPut) {
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { etag: '"fixture"' });
      res.end();
      return;
    }
    if (req.method === "DELETE") {
      if (!estado.preservarDelete) {
        objetos.delete(path);
        tipos.delete(path);
      }
      if (estado.perderDelete) {
        req.socket.destroy();
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "GET") {
      xml(res, 405, "MethodNotAllowed");
      return;
    }
    const consulta = new URL(url, "http://127.0.0.1").searchParams;
    if (consulta.get("list-type") === "2") {
      const prefixo = consulta.get("prefix") ?? "";
      const escapar = (s: string) =>
        s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      const itens = [...objetos]
        .map(([p, b]) => ({ key: p.replace(/^\/recreio-fixture\//, ""), bytes: b.length }))
        .filter((v) => v.key.startsWith(prefixo));
      const max = Number(consulta.get("max-keys") ?? "1000");
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>${itens.length > max}</IsTruncated><KeyCount>${Math.min(itens.length, max)}</KeyCount>${itens
          .slice(0, max)
          .map((v) => `<Contents><Key>${escapar(v.key)}</Key><Size>${v.bytes}</Size></Contents>`)
          .join("")}</ListBucketResult>`,
      );
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
    res.setHeader("content-type", tipos.get(path) ?? "application/octet-stream");
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
  return {
    storage,
    cliente,
    cifrador,
    preparado,
    conteudo,
    objetos,
    tipos,
    path,
    estado,
    pedidos,
    fechar,
  };
}
