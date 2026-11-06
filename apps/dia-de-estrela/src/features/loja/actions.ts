"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { estrelasDaMeta } from "@/domain/estrelas";
import { ICONES_RECOMPENSA } from "@/domain/modelos";
import { canCreateCustomRewards, canUseGoalPhoto } from "@/features/acesso/policy";
import { bytesDeDataUrl, FOTO_MAX_BYTES, tipoDaImagem } from "@/features/arquivos/validacao";
import { familyView } from "@/features/familia/view";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { parentActor, runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import { archiveReward, createReward, removeGoal, setGoal } from "./repository";

function atualizar() {
  revalidatePath("/", "layout");
}

const recompensaSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("custom"),
    name: z.string().trim().min(1).max(40),
    icon: z.enum(ICONES_RECOMPENSA),
    priceStars: z.number().int().min(1).max(100000),
  }),
  z.object({
    kind: z.literal("money"),
    reais: z.number().int().min(1).max(1000),
  }),
]);

export async function criarRecompensaAction(raw: unknown) {
  return runAction(async () => {
    const input = recompensaSchema.parse(raw);
    const actor = await parentActor();
    if (input.kind === "custom") {
      const { access } = await familyView(actor.ownerId);
      assertAllowed(
        canCreateCustomRewards(access),
        "PLAN",
        "Itens próprios na loja (tempo de tela, passeio…) são do plano Família.",
      );
      await createReward(actor.ownerId, input);
    } else {
      const centavos = input.reais * 100;
      await createReward(actor.ownerId, {
        kind: "money",
        name: (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        icon: "banknote",
        moneyCents: centavos,
      });
    }
    await avisarFamilia(actor.ownerId, "loja");
    atualizar();
  });
}

export async function tirarRecompensaAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const actor = await parentActor();
    await archiveReward(actor.ownerId, id);
    await avisarFamilia(actor.ownerId, "loja");
    atualizar();
  });
}

/** Meta da criança: nome, preço em reais (vira estrelas na taxa da casa) e foto opcional. */
export async function salvarMetaAction(raw: unknown) {
  return runAction(async () => {
    const { childId, name, reais, photo } = z
      .object({
        childId: z.string().uuid(),
        name: z.string().trim().min(1).max(40),
        reais: z.number().positive().max(100000),
        /** data URL nova, `null` para tirar a foto, ausente para manter. */
        photo: z
          .string()
          .max(Math.ceil((FOTO_MAX_BYTES * 4) / 3) + 200)
          .nullable()
          .optional(),
      })
      .parse(raw);
    const actor = await parentActor();
    const { access, family } = await familyView(actor.ownerId);
    let foto: { mime: string; data: Buffer } | null | undefined;
    if (photo === null) foto = null;
    else if (photo) {
      assertAllowed(canUseGoalPhoto(access), "PLAN", "Foto da meta é do plano Família.");
      const bytes = bytesDeDataUrl(photo, FOTO_MAX_BYTES);
      assertAllowed(bytes, "PHOTO", "A foto ficou grande demais. Escolha outra.");
      const mime = tipoDaImagem(bytes);
      assertAllowed(mime, "PHOTO", "Use uma foto JPG, PNG ou WebP.");
      foto = { mime, data: Buffer.from(bytes) };
    }
    await setGoal(actor.ownerId, childId, {
      name,
      stars: estrelasDaMeta(reais, family?.starsPerReal ?? 10),
      photo: foto,
    });
    if (foto)
      audit({
        eventType: "estrela.goal_photo_saved",
        actorId: actor.actorId,
        payload: { childId, via: actor.via },
      });
    await avisarFamilia(actor.ownerId, "loja");
    atualizar();
  });
}

export async function removerMetaAction(raw: unknown) {
  return runAction(async () => {
    const childId = z.string().uuid().parse(raw);
    const actor = await parentActor();
    await removeGoal(actor.ownerId, childId);
    await avisarFamilia(actor.ownerId, "loja");
    atualizar();
  });
}
