import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoordinationForm } from "./coordination-form";

const fixture = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("./coordination-actions", () => ({ coordinationAction: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: () => [fixture.state, () => {}, false],
}));

describe("payer coordination presentation", () => {
  const props = {
    accountId: "00000000-0000-4000-8000-000000000001",
    coordination: {
      state: "open",
      amountCents: 4990,
      fromChargeAt: new Date("2027-01-01T12:00:00Z"),
      deferUntil: new Date("2027-02-01T12:00:00Z"),
    },
    previewEnabled: true,
    acceptEnabled: false,
    declineEnabled: true,
  };
  beforeEach(() => {
    fixture.state = { ok: false, message: "" };
  });
  it("keeps preview and refusal available while new commercial changes are paused", () => {
    fixture.state = {
      ok: true,
      message: "Confira as datas antes de decidir.",
      preview: {
        accountId: props.accountId,
        revision: "a".repeat(64),
        requestKey: props.accountId,
        amountCents: 4990,
        interval: "month",
        fromChargeAt: props.coordination.fromChargeAt.toISOString(),
        deferUntil: props.coordination.deferUntil.toISOString(),
      },
    };
    const html = renderToStaticMarkup(createElement(CoordinationForm, props));
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Atualizar prévia<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Adiar minha cobrança<\/button>/);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Manter a data atual<\/button>/);
  });
  it("does not announce a date as applied while its provider response is pending", () => {
    for (const state of ["payer_accepted", "applying", "review"]) {
      const html = renderToStaticMarkup(
        createElement(CoordinationForm, {
          ...props,
          coordination: { ...props.coordination, state },
        }),
      );
      expect(html).not.toContain("Próxima cobrança adiada para");
      expect(html).toContain(
        state === "review" ? "precisa ser confirmada" : "Aguarde a confirmação",
      );
    }
  });
  it("announces the confirmed date after the provider effect was applied", () => {
    const html = renderToStaticMarkup(
      createElement(CoordinationForm, {
        ...props,
        coordination: { ...props.coordination, state: "applied" },
      }),
    );
    expect(html).toContain("Próxima cobrança adiada para");
  });
});
