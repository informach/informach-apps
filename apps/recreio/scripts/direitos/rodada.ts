import { concluirProximaRetirada } from "../../src/features/direitos/conclusao-repository";
import { retirarProximosDadosPessoais } from "../../src/features/direitos/dados-retirada-repository";
import { concluirProximaDrenagem } from "../../src/features/direitos/drenagem-repository";
import { concluirProximoEncerramento } from "../../src/features/direitos/encerramento-conta-repository";
import {
  criarProcessadorFinanceiroDoEncerramento,
  type RuntimeFinanceiroDoEncerramento,
} from "../../src/features/direitos/encerramento-financeiro-execucao-service";
import { resumoDaFilaDeDireitos } from "../../src/features/direitos/fila-repository";
import { liberarProximoMundoDeDireitos } from "../../src/features/direitos/liberacao-mundo-repository";
import type { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import type { criarAssinaturaDoLivro } from "../../src/features/direitos/livro/assinatura";
import { conferirPrefixoDoLivro } from "../../src/features/direitos/livro/leitura";
import { minimizarProximoPerfil } from "../../src/features/direitos/minimizacao-repository";
import { publicarProximoConsentimento } from "../../src/features/direitos/publicacao-repository";
import { expurgarProximaReferencia } from "../../src/features/direitos/referencias-retidas-repository";
import type { LeitorDeFotografiasPrivadas } from "../../src/features/posse/armazenamento";
import { processarProximaFotografiaDeDireitos } from "./fotografias";
import { recuperarProximoDiarioDeDireitos } from "./recuperacao";

type Config = {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  leitor: LeitorDeFotografiasPrivadas | null;
  politica: { retirarTextosDaFundacao: boolean };
  obterFinanceiro?: () => RuntimeFinanceiroDoEncerramento;
};
/** Uma passagem por etapa, não um daemon ou loop até esvaziar. Cada efeito
 * confere o livro atual, usa sua fila justa e deixa pendências discriminadas.
 * Falhas independentes não impedem tentar as etapas seguintes; a rodada falha
 * ao final se qualquer erro ou revisão ocorrer, preservando os erros originais. */
export async function processarRodadaDeDireitos(config: Config) {
  const resultados: { etapa: string; situacao: string }[] = [],
    falhas: unknown[] = [];
  const efeito = async () => ({
    assinatura: config.assinatura,
    prova: await conferirPrefixoDoLivro({
      storage: config.storage,
      maxEntradas: 100_000,
      tempoLimiteMs: 30_000,
    }),
  });
  const etapas = [
    { nome: "publicacao", executar: () => publicarProximoConsentimento(config) },
    {
      nome: "financeiro",
      executar: criarProcessadorFinanceiroDoEncerramento({
        livroId: config.assinatura.livroId,
        obterCoordenacao: efeito,
        obterRuntime:
          config.obterFinanceiro ??
          (() => {
            throw new Error("Closure financial provider is not configured");
          }),
      }),
    },
    { nome: "recuperacao", executar: () => recuperarProximoDiarioDeDireitos(config) },
    { nome: "drenagem", executar: async () => concluirProximaDrenagem(await efeito()) },
    { nome: "fotografias", executar: () => processarProximaFotografiaDeDireitos(config) },
    { nome: "dados", executar: async () => retirarProximosDadosPessoais(await efeito()) },
    { nome: "cadastro", executar: async () => minimizarProximoPerfil(await efeito()) },
    {
      nome: "liberacao_mundo",
      executar: async () => liberarProximoMundoDeDireitos(await efeito()),
    },
    { nome: "referencias", executar: async () => expurgarProximaReferencia(await efeito()) },
    { nome: "conclusao", executar: async () => concluirProximaRetirada(await efeito()) },
    {
      nome: "encerramento_conta",
      executar: async () => concluirProximoEncerramento(await efeito()),
    },
  ];
  for (const etapa of etapas) {
    try {
      const resultado = await etapa.executar();
      resultados.push({ etapa: etapa.nome, situacao: resultado.situacao });
      if (resultado.situacao === "revisao")
        falhas.push(new Error("Direitos exigem revisão nativa."));
    } catch (erro) {
      falhas.push(erro);
      resultados.push({ etapa: etapa.nome, situacao: "falhou" });
    }
  }
  let fila: Awaited<ReturnType<typeof resumoDaFilaDeDireitos>> | undefined;
  try {
    fila = await resumoDaFilaDeDireitos(config.assinatura.livroId);
    if (fila.review || fila.processingOverdue || fila.purgeOverdue)
      falhas.push(new Error("Fila de direitos exige intervenção."));
  } catch (erro) {
    falhas.push(erro);
  }
  if (falhas.length) throw new AggregateError(falhas, "Rodada de direitos incompleta.");
  return { formato: "recreio-direitos-rodada-v1" as const, etapas: resultados, ...fila };
}
