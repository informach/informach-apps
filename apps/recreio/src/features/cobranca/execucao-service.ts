import "server-only";
import { stripeDestination } from "@informach/billing/destinations";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { envioComercialDisponivel } from "@/lib/commercial-mode";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { packageLogger } from "@/lib/observability";
import { limitarTentativas } from "@/lib/rate-limit";
import { comCicloDeCobranca } from "./lifecycle";
import {
  admitirCompraEmCursoLocked,
  admitirConsultaDaCompraLocked,
  capturarEstadoDaCompraLocked,
  conferirCompraParaEnvioLocked,
  conferirDevolucaoDaCompraLocked,
  conferirResultadoDaCompraLocked,
} from "./repository";
import type { RuntimeDeCompra } from "./runtime";

/** O factory permite compor o mesmo executor com transporte real ou de ensaio,
 * mantendo os modos, a autoridade nativa e a persistência no caminho único.
 */
function criarOperacaoDeCompra(obterRuntime: () => RuntimeDeCompra, somenteLeitura: boolean) {
  return async (autor: AutorNativoRecente, entrada: unknown) => {
    const id = z.uuid().parse(entrada);
    assertAllowed(
      somenteLeitura || envioComercialDisponivel(env.RECREIO_BILLING_MODE),
      "INDISPONIVEL",
      "O envio da compra ainda não está disponível.",
    );
    await limitarTentativas({
      chave: `compra-executar:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return comCicloDeCobranca(autor.contaId, async () => {
      await conferirCompraParaEnvioLocked(autor, id, somenteLeitura);
      const runtime = obterRuntime();
      // Recuperar uma operação admitida não depende da disponibilidade do catálogo.
      if (!somenteLeitura) await runtime.conferirCatalogo();
      const prova = somenteLeitura
        ? await admitirConsultaDaCompraLocked(autor, id)
        : await admitirCompraEmCursoLocked(autor, id);
      let falhou = false;
      if (!somenteLeitura)
        try {
          await runtime.criarCheckout({
            subject: { type: "user", id: prova.payerId },
            actorId: prova.payerId,
            productId: prova.productId,
            successUrl: runtime.urlDeRetorno,
            cancelUrl: runtime.urlDeRetorno,
            managedAuthorization: { id: prova.id, expiresAt: prova.expiresAt },
          });
        } catch {
          falhou = true;
        }
      let observado: Awaited<ReturnType<RuntimeDeCompra["inspecionar"]>> = null;
      try {
        observado = await runtime.inspecionar(prova.payerId, prova.id);
      } catch {
        falhou = true;
      }
      if (
        observado &&
        (observado.productId !== prova.productId ||
          observado.expiresAt !== prova.expiresAt ||
          observado.priceId !== runtime.precoDoProduto(prova.productId) ||
          observado.successUrl !== runtime.urlDeRetorno ||
          observado.cancelUrl !== runtime.urlDeRetorno)
      ) {
        observado = null;
        falhou = true;
      }
      await capturarEstadoDaCompraLocked(prova, observado);
      if (!observado?.state)
        packageLogger.error("recreio.checkout.external_unconfirmed", { authorizationId: prova.id });
      const recibo = await conferirResultadoDaCompraLocked(autor, id);
      if (!observado?.state) {
        throw new AppError(
          "COBRANCA_EM_CONFERENCIA",
          "Não foi possível confirmar o envio. Confira o estado do pedido antes de tentar novamente.",
        );
      }
      const estado = observado.state;
      if (estado.status === "expired" && recibo.resolucao === "expired_unpaid")
        return { tipo: "encerrada" as const, recibo };
      if (estado.status !== "open" || !estado.url)
        return { tipo: "em_conferencia" as const, recibo };
      const destino = stripeDestination(estado.url);
      await conferirDevolucaoDaCompraLocked(autor, id, estado.id);
      if (falhou)
        packageLogger.warn("recreio.checkout.response_recovered", { authorizationId: prova.id });
      return { tipo: "checkout" as const, destino, recibo };
    });
  };
}

export function criarExecutorDeCompra(obterRuntime: () => RuntimeDeCompra) {
  return criarOperacaoDeCompra(obterRuntime, false);
}
export function criarConsultaDeCompra(obterRuntime: () => RuntimeDeCompra) {
  return criarOperacaoDeCompra(obterRuntime, true);
}
