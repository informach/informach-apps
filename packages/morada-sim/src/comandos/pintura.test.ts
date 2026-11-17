import { describe, expect, it } from "vitest";
import {
  conferirCatalogoDePinturas,
  conferirDisponibilidadeDasPinturas,
  type MovelPintado,
  PinturaDoMovelSchema,
} from "./pintura";

const perfil = "a".repeat(64);
const entrada = {
  catalogo: "rack_pes_2portas_vermelho",
  versaoDoCatalogo: 1,
  perfil,
  rotulo: "Estrutura",
  referencia: 0xe5484d,
};
const catalogo = () =>
  conferirCatalogoDePinturas({ formato: "morada.pinturas", versao: 1, perfis: [entrada] });

describe("perfil explícito de pintura de móvel", () => {
  it("conserva preto e branco como escolhas, distintas da arte original", () => {
    expect(PinturaDoMovelSchema.parse({ perfil, cor: 0 })).toEqual({ perfil, cor: 0 });
    expect(PinturaDoMovelSchema.parse({ perfil, cor: 0xffffff })).toEqual({
      perfil,
      cor: 0xffffff,
    });
    expect(PinturaDoMovelSchema.nullable().parse(null)).toBeNull();
  });
  it("recusa cor fracionária, fora do RGB, perfil curto ou arquivo/URL do cliente", () => {
    for (const cor of [-1, 1.5, 0x1000000, Number.NaN])
      expect(PinturaDoMovelSchema.safeParse({ perfil, cor }).success).toBe(false);
    expect(PinturaDoMovelSchema.safeParse({ perfil: "a", cor: 0 }).success).toBe(false);
    expect(
      PinturaDoMovelSchema.safeParse({ perfil, cor: 0, arquivo: "https://outro.test/mascara.png" })
        .success,
    ).toBe(false);
  });
  it("exige correspondência exata com a peça e não admite perfil repetido", () => {
    expect(catalogo().perfis).toHaveLength(1);
    for (const item of [
      { ...entrada, catalogo: "inexistente" },
      { ...entrada, versaoDoCatalogo: 2 },
    ])
      expect(() =>
        conferirCatalogoDePinturas({ formato: "morada.pinturas", versao: 1, perfis: [item] }),
      ).toThrow(/incompatível/);
    expect(() =>
      conferirCatalogoDePinturas({
        formato: "morada.pinturas",
        versao: 1,
        perfis: [entrada, entrada],
      }),
    ).toThrow(/repetido/);
  });
  it("originais continuam legíveis sem pintura; uma peça pintada exige o mesmo perfil instalado", () => {
    const movel: MovelPintado = { catalogo: entrada.catalogo, versao: 1, pintura: null };
    expect(() => conferirDisponibilidadeDasPinturas([movel], null, null)).not.toThrow();
    movel.pintura = { perfil, cor: 0 };
    expect(() => conferirDisponibilidadeDasPinturas([movel], catalogo(), catalogo())).not.toThrow();
    expect(() => conferirDisponibilidadeDasPinturas([movel], catalogo(), null)).toThrow(
      /compatível/,
    );
    expect(() => conferirDisponibilidadeDasPinturas([movel], null, catalogo())).toThrow(
      /compatível/,
    );
    const outro = catalogo();
    const item = outro.perfis[0];
    if (!item) throw new Error("Perfil ausente");
    item.perfil = "b".repeat(64);
    expect(() => conferirDisponibilidadeDasPinturas([movel], catalogo(), outro)).toThrow(
      /compatível/,
    );
  });
});
