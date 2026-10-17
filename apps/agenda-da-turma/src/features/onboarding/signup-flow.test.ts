import { describe, expect, it } from "vitest";
import { afterVerification, proOfferHref, signupSteps } from "./signup-flow";

describe("afterVerification", () => {
  it("sends an invited adult to the invitation, never to a child of their own", () => {
    expect(
      afterVerification({ next: "/familia/convite?token=abc", plan: { cycle: "annual" } }),
    ).toEqual({ kind: "next", href: "/familia/convite?token=abc" });
  });

  it("takes the Pro chosen on the sales page straight to checkout, in the same cycle", () => {
    // O anual escolhido na landing se perdia na escolha de plano.
    expect(afterVerification({ next: null, plan: { cycle: "annual" } })).toEqual({
      kind: "checkout",
      cycle: "annual",
    });
    expect(afterVerification({ next: null, plan: { cycle: "monthly" } })).toEqual({
      kind: "checkout",
      cycle: "monthly",
    });
  });

  it("keeps the Pro and its cycle when it arrives through the login, as the offer", () => {
    // Pro na landing, "Já tem conta? Entrar" e, no login, "Criar conta".
    expect(afterVerification({ next: "/upgrade?cycle=anual", plan: null })).toEqual({
      kind: "checkout",
      cycle: "annual",
    });
  });

  it("never lets a generic destination skip the child", () => {
    // O proxy põe `?next=` em toda rota protegida, inclusive Hoje e o início do
    // aplicativo instalado. Com a regra antiga, a conta nova ficava sem criança.
    expect(afterVerification({ next: "/dashboard", plan: null })).toEqual({
      kind: "child",
      continueTo: null,
    });
    expect(afterVerification({ next: "/upgrade?motivo=crianca", plan: null })).toEqual({
      kind: "child",
      continueTo: "/upgrade?motivo=crianca",
    });
  });

  it("brings the person back to where they were after the child, as a turma invite", () => {
    expect(afterVerification({ next: "/turmas/entrar?codigo=ABCDEFGHJKMN", plan: null })).toEqual({
      kind: "child",
      continueTo: "/turmas/entrar?codigo=ABCDEFGHJKMN",
    });
  });

  it("keeps everyone else in the signup: the child's name, then the first recado", () => {
    expect(afterVerification({ next: null, plan: null })).toEqual({
      kind: "child",
      continueTo: null,
    });
  });
});

describe("signupSteps", () => {
  it("shows only the steps of the path the person is on", () => {
    expect(signupSteps({ kind: "child", continueTo: null })).toEqual([
      "Conta",
      "Código",
      "Criança",
      "Recado",
    ]);
    expect(signupSteps({ kind: "child", continueTo: "/turmas/entrar?codigo=X" })).toEqual([
      "Conta",
      "Código",
      "Criança",
    ]);
    expect(signupSteps({ kind: "checkout", cycle: "annual" })).toEqual([
      "Conta",
      "Código",
      "Pagamento",
    ]);
    expect(signupSteps({ kind: "next", href: "/familia/convite?token=a" })).toEqual([
      "Conta",
      "Código",
    ]);
  });
});

describe("proOfferHref", () => {
  it("carries the chosen cycle to the Pro offer, in the words the URL uses", () => {
    // Quem já tem conta (login, recarga depois do código, pagamento cancelado)
    // cai aqui, e o anual não pode voltar a ser mensal no caminho.
    expect(proOfferHref("annual")).toBe("/upgrade?cycle=anual");
    expect(proOfferHref("monthly")).toBe("/upgrade?cycle=mensal");
  });
});
