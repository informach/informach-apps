"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { familyOwner, runAction } from "@/lib/action";
import { changePlan, checkout, portal, reactivate } from "./service";

const produto = z.enum(["estrela_family_monthly", "estrela_family_annual"]);

export async function assinarAction(raw: unknown) {
  return runAction(async () => {
    const productId = produto.parse(raw);
    const { ownerId } = await familyOwner();
    const result = await checkout(ownerId, productId);
    return { url: result.url };
  });
}

export async function trocarPlanoAction(raw: unknown) {
  return runAction(async () => {
    const productId = produto.parse(raw);
    const { ownerId } = await familyOwner({ recent: true });
    const result = await changePlan(ownerId, productId);
    revalidatePath("/ajustes");
    return result;
  });
}

export async function reativarAction() {
  return runAction(async () => {
    const { ownerId } = await familyOwner();
    await reactivate(ownerId);
    revalidatePath("/ajustes");
  });
}

export async function portalAction() {
  return runAction(async () => {
    const { ownerId } = await familyOwner();
    const session = await portal(ownerId);
    return { url: session.url };
  });
}
