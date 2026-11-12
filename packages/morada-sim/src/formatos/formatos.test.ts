import { describe, expect, it } from "vitest";
import { BAIRRO_DA_PROVA, modeloDeImovel } from "../conteudo";
import { DefinicaoDeBairroSchema } from "./bairro";
import { type Migracao, migrar } from "./fotografia";
import { andaresNoLote, ModeloDeImovelSchema } from "./imovel";

describe("migração de formato", () => {
  // Uma cadeia de exemplo: a versão 2 renomeia um campo, a 3 acrescenta outro.
  const cadeia: Migracao[] = [
    {
      de: 1,
      migrar: (estado) => {
        const { nomeAntigo, ...resto } = estado;
        return { ...resto, nome: nomeAntigo };
      },
    },
    { de: 2, migrar: (estado) => ({ ...estado, novo: 0 }) },
  ];

  it("leva um mundo antigo pela cadeia inteira, passo a passo", () => {
    expect(migrar({ versao: 1, nomeAntigo: "Ipê" }, 3, cadeia)).toEqual({
      versao: 3,
      nome: "Ipê",
      novo: 0,
    });
    expect(migrar({ versao: 2, nome: "Ipê" }, 3, cadeia)).toEqual({
      versao: 3,
      nome: "Ipê",
      novo: 0,
    });
  });

  it("não mexe em quem já está na versão atual", () => {
    const atual = { versao: 3, nome: "Ipê", novo: 5 };
    expect(migrar(atual, 3, cadeia)).toBe(atual);
  });

  it("recusa versão mais nova que o código, versão ausente e cadeia com buraco", () => {
    expect(() => migrar({ versao: 4 }, 3, cadeia)).toThrow(/lê até a versão 3/);
    expect(() => migrar({}, 3, cadeia)).toThrow(/sem versão/);
    expect(() => migrar({ versao: 1 }, 3, [cadeia[1] as Migracao])).toThrow(/Falta a migração/);
  });
});

describe("mundo como dados", () => {
  it("o bairro da prova passa na validação e recusa campo a mais", () => {
    expect(DefinicaoDeBairroSchema.safeParse(BAIRRO_DA_PROVA).success).toBe(true);
    expect(DefinicaoDeBairroSchema.safeParse({ ...BAIRRO_DA_PROVA, extra: 1 }).success).toBe(false);
    expect(
      DefinicaoDeBairroSchema.safeParse({ ...BAIRRO_DA_PROVA, tamanho: [40000.5, 25000] }).success,
    ).toBe(false);
  });

  it("o modelo da casa só tem números inteiros e nenhum arquivo", () => {
    const modelo = modeloDeImovel("casa_prova@1");
    expect(modelo).toBeDefined();
    expect(ModeloDeImovelSchema.safeParse(modelo).success).toBe(true);
    expect(JSON.stringify(modelo)).not.toMatch(/\.glb|\.png|\.webp|http/);
  });

  it("levar a casa para o lote desloca tudo junto", () => {
    const modelo = modeloDeImovel("casa_prova@1");
    if (!modelo) throw new Error("sem modelo");
    const [andar] = andaresNoLote(modelo, [7500, 7500]);
    const original = modelo.andares[0];
    expect(andar?.paredes[0]?.a).toEqual([
      (original?.paredes[0]?.a[0] ?? 0) + 7500,
      (original?.paredes[0]?.a[1] ?? 0) + 7500,
    ]);
    expect(andar?.aberturas[0]?.centro).toEqual([
      (original?.aberturas[0]?.centro[0] ?? 0) + 7500,
      (original?.aberturas[0]?.centro[1] ?? 0) + 7500,
    ]);
    // O modelo não é alterado.
    expect(modeloDeImovel("casa_prova@1")).toEqual(modelo);
  });
});
