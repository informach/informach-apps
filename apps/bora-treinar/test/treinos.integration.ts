import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { customers, subscriptions, users } from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Access, FREE_ACCESS } from "@/features/acesso/policy";
import { getAccess } from "@/features/billing/service";
import {
  createProfile,
  getFamily,
  listProfiles,
  progressOf,
  setPreferences,
  unsubscribedCategories,
} from "@/features/familia/repository";
import { rodarLembretes } from "@/features/lembretes/servico";
import {
  deleteCustomWorkout,
  listCustomWorkouts,
  saveCustomWorkout,
} from "@/features/meus-treinos/repository";
import {
  barramento,
  criarPareamento,
  emitirCredencial,
  entrarComCodigo,
  lerCredencial,
} from "@/features/pareamento/servidor";
import { achievementsOf, sessionsOf, sessoesDoGrupo } from "@/features/sessoes/repository";
import type { SessionInput } from "@/features/sessoes/schema";
import { acceptSuggestion, saveGroupSession, saveSession } from "@/features/sessoes/service";
import { comecarTeste } from "@/features/teste/service";
import { pendingSuggestions } from "@/features/treino/engine/progression";
import { inicioDaSemana, inicioDoDiaLocal, relogioLocal, somarDias } from "@/lib/datas";
import { emails } from "@/lib/emails";

const SP = "America/Sao_Paulo";
const owner = randomUUID();
let customerId = "";
let subscriptionId = "";
const family: Access = {
  subscribed: true,
  unlocked: true,
  trial: { active: false, endsAt: null, started: false },
  tier: "family",
  profileLimit: 4,
};
const profiles: string[] = [];

const sessao = (profileId: string, extra: Partial<SessionInput> = {}): SessionInput => ({
  id: randomUUID(),
  profileId,
  workoutRef: "catalogo:primeiro-treino",
  startedAt: Date.now() - 600_000,
  durationSeconds: 600,
  mode: "manual",
  logs: [1, 2, 3].map(() => ({
    exerciseId: "agachamento",
    kind: "reps" as const,
    target: 10,
    reps: 10,
    partials: 0,
    holdSeconds: 0,
    seconds: 40,
    issues: {},
  })),
  ...extra,
});

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Bora integration",
    emailVerified: true,
  });
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_bora_${owner}`,
      subjectType: "user",
      subjectId: owner,
      app: "bora-treinar",
      email: `${owner}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing customer fixture");
  customerId = customer.id;
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      customerId,
      provider: "stripe",
      providerSubscriptionId: `sub_bora_${owner}`,
      productId: "bora_family_monthly",
      providerPriceId: "price_bora_fixture",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  if (!subscription) throw new Error("Missing subscription fixture");
  subscriptionId = subscription.id;
});

afterAll(async () => {
  if (subscriptionId) await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  await db.delete(users).where(eq(users.id, owner));
});

describe("plano Família e perfis", () => {
  it("a assinatura ativa dá o plano Família com quatro perfis", async () => {
    const access = await getAccess(owner);
    expect(access).toMatchObject({
      subscribed: true,
      unlocked: true,
      tier: "family",
      profileLimit: 4,
    });
  });

  it("cria até o limite, mesmo com pedidos simultâneos", async () => {
    const results = await Promise.allSettled(
      ["Ana", "Beto", "Caio", "Duda", "Edu"].map((name) =>
        createProfile(owner, name, "#3D7BFF", family.profileLimit),
      ),
    );
    const criados = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(criados).toHaveLength(4);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    profiles.push(...criados);
  });
});

