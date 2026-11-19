import { randomBytes, randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { criarArmazenamentoDoLivro } from "../src/features/direitos/livro/armazenamento";
import {
  criarAssinaturaDoLivro,
  resumoDoRegistro,
} from "../src/features/direitos/livro/assinatura";
import { FalhaDoLivroDeDireitos, RAIZ_VAZIA } from "../src/features/direitos/livro/contrato";
import { exigir, FalhaDaProva } from "./backup/provas-arquivos";

interface ReciboDaProva {
  source: string;
  runId: string;
  boundary: string;
  status: "failed" | "passed";
  bucket: string;
  objectKeys: string[];
  immutableIntentVerified: boolean;
  conditionalCasVerified: boolean;
  concurrentWinnerVerified: boolean;
  staleOverwriteRefused: boolean;
  anonymousReadDenied: boolean;
  cleanupConfirmed: boolean;
  durableFreezeVerified: boolean;
  productionDataTouched: false;
  productionCredentialsPresent: false;
  failure: string | null;
  cleanupFailure: string | null;
}

const variavel = (nome: string) => {
  const valor = process.env[nome];
  exigir(valor, "CONFIGURACAO_AUSENTE");
  return valor;
};
async function main() {
  exigir(
    process.platform === "linux" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      /^\d+$/.test(variavel("GITHUB_RUN_ID")) &&
      /^[a-f0-9]{40}$/.test(variavel("GITHUB_SHA")) &&
      !process.env.DATABASE_URL &&
      !process.env.RAILWAY_ENVIRONMENT_ID &&
      !process.env.RECREIO_HOST_SECRETS &&
      !process.env.RECREIO_TOKEN_PRIVATE_KEY,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const bucket = variavel("RECREIO_S3_TEST_BUCKET"),
    endpoint = new URL(variavel("RECREIO_S3_TEST_ENDPOINT")),
    estilo = variavel("RECREIO_S3_TEST_PATH_STYLE");
  exigir(
    bucket === "recreio-homologacao-c0xyqx" &&
      variavel("RECREIO_S3_EXPECTED_BUCKET") === bucket &&
      endpoint.origin === "https://t3.storageapi.dev" &&
      endpoint.pathname === "/" &&
      !endpoint.search &&
      !endpoint.hash &&
      !endpoint.username &&
      !endpoint.password &&
      ["true", "false"].includes(estilo) &&
      variavel("RECREIO_S3_TEST_REGION") === "auto",
    "DESTINO_FORA_DO_ESCOPO",
  );
  const arquivo = await open(
      resolve(variavel("RUNNER_TEMP"), "recreio-livro-provider.json"),
      "wx",
      0o600,
    ),
    livroId = randomUUID(),
    chave = randomBytes(32),
    assinatura = criarAssinaturaDoLivro({
      livroId,
      chaveAtiva: "prova-v1",
      chaves: new Map([["prova-v1", chave]]),
    }),
    cliente = new S3Client({
      endpoint: endpoint.origin,
      region: "auto",
      forcePathStyle: estilo === "true",
      maxAttempts: 1,
      credentials: {
        accessKeyId: variavel("RECREIO_S3_TEST_ACCESS_KEY"),
        secretAccessKey: variavel("RECREIO_S3_TEST_SECRET_KEY"),
      },
    }),
    storage = criarArmazenamentoDoLivro({ cliente, bucket, assinatura, tempoLimiteMs: 20_000 }),
    prefixo = storage.prefixo,
    chavesProprias = new Set<string>();
  let limpeza = false;
  const recibo: ReciboDaProva = {
    source: variavel("GITHUB_SHA"),
    runId: variavel("GITHUB_RUN_ID"),
    boundary: "synthetic_external_rights_ledger_cas",
    status: "failed",
    bucket,
    objectKeys: [],
    immutableIntentVerified: false,
    conditionalCasVerified: false,
    concurrentWinnerVerified: false,
    staleOverwriteRefused: false,
    anonymousReadDenied: false,
    cleanupConfirmed: false,
    durableFreezeVerified: false,
    productionDataTouched: false,
    productionCredentialsPresent: false,
    failure: null,
    cleanupFailure: null,
  };
  cliente.middlewareStack.add(
    (next, contexto) => async (args) => {
      const i = args.input;
      exigir(
        i && typeof i === "object" && "Bucket" in i && i.Bucket === bucket,
        "BUCKET_FORA_DO_ESCOPO",
      );
      if (contexto.commandName === "ListObjectsV2Command") {
        exigir(limpeza && "Prefix" in i && i.Prefix === prefixo, "LIST_FORA_DO_ESCOPO");
      } else {
        exigir(
          "Key" in i && typeof i.Key === "string" && i.Key.startsWith(prefixo),
          "CHAVE_FORA_DO_ESCOPO",
        );
        const nome = i.Key.slice(prefixo.length);
        exigir(
          nome === "cabecalho.json" ||
            /^intencoes\/[a-f0-9-]{36}-[1-9][0-9]{0,15}\.json$/.test(nome) ||
            /^historico\/[0-9]{16}-[a-f0-9]{64}\.json$/.test(nome),
          "CHAVE_FORA_DO_ESCOPO",
        );
        if (contexto.commandName === "PutObjectCommand") chavesProprias.add(i.Key);
        else if (contexto.commandName === "DeleteObjectCommand")
          exigir(limpeza && chavesProprias.has(i.Key), "DELETE_FORA_DO_ESCOPO");
        else exigir(contexto.commandName === "GetObjectCommand", "COMANDO_FORA_DO_ESCOPO");
      }
      return next(args);
    },
    { step: "initialize", name: "somenteLivroSinteticoProprio" },
  );
  const intencao = () =>
    assinatura.assinarIntencao({
      formato: "recreio-intencao-direitos-v1",
      livroId,
      operacaoId: randomUUID(),
      revisao: 1,
      tipo: "retirar_perfil",
      contaId: `fixture-${randomUUID()}`,
      perfilIds: [randomUUID()],
      planoSha256: "a".repeat(64),
      fonte: variavel("GITHUB_SHA"),
      consentidaEm: "2026-11-19T10:00:00.000Z",
      autenticadaEm: "2026-11-19T09:59:00.000Z",
    });
  const codigo = (e: unknown) =>
    e instanceof FalhaDaProva || e instanceof FalhaDoLivroDeDireitos
      ? e.codigo
      : "PROVA_INCONCLUSIVA";
  async function limparProprios() {
    limpeza = true;
    const falhas: unknown[] = [];
    for (const Key of chavesProprias) {
      try {
        await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key }), {
          abortSignal: AbortSignal.timeout(10_000),
        });
        let ausente = false;
        try {
          const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key }), {
            abortSignal: AbortSignal.timeout(10_000),
          });
          await r.Body?.transformToByteArray();
        } catch (e) {
          if (
            e instanceof S3ServiceException &&
            e.name === "NoSuchKey" &&
            e.$metadata.httpStatusCode === 404
          )
            ausente = true;
          else throw e;
        }
        exigir(ausente, "AUSENCIA_NAO_CONFIRMADA");
      } catch (e) {
        falhas.push(e);
      }
    }
    try {
      const r = await cliente.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, MaxKeys: 100 }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      exigir(!r.IsTruncated && (r.KeyCount ?? 0) === 0 && !r.Contents?.length, "PREFIXO_NAO_VAZIO");
      exigir(falhas.length === 0, "LIMPEZA_INCOMPLETA");
      recibo.cleanupConfirmed = true;
    } catch (e) {
      recibo.cleanupFailure = codigo(e);
    }
  }
  try {
    const inicial = assinatura.assinarCabecalho({
        formato: "recreio-livro-direitos-v1",
        estado: "aberto",
        livroId,
        geracao: 0,
        entradas: 0,
        raizSha256: RAIZ_VAZIA,
        anteriorSha256: null,
        ultimaIntencao: null,
        atualizadoEm: "2026-11-19T10:00:00.000Z",
      }),
      base = await storage.iniciarCabecalho(inicial),
      a = intencao(),
      b = intencao();
    await storage.publicarIntencao(a);
    await storage.publicarIntencao(a);
    const original = assinatura.lerIntencao(a);
    let recusou = false;
    try {
      await storage.publicarIntencao(
        assinatura.assinarIntencao({ ...original, planoSha256: "f".repeat(64) }),
      );
    } catch (e) {
      recusou = e instanceof FalhaDoLivroDeDireitos && e.codigo === "INTEGRIDADE";
    }
    exigir(recusou, "INTENCAO_SOBRESCRITA");
    recibo.immutableIntentVerified = true;
    await storage.publicarIntencao(b);
    const head = (bytes: Buffer, anterior = base) => {
        const i = assinatura.lerIntencao(bytes),
          sha256 = resumoDoRegistro(bytes);
        return assinatura.assinarCabecalho({
          formato: "recreio-livro-direitos-v1",
          estado: "aberto",
          livroId,
          geracao: anterior.documento.geracao + 1,
          entradas: anterior.documento.entradas + 1,
          raizSha256: resumoDoRegistro(
            Buffer.from(JSON.stringify([anterior.documento.raizSha256, sha256])),
          ),
          anteriorSha256: anterior.sha256,
          ultimaIntencao: { operacaoId: i.operacaoId, revisao: i.revisao, sha256 },
          atualizadoEm: "2026-11-19T10:01:00.000Z",
        });
      },
      ha = head(a),
      hb = head(b),
      resultados = await Promise.allSettled([
        storage.trocarCabecalho(base, ha),
        storage.trocarCabecalho(base, hb),
      ]);
    exigir(
      resultados.filter((r) => r.status === "fulfilled").length === 1 &&
        resultados.some(
          (r) =>
            r.status === "rejected" &&
            r.reason instanceof FalhaDoLivroDeDireitos &&
            r.reason.codigo === "CONCORRENCIA",
        ),
      "CAS_CONCORRENTE_NAO_RESPEITADO",
    );
    recibo.concurrentWinnerVerified = true;
    const atual = await storage.lerCabecalho(),
      perdedor = atual.sha256 === resumoDoRegistro(ha) ? hb : ha;
    recusou = false;
    try {
      await storage.trocarCabecalho(base, perdedor);
    } catch (e) {
      recusou = e instanceof FalhaDoLivroDeDireitos && e.codigo === "CONCORRENCIA";
    }
    exigir(
      recusou && (await storage.lerCabecalho()).sha256 === atual.sha256,
      "CAS_ANTIGO_SOBRESCREVEU",
    );
    recibo.staleOverwriteRefused = true;
    recibo.conditionalCasVerified = true;
    const congelado = await storage.congelarCabecalho(atual, "2026-11-19T10:02:00.000Z");
    exigir(
      congelado.documento.estado === "congelado" &&
        congelado.documento.geracao === 2 &&
        congelado.documento.entradas === 1 &&
        congelado.documento.raizSha256 === atual.documento.raizSha256,
      "CONGELAMENTO_NAO_CONFIRMADO",
    );
    const seguinte = head(atual.sha256 === resumoDoRegistro(ha) ? b : a, atual);
    recusou = false;
    try {
      await storage.trocarCabecalho(atual, seguinte);
    } catch (e) {
      recusou = e instanceof FalhaDoLivroDeDireitos && e.codigo === "CONCORRENCIA";
    }
    exigir(recusou, "CAS_ULTRAPASSOU_CONGELAMENTO");
    recusou = false;
    try {
      await storage.trocarCabecalho(congelado, seguinte);
    } catch (e) {
      recusou = e instanceof FalhaDoLivroDeDireitos && e.codigo === "CONGELADO";
    }
    exigir(
      recusou && (await storage.lerCabecalho()).sha256 === congelado.sha256,
      "ADMISSAO_CONGELADA_NAO_RECUSADA",
    );
    recibo.durableFreezeVerified = true;
    const url = new URL(endpoint.origin);
    if (estilo === "true") url.pathname = `/${bucket}/${prefixo}cabecalho.json`;
    else {
      url.hostname = `${bucket}.${url.hostname}`;
      url.pathname = `/${prefixo}cabecalho.json`;
    }
    const anonima = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    try {
      exigir([401, 403].includes(anonima.status), "LEITURA_ANONIMA_NAO_RECUSADA");
    } finally {
      await anonima.body?.cancel();
    }
    recibo.anonymousReadDenied = true;
    exigir(chavesProprias.size === 8, "ESCOPO_DA_PROVA_DIVERGENTE");
    recibo.status = "passed";
  } catch (e) {
    recibo.failure = codigo(e);
  } finally {
    await limparProprios();
    recibo.objectKeys = [...chavesProprias].sort();
    if (recibo.failure || recibo.cleanupFailure || !recibo.cleanupConfirmed)
      recibo.status = "failed";
    assinatura.encerrar();
    chave.fill(0);
    cliente.destroy();
    try {
      await arquivo.writeFile(`${JSON.stringify(recibo, null, 2)}\n`);
      await arquivo.sync();
    } finally {
      await arquivo.close();
    }
  }
  console.log(JSON.stringify(recibo));
  if (recibo.status !== "passed") process.exitCode = 1;
}
main().catch(() => {
  console.error("Prova do livro recusada; detalhes privados omitidos.");
  process.exitCode = 1;
});
