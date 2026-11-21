import { isDeepStrictEqual } from "node:util";
import type { S3Client } from "@aws-sdk/client-s3";
import { eq } from "@informach/db";
import { recreioRightsOperations as operations } from "@informach/db/schema";
import type postgres from "postgres";
import { z } from "zod";
import {
  type CoordenacaoDeEfeitos,
  comCicloFinanceiroDaCoordenacao,
  comCoordenacaoPrivadaDeDireitos,
  comFinanceiroPrivadoDeEncerramento,
  comOperacaoPrivadaDeDireitos,
  conferirIntencaoDaCoordenacao,
} from "../../src/features/direitos/coordenacao-repository";
import { criarProcessadorFinanceiroRecuperado } from "../../src/features/direitos/encerramento-financeiro-execucao-service";
import { avaliarFinanceiroConfirmadoRecuperado } from "../../src/features/direitos/encerramento-financeiro-recuperado-service";
import { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "../../src/features/direitos/livro/assinatura";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { importarFontesHistoricasDeDireitos } from "./importar-fontes-direitos";
import {
  provarEncerramentoAusente,
  provarEncerramentoAusenteComCliente,
} from "./provar-encerramento-ausente";
import { provarEncerramentoAusenteSelecionado } from "./provar-encerramento-ausente-selecionado";
import { provarEncerramentoNativoRecuperado } from "./provar-encerramento-nativo-recuperado";
import { provarEncerramentoSelecionadoRecuperado } from "./provar-encerramento-selecionado-recuperado";
import { provarInventarioFinanceiroRecuperado } from "./provar-inventario-financeiro-recuperado";
import { provarPublicacaoDeEncerramento } from "./provar-publicacao-encerramento";
import { provarReciboDosDireitosNativos } from "./provar-recibo-direitos-nativos";
import { exigir } from "./provas-arquivos";
import { RetiradaNativaDeProvaSchema } from "./retirada-nativa-prova-contrato";

/** Synthetic native closures in the actual second private cluster. Financial
 * assessment precedes a separate zero-player native closure replay. Real
 * provider settlement, all closure profiles and recovered traffic stay outside
 * this qualification; no live financial or identity credential is supplied. */
export async function provarFinanceiroRecuperado(config: {
  copia: postgres.Sql;
  cliente: S3Client;
  bucket: string;
  capturaSha256: string;
  entrada: unknown;
}) {
  exigir(
    process.env.CI === "true" &&
      process.env.GITHUB_ACTIONS === "true" &&
      !process.env.DATABASE_URL &&
      !process.env.BETTER_AUTH_SECRET &&
      !process.env.STRIPE_SECRET_KEY,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const dado = RetiradaNativaDeProvaSchema.shape.financeiro.parse(config.entrada);
  const chaves = new Map(
    Object.entries(dado.chaves).map(([id, b64]) => {
      const bytes = Buffer.from(b64, "base64");
      exigir(bytes.length === 32 && bytes.toString("base64") === b64, "CHAVE_INVALIDA");
      return [id, bytes] as const;
    }),
  );
  const assinatura = criarAssinaturaDoLivro({
    livroId: dado.livroId,
    chaveAtiva: "finance-next",
    chaves,
  });
  for (const bytes of chaves.values()) bytes.fill(0);
  let leituras = 0;
  config.cliente.middlewareStack.add(
    (next, contexto) => async (args) => {
      const input = z.object({ Bucket: z.string(), Key: z.string() }).parse(args.input);
      exigir(
        contexto.commandName === "GetObjectCommand" &&
          input.Bucket === config.bucket &&
          input.Key.startsWith(`recreio/v1/direitos/${dado.livroId}/`) &&
          /\/(?:cabecalho\.json|historico\/[0-9]{16}-[a-f0-9]{64}\.json|planos\/[a-f0-9]{64}\.json|intencoes\/[a-f0-9-]{36}-1\.json)$/.test(
            input.Key,
          ),
        "LEITURA_FORA_DO_LIVRO",
      );
      leituras++;
      return next(args);
    },
    { step: "initialize", name: "recreioColdFinancialReadBoundary" },
  );
  try {
    const copia = config.copia;
    const lerOriginais = () =>
      copia.unsafe(
        `select to_jsonb(o) as operacao,to_jsonb(p) as preparacao,
      (select jsonb_agg(to_jsonb(u) order by id) from core.users u) as identidades
      from recreio.rights_operations o join recreio.rights_preparations p on p.id=o.preparation_id where o.id in ($1,$2) order by o.id`,
        [dado.operacaoId, dado.anterior.operacaoId],
      );
    const lerFinanceiro = () =>
      copia.unsafe(
        `select to_jsonb(f) as financeiro from recreio.account_closure_finances f where operation_id=$1`,
        [dado.operacaoId],
      );
    const originais = await lerOriginais(),
      financeiroAntes = await lerFinanceiro();
    const lerConfirmacaoAnterior = () =>
      copia.unsafe(
        `select to_jsonb(f) as financeiro from recreio.account_closure_finances f where operation_id=$1 and requester_user_id=$2 and state='confirmed' and result='no_customer'`,
        [dado.anterior.operacaoId, dado.anterior.contaId],
      );
    const confirmacaoAnterior = await lerConfirmacaoAnterior();
    exigir(
      originais.length === 2 && financeiroAntes.length === 1 && confirmacaoAnterior.length === 1,
      "CONSENTIMENTO_NATIVO_DIVERGENTE",
    );
    const [pendente] = await copia.unsafe<{ valida: boolean }[]>(
      `select
      o.kind='encerrar_conta' and o.requester_user_id=$2 and o.preparation_id is not null and o.recovery_source_id is null
      and o.state='admitted' and f.state<>'confirmed' and f.customer_id is null and f.provider_customer_id is null
      and f.created_at=o.consented_at and p.state='closing' and p.revision=2 as valida
      from recreio.rights_operations o join recreio.account_closure_finances f on f.operation_id=o.id
      join recreio.account_participations p on p.operation_id=o.id and p.user_id=o.requester_user_id where o.id=$1`,
      [dado.operacaoId, dado.contaId],
    );
    exigir(pendente?.valida === true, "CONSENTIMENTO_NATIVO_DIVERGENTE");
    const storage = criarArmazenamentoDoLivro({
      cliente: config.cliente,
      bucket: config.bucket,
      assinatura,
      tempoLimiteMs: 15000,
    });
    const comum = {
      storage,
      assinatura,
      capturaSha256: config.capturaSha256,
      fonte: process.env.GITHUB_SHA ?? "",
      maxEntradas: 10,
      maxBytesPlanos: 65536,
      tempoLimiteMs: 120000,
    };
    const importacao = await importarFontesHistoricasDeDireitos({ ...comum, copia });
    exigir(importacao.fontesConferidas === 7, "CONSENTIMENTO_NATIVO_DIVERGENTE");
    let inventario: Awaited<ReturnType<typeof provarInventarioFinanceiroRecuperado>> | undefined;
    async function negada(
      executar: () => unknown | Promise<unknown>,
      codigo: "DIREITOS_LIVRO" | "DIREITOS_INTEGRIDADE" = "DIREITOS_LIVRO",
    ) {
      let recusada = false;
      try {
        await executar();
      } catch (erro) {
        if (!(erro instanceof AppError) || erro.code !== codigo) throw erro;
        recusada = true;
      }
      exigir(recusada, "CAPACIDADE_PRIVADA_DIVERGENTE");
    }
    const runtime = () => {
      throw new Error("No-customer recovery must not compose a provider");
    };
    await comConexaoPrivadaDeDireitos(copia, (banco) =>
      comCoordenacaoPrivadaDeDireitos({
        ...comum,
        banco,
        execucaoId: importacao.execucaoId,
        executar: async (pai) => {
          await negada(() => criarProcessadorFinanceiroRecuperado(pai, runtime));
          await negada(() => avaliarFinanceiroConfirmadoRecuperado(pai, runtime));
          await negada(() =>
            comFinanceiroPrivadoDeEncerramento({ ...pai }, dado.operacaoId, async () => {
              throw new Error("Copied root admitted");
            }),
          );
          let anterior: CoordenacaoDeEfeitos | undefined;
          await comFinanceiroPrivadoDeEncerramento(pai, dado.operacaoId, async (filha) => {
            anterior = filha;
            await negada(
              () => avaliarFinanceiroConfirmadoRecuperado(filha, runtime),
              "DIREITOS_INTEGRIDADE",
            );
            await negada(() => criarProcessadorFinanceiroRecuperado({ ...filha }, runtime));
            await negada(
              () =>
                comCicloFinanceiroDaCoordenacao(filha, "another-payer", async () => {
                  throw new Error("Wrong payer admitted");
                }),
              "DIREITOS_INTEGRIDADE",
            );
            const [op] = await banco
              .select()
              .from(operations)
              .where(eq(operations.id, dado.operacaoId));
            exigir(op, "CONSENTIMENTO_NATIVO_DIVERGENTE");
            await negada(() =>
              banco.transaction((tx) => conferirIntencaoDaCoordenacao(tx, op, filha)),
            );
            const processar = criarProcessadorFinanceiroRecuperado(filha, runtime);
            const primeira = await processar();
            exigir(primeira.situacao === "confirmada", "CONSENTIMENTO_NATIVO_DIVERGENTE");
            const depois = await lerFinanceiro();
            const segunda = await processar();
            exigir(
              segunda.situacao === "ociosa" && isDeepStrictEqual(depois, await lerFinanceiro()),
              "CONSENTIMENTO_NATIVO_DIVERGENTE",
            );
          });
          await comFinanceiroPrivadoDeEncerramento(pai, dado.anterior.operacaoId, async (filha) => {
            await negada(() => avaliarFinanceiroConfirmadoRecuperado({ ...filha }, runtime));
            const primeira = await avaliarFinanceiroConfirmadoRecuperado(filha, runtime);
            const segunda = await avaliarFinanceiroConfirmadoRecuperado(filha, runtime);
            exigir(
              primeira.operacaoId === dado.anterior.operacaoId &&
                primeira.resultado === "no_customer" &&
                primeira.execucaoId === importacao.execucaoId &&
                segunda.operacaoId === primeira.operacaoId &&
                primeira.cercaSha256 === segunda.cercaSha256 &&
                /^[a-f0-9]{64}$/.test(primeira.sha256) &&
                /^[a-f0-9]{64}$/.test(segunda.sha256),
              "CONSENTIMENTO_NATIVO_DIVERGENTE",
            );
          });
          inventario = await provarInventarioFinanceiroRecuperado(
            pai,
            copia,
            dado.provedor,
            config.cliente,
          );
          const encerrada = anterior;
          exigir(encerrada, "CAPACIDADE_PRIVADA_DIVERGENTE");
          await negada(() => criarProcessadorFinanceiroRecuperado(encerrada, runtime));
          await negada(
            () =>
              comOperacaoPrivadaDeDireitos(pai, dado.operacaoId, async () => {
                throw new Error("Financial reconciliation admitted personal data effects");
              }),
            "DIREITOS_INTEGRIDADE",
          );
          await negada(
            () =>
              comOperacaoPrivadaDeDireitos(pai, dado.anterior.operacaoId, async () => {
                throw new Error("A descriptive financial assessment admitted erasure");
              }),
            "DIREITOS_INTEGRIDADE",
          );
        },
      }),
    );
    exigir(isDeepStrictEqual(originais, await lerOriginais()), "CONSENTIMENTO_NATIVO_DIVERGENTE");
    exigir(
      isDeepStrictEqual(confirmacaoAnterior, await lerConfirmacaoAnterior()),
      "CONSENTIMENTO_NATIVO_DIVERGENTE",
    );
    const [conferida] = await copia.unsafe<{ valida: boolean }[]>(
      `select
      f.state='confirmed' and f.result='no_customer' and f.attempts=1 and f.lease_token is null and f.lease_until is null
      and f.confirmed_at is not null and f.observed_at is not null and f.created_at=o.consented_at
      and o.state='admitted' and p.state='closing' and p.revision=2
      and (select count(*) from audit.events e where e.event_type='recreio.account_closure_finance_confirmed' and e.payload->>'operationId'=o.id::text)=1 as valida
      from recreio.account_closure_finances f join recreio.rights_operations o on o.id=f.operation_id
      join recreio.account_participations p on p.operation_id=o.id where o.id=$1`,
      [dado.operacaoId],
    );
    exigir(
      conferida?.valida === true && leituras > 0 && inventario,
      "CONSENTIMENTO_NATIVO_DIVERGENTE",
    );
    const encerramento = await provarEncerramentoNativoRecuperado(
      copia,
      { ...comum, execucaoId: importacao.execucaoId },
      dado,
    );
    const selecionado = await provarEncerramentoSelecionadoRecuperado(
      copia,
      { ...comum, execucaoId: importacao.execucaoId },
      dado,
    );
    const publicacao = await provarPublicacaoDeEncerramento(
      copia,
      { ...comum, execucaoId: importacao.execucaoId },
      dado.publicacaoPendente,
    );
    const posterior = await provarEncerramentoAusente(
      copia,
      { ...comum, execucaoId: importacao.execucaoId },
      dado.posterior,
    );
    const selecaoPosterior = await provarEncerramentoAusenteSelecionado(
      copia,
      { ...comum, execucaoId: importacao.execucaoId },
      dado.posteriorComSelecao,
    );
    const clientePosterior = await provarEncerramentoAusenteComCliente(
      copia,
      { ...comum, execucaoId: importacao.execucaoId },
      dado.posteriorComCliente,
    );
    const recibo = await provarReciboDosDireitosNativos(
      copia,
      { ...comum, execucaoId: importacao.execucaoId },
      dado,
    );
    return {
      ...recibo,
      ...publicacao,
      ...posterior,
      ...selecaoPosterior,
      ...clientePosterior,
      ...selecionado,
      ...encerramento,
      ...inventario,
      nativeClosureFinancialPrivateConnectionVerified: true,
      nativeClosureFinancialRetryVerified: true,
      nativeClosureFinancialRetryIdempotent: true,
      nativeClosureFinancialScopeIsolationVerified: true,
      nativeClosureFinancialOriginalConsentPreserved: true,
      nativeClosureFinancialBookOnlyRead: true,
      nativeClosureFinancialReadRequests: leituras,
      nativeClosureHistoricalConfirmationFreshlyAssessed: true,
      nativeClosureHistoricalConfirmationUnchanged: true,
      nativeClosureFreshAssessmentRequiresConfirmation: true,
      nativeClosureFreshAssessmentIsNotDataAuthority: true,
      nativeAccountClosureFullyReplayed: false,
    };
  } finally {
    assinatura.encerrar();
    config.cliente.middlewareStack.remove("recreioColdFinancialReadBoundary");
  }
}
