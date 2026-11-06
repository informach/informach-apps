"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canRecordVoice } from "@/features/acesso/policy";
import {
  bytesDeDataUrl,
  tipoDoAudio,
  VOZ_MAX_BYTES,
  VOZ_MAX_MS,
} from "@/features/arquivos/validacao";
import { familyView } from "@/features/familia/view";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { parentActor, runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import {
  applyTemplate,
  createTask,
  deleteTask,
  deleteVoice,
  saveVoice,
  updateTask,
} from "./repository";
import { taskSchema, templateIdSchema } from "./schemas";

function atualizar() {
  revalidatePath("/", "layout");
}

export async function salvarTarefaAction(raw: unknown) {
  return runAction(async () => {
    const { id, childId, task } = z
      .object({ id: z.string().uuid().optional(), childId: z.string().uuid(), task: taskSchema })
      .parse(raw);
    const actor = await parentActor();
    let salvo = id;
    if (id) await updateTask(actor.ownerId, id, task);
    else salvo = await createTask(actor.ownerId, childId, task);
    await avisarFamilia(actor.ownerId, "rotina");
    atualizar();
    return { id: salvo };
  });
}

export async function apagarTarefaAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const actor = await parentActor();
    await deleteTask(actor.ownerId, id);
    await avisarFamilia(actor.ownerId, "rotina");
    atualizar();
  });
}

export async function aplicarModeloAction(raw: unknown) {
  return runAction(async () => {
    const { childId, templateId } = z
      .object({ childId: z.string().uuid(), templateId: templateIdSchema })
      .parse(raw);
    const actor = await parentActor();
    const n = await applyTemplate(actor.ownerId, childId, templateId);
    await avisarFamilia(actor.ownerId, "rotina");
    atualizar();
    return { added: n };
  });
}

/** Voz dos pais por tarefa (plano Família): até 15 s, tipo conferido pelos bytes. */
export async function salvarVozAction(raw: unknown) {
  return runAction(async () => {
    const { taskId, audio, durationMs } = z
      .object({
        taskId: z.string().uuid(),
        audio: z.string().max(Math.ceil((VOZ_MAX_BYTES * 4) / 3) + 200),
        durationMs: z.number().int().min(300).max(VOZ_MAX_MS),
      })
      .parse(raw);
    const actor = await parentActor();
    const { access } = await familyView(actor.ownerId);
    assertAllowed(
      canRecordVoice(access),
      "PLAN",
      "Gravar a própria voz é do plano Família. A voz do aparelho continua lendo tudo.",
    );
    const bytes = bytesDeDataUrl(audio, VOZ_MAX_BYTES);
    assertAllowed(bytes, "AUDIO", "A gravação ficou grande demais. Grave uma frase curta.");
    const mime = tipoDoAudio(bytes);
    assertAllowed(mime, "AUDIO", "Não foi possível usar esta gravação. Tente gravar de novo.");
    await saveVoice(actor.ownerId, taskId, { mime, data: Buffer.from(bytes), durationMs });
    audit({
      eventType: "estrela.voice_saved",
      actorId: actor.actorId,
      payload: { taskId, via: actor.via },
    });
    await avisarFamilia(actor.ownerId, "rotina");
    atualizar();
  });
}

export async function apagarVozAction(raw: unknown) {
  return runAction(async () => {
    const taskId = z.string().uuid().parse(raw);
    const actor = await parentActor();
    await deleteVoice(actor.ownerId, taskId);
    await avisarFamilia(actor.ownerId, "rotina");
    atualizar();
  });
}
