import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ErroDoRecreio, ehErroDoRecreio } from "@informach/recreio";
import { ESTADOS_DE_ACESSO_LISTA, type RespostaDeErro } from "@informach/recreio/contrato";
import { ZodError, type z } from "zod";
import { env } from "./env";
import { reportError } from "./observability";

/**
 * O que as rotas JSON do Recreio têm em comum: corpo com teto de tamanho,
 * entrada conferida contra o contrato e toda recusa respondida como
 * `{ codigo, estado?, motivo?, detalhe? }`, com o status de `statusDoErro`.
 */

const SEM_CACHE = { "Cache-Control": "no-store" };

/** Compara dois segredos sem deixar o tempo da resposta dizer onde diferem. */
export function segredoConfere(fornecido: string, esperado: string): boolean {
  const a = Buffer.from(fornecido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Só o agendador, com `CRON_SECRET`, chama `/api/jobs/*`. Sem o segredo configurado, ninguém chama. */
export function authorizedJob(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  return segredoConfere(request.headers.get("authorization") ?? "", `Bearer ${env.CRON_SECRET}`);
}

/** O token de `Authorization: Bearer`, ou `null`. */
export function tokenDoPedido(request: Request): string | null {
  const [esquema, token, ...resto] = (request.headers.get("authorization") ?? "").split(" ");
  if (esquema !== "Bearer" || !token || resto.length > 0) return null;
  return token;
}

/** Rota autenticada por cookie só atende o próprio portal. */
export function mesmaOrigem(request: Request): boolean {
  return request.headers.get("origin") === new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

/**
 * Lê o corpo até `limite` bytes. Devolve `null` se passar: quem chama decide
 * a recusa. Nunca guarda mais do que o teto na memória.
 */
export async function boundedBytes(request: Request, limite: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length")) > limite) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  try {
    while (true) {
      const parte = await reader.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > limite) {
        await reader.cancel();
        return null;
      }
      partes.push(parte.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(partes);
}

/** Corpo JSON conferido contra o esquema. Grande demais, ilegível ou fora do contrato: recusa. */
export async function corpoJson<T>(
  request: Request,
  esquema: z.ZodType<T>,
  limite = 16_384,
): Promise<T> {
  const bytes = await boundedBytes(request, limite);
  if (bytes === null) throw new ErroDoRecreio("TAMANHO_EXCEDIDO");
  let lido: unknown;
  try {
    lido = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new ErroDoRecreio("ENTRADA_INVALIDA");
  }
  return esquema.parse(lido);
}

/** Inteiro não negativo de um parâmetro da consulta; qualquer outra coisa é `undefined`. */
export function inteiroDaConsulta(valor: string | null): number | undefined {
  if (valor === null || !/^\d{1,15}$/.test(valor)) return undefined;
  return Number(valor);
}

function corpoDaRecusa(erro: ErroDoRecreio): RespostaDeErro {
  const { estado, motivo, ...detalhe } = erro.detalhe;
  const estadoDeAcesso = ESTADOS_DE_ACESSO_LISTA.find((item) => item === estado);
  return {
    codigo: erro.codigo,
    ...(estadoDeAcesso === undefined ? {} : { estado: estadoDeAcesso }),
    ...(typeof motivo === "string" ? { motivo } : {}),
    ...(Object.keys(detalhe).length > 0 ? { detalhe } : {}),
  };
}

export function json(corpo: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
  return Response.json(corpo, {
    status: init.status ?? 200,
    headers: { ...SEM_CACHE, ...init.headers },
  });
}

/**
 * A resposta de uma recusa. `ErroDoRecreio` vai com o próprio código; entrada
 * fora do contrato vira `ENTRADA_INVALIDA` sem dizer qual campo; o resto é
 * registrado e respondido como `INDISPONIVEL`, sem detalhe.
 */
export function respostaDeErro(erro: unknown): Response {
  if (ehErroDoRecreio(erro)) return json(corpoDaRecusa(erro), { status: erro.status });
  if (erro instanceof ZodError) return json({ codigo: "ENTRADA_INVALIDA" }, { status: 400 });
  reportError(erro, crypto.randomUUID());
  return json({ codigo: "INDISPONIVEL" }, { status: 503 });
}

/** Envolve o corpo de uma rota: o que ela lançar vira a resposta de recusa. */
export async function responder(operacao: () => Promise<Response>): Promise<Response> {
  try {
    return await operacao();
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
