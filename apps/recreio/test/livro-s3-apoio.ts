import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { S3Client } from "@aws-sdk/client-s3";

/** HTTP fechado: o SDK real serializa If-Match/If-None-Match e lê o stream. */
export async function criarBucketDoLivro(maxAttempts = 1) {
  const objetos = new Map<string, { bytes: Buffer; tipo: string; etag: string }>(),
    pedidos: {
      metodo: string;
      path: string;
      ifMatch: string | undefined;
      ifNone: string | undefined;
    }[] = [],
    falhas: unknown[] = [],
    estado = {
      perderCas: false,
      negar: false,
      bucketAusente: false,
      corromper: false,
      silenciarGet: false,
    };
  function xml(res: ServerResponse, status: number, code: string) {
    res.writeHead(status, { "content-type": "application/xml" });
    res.end(`<Error><Code>${code}</Code><Message>closed ledger fixture</Message></Error>`);
  }
  async function atender(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? "/", "http://localhost").pathname,
      ifMatch = typeof req.headers["if-match"] === "string" ? req.headers["if-match"] : undefined,
      ifNone =
        typeof req.headers["if-none-match"] === "string" ? req.headers["if-none-match"] : undefined;
    pedidos.push({ metodo: req.method ?? "", path, ifMatch, ifNone });
    if (estado.negar) return xml(res, 403, "AccessDenied");
    if (estado.bucketAusente) return xml(res, 404, "NoSuchBucket");
    if (req.method === "PUT") {
      const partes: Buffer[] = [];
      for await (const b of req) partes.push(Buffer.from(b));
      const anterior = objetos.get(path);
      if ((ifNone === "*" && anterior) || (ifMatch && anterior?.etag !== ifMatch))
        return xml(res, 412, "PreconditionFailed");
      const bytes = Buffer.concat(partes),
        etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
      objetos.set(path, { bytes, tipo: req.headers["content-type"] ?? "", etag });
      if (ifMatch && estado.perderCas) {
        estado.perderCas = false;
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { etag });
      res.end();
      return;
    }
    if (req.method === "GET") {
      if (estado.silenciarGet) return;
      const objeto = objetos.get(path);
      if (!objeto) return xml(res, 404, "NoSuchKey");
      const bytes = Buffer.from(objeto.bytes);
      if (estado.corromper) bytes[0] = 0;
      res.writeHead(200, {
        "content-type": objeto.tipo,
        "content-length": bytes.length,
        etag: objeto.etag,
      });
      res.end(bytes);
      return;
    }
    xml(res, 400, "InvalidRequest");
  }
  const servidor = createServer((req, res) => {
    atender(req, res).catch((erro) => {
      falhas.push(erro);
      res.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  const endereco = servidor.address();
  if (!endereco || typeof endereco === "string") throw new Error("ledger fixture address");
  const cliente = new S3Client({
    endpoint: `http://127.0.0.1:${endereco.port}`,
    region: "auto",
    forcePathStyle: true,
    maxAttempts,
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture-not-secret" },
  });
  return {
    cliente,
    objetos,
    pedidos,
    estado,
    async fechar() {
      cliente.destroy();
      await new Promise<void>((resolve, reject) => {
        servidor.close((erro) => (erro ? reject(erro) : resolve()));
        servidor.closeAllConnections();
      });
      if (falhas.length) throw new AggregateError(falhas, "ledger fixture failed");
    },
  };
}