describe("treinos salvos", () => {
  it("grava, conta a conquista e não duplica o reenvio da fila offline", async () => {
    const profileId = profiles[0] ?? "";
    const input = sessao(profileId);
    const primeiro = await saveSession(owner, family, profiles, input, "America/Sao_Paulo");
    expect(primeiro.achievements).toContain("primeiro-treino");
    const reenvio = await saveSession(owner, family, profiles, input, "America/Sao_Paulo");
    expect(reenvio).toEqual({ sessionId: input.id, achievements: [] });
    expect(await sessionsOf(profileId)).toHaveLength(1);
    expect((await progressOf(profileId)).pernas?.streak).toBe(1);
  });

  it("duas sessões batendo a meta liberam o avanço, que só vale uma vez", async () => {
    const profileId = profiles[0] ?? "";
    await saveSession(owner, family, profiles, sessao(profileId), "America/Sao_Paulo");
    const [sugestao] = pendingSuggestions(await progressOf(profileId));
    expect(sugestao).toMatchObject({ chainId: "pernas", type: "bonus", to: 2 });
    await acceptSuggestion(family, profiles, profileId, "pernas");
    expect((await progressOf(profileId)).pernas).toMatchObject({ bonus: 2, streak: 0 });
    await expect(acceptSuggestion(family, profiles, profileId, "pernas")).rejects.toThrow(
      "já foi aplicado",
    );
  });

  it("a meta é a do servidor, e o 'como foi' e o 'parar' ficam gravados", async () => {
    const profileId = profiles[2] ?? "";
    // o aparelho manda meta 3 (adulterada): vale a planejada (10), e 5 repetições não batem
    const baixa = sessao(profileId, {
      logs: sessao(profileId).logs.map((l) => ({ ...l, target: 3, reps: 5 })),
      feeling: "dificil",
    });
    await saveSession(owner, family, profiles, baixa, "America/Sao_Paulo");
    const [gravada] = await sessionsOf(profileId);
    expect(gravada?.logs[0]?.target).toBe(10);
    expect(gravada?.feeling).toBe("dificil");
    expect((await progressOf(profileId)).pernas).toMatchObject({ streak: 0, struggle: 2 });
    // 1 de 3 séries, encerrado antes: guarda a marca e não pesa a trilha
    const parou = sessao(profileId, { logs: sessao(profileId).logs.slice(0, 1), endedEarly: true });
    await saveSession(owner, family, profiles, parou, "America/Sao_Paulo");
    const ultima = (await sessionsOf(profileId)).at(-1);
    expect(ultima?.endedEarly).toBe(true);
    expect((await progressOf(profileId)).pernas).toMatchObject({ struggle: 2 });
    // 1 de 3 séries sem parar: a série que faltou é meta não batida e o peso chega a 3
    await saveSession(
      owner,
      family,
      profiles,
      sessao(profileId, { logs: sessao(profileId).logs.slice(0, 1) }),
      "America/Sao_Paulo",
    );
    const [descer] = pendingSuggestions(await progressOf(profileId));
    expect(descer).toBeUndefined(); // nível 0, sem bônus: não há para onde descer
    expect((await progressOf(profileId)).pernas?.struggle).toBe(3);
  });

  it("o plano gratuito recusa treino da assinatura e contagem pela câmera", async () => {
    const profileId = profiles[1] ?? "";
    await expect(
      saveSession(
        owner,
        FREE_ACCESS,
        [profileId],
        sessao(profileId, { workoutRef: "catalogo:hiit-12" }),
        "America/Sao_Paulo",
      ),
    ).rejects.toThrow("assinatura");
    await expect(
      saveSession(
        owner,
        FREE_ACCESS,
        [profileId],
        sessao(profileId, { mode: "camera" }),
        "America/Sao_Paulo",
      ),
    ).rejects.toThrow("câmera");
    expect(await achievementsOf(profileId)).toHaveLength(0);
  });
});

describe("treinos montados pela família", () => {
  it("salva, lista e apaga", async () => {
    const id = await saveCustomWorkout(owner, {
      name: "Manhã",
      subtitle: "",
      level: "Iniciante",
      focus: "Força",
      blocks: [{ type: "sets", slot: "trilha:empurrar", sets: 2, target: 8, rest: 30 }],
    });
    expect((await listCustomWorkouts(owner)).map((w) => w.id)).toEqual([`meu:${id}`]);
    await deleteCustomWorkout(owner, id);
    expect(await listCustomWorkouts(owner)).toHaveLength(0);
  });
});

