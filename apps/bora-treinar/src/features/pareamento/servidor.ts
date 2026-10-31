import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type Redis from "ioredis";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { ALFABETO_CODIGO, TAMANHO_CODIGO } from "./protocolo";

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

interface Registro {
  userId: string;
  criadoEm: number;
  celular: boolean;
}

interface Barramento {
  get(chave: string): Promise<string | null>;
  set(chave: string, valor: string, ttlSegundos: number): Promise<void>;
  /** grava só se ainda não existir; devolve se gravou */
  setSeNovo(chave: string, valor: string, ttlSegundos: number): Promise<boolean>;
  incr(chave: string, ttlSegundos: number): Promise<number>;
  publicar(canal: string, mensagem: string): Promise<void>;
  assinar(canal: string, aoReceber: (mensagem: string) => void): () => void;
}

function barramentoRedis(cliente: Redis): Barramento {
  let assinante: Redis | null = null;
  const ouvintes = new Map<string, Set<(m: string) => void>>();
  const conectar = () => {
    if (assinante) return assinante;
    assinante = cliente.duplicate();
    assinante.on("message", (canal: string, mensagem: string) => {
      for (const fn of ouvintes.get(canal) ?? []) fn(mensagem);
    });
    return assinante;
  };
  return {
    get: (chave) => cliente.get(chave),
    async set(chave, valor, ttl) {
      await cliente.set(chave, valor, "EX", ttl);
    },
    async setSeNovo(chave, valor, ttl) {
      return (await cliente.set(chave, valor, "EX", ttl, "NX")) === "OK";
    },
    async incr(chave, ttl) {
      const n = await cliente.incr(chave);
      if (n === 1) await cliente.expire(chave, ttl);
      return n;
    },
    async publicar(canal, mensagem) {
      await cliente.publish(canal, mensagem);
    },
    assinar(canal, aoReceber) {
      const sub = conectar();
      let lista = ouvintes.get(canal);
      if (!lista) {
        lista = new Set();
        ouvintes.set(canal, lista);
        void sub.subscribe(canal);
      }
      lista.add(aoReceber);
      return () => {
        lista?.delete(aoReceber);
        if (lista && !lista.size) {
          ouvintes.delete(canal);
          void sub.unsubscribe(canal);
        }
      };
    },
  };
}

function barramentoMemoria(): Barramento {
  const valores = new Map<string, { valor: string; expira: number }>();
  const eventos = new EventEmitter();
  eventos.setMaxListeners(0);
  const ler = (chave: string) => {
    const item = valores.get(chave);
    if (!item || item.expira < Date.now()) return null;
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
    assinar(canal, aoReceber) {
      eventos.on(canal, aoReceber);
      return () => eventos.off(canal, aoReceber);
    },
  };
}

const globalBus = globalThis as unknown as { __boraPareamento?: Barramento };
export function barramento(): Barramento | null {
  if (globalBus.__boraPareamento) return globalBus.__boraPareamento;
  if (redis) globalBus.__boraPareamento = barramentoRedis(redis);
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
export const canal = (codigo: string, lado: Lado) => `${PREFIXO}${codigo}:para-${lado}`;

/** Cria um código novo para a TV de uma conta. Devolve null se a conta passou do limite. */
export async function criarPareamento(bus: Barramento, userId: string) {
  if ((await bus.incr(`${PREFIXO}criacoes:${userId}`, 3600)) > CRIACOES_POR_HORA) return null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    const registro: Registro = { userId, criadoEm: Date.now(), celular: false };
    if (await bus.setSeNovo(chave(codigo), JSON.stringify(registro), DURACAO_CANAL_S))
      return codigo;
  }
  throw new Error("Não foi possível gerar um código de pareamento");
}

async function registro(bus: Barramento, codigo: string): Promise<Registro | null> {
  const bruto = await bus.get(chave(codigo));
  return bruto ? (JSON.parse(bruto) as Registro) : null;
}

export async function tvDona(bus: Barramento, codigo: string, userId: string) {
  return (await registro(bus, codigo))?.userId === userId;
}

/**
 * O celular entra com o código: dentro da janela e uma única vez. Devolve o
 * dono do pareamento, para a auditoria, ou null.
 */
export async function entrarComCodigo(bus: Barramento, codigo: string, agora = Date.now()) {
  const r = await registro(bus, codigo);
  if (!r || r.celular || agora - r.criadoEm > JANELA_ENTRADA_MS) return null;
  const restante = Math.max(60, Math.round((r.criadoEm + DURACAO_CANAL_S * 1000 - agora) / 1000));
  await bus.set(chave(codigo), JSON.stringify({ ...r, celular: true }), restante);
  return r.userId;
}

const assinar = (dados: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`bora-pareamento:${dados}`)
    .digest("base64url");

/** Credencial do celular: vale só para aquele código e expira com o canal. */
export function emitirCredencial(codigo: string, agora = Date.now()) {
  const expira = agora + DURACAO_CANAL_S * 1000;
  return `${codigo}.${expira}.${assinar(`${codigo}.${expira}`)}`;
}

export function lerCredencial(valor: string | undefined, agora = Date.now()) {
  if (!valor) return null;
  const [codigo, expira, assinatura] = valor.split(".");
  if (!codigo || !expira || !assinatura || Number(expira) < agora) return null;
  const esperado = Buffer.from(assinar(`${codigo}.${expira}`));
  const recebido = Buffer.from(assinatura);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? codigo : null;
}

export const ultimoEstado = (codigo: string) => `${PREFIXO}${codigo}:estado`;

/** Resposta SSE com batimento a cada 15 s; fecha a assinatura quando o cliente sai. */
export function streamSse(
  bus: Barramento,
  canalAssinado: string,
  inicial: string | null,
  sinal: AbortSignal,
) {
  const codificador = new TextEncoder();
  let encerrar: () => void = () => {};
  const corpo = new ReadableStream<Uint8Array>({
    start(controle) {
      const enviar = (texto: string) => {
        try {
          controle.enqueue(codificador.encode(texto));
        } catch {
          encerrar();
        }
      };
      enviar("retry: 3000\n\n");
      if (inicial) enviar(`data: ${inicial}\n\n`);
      const desassinar = bus.assinar(canalAssinado, (m) => enviar(`data: ${m}\n\n`));
      const batimento = setInterval(() => enviar(": ping\n\n"), 15_000);
      encerrar = () => {
        clearInterval(batimento);
        desassinar();
        try {
          controle.close();
        } catch {
          // já fechado
        }
      };
      sinal.addEventListener("abort", () => encerrar(), { once: true });
    },
    cancel() {
      encerrar();
    },
  });
  return new Response(corpo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
