import { describe, expect, it } from "vitest";
import { GlobaisPostgresSchema } from "../../../scripts/backup/globais-postgres";

function fixture() {
  const papel = {
    nome: "fixture",
    superuser: true,
    herdar: true,
    criarPapel: true,
    criarBanco: true,
    login: true,
    replicacao: true,
    ignorarRls: true,
    conexoes: -1,
    validade: null,
    configuracoes: [],
  };
  return {
    formato: "recreio-globais-postgres-v1",
    operador: "fixture",
    papeis: [papel],
    membros: [],
  };
}
describe("metadados globais privados e perfil de recriação isolada", () => {
  it("admite o operador e memberships dos papéis nativos sem material de senha", () => {
    const f = fixture();
    const r = GlobaisPostgresSchema.parse({
      ...f,
      membros: [
        {
          papel: "pg_read_all_stats",
          membro: "pg_monitor",
          concedente: "fixture",
          admin: false,
          herdar: true,
          assumir: false,
        },
      ],
    });
    expect(r.membros).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/password|senha/);
  });
  it("recusa campos de senha em vez de transportá-los no backup", () => {
    const f = fixture(),
      p = f.papeis[0];
    if (!p) throw new Error("Fixture ausente");
    expect(
      GlobaisPostgresSchema.safeParse({ ...f, papeis: [{ ...p, password: "NAO_TRANSPORTAR" }] })
        .success,
    ).toBe(false);
  });
  it("recusa nome de papel com NUL e papel duplicado", () => {
    const f = fixture(),
      p = f.papeis[0];
    if (!p) throw new Error("Fixture ausente");
    expect(
      GlobaisPostgresSchema.safeParse({ ...f, papeis: [{ ...p, nome: "fixture\0" }] }).success,
    ).toBe(false);
    expect(GlobaisPostgresSchema.safeParse({ ...f, papeis: [p, p] }).success).toBe(false);
  });
  it("operador sem superuser não é silenciosamente promovido", () => {
    const f = fixture(),
      p = f.papeis[0];
    if (!p) throw new Error("Fixture ausente");
    expect(
      GlobaisPostgresSchema.safeParse({ ...f, papeis: [{ ...p, superuser: false }] }).success,
    ).toBe(false);
  });
  it("recusa GUC fora da lista e configuração duplicada", () => {
    const f = fixture(),
      p = f.papeis[0];
    if (!p) throw new Error("Fixture ausente");
    expect(
      GlobaisPostgresSchema.safeParse({
        ...f,
        papeis: [{ ...p, configuracoes: [{ nome: "custom.api_key", valor: "NAO_TRANSPORTAR" }] }],
      }).success,
    ).toBe(false);
    const c = { nome: "statement_timeout", valor: "15000ms" };
    expect(
      GlobaisPostgresSchema.safeParse({ ...f, papeis: [{ ...p, configuracoes: [c, c] }] }).success,
    ).toBe(false);
  });
  it("admite somente configurações delimitadas necessárias ao perfil", () => {
    const f = fixture(),
      p = f.papeis[0];
    if (!p) throw new Error("Fixture ausente");
    const r = GlobaisPostgresSchema.parse({
      ...f,
      papeis: [
        {
          ...p,
          configuracoes: [{ nome: "search_path", valor: '"Schema com espaços", pg_catalog' }],
        },
      ],
    });
    expect(r.papeis[0]?.configuracoes).toHaveLength(1);
  });
  it("recusa concedente diferente e membro inexistente no manifesto", () => {
    const f = fixture(),
      m = {
        papel: "pg_monitor",
        membro: "fixture",
        concedente: "outro",
        admin: false,
        herdar: true,
        assumir: true,
      };
    expect(GlobaisPostgresSchema.safeParse({ ...f, membros: [m] }).success).toBe(false);
    expect(
      GlobaisPostgresSchema.safeParse({
        ...f,
        membros: [{ ...m, concedente: "fixture", membro: "inexistente" }],
      }).success,
    ).toBe(false);
  });
  it("recusa membership duplicada", () => {
    const f = fixture(),
      m = {
        papel: "pg_monitor",
        membro: "fixture",
        concedente: "fixture",
        admin: false,
        herdar: true,
        assumir: true,
      };
    expect(GlobaisPostgresSchema.safeParse({ ...f, membros: [m, m] }).success).toBe(false);
  });
});
