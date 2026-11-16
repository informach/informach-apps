import { type CodigoDeErro, ehErroDoRecreio } from "@informach/recreio";

type NomeDaFalha =
  | "ErroDoRecreio"
  | "SyntaxError"
  | "TypeError"
  | "RangeError"
  | "ReferenceError"
  | "URIError"
  | "AggregateError"
  | "Error"
  | "desconhecido";

/** Nenhuma mensagem, causa, stack ou conversão de objeto desconhecido. */
export function resumoDaFalha(erro: unknown): {
  nome: NomeDaFalha;
  codigo: CodigoDeErro | "INTERNO";
} {
  if (ehErroDoRecreio(erro)) return { nome: "ErroDoRecreio", codigo: erro.codigo };
  const nome: NomeDaFalha =
    erro instanceof SyntaxError
      ? "SyntaxError"
      : erro instanceof TypeError
        ? "TypeError"
        : erro instanceof RangeError
          ? "RangeError"
          : erro instanceof ReferenceError
            ? "ReferenceError"
            : erro instanceof URIError
              ? "URIError"
              : erro instanceof AggregateError
                ? "AggregateError"
                : erro instanceof Error
                  ? "Error"
                  : "desconhecido";
  return { nome, codigo: "INTERNO" };
}
