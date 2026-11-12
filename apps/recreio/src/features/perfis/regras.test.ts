import { describe, expect, it } from "vitest";
import { AVATARES, avatarConhecido, inicialDoApelido } from "./avatares";
import { ApelidoSchema, NovoPerfilSchema } from "./regras";

describe("apelido", () => {
  it("tira os espaços das pontas e junta os do meio", () => {
    expect(ApelidoSchema.parse("  Lia   da  Silva ")).toBe("Lia da Silva");
  });

  it("aceita de 2 a 20 caracteres, contando depois de limpar", () => {
    expect(ApelidoSchema.safeParse("Li").success).toBe(true);
    expect(ApelidoSchema.safeParse("a".repeat(20)).success).toBe(true);
    expect(ApelidoSchema.safeParse("L").success).toBe(false);
    expect(ApelidoSchema.safeParse(" L ").success).toBe(false);
    expect(ApelidoSchema.safeParse("a".repeat(21)).success).toBe(false);
  });

  it("conta caracteres como o banco: um emoji vale um", () => {
    // Um emoji tem duas unidades UTF-16, mas é um caractere só para o `char_length`.
    expect(ApelidoSchema.safeParse("🙂").success).toBe(false);
    expect(ApelidoSchema.safeParse("🙂".repeat(20)).success).toBe(true);
    expect(ApelidoSchema.safeParse("🙂".repeat(21)).success).toBe(false);
  });

  it("recusa caracteres de controle e o que não é texto", () => {
    expect(ApelidoSchema.safeParse(`Li${String.fromCharCode(0)}a`).success).toBe(false);
    expect(ApelidoSchema.safeParse(`Li${String.fromCharCode(27)}a`).success).toBe(false);
    expect(ApelidoSchema.safeParse(42).success).toBe(false);
    expect(ApelidoSchema.safeParse("a".repeat(201)).success).toBe(false);
  });
});

describe("novo perfil", () => {
  it("só aceita avatar do conjunto fixo e nenhum campo a mais", () => {
    expect(NovoPerfilSchema.parse({ apelido: "Lia", avatar: "sol" })).toEqual({
      apelido: "Lia",
      avatar: "sol",
    });
    expect(NovoPerfilSchema.safeParse({ apelido: "Lia", avatar: "dragao" }).success).toBe(false);
    expect(
      NovoPerfilSchema.safeParse({ apelido: "Lia", avatar: "sol", perfilId: "x" }).success,
    ).toBe(false);
  });

  it("o padrão da coluna faz parte do conjunto", () => {
    expect(AVATARES).toContain("padrao");
    expect(avatarConhecido("sol")).toBe("sol");
    expect(avatarConhecido("de-outra-versao")).toBe("padrao");
  });
});

describe("inicial do apelido", () => {
  it("usa o primeiro caractere, em maiúscula", () => {
    expect(inicialDoApelido("lia")).toBe("L");
    expect(inicialDoApelido("érica")).toBe("É");
    expect(inicialDoApelido("🙂 Lia")).toBe("🙂");
    expect(inicialDoApelido("")).toBe("?");
  });
});
