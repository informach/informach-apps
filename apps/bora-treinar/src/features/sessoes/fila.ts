"use client";
import Dexie, { type EntityTable } from "dexie";
import type { SessionInput } from "./schema";

/**
 * Treinos concluídos sem rede esperam aqui até poderem ser salvos. Só o que o
 * player mandaria ao servidor fica no aparelho, e cada item sai da fila assim
 * que o servidor confirma (ou recusa de vez).
 */
interface Pendente {
  id: string;
  payload: SessionInput;
  criadoEm: number;
}

let banco: (Dexie & { pendentes: EntityTable<Pendente, "id"> }) | null = null;
function abrir() {
  if (!banco) {
    banco = new Dexie("bora-fila") as Dexie & { pendentes: EntityTable<Pendente, "id"> };
    banco.version(1).stores({ pendentes: "id, criadoEm" });
  }
  return banco;
}

export async function guardarPendente(payload: SessionInput) {
  await abrir().pendentes.put({ id: payload.id, payload, criadoEm: Date.now() });
}

export async function contarPendentes() {
  try {
    return await abrir().pendentes.count();
  } catch {
    return 0;
  }
}

type Envio = (payload: SessionInput) => Promise<{ ok: boolean; code?: string }>;

/**
 * Reenvia a fila. Falha de rede deixa o item para a próxima vez; recusa do
 * servidor (perfil apagado, plano mudou) tira o item, porque repetir não muda
 * a resposta.
 */
export async function enviarPendentes(enviar: Envio) {
  let enviados = 0;
  let pendentes: Pendente[];
  try {
    pendentes = await abrir().pendentes.orderBy("criadoEm").toArray();
  } catch {
    return 0;
  }
  for (const item of pendentes) {
    try {
      const result = await enviar(item.payload);
      if (result.ok || result.code !== "UNEXPECTED") await abrir().pendentes.delete(item.id);
      if (result.ok) enviados += 1;
    } catch {
      break;
    }
  }
  return enviados;
}
