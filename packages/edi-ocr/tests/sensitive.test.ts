import { describe, expect, it } from "vitest";
import {
  brazilianPhone,
  findSensitiveData,
  isValidCnpj,
  isValidCpf,
  type SensitiveWord,
} from "../src/sensitive.ts";

/** Lay words out left to right on their lines, 10 px per character. */
function layout(lines: string[]): SensitiveWord[] {
  return lines.flatMap((line, index) => {
    let x = 0;
    return line.split(" ").map((text) => {
      const word = {
        text,
        line: index,
        x0: x,
        y0: index * 30,
        x1: x + text.length * 10,
        y1: index * 30 + 20,
      };
      x = word.x1 + 10;
      return word;
    });
  });
}

describe("check digits", () => {
  it("validates CPF and rejects wrong or repeated digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247")).toBe(false);
  });

  it("validates numeric and alphanumeric CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    // Example published by the Receita Federal for the alphanumeric CNPJ.
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
  });

  it("recognizes Brazilian phone shapes", () => {
    expect(brazilianPhone("(11) 91234-5678")).toBe("high");
    expect(brazilianPhone("+55 21 3456-7890")).toBe("high");
    expect(brazilianPhone("11 81234-5678")).toBeUndefined();
    expect(brazilianPhone("(10) 91234-5678")).toBeUndefined();
    expect(brazilianPhone("91234-5678")).toBe("medium");
    expect(brazilianPhone("912345678")).toBeUndefined();
  });
});

describe("findSensitiveData", () => {
  it("finds each kind with the boxes of the words it touches", () => {
    const words = layout([
      "Contato: maria.silva@exemplo.com.br",
      "Tel. (11) 91234-5678",
      "CPF 529.982.247-25 CNPJ 11.222.333/0001-81",
      "senha: Tr0ub4dor&3",
      "chave sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123",
    ]);
    const found = findSensitiveData(words);
    expect(found.map((match) => [match.kind, match.text])).toEqual([
      ["email", "maria.silva@exemplo.com.br"],
      ["phone", "(11) 91234-5678"],
      ["cpf", "529.982.247-25"],
      ["cnpj", "11.222.333/0001-81"],
      ["credential", "Tr0ub4dor&3"],
      ["credential", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123"],
    ]);
    const phone = found[1];
    expect(phone?.words).toEqual([3, 4]);
    expect(phone?.boxes).toEqual([
      { x0: 50, y0: 30, x1: 90, y1: 50 },
      { x0: 100, y0: 30, x1: 200, y1: 50 },
    ]);
    expect(phone?.bounds).toEqual({ x0: 50, y0: 30, x1: 200, y1: 50 });
    expect(found.find((match) => match.kind === "cpf")?.confidence).toBe("high");
  });

  it("ignores numbers with invalid check digits and plain prose", () => {
    const words = layout([
      "CPF 529.982.247-24 CNPJ 11.222.333/0001-80",
      "Pedido 12345678 entregue em 2026",
      "Relatório anual da organização sem dados pessoais",
    ]);
    expect(findSensitiveData(words)).toEqual([]);
  });

  it("returns the whole word when the value is inside it and honours kind filters", () => {
    const words = layout(["password=Segredo123 contato@exemplo.org"]);
    const credential = findSensitiveData(words, { kinds: ["credential"] });
    expect(credential).toHaveLength(1);
    expect(credential[0]?.text).toBe("Segredo123");
    expect(credential[0]?.boxes).toEqual([{ x0: 0, y0: 0, x1: 190, y1: 20 }]);
    expect(findSensitiveData(words, { kinds: ["email"] }).map((match) => match.text)).toEqual([
      "contato@exemplo.org",
    ]);
  });

  it("flags long random tokens but not long ordinary words or hashes", () => {
    const words = layout([
      "token aB3dE5fG7hJ9kL1mN2pQ4rS6tU8vW0x",
      "inconstitucionalissimamente",
      "3f786850e387550fdab836ed7e6dc881de23001b",
    ]);
    const found = findSensitiveData(words);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(0);
  });

  it("does not cross lines and stops at the match limit", () => {
    const words = layout(["(11)", "91234-5678 a@b.co c@d.co"]);
    expect(findSensitiveData(words).map((match) => match.kind)).toEqual([
      "phone",
      "email",
      "email",
    ]);
    expect(findSensitiveData(words)[0]?.confidence).toBe("medium");
    expect(findSensitiveData(words, { maxMatches: 1 })).toHaveLength(1);
  });
});
