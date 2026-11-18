import { describe, expect, it } from "vitest";
import { conferirSelecaoDaTroca, type PerfilParaTroca, type SelecaoDaTroca } from "./troca-selecao";

function fixture() {
  const atuais: PerfilParaTroca[] = ["perfil_b", "perfil_a"].map((id) => ({
    id,
    groupId: "grupo",
    policyVersion: 3,
    status: "active",
    podeCobrir: true,
  }));
  const selecao: SelecaoDaTroca[] = atuais.map((p, index) => ({
    profileReference: p.id,
    profileId: p.id,
    groupId: "grupo",
    policyVersion: p.policyVersion,
    coverageEnabled: index === 0,
  }));
  return {
    atuais,
    selecao,
    conferir: () => conferirSelecaoDaTroca("grupo", "recreio_individual_monthly", selecao, atuais),
  };
}

describe("seleção completa de perfis na troca de plano", () => {
  it("reduz cobertura conservando os IDs de todos, inclusive de quem fica guardado", () => {
    const f = fixture();
    const antes = structuredClone(f.selecao);
    expect(f.conferir()).toEqual([f.selecao[1], f.selecao[0]]);
    expect(f.selecao).toEqual(antes);
    expect(
      f
        .conferir()
        .filter((s) => s.coverageEnabled)
        .map((s) => s.profileReference),
    ).toEqual(["perfil_b"]);
  });
  it("revogação posterior invalida a escolha antiga mesmo se o perfil ainda está no grupo", () => {
    const f = fixture();
    const perfil = f.atuais[0];
    if (!perfil) throw new Error("Fixture absent");
    perfil.policyVersion++;
    expect(f.conferir).toThrow("perfis mudaram");
  });
  it("perda de responsabilidade e suspensão impedem cobertura sem apagar o perfil", () => {
    const f = fixture();
    const perfil = f.atuais[0];
    if (!perfil) throw new Error("Fixture absent");
    perfil.podeCobrir = false;
    expect(f.conferir).toThrow("perfis mudaram");
    perfil.podeCobrir = true;
    perfil.status = "suspended";
    expect(f.conferir).toThrow("perfis mudaram");
    expect(f.atuais).toHaveLength(2);
  });
  it("perfil excluído não pode ser substituído por outro ID", () => {
    const f = fixture();
    const escolha = f.selecao[0];
    const perfil = f.atuais[0];
    if (!escolha || !perfil) throw new Error("Fixture absent");
    escolha.profileId = null;
    expect(f.conferir).toThrow("perfis mudaram");
    escolha.profileId = escolha.profileReference;
    perfil.id = "outro_perfil";
    expect(f.conferir).toThrow("perfis mudaram");
  });
  it("entrada, saída, duplicação ou troca de grupo exige nova seleção", () => {
    const f = fixture();
    const perfil = f.atuais[0];
    const escolha = f.selecao[0];
    if (!perfil || !escolha) throw new Error("Fixture absent");
    for (const atuais of [
      f.atuais.slice(1),
      [...f.atuais, { ...perfil, id: "novo" }],
      [perfil, perfil],
      [{ ...perfil, groupId: "outro" }, ...f.atuais.slice(1)],
    ])
      expect(() =>
        conferirSelecaoDaTroca("grupo", "recreio_individual_monthly", f.selecao, atuais),
      ).toThrow("perfis mudaram");
    expect(() =>
      conferirSelecaoDaTroca("grupo", "recreio_individual_monthly", [escolha, escolha], f.atuais),
    ).toThrow("perfis mudaram");
    escolha.groupId = "outro";
    expect(f.conferir).toThrow("perfis mudaram");
  });
  it("a capacidade vem da oferta aprovada e nunca do recibo ou do navegador", () => {
    const f = fixture();
    for (const escolha of f.selecao) escolha.coverageEnabled = true;
    expect(f.conferir).toThrow("excede a cobertura");
    expect(
      conferirSelecaoDaTroca("grupo", "recreio_family_annual", f.selecao, f.atuais),
    ).toHaveLength(2);
    expect(() => conferirSelecaoDaTroca("grupo", "compasso_annual", f.selecao, f.atuais)).toThrow(
      "oferta atual",
    );
  });
  it("pagante sem jogador pode manter seleção vazia e perfis suspensos guardados", () => {
    expect(conferirSelecaoDaTroca("grupo", "recreio_individual_annual", [], [])).toEqual([]);
    const f = fixture();
    const perfil = f.atuais[1];
    if (!perfil) throw new Error("Fixture absent");
    perfil.status = "suspended";
    perfil.podeCobrir = false;
    expect(f.conferir()).toHaveLength(2);
  });
  it.each([0, -1, 1.2, 2147483646, Number.NaN])("recusa revisão inválida %s", (revision) => {
    const f = fixture();
    for (const escolha of f.selecao) escolha.policyVersion = revision;
    for (const perfil of f.atuais) perfil.policyVersion = revision;
    expect(f.conferir).toThrow("perfis mudaram");
  });
});
