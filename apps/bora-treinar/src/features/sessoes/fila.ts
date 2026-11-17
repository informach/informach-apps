"use client";
import Dexie, { type EntityTable } from "dexie";
import {
  type LegacyQueueCandidate,
  legacyQueueCandidateSchema,
  type TrainingContext,
} from "./context";
import type { GroupInput, SessionInput } from "./schema";

export type Envio = SessionInput | GroupInput;
export const ehGrupo = (e: Envio): e is GroupInput => "sessoes" in e;

export interface Pendente {
  id: string;
  payload: Envio;
  criadoEm: number;
  motivo?: string;
  // Absent only on v1–v3 rows, preserved until the server proves their original owner.
  actorId?: string;
  familyGroupId?: string;
}

export const RECUSA_DEFINITIVA = new Set(["INPUT", "EMPTY", "WORKOUT"]);
export const GUARDAR_NA_FILA = new Set([
  "UNEXPECTED",
  "PLAN",
  "PROFILE",
  "AUTH",
  "VERIFY",
  "ACCESS_DENIED",
]);

let banco: (Dexie & { pendentes: EntityTable<Pendente, "id"> }) | null = null;
function abrir() {
  if (!banco) {
    banco = new Dexie("bora-fila") as Dexie & { pendentes: EntityTable<Pendente, "id"> };
    banco.version(1).stores({ pendentes: "id, criadoEm" });
    banco.version(2).stores({ pendentes: "id, criadoEm" });
    banco.version(3).stores({ pendentes: "id, criadoEm" });
    // Do not attach old rows to whichever account happens to open this database first.
    banco.version(4).stores({ pendentes: "id, criadoEm, [actorId+familyGroupId]" });
  }
  return banco;
}

function pertence(item: Pendente, scope: TrainingContext) {
  return item.actorId === scope.actorId && item.familyGroupId === scope.familyGroupId;
}
function legado(item: Pendente) {
  return item.actorId === undefined && item.familyGroupId === undefined;
}

export async function guardarPendente(scope: TrainingContext, payload: Envio, motivo?: string) {
  const database = abrir();
  const id = ehGrupo(payload) ? payload.groupId : payload.id;
  await database.transaction("rw", database.pendentes, async () => {
    const previous = await database.pendentes.get(id);
    if (previous && !pertence(previous, scope))
      throw new Error("Este treino já está reservado a outra conta ou família neste aparelho.");
    await database.pendentes.put({
      id,
      payload,
      criadoEm: previous?.criadoEm ?? Date.now(),
      motivo,
      ...scope,
    });
  });
}

export function listarPendentes(scope: TrainingContext): Promise<Pendente[]> {
  return abrir()
    .pendentes.where("[actorId+familyGroupId]")
    .equals([scope.actorId, scope.familyGroupId])
    .sortBy("criadoEm");
}

export function contarPendentes(scope: TrainingContext) {
  return abrir()
    .pendentes.where("[actorId+familyGroupId]")
    .equals([scope.actorId, scope.familyGroupId])
    .count();
}

export async function descartarPendente(scope: TrainingContext, id: string) {
  const database = abrir();
  await database.transaction("rw", database.pendentes, async () => {
    const item = await database.pendentes.get(id);
    if (item && pertence(item, scope)) await database.pendentes.delete(id);
  });
}

type Enviar = (payload: Envio) => Promise<{ ok: boolean; code?: string }>;
export function destino(resultado: { ok: boolean; code?: string }): "sai" | "fica" {
  if (resultado.ok) return "sai";
  return RECUSA_DEFINITIVA.has(resultado.code ?? "") ? "sai" : "fica";
}

/** Network calls run outside IDB transactions; a response cannot resurrect a discarded row. */
export async function enviarPendentes(
  scope: TrainingContext,
  enviar: Enviar,
  shouldContinue = () => true,
) {
  let enviados = 0;
  const database = abrir();
  for (const item of await listarPendentes(scope)) {
    if (!shouldContinue()) break;
    const current = await database.pendentes.get(item.id);
    if (!current || !pertence(current, scope)) continue;
    let result: Awaited<ReturnType<Enviar>>;
    try {
      result = await enviar(current.payload);
    } catch {
      break; // Connection failure preserves this item and the rest of this context's queue.
    }
    await database.transaction("rw", database.pendentes, async () => {
      const latest = await database.pendentes.get(item.id);
      if (
        !latest ||
        !pertence(latest, scope) ||
        JSON.stringify(latest.payload) !== JSON.stringify(current.payload)
      )
        return;
      if (destino(result) === "sai") await database.pendentes.delete(item.id);
      else await database.pendentes.update(item.id, { motivo: result.code });
    });
    if (result.ok) enviados += 1;
  }
  return enviados;
}

/** Only profile identifiers leave the device while claiming historical queue rows. */
export async function recuperarPendentesLegados(
  scope: TrainingContext,
  authorize: (candidates: LegacyQueueCandidate[]) => Promise<readonly string[]>,
) {
  const database = abrir();
  const old = await database.pendentes.orderBy("criadoEm").filter(legado).toArray();
  const candidates = old.flatMap((item) => {
    const payload = item.payload;
    if (!payload || typeof payload !== "object") return [];
    const profileIds =
      "sessoes" in payload
        ? Array.isArray(payload.sessoes)
          ? payload.sessoes.map((session) => session?.profileId)
          : []
        : [payload.profileId];
    const parsed = legacyQueueCandidateSchema.safeParse({ id: item.id, profileIds });
    return parsed.success ? [parsed.data] : [];
  });
  let recovered = 0;
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const batch = candidates.slice(offset, offset + 100);
    const accepted = new Set(await authorize(batch));
    await database.transaction("rw", database.pendentes, async () => {
      for (const candidate of batch) {
        if (!accepted.has(candidate.id)) continue;
        const current = await database.pendentes.get(candidate.id);
        const original = old.find((item) => item.id === candidate.id);
        if (
          !current ||
          !legado(current) ||
          JSON.stringify(current.payload) !== JSON.stringify(original?.payload)
        )
          continue;
        await database.pendentes.update(candidate.id, { ...scope });
        recovered += 1;
      }
    });
  }
  return recovered;
}