describe("pareamento celular ↔ TV", () => {
  it("o código vale uma vez e a credencial é presa a ele", async () => {
    const bus = barramento();
    if (!bus) throw new Error("barramento indisponível");
    const codigo = await criarPareamento(bus, owner);
    if (!codigo) throw new Error("código não criado");
    expect(await entrarComCodigo(bus, codigo)).toBe(owner);
    expect(await entrarComCodigo(bus, codigo)).toBeNull();
    const credencial = emitirCredencial(codigo);
    expect(lerCredencial(credencial)).toBe(codigo);
    expect(lerCredencial(`${credencial.slice(0, -2)}xx`)).toBeNull();
    expect(lerCredencial(emitirCredencial(codigo, Date.now() - 4 * 3_600_000))).toBeNull();
  });
});

describe("lembrete de treino", () => {
  it("sai na hora escolhida para quem ainda não treinou hoje, uma vez por dia", async () => {
    const agora = relogioLocal(new Date(), "America/Sao_Paulo");
    await setPreferences(owner, {
      reminderDays: 127,
      reminderHour: agora.hora,
      weeklySummary: false,
    });
    expect((await getFamily(owner))?.reminderDays).toBe(127);
    expect([...(await unsubscribedCategories(owner))]).toEqual(["bora.weekly-summary"]);
    // o primeiro e o terceiro perfis já treinaram hoje (sessões acima); o segundo e o quarto, não:
    // o lembrete lista só os dois que faltam, com a meta da semana (3 dias, o padrão)
    const nomes = new Map((await listProfiles(owner)).map((p) => [p.id, p.name]));
    const nome = (i: number) => nomes.get(profiles[i] ?? "") ?? "?";
    const antes = emails.getOutbox?.().length ?? 0;
    await rodarLembretes();
    const novos = (emails.getOutbox?.() ?? []).slice(antes);
    expect(novos).toHaveLength(1);
    expect(novos[0]?.text).toContain(`${nome(1)}: 0 de 3 dias nesta semana.`);
    expect(novos[0]?.text).toContain(`${nome(3)}: 0 de 3 dias nesta semana.`);
    expect(novos[0]?.text).not.toContain(`${nome(0)}:`);
    expect(novos[0]?.text).not.toContain(`${nome(2)}:`);
    // a chave da mensagem (família + dia) segura o segundo envio
    await rodarLembretes();
    expect((emails.getOutbox?.().length ?? 0) - antes).toBe(1);
  });
});

describe("resumo da semana", () => {
  it("traz a meta da semana de cada perfil e sai uma vez por semana", async () => {
    await setPreferences(owner, { reminderDays: 0, reminderHour: 18, weeklySummary: true });
    // segunda que vem, 9h em São Paulo: o resumo é desta semana, com as sessões acima
    const segunda = inicioDoDiaLocal(somarDias(inicioDaSemana(Date.now(), SP), 7), SP);
    const agora = new Date(segunda.getTime() + 9 * 3_600_000);
    const nomes = new Map((await listProfiles(owner)).map((p) => [p.id, p.name]));
    const antes = emails.getOutbox?.().length ?? 0;
    await rodarLembretes(agora);
    const novos = (emails.getOutbox?.() ?? []).slice(antes);
    expect(novos.map((e) => e.category)).toEqual(["bora.weekly-summary"]);
    expect(novos[0]?.text).toContain(nomes.get(profiles[0] ?? ""));
    expect(novos[0]?.text).toContain("Meta da semana: 1 de 3 dias.");
    await rodarLembretes(agora);
    expect((emails.getOutbox?.().length ?? 0) - antes).toBe(1);
  });
});

