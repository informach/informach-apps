import type { z } from "zod";
import { type RespostaDeErro, RespostaDeErroSchema } from "../contrato/sdk";
import { CODIGOS_DE_ERRO, type CodigoDeErro, ErroDoRecreio } from "../dominio/erros";

/**
 * O que o SDK e o cliente das instâncias têm em comum ao falar com o Recreio:
 * toda recusa vira `ErroDoRecreio` com o código que o servidor mandou, e o que
 * não dá para entender (rede, 5xx, resposta fora do contrato) vira
 * `INDISPONIVEL`, que quem chama pode tentar de novo.
 */

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

function ehCodigo(codigo: string): codigo is CodigoDeErro {
  return (CODIGOS_DE_ERRO as readonly string[]).includes(codigo);
}

/** A recusa que o servidor mandou, ou `null` se a resposta não for uma recusa do contrato. */
async function lerRecusa(resposta: Response): Promise<RespostaDeErro | null> {
  try {
    const corpo = RespostaDeErroSchema.safeParse(await resposta.json());
    return corpo.success ? corpo.data : null;
  } catch {
    return null;
  }
}

/** Transforma uma resposta que não deu certo no erro que quem chama recebe. */
export async function erroDaResposta(resposta: Response): Promise<ErroDoRecreio> {
  const recusa = await lerRecusa(resposta);
  // Um 5xx com código do contrato (`SEM_INSTANCIA`) continua sendo a recusa do
  // servidor; sem código conhecido, não há o que interpretar.
  if (!recusa || !ehCodigo(recusa.codigo)) return new ErroDoRecreio("INDISPONIVEL");
  return new ErroDoRecreio(recusa.codigo, detalheDa(recusa));
}

function detalheDa(recusa: RespostaDeErro): Record<string, string | number | boolean | null> {
  return {
    ...recusa.detalhe,
    ...(recusa.estado === undefined ? {} : { estado: recusa.estado }),
    ...(recusa.motivo === undefined ? {} : { motivo: recusa.motivo }),
  };
}

/** Faz o pedido; falha de rede e tempo esgotado viram `INDISPONIVEL`. */
export async function pedir(buscar: Buscar, url: string, init: RequestInit): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await buscar(url, init);
  } catch {
    throw new ErroDoRecreio("INDISPONIVEL");
  }
  if (!resposta.ok) throw await erroDaResposta(resposta);
  return resposta;
}

/** Lê o corpo JSON de uma resposta que deu certo e confere contra o contrato. */
export async function lerCorpo<T>(
  resposta: Response,
  esquema: z.ZodType<T>,
  maxBytes?: number,
): Promise<T> {
  let corpo: unknown;
  try {
    if (maxBytes === undefined) corpo = await resposta.json();
    else {
      const leitor = resposta.body?.getReader();
      if (!leitor) throw new ErroDoRecreio("INDISPONIVEL");
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      let terminou = false;
      try {
        for (;;) {
          const parte = await leitor.read();
          if (parte.done) {
            terminou = true;
            break;
          }
          tamanho += parte.value.length;
          if (tamanho > maxBytes) throw new ErroDoRecreio("INDISPONIVEL");
          partes.push(parte.value);
        }
        const bytes = new Uint8Array(tamanho);
        let posicao = 0;
        for (const parte of partes) {
          bytes.set(parte, posicao);
          posicao += parte.length;
        }
        corpo = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } finally {
        try {
          if (!terminou) await leitor.cancel();
        } finally {
          leitor.releaseLock();
        }
      }
    }
  } catch {
    throw new ErroDoRecreio("INDISPONIVEL");
  }
  const lido = esquema.safeParse(corpo);
  if (!lido.success) throw new ErroDoRecreio("INDISPONIVEL");
  return lido.data;
}

/** `https://recreio.example/` e `https://recreio.example` dão o mesmo endereço base. */
export function semBarraFinal(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
