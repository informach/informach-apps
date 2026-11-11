"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  approveCompletion,
  completeTask,
  giveBonus,
  undoCompletion,
} from "@/features/estrelas/repository";
import { nudge, snooze } from "@/features/lembretes/repository";
import { resolveRedemption } from "@/features/loja/repository";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { parentActor, runAction } from "@/lib/action";
import { audit } from "@/lib/observability";

const ids = z.object({ childId: z.string().uuid(), taskId: z.string().uuid() });

function atualizar() {
  revalidatePath("/", "layout");
}

export async function aprovarAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const actor = await parentActor();
    await approveCompletion(actor, id);
    await avisarFamilia(actor.familyGroupId, "estrelas");
    atualizar();
  });
}

/** "Não foi feita" para a pendente, ou "Desfazer" para a aprovada: sem linha de castigo. */
export async function desfazerAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const actor = await parentActor();
    const c = await undoCompletion(actor, id);
    audit({
      eventType: "estrela.completion_undone",
      actorId: actor.userId,
      payload: { childId: c.childId, completionId: c.id, via: actor.kind },
    });
    await avisarFamilia(actor.familyGroupId, "conclusao");
    atualizar();
  });
}

/** Os pais marcam pela criança ("Já fez"): entra aprovada. */
export async function marcarPelaCriancaAction(raw: unknown) {
  return runAction(async () => {
    const { childId, taskId } = ids.parse(raw);
    const actor = await parentActor();
    await completeTask({
      actor,
      childId,
      taskId,
    });
    await avisarFamilia(actor.familyGroupId, "conclusao");
    atualizar();
  });
}

export async function lembrarAgoraAction(raw: unknown) {
  return runAction(async () => {
    const { childId, taskId } = ids.parse(raw);
    const actor = await parentActor();
    await nudge(actor, childId, taskId);
    await avisarFamilia(actor.familyGroupId, "lembrete");
    atualizar();
  });
}

export async function adiarAction(raw: unknown) {
  return runAction(async () => {
    const { childId, taskId } = ids.parse(raw);
    const actor = await parentActor();
    await snooze(actor, childId, taskId, 15);
    await avisarFamilia(actor.familyGroupId, "lembrete");
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
    await giveBonus(actor, childId, stars, `Bônus: ${reason || "mandou bem!"}`);
    audit({
      eventType: "estrela.bonus_given",
      actorId: actor.userId,
      payload: { childId, stars, via: actor.kind },
    });
    await avisarFamilia(actor.familyGroupId, "estrelas");
    atualizar();
  });
}

export async function resolverPedidoAction(raw: unknown) {
  return runAction(async () => {
    const { id, outcome } = z
      .object({ id: z.string().uuid(), outcome: z.enum(["delivered", "declined"]) })
      .parse(raw);
    const actor = await parentActor();
    const r = await resolveRedemption(actor, id, outcome);
    audit({
      eventType: "estrela.redemption_resolved",
      actorId: actor.userId,
      payload: { redemptionId: r.id, childId: r.childId, outcome, via: actor.kind },
    });
    await avisarFamilia(actor.familyGroupId, "loja");
    atualizar();
  });
}
