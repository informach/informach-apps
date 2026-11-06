"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { recentParent, runAction, verifiedUser } from "@/lib/action";
import { fusoValido } from "@/lib/datas";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import {
  changePlan,
  checkout,
  closeBillingAndFamily,
  portal,
  reactivate,
} from "../billing/service";
import { MINUTOS, RITMO_IDS, ritmoPorId } from "../perfil/regras";
import { salvarPreferencias } from "../perfil/repository";
import { comecarPerfil } from "../perfil/service";
import { comecarTeste } from "../teste/service";
import {
  clearFamily,
  createProfile,
  deleteProfile,
  setPreferences,
  setTimezone,
  updateProfile,
} from "./repository";
import { familyView, PROFILE_COLORS, PROFILE_COOKIE } from "./view";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(24),
  color: z.enum(PROFILE_COLORS),
});

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
 * Cria um perfil. `fusoDoAparelho` é o fuso do navegador: no primeiro perfil ele vira o fuso da
 * família (antes ninguém gravava, e famílias fora de Brasília recebiam lembrete na hora errada).
 */
export async function createProfileAction(name: string, color: string, fusoDoAparelho?: string) {
  return runAction(async () => {
    const input = profileSchema.parse({ name, color });
    const user = await verifiedUser();
    const { access, profiles } = await familyView(user.id);
    const id = await createProfile(user.id, input.name, input.color, access.profileLimit);
    if (!profiles.length && fusoDoAparelho && fusoValido(fusoDoAparelho))
      await setTimezone(user.id, fusoDoAparelho, true);
    // O teste de 7 dias começa sozinho no primeiro perfil: a pessoa prova a câmera e os treinos
    // antes de qualquer cobrança. Se o e-mail já usou o teste, segue no grátis, sem erro.
    if (!profiles.length && !access.subscribed) await comecarTeste(user);
    audit({ eventType: "bora.profile_created", actorId: user.id, payload: { profileId: id } });
    await rememberProfile(id);
    revalidatePath("/", "layout");
    return { id };
  });
}

/** Edita o perfil em "Gerenciar": apelido, cor e o jeito de treinar (sem mexer nos níveis). */
export async function updateProfileAction(
  id: string,
  dados: { name: string; color: string } & z.input<typeof respostasSchema>,
) {
  return runAction(async () => {
    const profileId = z.uuid().parse(id);
    const input = profileSchema.parse({ name: dados.name, color: dados.color });
    const respostas = respostasSchema.parse(dados);
    const user = await verifiedUser();
    await updateProfile(user.id, profileId, input.name, input.color);
    await salvarPreferencias(user.id, profileId, {
      intensity: ritmoPorId(respostas.ritmo).intensidade,
      weeklyGoal: respostas.dias,
      minutesPref: respostas.minutos,
    });
    audit({
      eventType: "bora.profile_updated",
      actorId: user.id,
      payload: { profileId, fields: ["name", "color", "intensity", "weeklyGoal", "minutesPref"] },
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
    const { profiles } = await familyView(user.id);
    await comecarPerfil(
      user.id,
      profiles.filter((p) => p.allowed).map((p) => p.id),
      profileId,
      r,
    );
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
      "Este perfil está guardado. O plano atual libera menos perfis; no plano Família cabem quatro.",
    );
    await rememberProfile(profileId);
  });
}

/** "Começar 7 dias grátis": para quem já tinha conta no grátis antes de o teste existir. */
export async function startTrialAction() {
  return runAction(async () => {
    const user = await verifiedUser();
    const { access } = await familyView(user.id);
    assertAllowed(!access.subscribed, "ALREADY_SUBSCRIBED", "Você já tem uma assinatura.");
    const resultado = await comecarTeste(user);
    assertAllowed(
      resultado.ok,
      resultado.ok ? "OK" : resultado.code,
      "O teste de 7 dias já foi usado por este e-mail. Os planos continuam a um toque.",
    );
    revalidatePath("/", "layout");
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

/**
 * Abre o pagamento de uma assinatura nova. Não pede login recente: o pagamento acontece no Stripe,
 * com o cartão. Antes cada cadeado levava a Conta, que pedia o código de novo antes de mostrar o
 * botão de assinar. O login recente continua para Portal, troca de plano, limpeza e exclusão.
 */
export async function checkoutAction(productId: string) {
  return runAction(async () => {
    z.string().max(80).parse(productId);
    const user = await verifiedUser();
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
