"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { relogioDa } from "@/domain/relogio";
import {
  approveCompletion,
  completeTask,
  giveBonus,
  undoCompletion,
} from "@/features/estrelas/repository";
import { getFamily } from "@/features/familia/repository";
import { nudge, snooze } from "@/features/lembretes/repository";
import { resolveRedemption } from "@/features/loja/repository";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { parentActor, runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";

const ids = z.object({ childId: z.string().uuid(), taskId: z.string().uuid() });

async function hojeDa(ownerId: string) {
  const family = await getFamily(ownerId);
  assertAllowed(family, "NOT_FOUND", "Família não encontrada.");
  return relogioDa(Date.now(), family.timezone);
}

function atualizar() {
  revalidatePath("/", "layout");
}

export async function aprovarAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const actor = await parentActor();
    await approveCompletion(actor.ownerId, id);
    await avisarFamilia(actor.ownerId, "estrelas");
    atualizar();
  });
}

/** "Não foi feita" para a pendente, ou "Desfazer" para a aprovada: sem linha de castigo. */
export async function desfazerAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const actor = await parentActor();
    const c = await undoCompletion(actor.ownerId, id);
    audit({
      eventType: "estrela.completion_undone",
      actorId: actor.actorId,
      payload: { childId: c.childId, completionId: c.id, via: actor.via },
    });
    await avisarFamilia(actor.ownerId, "conclusao");
    atualizar();
  });
}

/** Os pais marcam pela criança ("Já fez"): entra aprovada. */
export async function marcarPelaCriancaAction(raw: unknown) {
  return runAction(async () => {
    const { childId, taskId } = ids.parse(raw);
    const actor = await parentActor();
    const hoje = await hojeDa(actor.ownerId);
    await completeTask({
      ownerId: actor.ownerId,
      childId,
      taskId,
      date: hoje.data,
      diaDaSemana: hoje.diaDaSemana,
      markedBy: "adult",
    });
    await avisarFamilia(actor.ownerId, "conclusao");
    atualizar();
  });
}

export async function lembrarAgoraAction(raw: unknown) {
  return runAction(async () => {
    const { childId, taskId } = ids.parse(raw);
    const actor = await parentActor();
    await nudge(actor.ownerId, childId, taskId, (await hojeDa(actor.ownerId)).data);
    await avisarFamilia(actor.ownerId, "lembrete");
    atualizar();
  });
}

export async function adiarAction(raw: unknown) {
  return runAction(async () => {
    const { childId, taskId } = ids.parse(raw);
    const actor = await parentActor();
    await snooze(actor.ownerId, childId, taskId, (await hojeDa(actor.ownerId)).data, 15);
    await avisarFamilia(actor.ownerId, "lembrete");
    atualizar();
  });
}

export async function darBonusAction(raw: unknown) {
  return runAction(async () => {
    const { childId, stars, reason } = z
      .object({
        childId: z.string().uuid(),
        stars: z.number().int().min(1).max(50),
        reason: z.string().trim().max(60).default(""),
      })
      .parse(raw);
    const actor = await parentActor();
    await giveBonus(actor.ownerId, childId, stars, `Bônus: ${reason || "mandou bem!"}`);
    audit({
      eventType: "estrela.bonus_given",
      actorId: actor.actorId,
      payload: { childId, stars, via: actor.via },
    });
    await avisarFamilia(actor.ownerId, "estrelas");
    atualizar();
  });
}

export async function resolverPedidoAction(raw: unknown) {
  return runAction(async () => {
    const { id, outcome } = z
      .object({ id: z.string().uuid(), outcome: z.enum(["delivered", "declined"]) })
      .parse(raw);
    const actor = await parentActor();
    const r = await resolveRedemption(actor.ownerId, id, outcome);
    audit({
      eventType: "estrela.redemption_resolved",
      actorId: actor.actorId,
      payload: { redemptionId: r.id, childId: r.childId, outcome, via: actor.via },
    });
    await avisarFamilia(actor.ownerId, "loja");
    atualizar();
  });
}
