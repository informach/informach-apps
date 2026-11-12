import type { z } from "zod";

/**
 * Erro de leitura ou de validação da biblioteca de arte. A mensagem sempre diz
 * o arquivo e, quando há, o campo: é o que aparece na linha de comando.
 */
export class ErroDeArte extends Error {
  readonly arquivo: string;
  readonly campo: string | null;

  constructor(arquivo: string, mensagem: string, campo: string | null = null) {
    super(campo ? `${arquivo}: campo "${campo}": ${mensagem}` : `${arquivo}: ${mensagem}`);
    this.name = "ErroDeArte";
    this.arquivo = arquivo;
    this.campo = campo;
  }
}

/** Valida um dado lido de um arquivo; a falha vira `ErroDeArte` com o primeiro campo errado. */
export function validar<T>(esquema: z.ZodType<T>, dado: unknown, arquivo: string): T {
  const resultado = esquema.safeParse(dado);
  if (resultado.success) return resultado.data;
  const primeiro = resultado.error.issues[0];
  const campo = primeiro && primeiro.path.length > 0 ? primeiro.path.join(".") : null;
  const outros = resultado.error.issues.length - 1;
  const resto = outros > 0 ? ` (e mais ${outros} problema${outros > 1 ? "s" : ""})` : "";
  throw new ErroDeArte(arquivo, `${primeiro?.message ?? "formato inválido"}${resto}`, campo);
}

/** Lê JSON de um texto; o erro de sintaxe sai com o nome do arquivo. */
export function lerJson(texto: string, arquivo: string): unknown {
  try {
    return JSON.parse(texto) as unknown;
  } catch (erro) {
    throw new ErroDeArte(
      arquivo,
      `JSON inválido: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}
