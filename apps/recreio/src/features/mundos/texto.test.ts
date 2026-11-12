import { describe, expect, it } from "vitest";
import { mensagemDaRecusa } from "@/lib/recusas";
import { avisoDoMembro, contagemDeMembros, rotuloDoPapel } from "./texto";

describe("textos dos mundos", () => {
  it("nomeia os papéis e conta as pessoas", () => {
    expect(rotuloDoPapel("steward")).toBe("Responsável");
    expect(rotuloDoPapel("member")).toBe("Membro");
    expect(contagemDeMembros(1)).toBe("1 pessoa");
    expect(contagemDeMembros(4)).toBe("4 pessoas");
  });

  it("só avisa de membro que não está jogando normalmente", () => {
    expect(avisoDoMembro("active")).toBeNull();
    expect(avisoDoMembro("no_access")).toContain("sem acesso");
  });

  it("código errado, vencido ou usado tem a mesma mensagem, sem dizer qual", () => {
    const mensagem = mensagemDaRecusa("CONVITE_INVALIDO");
    expect(mensagem).toContain("incorreto");
    expect(mensagem).toContain("expirado");
    expect(mensagem).toContain("usado");
  });

  it("recusa que o portal não provoca fica sem mensagem própria", () => {
    expect(mensagemDaRecusa("POSSE_PERDIDA")).toBeNull();
    expect(mensagemDaRecusa("SEQUENCIA")).toBeNull();
  });

  it("nenhuma mensagem usa travessão", () => {
    for (const codigo of ["ACESSO_NEGADO", "LIMITE_DE_MUNDOS", "MUNDO_CHEIO", "JA_MEMBRO"] as const)
      expect(mensagemDaRecusa(codigo)).not.toMatch(/[\u2013\u2014]/);
  });
});
