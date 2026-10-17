import { describe, expect, it } from "vitest";
import { unsubscribeMessage } from "./unsubscribe-message";

describe("frase do descadastro do Bastidores", () => {
  it("diz que o resumo da semana para e que os avisos de queda continuam", () => {
    const text = unsubscribeMessage("admin.weekly-summary");
    expect(text).toContain("resumo da semana não chega mais");
    expect(text).toContain("avisos de queda de serviço continuam chegando");
  });

  it("diz que o aviso de queda não obedece ao descadastro", () => {
    const text = unsubscribeMessage("admin.alert");
    expect(text).toContain("continuam chegando, mesmo com o descadastro");
    expect(text).not.toContain("Pronto");
  });

  it("explica que e-mail de acesso continua", () => {
    expect(unsubscribeMessage("auth.two-factor-setup-otp")).toContain("e-mails de acesso");
  });

  it("não usa travessão", () => {
    for (const category of ["admin.weekly-summary", "admin.alert", "auth.sign-in-otp", "x"]) {
      const text = unsubscribeMessage(category);
      const dashes = [0x2013, 0x2014].map((code) => String.fromCharCode(code));
      expect(
        dashes.some((dash) => text.includes(dash)),
        category,
      ).toBe(false);
    }
  });
});
