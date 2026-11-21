import { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { criarArmazenamentoDoLivro } from "../src/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "../src/features/direitos/livro/assinatura";
import {
  inicializarLivroDeDireitos,
  inspecionarLivroDeDireitos,
} from "../src/features/direitos/livro/inicializacao";
import { configuracaoDosDireitosDoProcesso } from "../src/lib/rights-environment";

async function main() {
  const [comando, livroEsperado, bucketEsperado] = z
    .tuple([z.enum(["--inspect", "--initialize"]), z.uuid(), z.string().min(3).max(63)])
    .parse(process.argv.slice(2));
  if (
    process.platform !== "linux" ||
    [
      "DATABASE_URL",
      "PGPASSWORD",
      "BETTER_AUTH_SECRET",
      "STRIPE_SECRET_KEY",
      "SENDGRID_API_KEY",
      "RECREIO_HOST_SECRETS",
      "RECREIO_TOKEN_PRIVATE_KEY",
    ].some((k) => process.env[k])
  )
    throw new Error("Invalid initialization boundary");
  const fonte = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.RAILWAY_GIT_COMMIT_SHA);
  const config = configuracaoDosDireitosDoProcesso(process.env);
  if (!config) throw new Error("Initialization requires explicit custody configuration");
  let assinatura: ReturnType<typeof criarAssinaturaDoLivro> | undefined,
    cliente: S3Client | undefined;
  try {
    if (
      config.scope !== "production" ||
      config.livroId !== livroEsperado ||
      config.bucket !== bucketEsperado
    )
      throw new Error("Invalid initialization destination");
    assinatura = criarAssinaturaDoLivro(config);
    for (const key of config.chaves.values()) key.fill(0);
    cliente = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.pathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    cliente.middlewareStack.add(
      (next, contexto) => async (args) => {
        const input = z.object({ Bucket: z.string(), Key: z.string() }).parse(args.input);
        const prefixo = `recreio/v1/direitos/${livroEsperado}/`;
        if (
          ![
            "GetObjectCommand",
            ...(comando === "--initialize" ? ["PutObjectCommand"] : []),
          ].includes(contexto.commandName ?? "") ||
          input.Bucket !== bucketEsperado ||
          !(
            input.Key === `${prefixo}cabecalho.json` ||
            new RegExp(`^${prefixo}historico/0000000000000000-[a-f0-9]{64}\\.json$`).test(input.Key)
          )
        )
          throw new Error("Initialization request outside fixed book");
        return next(args);
      },
      { step: "initialize", name: "recreioExplicitLedgerInitialization" },
    );
    const storage = criarArmazenamentoDoLivro({
      cliente,
      bucket: config.bucket,
      assinatura,
      tempoLimiteMs: 10000,
    });
    const comum = { assinatura, storage, livroEsperado };
    const resultado = comando === "--initialize" ? await inicializarLivroDeDireitos(comum) : null;
    const head = resultado?.cabecalho ?? (await inspecionarLivroDeDireitos(comum));
    console.log(
      JSON.stringify({
        formato: "recreio-livro-inicializacao-v1",
        fonte,
        modo: config.scope,
        livroId: livroEsperado,
        comando,
        situacao: head
          ? resultado?.jaInicializado === false
            ? "iniciado"
            : "existente"
          : "ausente",
        estado: head?.documento.estado ?? null,
        epoca: head?.documento.epoca ?? null,
        entradas: head?.documento.entradas ?? null,
        efeitosPessoaisAplicados: false,
        trafegoAutorizado: false,
      }),
    );
  } finally {
    for (const key of config.chaves.values()) key.fill(0);
    assinatura?.encerrar();
    cliente?.destroy();
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      formato: "recreio-livro-inicializacao-v1",
      erro: "LIVRO_INICIALIZACAO_FALHOU",
    }),
  );
  process.exitCode = 1;
});
