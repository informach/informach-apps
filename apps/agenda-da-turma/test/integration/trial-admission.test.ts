import { randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import {
  agendaNotices,
  agendaProductEvents,
  agendaStudentProfiles,
  creditLedger,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { admitFreeTrialCall } from "@/features/notices/trial";
import { FREE_NOTICE_TRIAL, TRIAL_GRANT_AMOUNTS } from "@/features/notices/trial-reserve";
import { billing } from "@/lib/billing";

/**
 * A admissão da franquia contra banco e billing reais.
 *
 * O ditado grátis já esteve completamente inacessível porque o saldo era medido
 * antes da concessão que o financia: conta nova via `available = 0` contra
 * cinco importações restantes e era recusada na primeira tentativa, para
 * sempre. Os testes unitários da aritmética não pegariam isso — o defeito
 * estava na ORDEM entre conceder e medir, que só aparece aqui.
 *
 * Não há chamada de IA nestes testes: `admitFreeTrialCall` decide antes de
 * qualquer provedor entrar em cena.
 */
const BUDGET = 10_000;

let owner: string;
let profileId: string;

async function seedOwner(emailVerified: boolean) {
  const id = `trial-admission-${randomUUID()}`;
  await db.insert(users).values({
    id,
    name: "Adulto fictício",
    email: `${id}@e2e.local`,
    emailVerified,
  });
  const [profile] = await db
    .insert(agendaStudentProfiles)
    .values({ userId: id, name: "Criança fictícia" })
    .returning();
  if (!profile) throw new Error("Missing fixture profile");
  return { id, profileId: profile.id };
}

async function cleanup(id: string) {
  await db.delete(agendaNotices).where(eq(agendaNotices.ownerUserId, id));
  await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, id));
  await db
    .delete(creditLedger)
    .where(and(eq(creditLedger.ownerId, id), eq(creditLedger.app, "agenda-da-turma")));
  await db.delete(users).where(eq(users.id, id));
}

beforeEach(async () => {
  const seeded = await seedOwner(true);
  owner = seeded.id;
  profileId = seeded.profileId;
});

afterEach(async () => {
  await cleanup(owner);
});

describe("admitFreeTrialCall", () => {
  it("deixa quem acabou de chegar ditar, em vez de recusar na primeira tentativa", async () => {
    const admission = await admitFreeTrialCall(owner, owner, BUDGET, "voice");
    expect(admission).toEqual({ ok: true });
  });

  it("concede o crédito que financia a chamada, e não depois dela", async () => {
    // A regressão: o saldo era lido antes da concessão, então a conta nunca
    // tinha com o que ser admitida — e a concessão só viria após a admissão.
    const before = await billing.getBalance({ type: "user", id: owner });
    expect(before.available).toBe(0);

    await admitFreeTrialCall(owner, owner, BUDGET, "voice");

    const after = await billing.getBalance({ type: "user", id: owner });
    expect(after.available).toBe(TRIAL_GRANT_AMOUNTS.voice);
  });

  it("não concede duas vezes para a mesma conta", async () => {
    await admitFreeTrialCall(owner, owner, BUDGET, "voice");
    await admitFreeTrialCall(owner, owner, BUDGET, "voice");
    const balance = await billing.getBalance({ type: "user", id: owner });
    expect(balance.available).toBe(TRIAL_GRANT_AMOUNTS.voice);
  });

  it("recusa conta com e-mail não confirmado, sem gastar IA por conta da casa", async () => {
    const unverified = await seedOwner(false);
    try {
      const admission = await admitFreeTrialCall(unverified.id, unverified.id, BUDGET, "voice");
      expect(admission).toEqual({ ok: false, code: "VERIFY_EMAIL" });
      const balance = await billing.getBalance({ type: "user", id: unverified.id });
      expect(balance.available).toBe(0);
    } finally {
      await cleanup(unverified.id);
    }
  });

  it("recusa quando o teto diário global já foi atingido", async () => {
    const admission = await admitFreeTrialCall(owner, owner, 0, "voice");
    expect(admission).toEqual({ ok: false, code: "TRIAL_BUSY" });
  });

  it("recusa depois que as importações de teste acabaram", async () => {
    await db.insert(agendaNotices).values(
      Array.from({ length: FREE_NOTICE_TRIAL }, (_, index) => ({
        ownerUserId: owner,
        captureProfileId: profileId,
        createdByUserId: owner,
        source: "teams" as const,
        text: `recado ${index}`,
        contentHash: `hash-${owner}-${index}`,
        status: "confirmed" as const,
        isTrial: true,
      })),
    );
    const admission = await admitFreeTrialCall(owner, owner, BUDGET, "voice");
    expect(admission).toEqual({ ok: false, code: "TRIAL_ENDED" });
  });

  it("guarda um crédito por importação restante para a leitura do recado", async () => {
    await admitFreeTrialCall(owner, owner, BUDGET, "voice");
    // Gasta o que a franquia de voz financiou, menos o que precisa sobrar para
    // as cinco leituras.
    const spend = TRIAL_GRANT_AMOUNTS.voice - FREE_NOTICE_TRIAL;
    for (let index = 0; index < spend; index += 1) {
      const reservation = await billing.reserveCredits({
        owner: { type: "user", id: owner },
        app: "agenda-da-turma",
        feature: "agenda.activities.transcribe_audio",
        estimatedAmount: 1,
      });
      await billing.commitReservation({ reservationId: reservation.id, actualAmount: 1 });
    }
    const admission = await admitFreeTrialCall(owner, owner, BUDGET, "voice");
    expect(admission).toEqual({ ok: false, code: "VOICE_TRIAL_SPENT" });
  });
});
