import "server-only";
import type { PaymentReadBudget } from "@informach/billing/payment-facts";
import type { RecreioUpgradeProvider } from "@informach/billing/providers/stripe-recreio-upgrades";
import type { Product, StripeMode } from "@informach/config";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { comCicloDeCobranca } from "./lifecycle";
import { admitirTentativaDeAumentoLocked } from "./troca-aumento-execucao-repository";
import { recuperarAumentoAdmitido } from "./troca-aumento-recuperacao-service";
import {
  conferirResultadoDaTrocaNoBanco,
  conferirTrocaParaEnvioLocked,
} from "./troca-execucao-repository";

export type RuntimeDeEnvioDoAumento = {
  modo: StripeMode;
  produtos: readonly Product[];
  conferirCatalogo: (budget: PaymentReadBudget) => Promise<void>;
  aumentos: RecreioUpgradeProvider;
};
function criarOperacao(obterRuntime: () => RuntimeDeEnvioDoAumento, somenteRecuperacao: boolean) {
  return async (autor: AutorNativoRecente, entrada: unknown) => {
    const id = z.uuid().parse(entrada);
    assertAllowed(
      somenteRecuperacao || env.RECREIO_BILLING_MODE === "sandbox",
      "INDISPONIVEL",
      "As trocas ainda estão em homologação.",
    );
    await limitarTentativas({
      chave: `troca-enviar:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return comCicloDeCobranca(autor.contaId, async () => {
      const runtime = obterRuntime();
      assertAllowed(
        runtime.modo === "dev",
        "INDISPONIVEL",
        "Envio disponível somente no ambiente de teste.",
      );
      const anterior = await conferirResultadoDaTrocaNoBanco(autor, id, runtime.modo);
      assertAllowed(anterior.tipo === "upgrade", "CONFLITO", "Confira o tipo da troca.");
      if (anterior.resolvidoEm !== null) return anterior;
      const { jaAdmitida } = await conferirTrocaParaEnvioLocked(autor, id, runtime.modo, "upgrade");
      assertAllowed(
        !somenteRecuperacao || jaAdmitida,
        "OPERACAO_EM_CONFERENCIA",
        "A troca ainda não foi enviada.",
      );
      const budget = { deadlineMs: Date.now() + 90_000 };
      if (!jaAdmitida) await runtime.conferirCatalogo(budget);
      const prova = await admitirTentativaDeAumentoLocked(
        autor,
        id,
        runtime.modo,
        runtime.produtos,
        somenteRecuperacao,
      );
      const { falhou } = await recuperarAumentoAdmitido(prova, runtime.aumentos, budget);
      const resultado = await conferirResultadoDaTrocaNoBanco(autor, id, runtime.modo);
      if (falhou)
        throw new AppError(
          "COBRANCA_EM_CONFERENCIA",
          "Não foi possível confirmar a troca. Confira o pedido antes de tentar novamente.",
        );
      return resultado;
    });
  };
}
export const criarEnvioDeAumento = (obterRuntime: () => RuntimeDeEnvioDoAumento) =>
  criarOperacao(obterRuntime, false);
export const criarRecuperacaoDeAumento = (obterRuntime: () => RuntimeDeEnvioDoAumento) =>
  criarOperacao(obterRuntime, true);
