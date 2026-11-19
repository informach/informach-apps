import "server-only";
import { ehErroDoRecreio } from "@informach/recreio";
import { ZodError } from "zod";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { AppError, assertAllowed } from "@/lib/errors";
import { configuracaoDaExportacao } from "@/lib/export-environment";
import { LIMITES_DA_COPIA_PESSOAL } from "./captura-contrato";

export function exportacaoDisponivel() {
  return process.env.RECREIO_EXPORT_MODE === "native";
}

export async function comCifradorPessoal<T>(
  executar: (cifrador: ReturnType<typeof criarCifradorDeObjetos>) => Promise<T>,
) {
  const config = configuracaoDaExportacao(process.env);
  assertAllowed(config, "INDISPONIVEL", "A cópia pessoal ainda não está disponível nesta área.");
  let cifrador: ReturnType<typeof criarCifradorDeObjetos> | undefined;
  try {
    cifrador = criarCifradorDeObjetos({ ...config, limiteBytes: LIMITES_DA_COPIA_PESSOAL.bytes });
    for (const key of config.chaves.values()) key.fill(0);
    return await executar(cifrador);
  } catch (erro) {
    if (erro instanceof AppError || erro instanceof ZodError || ehErroDoRecreio(erro)) throw erro;
    // Erros SQL podem anexar o envelope como parâmetro. Na fronteira pública,
    // registrar só a falha fixa; o identificador de incidente vem do runAction.
    throw new Error("recreio.personal_export.failed");
  } finally {
    for (const key of config.chaves.values()) key.fill(0);
    cifrador?.encerrar();
  }
}
