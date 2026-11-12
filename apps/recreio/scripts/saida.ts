import { ZodError } from "zod";
import { RecusaDeConcessao } from "./concessoes";

/**
 * Fim com erro dos scripts de concessão. Recusa de regra sai com a explicação
 * e código 1; argumento errado mostra o uso e sai com 2. Erro inesperado
 * mostra só o tipo: a mensagem de um erro de banco pode citar o e-mail.
 */
export function encerrarComErro(error: unknown, uso: string): never {
  if (error instanceof RecusaDeConcessao) {
    console.error(error.message);
    process.exit(1);
  }
  // `parseArgs` recusa opção desconhecida com um TypeError que traz `code`.
  if (error instanceof ZodError || (error instanceof TypeError && "code" in error)) {
    console.error(uso);
    process.exit(2);
  }
  console.error(
    `Nada foi gravado. Falha inesperada (${error instanceof Error ? error.name : "erro"}).`,
  );
  process.exit(3);
}
