import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { mayUsePairing } from "./authorization";
import { type PairingAuthority, pairingAuthoritySchema } from "./context";
import { ALFABETO_CODIGO, codigoSchema, TAMANHO_CODIGO } from "./protocolo";
import { type PairingBus as Barramento, createRedisPairingBus } from "./redis-bus";

/**
 * Pareamento TV ↔ celular. O código vale 10 minutos para o celular entrar e é
 * de uso único; depois disso a conversa segue por um canal de 3 horas. As
 * mensagens são pequenas (eventos de contagem), passam pelo Redis (pub/sub)
 * e chegam a cada lado por SSE. Sem Redis, só em desenvolvimento, um
 * barramento em memória faz o mesmo papel numa instância única.
 */
const PREFIXO = "bora-treinar:par:";
export const JANELA_ENTRADA_MS = 10 * 60_000;
export const DURACAO_CANAL_S = 3 * 3600;
const CRIACOES_POR_HORA = 20;

export type Lado = "tv" | "celular";

const registroSchema = pairingAuthoritySchema.extend({
  version: z.literal(3),
  id: z.uuid(),
  criadoEm: z.number().int().positive(),
  celular: z.boolean(),
});
type Registro = z.infer<typeof registroSchema>;

function barramentoMemoria(): Barramento {
  const valores = new Map<string, { valor: string; expira: number }>();
  const eventos = new EventEmitter();
  eventos.setMaxListeners(0);
  const ler = (chave: string) => {
    const item = valores.get(chave);
    if (!item || item.expira <= Date.now()) {
      valores.delete(chave);
      return null;
    }
    return item.valor;
  };
  return {
    get: async (chave) => ler(chave),
    async set(chave, valor, ttl) {
      valores.set(chave, { valor, expira: Date.now() + ttl * 1000 });
    },
    async setSeNovo(chave, valor, ttl) {
      if (ler(chave) !== null) return false;
      valores.set(chave, { valor, expira: Date.now() + ttl * 1000 });
      return true;
    },
    async incr(chave, ttl) {
      const n = Number(ler(chave) ?? 0) + 1;
      valores.set(chave, {
        valor: String(n),
        expira: valores.get(chave)?.expira ?? Date.now() + ttl * 1000,
      });
      return n;
    },
    async publicar(canal, mensagem) {
      eventos.emit(canal, mensagem);
    },
    async assinar(canal, aoReceber) {
      eventos.on(canal, aoReceber);
      return async () => {
        eventos.off(canal, aoReceber);
      };
    },
  };
}

const globalBus = globalThis as unknown as { __boraPareamento?: Barramento };
export function barramento(): Barramento | null {
  if (globalBus.__boraPareamento) return globalBus.__boraPareamento;
  if (redis) globalBus.__boraPareamento = createRedisPairingBus(redis);
  else if (env.NODE_ENV !== "production") globalBus.__boraPareamento = barramentoMemoria();
  return globalBus.__boraPareamento ?? null;
}

export function gerarCodigo() {
  return Array.from(
    { length: TAMANHO_CODIGO },
    () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)],
  ).join("");
}

const chave = (codigo: string) => `${PREFIXO}${codigo}`;
export const canal = (codigo: string, id: string, lado: Lado) =>
  `${PREFIXO}${codigo}:${id}:para-${lado}`;

/** The route proves authority before allocation; the saved generation binds every later operation. */
export async function criarPareamento(bus: Barramento, authority: PairingAuthority) {
  const scope = pairingAuthoritySchema.parse(authority);
  if ((await bus.incr(`${PREFIXO}criacoes:${scope.actorId}`, 3600)) > CRIACOES_POR_HORA)
    return null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    const registro: Registro = {
      ...scope,
      version: 3,
      id: randomUUID(),
      criadoEm: Date.now(),
      celular: false,
    };
    if (await bus.setSeNovo(chave(codigo), JSON.stringify(registro), DURACAO_CANAL_S))
      return { codigo, ...registro };
  }
  throw new Error("Não foi possível gerar um código de pareamento");
}

async function registro(bus: Barramento, codigo: string): Promise<Registro | null> {
  if (!codigoSchema.safeParse(codigo).success) return null;
  const bruto = await bus.get(chave(codigo));
  if (!bruto) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(bruto);
  } catch {
    return null;
  }
  const parsed = registroSchema.safeParse(decoded);
  if (
    !parsed.success ||
    parsed.data.criadoEm > Date.now() ||
    parsed.data.criadoEm + DURACAO_CANAL_S * 1000 <= Date.now()
  )
    return null;
  return parsed.data;
}

/** Channels without delegated grant identities cannot survive the identity cutover; generation prevents code reuse. */
export async function canalAutorizado(bus: Barramento, codigo: string, registroId?: string) {
  const current = await registro(bus, codigo);
  if (!current || (registroId && current.id !== registroId)) return null;
  return (await mayUsePairing(current)) ? current : null;
}

