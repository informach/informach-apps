import { describe, expect, it } from "vitest";
import { bytesParaBase64 } from "../transporte/bytes";
import { ChaveDeDadosSchema, MutacaoDeDadosSchema } from "./dados";

describe("contrato de progresso privado", () => {
  it.each(["../chave", "a/b", "nome com espaço", "", "a".repeat(65)])(
    "recusa chave fora do formato: %s",
    (chave) => {
      expect(ChaveDeDadosSchema.safeParse(chave).success).toBe(false);
    },
  );
  it.each(["YQ", "YR==", " YQ==", "%%%", "YQ==\n"])(
    "recusa base64 não canônico: %s",
    (conteudo) => {
      expect(
        MutacaoDeDadosSchema.safeParse({
          operacao: "gravar",
          chave: "progresso",
          revisao: 0,
          conteudo,
        }).success,
      ).toBe(false);
    },
  );
  it("aceita 64 KiB e recusa um byte além, revisões inválidas e perfil injetado", () => {
    const valido = {
      operacao: "gravar",
      chave: "progresso",
      revisao: 0,
      conteudo: bytesParaBase64(new Uint8Array(65536)),
    };
    expect(MutacaoDeDadosSchema.safeParse(valido).success).toBe(true);
    expect(
      MutacaoDeDadosSchema.safeParse({
        ...valido,
        conteudo: bytesParaBase64(new Uint8Array(65537)),
      }).success,
    ).toBe(false);
    for (const revisao of [-1, 0.5, 2147483647])
      expect(MutacaoDeDadosSchema.safeParse({ ...valido, revisao }).success).toBe(false);
    expect(
      MutacaoDeDadosSchema.safeParse({ ...valido, perfilId: crypto.randomUUID() }).success,
    ).toBe(false);
  });
});
