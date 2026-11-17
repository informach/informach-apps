import { describe, expect, it } from "vitest";
import { accountReturnDestination } from "./return";

describe("account continuation", () => {
  it("returns to privacy after a fresh credential entry", () => {
    expect(accountReturnDestination("/#privacidade")).toBe("/#privacidade");
    expect(accountReturnDestination("/privacidade/encerramento")).toBe("/privacidade/encerramento");
  });
  it("preserves a family and annual selection without starting a purchase", () => {
    const path = "/?familia=670e4d51-ea33-441c-a74e-f154bc7f872c&plano=anual#compasso";
    expect(accountReturnDestination(path)).toBe(path);
  });
  it("preserves the selected billing account after payment setup", () => {
    const path = "/?pagamento=670e4d51-ea33-441c-a74e-f154bc7f872c#compasso";
    expect(accountReturnDestination(path)).toBe(path);
  });
  it.each([
    "https://evil.test/",
    "//evil.test/",
    "/\\evil.test/",
    "/api/auth/sign-out",
    "/privacidade/encerramento?next=https://evil.test/",
    "/privacidade/encerramento#unknown",
    "/?plano=anual&plano=mensal",
    "/?plano=invalid",
    "/?familia=invalid",
    "/?next=https://evil.test/",
    "/#unknown",
    undefined,
  ])("rejects foreign or ambiguous destinations: %s", (input) => {
    expect(accountReturnDestination(input)).toBe("/");
  });
});
