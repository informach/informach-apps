import { describe, expect, it } from "vitest";
import { PedidoDeSalvamentoDePerfilSchema } from "./salvamento";

const gravacao = { operacao: "gravar", chave: "pontos", revisao: 0, conteudo: "MQ==" };
describe("lote final de dados de perfil", () => {
  it("recusa chaves repetidas, resolução, descarte, cota e bytes inválidos", () => {
    for (const dados of [
      [gravacao, gravacao],
      [{ ...gravacao, operacao: "resolver" }],
      [{ ...gravacao, operacao: "descartar" }],
      Array.from({ length: 17 }, (_, i) => ({ ...gravacao, chave: `k${i}` })),
      [{ ...gravacao, conteudo: "não é base64" }],
      [{ ...gravacao, conteudo: Buffer.alloc(65_537).toString("base64") }],
    ])
      expect(PedidoDeSalvamentoDePerfilSchema.safeParse({ dados }).success).toBe(false);
    expect(PedidoDeSalvamentoDePerfilSchema.parse({ dados: [gravacao] })).toEqual({
      dados: [gravacao],
    });
  });
});
