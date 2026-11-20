/** GitHub-only synthetic custody. No deployment, production DB or provider
 * financial credentials. Private composition/manifest never become artifacts. */
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { criarArmazenamentoDoLivro } from "../src/features/direitos/livro/armazenamento";
import {
  criarAssinaturaDoLivro,
  resumoDoRegistro,
} from "../src/features/direitos/livro/assinatura";
import { RAIZ_VAZIA } from "../src/features/direitos/livro/contrato";
import { conferirPrefixoDoLivro } from "../src/features/direitos/livro/leitura";
import { configuracaoDosDireitosDoProcesso } from "../src/lib/rights-environment";

class Falha extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}
function exigir(ok: unknown, codigo: string): asserts ok {
  if (!ok) throw new Falha(codigo);
}
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const Keyring = z
  .array(z.tuple([z.literal("e2e-closure"), z.string().regex(/^[A-Za-z0-9+/]{43}=$/)]))
  .length(1);
const Manifesto = z
  .array(
    z.strictObject({
      key: z.string().min(1).max(256),
      bytes: z
        .int()
        .positive()
        .max(4 * 1024 * 1024),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .max(100);
const Privado = z.strictObject({
  formato: z.literal("recreio-encerramento-prova-privada-v1"),
  source: z.string().regex(/^[a-f0-9]{40}$/),
  runId: z.string().regex(/^\d+$/),
  attempt: z.string().regex(/^\d+$/),
  livroId: z.uuid(),
  keyring: Keyring,
  manifesto: Manifesto.nullable(),
  prefixoVerificado: z.boolean(),
});
type Estado = z.infer<typeof Privado>;
const prazoFinal = Date.now() + 90_000;
const prazo = () => {
  const restante = prazoFinal - Date.now();
  exigir(restante > 0, "PRAZO_ESGOTADO");
  return { abortSignal: AbortSignal.timeout(Math.min(10_000, restante)) };
};
function fronteira() {
  exigir(
    process.platform === "linux" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      !process.env.RAILWAY_ENVIRONMENT_ID &&
      /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
      /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") &&
      /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") &&
      process.env.RUNNER_TEMP,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  exigir(
    process.env.RECREIO_S3_EXPECTED_BUCKET === "recreio-homologacao-c0xyqx" &&
      process.env.RECREIO_S3_TEST_BUCKET === process.env.RECREIO_S3_EXPECTED_BUCKET &&
      process.env.RECREIO_S3_TEST_ENDPOINT === "https://t3.storageapi.dev" &&
      process.env.RECREIO_S3_TEST_REGION === "auto" &&
      ["true", "false"].includes(process.env.RECREIO_S3_TEST_PATH_STYLE ?? "") &&
      process.env.RECREIO_S3_TEST_ACCESS_KEY &&
      process.env.RECREIO_S3_TEST_SECRET_KEY,
    "CUSTODIA_FORA_DO_ESCOPO",
  );
  const raiz = resolve(process.env.RUNNER_TEMP),
    sufixo = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  return {
    privado: resolve(raiz, `recreio-encerramento-${sufixo}.private.json`),
    publico: resolve(raiz, "recreio-encerramento-prova.json"),
    ui: resolve(raiz, `recreio-encerramento-ui-${sufixo}.json`),
  };
}
function configurar(estado: Estado) {
  exigir(
    estado.source === process.env.GITHUB_SHA &&
      estado.runId === process.env.GITHUB_RUN_ID &&
      estado.attempt === process.env.GITHUB_RUN_ATTEMPT,
    "ORIGEM_PRIVADA_DIVERGENTE",
  );
  const config = configuracaoDosDireitosDoProcesso({
    RECREIO_RIGHTS_MODE: "process",
    RECREIO_RIGHTS_SCOPE: "qualification",
    RECREIO_RIGHTS_LEDGER_ID: estado.livroId,
    RECREIO_RIGHTS_BUCKET: process.env.RECREIO_S3_TEST_BUCKET,
    RECREIO_RIGHTS_ENDPOINT: process.env.RECREIO_S3_TEST_ENDPOINT,
    RECREIO_RIGHTS_REGION: "auto",
    RECREIO_RIGHTS_PATH_STYLE: process.env.RECREIO_S3_TEST_PATH_STYLE === "true" ? "1" : "0",
    RECREIO_RIGHTS_ACCESS_KEY: process.env.RECREIO_S3_TEST_ACCESS_KEY,
    RECREIO_RIGHTS_SECRET_KEY: process.env.RECREIO_S3_TEST_SECRET_KEY,
    RECREIO_RIGHTS_ACTIVE_KEY: "e2e-closure",
    RECREIO_RIGHTS_KEYRING: JSON.stringify(estado.keyring),
    RECREIO_RIGHTS_POLICY: "retirar-textos-fundacao-v1",
  });
  exigir(config, "CUSTODIA_AUSENTE");
  const cliente = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.pathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const assinatura = criarAssinaturaDoLivro(config);
  for (const key of config.chaves.values()) key.fill(0);
  const storage = criarArmazenamentoDoLivro({
    cliente,
    bucket: config.bucket,
    assinatura,
    tempoLimiteMs: 10_000,
  });
  return { cliente, assinatura, storage, bucket: config.bucket };
}
async function escreverPrivado(path: string, estado: Estado, inicial = false) {
  const bytes = Buffer.from(`${JSON.stringify(estado)}\n`),
    destino = inicial ? path : `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(destino, bytes, { flag: "wx", mode: 0o600 });
    if (!inicial) await rename(destino, path);
  } finally {
    bytes.fill(0);
  }
}
function ausente(error: unknown) {
  return (
    error instanceof S3ServiceException &&
    error.name === "NoSuchKey" &&
    error.$metadata.httpStatusCode === 404
  );
}
async function lerObjeto(cliente: S3Client, bucket: string, key: string) {
  let body: Readable | undefined;
  const partes: Buffer[] = [];
  try {
    const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: key }), prazo());
    exigir(
      r.Body instanceof Readable &&
        r.ContentLength &&
        r.ContentLength > 0 &&
        r.ContentLength <= 4 * 1024 * 1024,
      "OBJETO_FORA_DO_LIMITE",
    );
    body = r.Body;
    let total = 0;
    for await (const parte of body) {
      exigir(parte instanceof Uint8Array, "CORPO_INCONSISTENTE");
      total += parte.byteLength;
      exigir(total <= 4 * 1024 * 1024, "OBJETO_FORA_DO_LIMITE");
      partes.push(Buffer.from(parte));
    }
    exigir(total === r.ContentLength && total > 0, "CORPO_INCONSISTENTE");
    return Buffer.concat(partes);
  } catch (error) {
    if (ausente(error)) return null;
    throw error;
  } finally {
    body?.destroy();
    for (const p of partes) p.fill(0);
  }
}
async function jornadaConfirmada(path: string, estado: Estado) {
  try {
    const b = await readFile(path);
    exigir(b.length <= 4096, "RECIBO_UI_FORA_DO_LIMITE");
    const r: unknown = JSON.parse(b.toString("utf8"));
    const schema = z.strictObject({
      formato: z.literal("recreio-encerramento-ui-v2"),
      source: z.literal(estado.source),
      runId: z.literal(estado.runId),
      livroId: z.literal(estado.livroId),
      semJogador: z.literal(true),
      perfilProprio: z.literal(true),
      outraContaPreservada: z.literal(true),
      copiaAposEncerramento: z.literal(true),
      aceitesExplicitos: z.literal(true),
      envioBloqueiaOutraPrevia: z.literal(true),
      executorNativo: z.literal(true),
      retencaoTecnicaOriginal: z.literal(true),
    });
    return schema.safeParse(r).success;
  } catch {
    return false;
  }
}
async function iniciar(paths: ReturnType<typeof fronteira>) {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  exigir(
    process.env.RECREIO_E2E_ACCOUNT_CLOSURE === "1" &&
      process.env.RECREIO_ISOLATED_TEST === "1" &&
      url &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      /^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname),
    "BANCO_FORA_DO_ESCOPO",
  );
  const estado = Privado.parse({
    formato: "recreio-encerramento-prova-privada-v1",
    source: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    livroId: process.env.RECREIO_RIGHTS_LEDGER_ID,
    keyring: JSON.parse(process.env.RECREIO_RIGHTS_KEYRING ?? "null"),
    manifesto: null,
    prefixoVerificado: false,
  });
  await escreverPrivado(paths.privado, estado, true);
  const r = configurar(estado);
  try {
    const bytes = r.assinatura.assinarCabecalho({
      formato: "recreio-livro-direitos-v1",
      livroId: estado.livroId,
      estado: "aberto",
      epoca: 0,
      chavesUtilizadas: ["e2e-closure"],
      retomada: null,
      geracao: 0,
      entradas: 0,
      raizSha256: RAIZ_VAZIA,
      anteriorSha256: null,
      ultimaIntencao: null,
      atualizadoEm: new Date().toISOString(),
    });
    const head = await r.storage.iniciarCabecalho(bytes);
    exigir(head.sha256 === resumoDoRegistro(bytes), "LIVRO_INICIAL_DIVERGENTE");
    console.log(
      JSON.stringify({
        formato: "recreio-encerramento-prova-v1",
        preparado: true,
        productionDataTouched: false,
      }),
    );
  } finally {
    r.assinatura.encerrar();
    r.cliente.destroy();
  }
}
async function limpar(paths: ReturnType<typeof fronteira>) {
  let estado: Estado;
  try {
    const stat = await lstat(paths.privado);
    exigir(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= 65_536 && (stat.mode & 0o077) === 0,
      "ARQUIVO_PRIVADO_INVALIDO",
    );
    estado = Privado.parse(JSON.parse(await readFile(paths.privado, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      // A second cleanup must preserve the first receipt, including a failure
      // of the browser gate. Absence of a private marker never authorizes LIST.
      console.log(
        JSON.stringify({ formato: "recreio-encerramento-prova-v1", nenhumLivroPendente: true }),
      );
      return;
    }
    throw error;
  }
  const r = configurar(estado),
    prefixo = `recreio/v1/direitos/${estado.livroId}/`;
  const permitido =
    /^(?:cabecalho\.json|intencoes\/[a-f0-9-]{36}-[1-9][0-9]*\.json|planos\/[a-f0-9]{64}\.json|historico\/[0-9]{16}-[a-f0-9]{64}\.json)$/;
  let limpeza = false,
    objetos = estado.manifesto?.length ?? 0;
  const ui = await jornadaConfirmada(paths.ui, estado);
  try {
    if (estado.manifesto === null) {
      const head = await lerObjeto(r.cliente, r.bucket, `${prefixo}cabecalho.json`);
      if (head) {
        try {
          r.assinatura.lerCabecalhoAssinado(head);
        } finally {
          head.fill(0);
        }
        const atual = await r.storage.lerCabecalho();
        await conferirPrefixoDoLivro({
          storage: r.storage,
          maxEntradas: 16,
          tempoLimiteMs: 30_000,
        });
        await r.storage.congelarCabecalho(atual, new Date().toISOString());
        await conferirPrefixoDoLivro({
          storage: r.storage,
          maxEntradas: 16,
          tempoLimiteMs: 30_000,
        });
        estado.prefixoVerificado = true;
      }
      const lista = await r.cliente.send(
        new ListObjectsV2Command({ Bucket: r.bucket, Prefix: prefixo, MaxKeys: 100 }),
        prazo(),
      );
      const keys = lista.Contents ?? [];
      exigir(
        lista.IsTruncated === false &&
          lista.KeyCount === keys.length &&
          keys.length <= 100 &&
          (head !== null || keys.length === 0),
        "INVENTARIO_INCONCLUSIVO",
      );
      const manifesto: z.infer<typeof Manifesto> = [];
      const unicas = new Set<string>();
      for (const obj of keys) {
        const key = obj.Key;
        exigir(
          typeof key === "string" &&
            key.startsWith(prefixo) &&
            permitido.test(key.slice(prefixo.length)),
          "CHAVE_FORA_DO_ESCOPO",
        );
        exigir(!unicas.has(key), "INVENTARIO_REPETIDO");
        unicas.add(key);
        const bytes = await lerObjeto(r.cliente, r.bucket, key);
        exigir(bytes, "OBJETO_DESAPARECEU");
        try {
          manifesto.push({ key, bytes: bytes.length, sha256: sha(bytes) });
        } finally {
          bytes.fill(0);
        }
      }
      manifesto.sort((a, b) =>
        a.key.endsWith("/cabecalho.json")
          ? 1
          : b.key.endsWith("/cabecalho.json")
            ? -1
            : a.key < b.key
              ? -1
              : 1,
      );
      estado.manifesto = manifesto;
      objetos = manifesto.length;
      await escreverPrivado(paths.privado, estado);
    }
    exigir(estado.manifesto, "MANIFESTO_AUSENTE");
    exigir(estado.prefixoVerificado || estado.manifesto.length === 0, "MANIFESTO_SEM_PROVA");
    for (const obj of estado.manifesto) {
      exigir(
        obj.key.startsWith(prefixo) && permitido.test(obj.key.slice(prefixo.length)),
        "CHAVE_FORA_DO_ESCOPO",
      );
      const bytes = await lerObjeto(r.cliente, r.bucket, obj.key);
      if (bytes) {
        try {
          exigir(bytes.length === obj.bytes && sha(bytes) === obj.sha256, "OBJETO_MUDOU");
        } finally {
          bytes.fill(0);
        }
        await r.cliente.send(new DeleteObjectCommand({ Bucket: r.bucket, Key: obj.key }), prazo());
      }
      const restante = await lerObjeto(r.cliente, r.bucket, obj.key);
      if (restante) {
        restante.fill(0);
        throw new Falha("AUSENCIA_NAO_CONFIRMADA");
      }
    }
    const final = await r.cliente.send(
      new ListObjectsV2Command({ Bucket: r.bucket, Prefix: prefixo, MaxKeys: 100 }),
      prazo(),
    );
    exigir(
      final.IsTruncated === false && final.KeyCount === 0 && !final.Contents?.length,
      "PREFIXO_NAO_VAZIO",
    );
    limpeza = true;
    await unlink(paths.privado);
  } finally {
    r.assinatura.encerrar();
    r.cliente.destroy();
    await writeFile(
      paths.publico,
      `${JSON.stringify(
        {
          formato: "recreio-encerramento-prova-v2",
          source: estado.source,
          runId: estado.runId,
          livroId: estado.livroId,
          boundary: "github_disposable_database_and_homologation_ledger",
          status: limpeza && ui ? "passed" : limpeza ? "cleaned_without_browser_proof" : "failed",
          browserJourneyVerified: ui,
          technicalRetentionUiVerified: ui,
          fullPrefixVerified: estado.prefixoVerificado,
          cleanupConfirmed: limpeza,
          objectCount: objetos,
          productionDataTouched: false,
          realFinancialCredentialsPresent: false,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
  }
  exigir(ui, "JORNADA_NAO_CONFIRMADA");
}
async function main() {
  const paths = fronteira();
  exigir(process.argv.length === 3, "ARGUMENTOS_INVALIDOS");
  if (process.argv[2] === "init") await iniciar(paths);
  else if (process.argv[2] === "cleanup") await limpar(paths);
  else throw new Falha("ARGUMENTOS_INVALIDOS");
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      formato: "recreio-encerramento-prova-v1",
      erro: error instanceof Falha ? error.codigo : "PROVA_INCONCLUSIVA",
    }),
  );
  process.exitCode = 1;
});
