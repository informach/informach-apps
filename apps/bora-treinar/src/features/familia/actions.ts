"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { runAction, verifiedUser } from "@/lib/action";
import { fusoValido } from "@/lib/datas";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import { MINUTOS, RITMO_IDS, ritmoPorId } from "../perfil/regras";
import { salvarPreferencias } from "../perfil/repository";
import { comecarPerfil } from "../perfil/service";
import { deleteProfile, setPreferences, setTimezone } from "./repository";
import { activateTrainer } from "./service";
import { familyView, PROFILE_COOKIE } from "./view";

/** Primeiro acesso e edição do jeito de treinar: só preferências de treino, nada de saúde. */
const respostasSchema = z.object({
  ritmo: z.enum(RITMO_IDS),
  minutos: z
    .number()
    .refine((m) => (MINUTOS as readonly number[]).includes(m), "Tempo inválido.")
    .nullable(),
  dias: z.number().int().min(1, "Pelo menos 1 dia.").max(7, "No máximo 7 dias."),
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

/**
 * Ativa uma pessoa cadastrada na central. `fusoDoAparelho` é o fuso do navegador: no primeiro perfil ele vira o fuso da
 * família (antes ninguém gravava, e famílias fora de Brasília recebiam lembrete na hora errada).
 */
export async function createProfileAction(personId: string, fusoDoAparelho?: string) {
  return runAction(async () => {
    const person = z.uuid().parse(personId);
    const user = await verifiedUser();
    const { group, profiles } = await familyView(user.id);
    const id = await activateTrainer(user.id, group.id, person);
    if (!profiles.length && fusoDoAparelho && fusoValido(fusoDoAparelho))
      await setTimezone(user.id, fusoDoAparelho, true);
    audit({ eventType: "bora.profile_created", actorId: user.id, payload: { profileId: id } });
    await rememberProfile(id);
    revalidatePath("/", "layout");
    return { id };
  });
}

/** Edita o perfil em "Gerenciar": o jeito de treinar (sem mexer nos níveis). */
export async function updateProfileAction(id: string, dados: z.input<typeof respostasSchema>) {
  return runAction(async () => {
    const profileId = z.uuid().parse(id);
    const respostas = respostasSchema.parse(dados);
    const user = await verifiedUser();
    await salvarPreferencias(user.id, profileId, {
      intensity: ritmoPorId(respostas.ritmo).intensidade,
      weeklyGoal: respostas.dias,
      minutesPref: respostas.minutos,
    });
    audit({
      eventType: "bora.profile_updated",
      actorId: user.id,
      payload: { profileId, fields: ["intensity", "weeklyGoal", "minutesPref"] },
    });
    revalidatePath("/", "layout");
  });
}

/** Primeiro acesso do perfil: ritmo, tempo e dias por semana. */
export async function comecarPerfilAction(id: string, respostas: z.input<typeof respostasSchema>) {
  return runAction(async () => {
    const profileId = z.uuid().parse(id);
    const r = respostasSchema.parse(respostas);
    const user = await verifiedUser();
    const { group } = await familyView(user.id);
    await comecarPerfil(user.id, group.id, profileId, r);
    audit({
      eventType: "bora.profile_updated",
      actorId: user.id,
      payload: { profileId, fields: ["intensity", "weeklyGoal", "minutesPref", "levels"] },
    });
    await rememberProfile(profileId);
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
      "Este perfil está guardado. Consulte a cobertura desta família na Minha conta.",
    );
    await rememberProfile(profileId);
  });
}

export async function forgetProfileAction() {
  (await cookies()).delete(PROFILE_COOKIE);
}

const preferencesSchema = z.object({
  timezone: z.string().max(64).refine(fusoValido, "Fuso inválido.").optional(),
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
