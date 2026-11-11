import { resumoDoTexto } from "./sorteio";

/**
 * Forma canônica do estado: JSON com as chaves em ordem. Dois estados iguais
 * dão o mesmo texto, não importa a ordem em que os campos foram criados.
 */
export function canonico(valor: unknown): string {
  if (valor === null) return "null";
  switch (typeof valor) {
    case "number":
      if (!Number.isInteger(valor)) throw new Error(`Número não inteiro no estado: ${valor}`);
      return String(valor);
    case "boolean":
      return valor ? "true" : "false";
    case "string":
      return JSON.stringify(valor);
    case "object": {
      if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
      const objeto = valor as Record<string, unknown>;
      const partes: string[] = [];
      for (const chave of Object.keys(objeto).sort()) {
        const item = objeto[chave];
        if (item === undefined) continue;
        partes.push(`${JSON.stringify(chave)}:${canonico(item)}`);
      }
      return `{${partes.join(",")}}`;
    }
    default:
      throw new Error(`Valor fora do estado: ${typeof valor}`);
  }
}

/** Resumo de 64 bits, em hexadecimal, para comparar estados. Não é criptográfico. */
export function resumo(texto: string): string {
  const alto = resumoDoTexto(texto, 0x9e3779b9).toString(16).padStart(8, "0");
  const baixo = resumoDoTexto(texto, 0x85ebca6b).toString(16).padStart(8, "0");
  return alto + baixo;
}

export function resumoDe(valor: unknown): string {
  return resumo(canonico(valor));
}

/** Cópia profunda de dados puros. */
export function copiar<T>(valor: T): T {
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(copiar) as T;
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(valor as Record<string, unknown>)) {
    const item = (valor as Record<string, unknown>)[chave];
    if (item !== undefined) saida[chave] = copiar(item);
  }
  return saida as T;
}
