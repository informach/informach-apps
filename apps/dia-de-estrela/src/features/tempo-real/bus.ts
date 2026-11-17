import "server-only";
import { EventEmitter } from "node:events";
import type Redis from "ioredis";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

/**
 * Avisos "algo mudou" entre o tablet da criança e o celular dos pais. A
 * mensagem não carrega dado nenhum da família: só o tipo de mudança, e cada
 * tela busca de novo o que é dela, pelo servidor, com a própria autorização.
 *
 * Em produção passa pelo Redis (pub/sub), para valer entre instâncias. Sem
 * Redis, só fora de produção, um barramento em memória faz o mesmo papel.
 */
export type Mudanca =
  | "rotina"
  | "conclusao"
  | "lembrete"
  | "alerta"
  | "estrelas"
  | "loja"
  | "ajustes"
  | "aparelhos";

type Barramento = {
  publicar(canal: string, mensagem: string): Promise<void>;
  assinar(canal: string, aoReceber: (mensagem: string) => void): () => void;
};

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
      const minha = lista;
      let saiu = false;
      return () => {
        // Idempotente e preso ao próprio conjunto: sair duas vezes (cancel e
        // abort) não pode derrubar a assinatura nova de uma tela recarregada.
        if (saiu) return;
        saiu = true;
        minha.delete(aoReceber);
        if (!minha.size && ouvintes.get(canal) === minha) {
          ouvintes.delete(canal);
          void sub.unsubscribe(canal);
        }
      };
    },
  };
}

function barramentoMemoria(): Barramento {
  const eventos = new EventEmitter();
  eventos.setMaxListeners(0);
  return {
    async publicar(canal, mensagem) {
      eventos.emit(canal, mensagem);
    },
    assinar(canal, aoReceber) {
      eventos.on(canal, aoReceber);
      return () => eventos.off(canal, aoReceber);
    },
  };
}

const global = globalThis as unknown as { __estrelaBus?: Barramento };
function barramento(): Barramento | null {
  if (global.__estrelaBus) return global.__estrelaBus;
  if (redis) global.__estrelaBus = barramentoRedis(redis);
  else if (env.NODE_ENV !== "production") global.__estrelaBus = barramentoMemoria();
  return global.__estrelaBus ?? null;
}

const canalDa = (familyGroupId: string) => `dia-de-estrela:familia:${familyGroupId}`;

/** Avisa as telas abertas da família. Nunca derruba a operação que já foi gravada. */
export async function avisarFamilia(familyGroupId: string, mudanca: Mudanca) {
  try {
    await barramento()?.publicar(canalDa(familyGroupId), mudanca);
  } catch {
    // As telas também se atualizam sozinhas de tempos em tempos.
  }
}

/** Rechecks live session/delegation before every signal and heartbeat. */
export function fluxoDaFamilia(
  familyGroupId: string,
  sinal: AbortSignal,
  authorized: () => Promise<boolean>,
) {
  const bus = barramento();
  if (!bus) return new Response("Indisponível", { status: 503 });
  const encoder = new TextEncoder();
  let close: () => void = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let checking = false;
      let unsubscribe: () => void = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      const abort = () => close();
      close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (lifetime) clearTimeout(lifetime);
        unsubscribe();
        sinal.removeEventListener("abort", abort);
        try {
          controller.close();
        } catch {
          /* Client already closed. */
        }
      };
      const send = async (text: string) => {
        // All signals cause a refresh; coalesce while authorization is in flight.
        if (closed || checking) return;
        checking = true;
        try {
          if (!(await authorized())) {
            close();
            return;
          }
          if (!closed) controller.enqueue(encoder.encode(text));
        } catch {
          close();
        } finally {
          checking = false;
        }
      };
      sinal.addEventListener("abort", abort, { once: true });
      if (sinal.aborted) {
        close();
        return;
      }
      unsubscribe = bus.assinar(canalDa(familyGroupId), (message) => {
        void send(`data: ${message}\n\n`);
      });
      heartbeat = setInterval(() => {
        void send(": ping\n\n");
      }, 15_000);
      lifetime = setTimeout(close, 5 * 60_000);
      void send("retry: 5000\n\n");
    },
    cancel() {
      close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
