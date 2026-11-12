import { describe, expect, it } from "vitest";
import {
  ALFABETO_DO_CONVITE,
  formatarCodigoDeConvite,
  gerarCodigoDeConvite,
  normalizarCodigoDeConvite,
  TAMANHO_DO_CONVITE,
} from "./convite";
import { ErroDoRecreio, ehErroDoRecreio, statusDoErro } from "./erros";
import type { MembroId } from "./ids";
import { MundoIdSchema, PerfilIdSchema } from "./ids";
import {
  type MembroParaSucessao,
  nomeDeMundoValido,
  podeConvidar,
  sucessorDoResponsavel,
} from "./mundos";
import { deveSeCercar, FOLGA_DE_AUTOCERCA_MS, posseVigente } from "./posse";

describe("código de convite", () => {
  it("tem dez caracteres do alfabeto sem ambiguidade", () => {
    for (let i = 0; i < 200; i++) {
      const codigo = gerarCodigoDeConvite();
      expect(codigo).toHaveLength(TAMANHO_DO_CONVITE);
      for (const caractere of codigo) expect(ALFABETO_DO_CONVITE).toContain(caractere);
    }
    for (const confuso of "01ILO") expect(ALFABETO_DO_CONVITE).not.toContain(confuso);
  });

  it("descarta bytes que dariam viés", () => {
    // 255 está acima do maior múltiplo de 31 que cabe em um byte e é descartado.
    let chamada = 0;
    const codigo = gerarCodigoDeConvite((bytes) => {
      bytes.fill(chamada++ === 0 ? 255 : 0);
      return bytes;
    });
    expect(codigo).toBe("A".repeat(TAMANHO_DO_CONVITE));
    expect(chamada).toBe(2);
  });

  it("formata e aceita de volta o que a pessoa digita", () => {
    const codigo = "ABCDE23456";
    expect(formatarCodigoDeConvite(codigo)).toBe("ABCDE-23456");
    expect(normalizarCodigoDeConvite(" abcde-23456 ")).toBe(codigo);
    expect(normalizarCodigoDeConvite("ABCDE2345")).toBeNull();
    expect(normalizarCodigoDeConvite("ABCDE-2345O")).toBeNull();
  });
});

describe("identificadores", () => {
  it("aceita só UUID", () => {
    const uuid = "3f2b6c1e-8a4d-4c7b-9e21-5d0f6a7b8c9d";
    expect(PerfilIdSchema.parse(uuid)).toBe(uuid);
    expect(MundoIdSchema.safeParse("mundo-1").success).toBe(false);
    expect(PerfilIdSchema.safeParse("").success).toBe(false);
  });
});

describe("erros", () => {
  it("carrega código, status e detalhe estrutural", () => {
    const erro = new ErroDoRecreio("SEQUENCIA", { esperado: 7 });
    expect(erro.status).toBe(409);
    expect(statusDoErro("TAMANHO_EXCEDIDO")).toBe(413);
    expect(erro.detalhe).toEqual({ esperado: 7 });
    expect(ehErroDoRecreio(erro, "SEQUENCIA")).toBe(true);
    expect(ehErroDoRecreio(erro, "POSSE_PERDIDA")).toBe(false);
    expect(ehErroDoRecreio(new Error("x"))).toBe(false);
  });
});

describe("mundo", () => {
  const membro = (
    id: string,
    papel: MembroParaSucessao["papel"],
    dias: number,
    estado: MembroParaSucessao["estado"] = "active",
  ): MembroParaSucessao => ({
    id: id as MembroId,
    papel,
    estado,
    entrouEm: new Date(Date.UTC(2026, 0, 1 + dias)),
  });

  it("valida o nome pelo tamanho sem espaços das pontas", () => {
    expect(nomeDeMundoValido(" Ipê ")).toBe(true);
    expect(nomeDeMundoValido(" a ")).toBe(false);
    expect(nomeDeMundoValido("x".repeat(41))).toBe(false);
  });

  it("o coadministrador ativo mais antigo assume", () => {
    const sucessor = sucessorDoResponsavel([
      membro("dono", "steward", 0),
      membro("membro-antigo", "member", 1),
      membro("coadmin-novo", "coadmin", 5),
      membro("coadmin-antigo", "coadmin", 3),
      membro("coadmin-fora", "coadmin", 2, "former"),
    ]);
    expect(sucessor?.id).toBe("coadmin-antigo");
  });

  it("sem coadministrador, o membro ativo mais antigo assume", () => {
    const sucessor = sucessorDoResponsavel([
      membro("dono", "steward", 0),
      membro("b", "member", 4),
      membro("a", "member", 2),
      membro("sem-acesso", "member", 1, "no_access"),
    ]);
    expect(sucessor?.id).toBe("a");
  });

  it("sem ninguém ativo, o mundo fica sem responsável", () => {
    expect(sucessorDoResponsavel([membro("dono", "steward", 0)])).toBeNull();
    expect(sucessorDoResponsavel([])).toBeNull();
  });

  it("responsável e coadministrador sempre convidam; membro segue a opção do mundo", () => {
    expect(podeConvidar("steward", "no")).toEqual({ pode: true, precisaDeAprovacao: false });
    expect(podeConvidar("coadmin", "no")).toEqual({ pode: true, precisaDeAprovacao: false });
    expect(podeConvidar("member", "no")).toEqual({ pode: false, motivo: "papel" });
    expect(podeConvidar("member", "with_approval")).toEqual({
      pode: true,
      precisaDeAprovacao: true,
    });
    expect(podeConvidar("member", "yes")).toEqual({ pode: true, precisaDeAprovacao: false });
  });
});

describe("posse", () => {
  it("vale até o prazo, exclusive", () => {
    const agora = new Date(1_000_000);
    const posse = { cerca: 1, estado: "held" as const, expiraEm: new Date(1_000_001) };
    expect(posseVigente(posse, agora)).toBe(true);
    expect(posseVigente({ ...posse, expiraEm: agora }, agora)).toBe(false);
    expect(posseVigente(null, agora)).toBe(false);
  });

  it("a instância se cerca antes do prazo", () => {
    const expira = 100_000;
    expect(deveSeCercar(expira, expira - FOLGA_DE_AUTOCERCA_MS - 1)).toBe(false);
    expect(deveSeCercar(expira, expira - FOLGA_DE_AUTOCERCA_MS)).toBe(true);
  });
});
