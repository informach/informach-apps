import { describe, expect, it } from "vitest";
import {
  hasEverSubscribed,
  TRIAL_DAYS,
  TRIAL_RECAP_DAYS,
  trialDaysLeft,
  trialEnded,
  trialRecap,
} from "./trial";

const DAY = 86400000;
// 17/10/2026, 15h em São Paulo.
const now = new Date("2026-10-17T18:00:00Z");
const trial = (startedDaysAgo: number) => {
  const trialStartedAt = new Date(now.getTime() - startedDaysAgo * DAY);
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * DAY);
  return { profile: { trialStartedAt }, trialEndsAt, trialActive: trialEndsAt > now };
};
const neverStarted = { trialActive: false, trialEndsAt: null, profile: null };

describe("o teste na tela", () => {
  it("conta os dias que faltam durante o teste", () => {
    expect(trialDaysLeft({ isPro: false, ...trial(2) }, now)).toBe(12);
    expect(trialDaysLeft({ isPro: false, ...trial(13.9) }, now)).toBe(0);
  });

  it("some para quem assinou o Pro durante o teste", () => {
    expect(trialDaysLeft({ isPro: true, ...trial(12) }, now)).toBeNull();
    expect(trialEnded({ isPro: true, ...trial(30) })).toBe(false);
  });

  it("vira fim de teste só para quem não é Pro", () => {
    expect(trialDaysLeft({ isPro: false, ...trial(30) }, now)).toBeNull();
    expect(trialEnded({ isPro: false, ...trial(30) })).toBe(true);
    expect(trialEnded({ isPro: false, ...neverStarted })).toBe(false);
  });
});

describe("o resumo do fim do teste", () => {
  it("durante o teste, conta os dias do teste", () => {
    const access = { isPro: false, ...trial(3) };
    expect(trialRecap(access, false, now)).toEqual({
      phase: "active",
      from: access.profile.trialStartedAt,
      to: access.trialEndsAt,
    });
  });

  it("logo depois do teste, conta só os dias do teste", () => {
    const access = { isPro: false, ...trial(TRIAL_DAYS + 2) };
    expect(trialRecap(access, false, now)).toEqual({
      phase: "ended",
      from: access.profile.trialStartedAt,
      to: access.trialEndsAt,
    });
  });

  it("não diz que o teste terminou a quem assinou e cancelou", () => {
    expect(trialRecap({ isPro: false, ...trial(TRIAL_DAYS + 2) }, true, now)).toBeNull();
  });

  it("não diz que o teste terminou a quem volta meses depois", () => {
    expect(
      trialRecap({ isPro: false, ...trial(TRIAL_DAYS + TRIAL_RECAP_DAYS + 1) }, false, now),
    ).toBeNull();
    expect(trialRecap({ isPro: false, ...trial(120) }, false, now)).toBeNull();
  });

  it("não mostra resumo ao Pro nem a quem nunca começou o teste", () => {
    expect(trialRecap({ isPro: true, ...trial(3) }, true, now)).toBeNull();
    expect(trialRecap({ isPro: false, ...neverStarted }, false, now)).toBeNull();
  });

  it("um pagamento que nunca passou não conta como assinatura", () => {
    expect(hasEverSubscribed([])).toBe(false);
    expect(hasEverSubscribed([{ status: "incomplete_expired" }])).toBe(false);
    expect(hasEverSubscribed([{ status: "incomplete" }, { status: "canceled" }])).toBe(true);
  });
});
