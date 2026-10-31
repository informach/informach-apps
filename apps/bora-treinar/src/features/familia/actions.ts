"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { recentParent, runAction, verifiedUser } from "@/lib/action";
import { AppError, assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import {
  changePlan,
  checkout,
  closeBillingAndFamily,
  portal,
  reactivate,
} from "../billing/service";
import { parseEdibodyBackup } from "../sessoes/edibody";
import { importProfiles } from "../sessoes/service";
import {
  clearFamily,
  createProfile,
  deleteProfile,
  setPreferences,
  updateProfile,
} from "./repository";
import { familyView, PROFILE_COLORS, PROFILE_COOKIE } from "./view";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(24),
  color: z.enum(PROFILE_COLORS),
});

async function rememberProfile(id: string) {
  (await cookies()).set(PROFILE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function createProfileAction(name: string, color: string) {
  return runAction(async () => {
    const input = profileSchema.parse({ name, color });
    const user = await verifiedUser();
    const { access } = await familyView(user.id);
    const id = await createProfile(user.id, input.name, input.color, access.profileLimit);
    audit({ eventType: "bora.profile_created", actorId: user.id, payload: { profileId: id } });
    await rememberProfile(id);
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function updateProfileAction(id: string, name: string, color: string) {
  return runAction(async () => {
    const profileId = z.uuid().parse(id);
    const input = profileSchema.parse({ name, color });
    const user = await verifiedUser();
    await updateProfile(user.id, profileId, input.name, input.color);
    audit({
      eventType: "bora.profile_updated",
      actorId: user.id,
      payload: { profileId, fields: ["name", "color"] },
    });
    revalidatePath("/", "layout");
  });
}

export async function deleteProfileAction(id: string) {
  return runAction(async () => {
    const profileId = z.uuid().parse(id);
    const user = await verifiedUser();
    await deleteProfile(user.id, profileId);
    audit({ eventType: "bora.profile_deleted", actorId: user.id, payload: { profileId } });
    const jar = await cookies();
    if (jar.get(PROFILE_COOKIE)?.value === profileId) jar.delete(PROFILE_COOKIE);
    revalidatePath("/", "layout");
  });
}

export async function selectProfileAction(id: string) {
  return runAction(async () => {
    const profileId = z.uuid().parse(id);
    const user = await verifiedUser();
    const { profiles } = await familyView(user.id);
    const profile = profiles.find((p) => p.id === profileId);
    assertAllowed(profile, "PROFILE", "Perfil não encontrado.");
    assertAllowed(
      profile.allowed,
      "PROFILE_LIMIT",
      "Este perfil está guardado. O plano atual libera menos perfis; no plano Família cabem quatro.",
    );
    await rememberProfile(profileId);
  });
}

export async function forgetProfileAction() {
  (await cookies()).delete(PROFILE_COOKIE);
}

const preferencesSchema = z.object({
  reminderDays: z.number().int().min(0).max(127),
  reminderHour: z.number().int().min(0).max(23),
  weeklySummary: z.boolean(),
});

export async function preferencesAction(prefs: z.input<typeof preferencesSchema>) {
  return runAction(async () => {
    const input = preferencesSchema.parse(prefs);
    const user = await verifiedUser();
    await setPreferences(user.id, input);
    audit({
      eventType: "bora.preferences_updated",
      actorId: user.id,
      payload: { fields: Object.keys(input) },
    });
    revalidatePath("/conta");
  });
}

export async function checkoutAction(productId: string) {
  return runAction(async () => {
    z.string().max(80).parse(productId);
    const user = await recentParent();
    return checkout(user.id, productId);
  });
}

export async function portalAction() {
  return runAction(async () => portal((await recentParent()).id));
}

export async function changePlanAction(productId: string, retainedProfileId?: string) {
  return runAction(async () => {
    z.string().max(80).parse(productId);
    const retained = z.uuid().optional().parse(retainedProfileId);
    const result = await changePlan((await recentParent()).id, productId, retained);
    revalidatePath("/conta");
    return result;
  });
}

export async function reactivateAction() {
  return runAction(async () => {
    await reactivate((await recentParent()).id);
    revalidatePath("/conta");
  });
}

export async function clearAction(confirmation: string) {
  return runAction(async () => {
    assertAllowed(
      confirmation === "ENCERRAR E APAGAR",
      "CONFIRM",
      "Digite ENCERRAR E APAGAR para confirmar.",
    );
    const user = await recentParent();
    await closeBillingAndFamily(user.id, () => clearFamily(user.id));
    (await cookies()).delete(PROFILE_COOKIE);
    revalidatePath("/", "layout");
  });
}

function lerBackup(json: string) {
  try {
    return parseEdibodyBackup(JSON.parse(json));
  } catch {
    throw new AppError("INPUT", "O arquivo não é um backup do EdiBody.");
  }
}

/**
 * Traz perfis e treinos de um backup do EdiBody para a conta. Os perfis entram
 * até o limite do plano; os que não couberem são informados, não descartados
 * em silêncio.
 */
export async function importEdibodyAction(json: string) {
  return runAction(async () => {
    assertAllowed(json.length <= 5_000_000, "INPUT", "Arquivo grande demais.");
    const perfis = lerBackup(json);
    const user = await recentParent();
    const { access, profiles } = await familyView(user.id);
    const result = await importProfiles(user.id, perfis, access.profileLimit, profiles.length);
    audit({
      eventType: "bora.backup_imported",
      actorId: user.id,
      payload: {
        profiles: result.perfis,
        sessions: result.sessoes,
        skippedProfiles: result.ficaramDeFora,
      },
    });
    revalidatePath("/", "layout");
    return result;
  });
}