export async function tvDona(
  bus: Barramento,
  codigo: string,
  id: string,
  actorId: string,
  sessionId: string,
) {
  const current = await registro(bus, codigo);
  if (
    !current ||
    current.id !== id ||
    current.actorId !== actorId ||
    current.sessionId !== sessionId
  )
    return null;
  return (await mayUsePairing(current)) ? current : null;
}

/** Exactly one phone claims a generation, even when multiple requests pass the initial read. */
export async function entrarComCodigo(bus: Barramento, codigo: string) {
  const r = await canalAutorizado(bus, codigo);
  const agora = Date.now();
  if (!r || r.celular || agora - r.criadoEm >= JANELA_ENTRADA_MS) return null;
  const restante = Math.ceil((r.criadoEm + DURACAO_CANAL_S * 1000 - agora) / 1000);
  if (!(await bus.setSeNovo(`${chave(codigo)}:${r.id}:claimed`, "1", restante))) return null;
  await bus.set(chave(codigo), JSON.stringify({ ...r, celular: true }), restante);
  return { ...r, celular: true };
}

const assinar = (dados: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`bora-pareamento:${dados}`)
    .digest("base64url");

/** The phone credential expires with the original channel, never three hours after a later join. */
export function emitirCredencial(codigo: string, registroId: string, expiresAt: number) {
  codigoSchema.parse(codigo);
  z.uuid().parse(registroId);
  z.number().int().positive().parse(expiresAt);
  const data = `${codigo}.${registroId}.${expiresAt}`;
  return `${data}.${assinar(data)}`;
}

export function lerCredencial(valor: string | undefined, agora = Date.now()) {
  if (!valor || valor.length > 250) return null;
  const [codigo, registroId, expira, assinatura, extra] = valor.split(".");
  const parsed = z
    .object({ codigo: codigoSchema, registroId: z.uuid() })
    .safeParse({ codigo, registroId });
  if (
    extra !== undefined ||
    !parsed.success ||
    !expira ||
    !/^\d{13}$/.test(expira) ||
    Number(expira) <= agora ||
    !assinatura
  )
    return null;
  const esperado = Buffer.from(assinar(`${codigo}.${registroId}.${expira}`));
  const recebido = Buffer.from(assinatura);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
    ? parsed.data
    : null;
}

export const ultimoEstado = (codigo: string, id: string) => `${PREFIXO}${codigo}:${id}:estado`;

/** Authorization precedes every delivery and heartbeat; bounded queues close on backpressure. */
export function streamSse(
  bus: Barramento,
  canalAssinado: string,
  inicial: string | null | (() => Promise<string | null>),
  sinal: AbortSignal,
  authorize: () => Promise<boolean>,
) {
  const codificador = new TextEncoder();
  let encerrar: () => void = () => {};
  const corpo = new ReadableStream<Uint8Array>(
    {
      async start(controle) {
        let closed = false;
        let desassinar: (() => Promise<void>) | undefined;
        let batimento: ReturnType<typeof setInterval> | undefined;
        let pending = 0;
        let sequence = Promise.resolve();
        const entregar = (texto: string) => {
          if (closed) return;
          if (pending >= 32) {
            encerrar();
            return;
          }
          pending++;
          sequence = sequence.then(async () => {
            try {
              if (closed) return;
              if (!(await authorize()) || (controle.desiredSize ?? 0) <= 0) {
                encerrar();
                return;
              }
              if (!closed) controle.enqueue(codificador.encode(texto));
            } catch {
              encerrar();
            } finally {
              pending--;
            }
          });
        };
        const onAbort = () => encerrar();
        encerrar = () => {
          if (closed) return;
          closed = true;
          if (batimento) clearInterval(batimento);
          if (desassinar) void desassinar().catch(() => logger.error("pairing.unsubscribe_failed"));
          sinal.removeEventListener("abort", onAbort);
          try {
            controle.close();
          } catch {
            /* The consumer can have canceled concurrently. */
          }
        };
        sinal.addEventListener("abort", onAbort, { once: true });
        if (sinal.aborted) {
          encerrar();
          return;
        }
        try {
          desassinar = await bus.assinar(
            canalAssinado,
            (m) => entregar(`data: ${m}\n\n`),
            encerrar,
          );
          if (closed) {
            await desassinar();
            return;
          }
          // Redis has acknowledged the subscription before the first response bytes.
          entregar("retry: 3000\n\n");
          const first = typeof inicial === "function" ? await inicial() : inicial;
          if (first) entregar(`data: ${first}\n\n`);
          if (!closed) batimento = setInterval(() => entregar(": ping\n\n"), 15_000);
        } catch {
          encerrar();
        }
      },
      cancel() {
        encerrar();
      },
    },
    { highWaterMark: 32 },
  );
  return new Response(corpo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
