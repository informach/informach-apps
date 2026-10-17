import { describe, expect, it } from "vitest";
import { failureMessage } from "./failure-copy";

const wrapped = (channel: string, message: string) =>
  new Error(`Error invoking remote method '${channel}': Error: ${message}`);

describe("Hub failure copy", () => {
  it("strips the Electron wrapper and keeps messages written for people", () => {
    expect(
      failureMessage("open", wrapped("hub:open", "Instale a ferramenta antes de abri-la.")),
    ).toBe("Instale a ferramenta antes de abri-la.");
    expect(failureMessage("open", wrapped("hub:open", "edi_access_restricted"))).toMatch(
      /assinatura ativa/,
    );
  });
  it("never shows technical English to the person", () => {
    expect(failureMessage("open", wrapped("hub:open", "spawn ENOENT"))).toBe(
      "Não foi possível abrir a ferramenta. Tente de novo.",
    );
    expect(failureMessage("updates", new Error("net::ERR_INTERNET_DISCONNECTED"))).toMatch(
      /atualizações/,
    );
    expect(failureMessage("account", "not an error")).toMatch(/navegador/);
    expect(failureMessage("logout", wrapped("edi:logout", "vault EACCES"))).toBe(
      "Não foi possível sair deste computador. Tente de novo.",
    );
  });
});
