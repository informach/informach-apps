import { z } from "zod";

export const LIMITES_DA_COPIA_PESSOAL = {
  bytes: 32 * 1024 * 1024,
  registros: 100_000,
  jogos: 256,
  pagina: 100,
};

/** Acumulador delimitado de NDJSON. Excesso é falha explícita, jamais um
 * download parcial anunciado como completo. Não recebe metadados de acesso. */
export function criarArquivoPessoal() {
  const partes: Buffer[] = [];
  let bytes = 0,
    registros = 0,
    encerrado = false;
  const secao = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
  return {
    adicionar(tipo: string, dados: unknown) {
      if (encerrado) throw new Error("Personal copy closed");
      const linha = Buffer.from(`${JSON.stringify({ tipo: secao.parse(tipo), dados })}\n`, "utf8");
      if (
        ++registros > LIMITES_DA_COPIA_PESSOAL.registros ||
        bytes + linha.length > LIMITES_DA_COPIA_PESSOAL.bytes
      ) {
        linha.fill(0);
        throw new Error("Personal copy limit exceeded");
      }
      bytes += linha.length;
      partes.push(linha);
    },
    concluir() {
      if (encerrado) throw new Error("Personal copy closed");
      encerrado = true;
      try {
        return Buffer.concat(partes, bytes);
      } finally {
        for (const parte of partes) parte.fill(0);
        partes.length = 0;
      }
    },
    encerrar() {
      encerrado = true;
      for (const parte of partes) parte.fill(0);
      partes.length = 0;
    },
  };
}
