"use client";
import Dexie, { type EntityTable } from "dexie";
import type { GroupInput, SessionInput } from "./schema";

/**
 * Treinos concluídos sem rede (ou recusados por um motivo que pode mudar) esperam aqui até
 * poderem ser salvos. Só o que o player mandaria ao servidor fica no aparelho, e cada item sai
 * da fila quando o servidor confirma, quando a recusa é sobre o conteúdo (repetir não muda a
 * resposta) ou quando a pessoa descarta.
 */
/** Um treino, ou um treino em grupo (que só vale inteiro: um item só na fila). */
export type Envio = SessionInput | GroupInput;
export const ehGrupo = (e: Envio): e is GroupInput => "sessoes" in e;

export interface Pendente {
  id: string;
  payload: Envio;
  criadoEm: number;
  /** a última recusa do servidor, para dizer o que fazer; vazio = só faltou rede */
  motivo?: string;
}

/**
 * Recusas sobre o próprio treino: reenviar não muda a resposta, então o item sai da fila.
 * Plano, perfil, login e e-mail podem mudar (o pagamento volta, a pessoa entra de novo), e por
 * isso esses treinos ficam guardados: apagá-los perdia de vez um treino feito.
 */
export const RECUSA_DEFINITIVA = new Set(["INPUT", "EMPTY", "WORKOUT"]);

/** Códigos que o player guarda na fila em vez de só mostrar o erro. */
export const GUARDAR_NA_FILA = new Set(["UNEXPECTED", "PLAN", "PROFILE", "AUTH", "VERIFY"]);

let banco: (Dexie & { pendentes: EntityTable<Pendente, "id"> }) | null = null;
function abrir() {
  if (!banco) {
    banco = new Dexie("bora-fila") as Dexie & { pendentes: EntityTable<Pendente, "id"> };
    banco.version(1).stores({ pendentes: "id, criadoEm" });
    // v2: o motivo da última recusa (campo não indexado; a versão marca a mudança de formato)
    banco.version(2).stores({ pendentes: "id, criadoEm" });
    // v3: o item pode ser um grupo (treinar junto), com o id do grupo
    banco.version(3).stores({ pendentes: "id, criadoEm" });
  }
  return banco;
}

export async function guardarPendente(payload: Envio, motivo?: string) {
  const id = ehGrupo(payload) ? payload.groupId : payload.id;
  await abrir().pendentes.put({ id, payload, criadoEm: Date.now(), motivo });
}

export async function listarPendentes(): Promise<Pendente[]> {
  try {
    return await abrir().pendentes.orderBy("criadoEm").toArray();
  } catch {
    return [];
  }
}

export async function contarPendentes() {
  try {
    return await abrir().pendentes.count();
  } catch {
    return 0;
  }
}

export async function descartarPendente(id: string) {
  try {
    await abrir().pendentes.delete(id);
  } catch {
    // nada a fazer
  }
}

type Enviar = (payload: Envio) => Promise<{ ok: boolean; code?: string }>;

/** O que fazer com o item depois da resposta do servidor. Pura, para ser testada. */
export function destino(resultado: { ok: boolean; code?: string }): "sai" | "fica" {
  if (resultado.ok) return "sai";
  return RECUSA_DEFINITIVA.has(resultado.code ?? "") ? "sai" : "fica";
}

/**
 * Reenvia a fila. Falha de rede para no primeiro item e deixa tudo para a próxima vez; recusa
 * definitiva tira o item; recusa que pode mudar (plano, perfil, login) guarda o motivo.
 */
export async function enviarPendentes(enviar: Enviar) {
  let enviados = 0;
  const pendentes = await listarPendentes();
  for (const item of pendentes) {
    try {
      const result = await enviar(item.payload);
      if (destino(result) === "sai") await abrir().pendentes.delete(item.id);
      else await abrir().pendentes.put({ ...item, motivo: result.code });
      if (result.ok) enviados += 1;
    } catch {
      break;
    }
  }
  return enviados;
}