describe("teste de 7 dias, sem cartão", () => {
  const conta = (id: string, email: string) =>
    db.insert(users).values({ id, email, name: "Teste", emailVerified: true });

  it("libera tudo, com quatro perfis, sem ser assinatura", async () => {
    const id = randomUUID();
    const email = `${id}@example.test`;
    await conta(id, email);
    try {
      expect((await getAccess(id)).unlocked).toBe(false);
      expect((await comecarTeste({ id, email, emailVerified: true })).ok).toBe(true);
      const access = await getAccess(id);
      expect(access).toMatchObject({ subscribed: false, unlocked: true, profileLimit: 4 });
      expect(access.trial.active).toBe(true);
      // pedir de novo na mesma conta não recomeça nem falha
      expect((await comecarTeste({ id, email, emailVerified: true })).ok).toBe(true);
    } finally {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("é um por e-mail, mesmo apagando a conta e criando outra", async () => {
    const email = `${randomUUID()}@example.test`;
    const primeira = randomUUID();
    await conta(primeira, email);
    expect((await comecarTeste({ id: primeira, email, emailVerified: true })).ok).toBe(true);
    await db.delete(users).where(eq(users.id, primeira));
    const segunda = randomUUID();
    await conta(segunda, email.toUpperCase());
    try {
      expect(
        await comecarTeste({ id: segunda, email: email.toUpperCase(), emailVerified: true }),
      ).toEqual({
        ok: false,
        code: "TRIAL_USED",
      });
      expect((await getAccess(segunda)).unlocked).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, segunda));
    }
  });

  it("e-mail não confirmado não começa o teste", async () => {
    expect(
      await comecarTeste({ id: randomUUID(), email: "x@example.test", emailVerified: false }),
    ).toEqual({ ok: false, code: "VERIFY" });
  });
});

describe("pagamento atrasado", () => {
  it("segue liberado por 7 dias depois do fim do período, e depois não", async () => {
    const id = randomUUID();
    await db
      .insert(users)
      .values({ id, email: `${id}@example.test`, name: "Atraso", emailVerified: true });
    const [cliente] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_atraso_${id}`,
        subjectType: "user",
        subjectId: id,
        app: "bora-treinar",
        email: `${id}@example.test`,
      })
      .returning();
    if (!cliente) throw new Error("cliente");
    const [assinatura] = await db
      .insert(subscriptions)
      .values({
        customerId: cliente.id,
        provider: "stripe",
        providerSubscriptionId: `sub_atraso_${id}`,
        productId: "bora_family_monthly",
        providerPriceId: "price_bora_fixture",
        status: "past_due",
        currentPeriodStart: new Date(Date.now() - 32 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() - 2 * 86_400_000),
      })
      .returning();
    if (!assinatura) throw new Error("assinatura");
    try {
      expect(await getAccess(id)).toMatchObject({
        subscribed: true,
        unlocked: true,
        profileLimit: 4,
        pagamentoAtrasado: true,
      });
      await db
        .update(subscriptions)
        .set({ currentPeriodEnd: new Date(Date.now() - 8 * 86_400_000) })
        .where(eq(subscriptions.id, assinatura.id));
      expect((await getAccess(id)).unlocked).toBe(false);
    } finally {
      await db.delete(subscriptions).where(eq(subscriptions.id, assinatura.id));
      await db.delete(customers).where(eq(customers.id, cliente.id));
      await db.delete(users).where(eq(users.id, id));
    }
  });
});

describe("treinar junto", () => {
  it("grava um treino por perfil, com o mesmo grupo, e recusa treino que não é de séries", async () => {
    const [a = "", , , d = ""] = profiles;
    const groupId = randomUUID();
    const grupo = {
      groupId,
      sessoes: [d, a].map((profileId) => ({ ...sessao(profileId), groupId })),
    };
    const r = await saveGroupSession(owner, family, profiles, grupo, "America/Sao_Paulo");
    expect(r.sessoes).toHaveLength(2);
    const salvas = await sessoesDoGrupo(owner, groupId);
    expect(salvas.map((s) => s.profileId).sort()).toEqual([a, d].sort());
    expect(salvas.every((s) => s.groupId === groupId)).toBe(true);
    // reenviar o mesmo grupo (fila offline) não duplica
    await saveGroupSession(owner, family, profiles, grupo, "America/Sao_Paulo");
    expect(await sessoesDoGrupo(owner, groupId)).toHaveLength(2);
    // AMRAP tem um relógio só: não vale para treinar junto
    const outro = randomUUID();
    await expect(
      saveGroupSession(
        owner,
        family,
        profiles,
        {
          groupId: outro,
          sessoes: [a, d].map((profileId) => ({
            ...sessao(profileId),
            workoutRef: "catalogo:amrap-8",
            groupId: outro,
          })),
        },
        "America/Sao_Paulo",
      ),
    ).rejects.toThrow("só com treino de séries");
    // um treino do grupo não entra sozinho
    await expect(
      saveSession(owner, family, profiles, { ...sessao(a), groupId: outro }, "America/Sao_Paulo"),
    ).rejects.toThrow("vai junto com o grupo");
  });
});
