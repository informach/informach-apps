"use server";
import { z } from "zod";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { getRuntimeDaReducao, getRuntimeDoAumento } from "@/lib/billing";
import { env } from "@/lib/env";
import { criarAceiteDeTroca, criarEncerramentoDeTroca } from "./troca-aceite-service";
import { criarEnvioDeAumento, criarRecuperacaoDeAumento } from "./troca-aumento-execucao-service";
import { criarCancelamentoDeReducao } from "./troca-cancelamento-service";
import { criarPreparacaoDeAumento, criarPreparacaoDeReducao } from "./troca-cotacao-service";
import { criarEnvioDeReducao, criarRecuperacaoDeReducao } from "./troca-execucao-service";

// The kind selects a narrow capability only. Each native service independently
// validates the saved/current kind, payer, revision and complete selection.
const Tipo = z.enum(["upgrade", "downgrade"]);
export async function prepararTrocaAction(tipo: unknown, entrada: unknown) {
  return runAction(async () => {
    const operacao =
      Tipo.parse(tipo) === "upgrade"
        ? criarPreparacaoDeAumento(getRuntimeDoAumento)
        : criarPreparacaoDeReducao(getRuntimeDaReducao);
    return operacao(await autorDaFamilia(), entrada);
  });
}
export async function aceitarTrocaAction(entrada: unknown) {
  return runAction(async () =>
    criarAceiteDeTroca(getRuntimeDaReducao)(await autorDaFamilia(), entrada),
  );
}
export async function encerrarTrocaAction(id: unknown) {
  return runAction(async () =>
    criarEncerramentoDeTroca(() => env.STRIPE_MODE)(await autorDaFamilia(), id),
  );
}
export async function enviarTrocaAction(tipo: unknown, id: unknown) {
  return runAction(async () => {
    const operacao =
      Tipo.parse(tipo) === "upgrade"
        ? criarEnvioDeAumento(getRuntimeDoAumento)
        : criarEnvioDeReducao(getRuntimeDaReducao);
    return operacao(await autorDaFamilia(), id);
  });
}
export async function conferirTrocaAction(tipo: unknown, id: unknown) {
  return runAction(async () => {
    const operacao =
      Tipo.parse(tipo) === "upgrade"
        ? criarRecuperacaoDeAumento(getRuntimeDoAumento)
        : criarRecuperacaoDeReducao(getRuntimeDaReducao);
    return operacao(await autorDaFamilia(), id);
  });
}
export async function cancelarReducaoAction(id: unknown) {
  return runAction(async () =>
    criarCancelamentoDeReducao(getRuntimeDaReducao)(await autorDaFamilia(), id),
  );
}
