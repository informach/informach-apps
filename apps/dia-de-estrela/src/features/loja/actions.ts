"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ICONES_RECOMPENSA } from "@/domain/modelos";
import { bytesDeDataUrl, FOTO_MAX_BYTES, tipoDaImagem } from "@/features/arquivos/validacao";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { familyAdministrator, parentActor, runAction } from "@/lib/action";
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
    const { actor } = await familyAdministrator();
    if (input.kind === "custom") {
      await createReward(actor, input);
    } else {
      const centavos = input.reais * 100;
      await createReward(actor, {
        kind: "money",
        name: (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        icon: "banknote",
        moneyCents: centavos,
      });
    }
    await avisarFamilia(actor.familyGroupId, "loja");
    atualizar();
  });
}

export async function tirarRecompensaAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const { actor } = await familyAdministrator();
    await archiveReward(actor, id);
    await avisarFamilia(actor.familyGroupId, "loja");
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
    let foto: { mime: string; data: Buffer } | null | undefined;
    if (photo === null) foto = null;
    else if (photo) {
      const bytes = bytesDeDataUrl(photo, FOTO_MAX_BYTES);
      assertAllowed(bytes, "PHOTO", "A foto ficou grande demais. Escolha outra.");
      const mime = tipoDaImagem(bytes);
      assertAllowed(mime, "PHOTO", "Use uma foto JPG, PNG ou WebP.");
      foto = { mime, data: Buffer.from(bytes) };
    }
    await setGoal(actor, childId, {
      name,
      reais,
      photo: foto,
    });
    if (foto)
      audit({
        eventType: "estrela.goal_photo_saved",
        actorId: actor.userId,
        payload: { childId, via: actor.kind },
      });
    await avisarFamilia(actor.familyGroupId, "loja");
    atualizar();
  });
}

export async function removerMetaAction(raw: unknown) {
  return runAction(async () => {
    const childId = z.string().uuid().parse(raw);
    const actor = await parentActor();
    await removeGoal(actor, childId);
    await avisarFamilia(actor.familyGroupId, "loja");
    atualizar();
  });
}
