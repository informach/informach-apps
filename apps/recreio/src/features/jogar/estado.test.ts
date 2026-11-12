import { CODIGOS_DE_ERRO, ErroDoRecreio } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import {
  ESTADO_INICIAL,
  type EstadoDoHospedeiro,
  type EventoDoHospedeiro,
  type Parada,
  paradaDaMudanca,
  paradaDoErro,
  reduzir,
  textoDaParada,
} from "./estado";

function depois(...eventos: EventoDoHospedeiro[]): EstadoDoHospedeiro {
  return eventos.reduce(reduzir, ESTADO_INICIAL);
}

describe("estado da página do jogo", () => {
  it("abre, monta e joga", () => {
    expect(ESTADO_INICIAL).toEqual({ fase: "carregando" });
    expect(depois({ tipo: "montado" })).toEqual({ fase: "jogando" });
  });

  it("pergunta quando o perfil já joga em outro lugar e segue quando a pessoa confirma", () => {
    expect(depois({ tipo: "ja_aberto" })).toEqual({ fase: "ja_aberto" });
    expect(depois({ tipo: "ja_aberto" }, { tipo: "abrir" })).toEqual({ fase: "carregando" });
    expect(depois({ tipo: "ja_aberto" }, { tipo: "abrir" }, { tipo: "montado" })).toEqual({
      fase: "jogando",
    });
  });

  it("guarda o primeiro motivo de uma parada e aceita tentar de novo", () => {
    const parado = depois(
      { tipo: "montado" },
      { tipo: "parou", parada: "outro_lugar" },
      { tipo: "parou", parada: "rede" },
    );
    expect(parado).toEqual({ fase: "parado", parada: "outro_lugar" });
    expect(reduzir(parado, { tipo: "abrir" })).toEqual({ fase: "carregando" });
  });

  it("o que chega atrasado não muda o que a pessoa vê", () => {
    // Um "montado" depois da parada, ou a pergunta depois de já estar jogando.
    expect(depois({ tipo: "parou", parada: "iniciando" }, { tipo: "montado" })).toEqual({
      fase: "parado",
      parada: "iniciando",
    });
    expect(depois({ tipo: "montado" }, { tipo: "ja_aberto" })).toEqual({ fase: "jogando" });
    expect(depois({ tipo: "montado" }, { tipo: "abrir" })).toEqual({ fase: "jogando" });
  });

  it("quem está saindo não volta", () => {
    const saindo = depois({ tipo: "montado" }, { tipo: "sair" });
    expect(saindo).toEqual({ fase: "saindo" });
    for (const evento of [
      { tipo: "abrir" },
      { tipo: "montado" },
      { tipo: "ja_aberto" },
      { tipo: "parou", parada: "rede" },
    ] satisfies EventoDoHospedeiro[])
      expect(reduzir(saindo, evento)).toBe(saindo);
  });
});

describe("motivo de uma parada", () => {
  it.each<[ErroDoRecreio, Parada]>([
    [new ErroDoRecreio("NAO_AUTENTICADO"), "sem_login"],
    [new ErroDoRecreio("SEM_PERFIL"), "sem_login"],
    [new ErroDoRecreio("ACESSO_NEGADO", { estado: "ENCERRADO" }), "sem_acesso"],
    [new ErroDoRecreio("ACESSO_PERDIDO", { estado: "REVOGADO" }), "acesso_perdido"],
    [new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "signed_out" }), "saiu_da_conta"],
    [new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "replaced" }), "outro_lugar"],
    [new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "signed_out" }), "saiu_da_conta"],
    [new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "access_lost" }), "acesso_perdido"],
    [new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "expired" }), "sessao_encerrada"],
    [new ErroDoRecreio("SESSAO_ENCERRADA"), "sessao_encerrada"],
    [new ErroDoRecreio("SESSAO_INVALIDA"), "sessao_encerrada"],
    [new ErroDoRecreio("INGRESSO_INVALIDO"), "sessao_encerrada"],
    [new ErroDoRecreio("JOGO_INDISPONIVEL"), "jogo_indisponivel"],
    [new ErroDoRecreio("SEM_INSTANCIA"), "iniciando"],
    [new ErroDoRecreio("INDISPONIVEL"), "rede"],
    [new ErroDoRecreio("MUITAS_TENTATIVAS"), "rede"],
  ])("%o vira %s", (erro, parada) => {
    expect(paradaDoErro(erro)).toBe(parada);
  });

  it("mundo que não existe e mundo de outra pessoa dão a mesma resposta", () => {
    const respostas = (["NAO_MEMBRO", "NAO_ENCONTRADO", "MUNDO_INDISPONIVEL"] as const).map(
      (codigo) => textoDaParada(paradaDoErro(new ErroDoRecreio(codigo))),
    );
    expect(new Set(respostas).size).toBe(1);
    expect(respostas[0]?.titulo).toBe("Este mundo não está disponível");
  });

  it("o que não é recusa do Recreio é uma falha que dá para tentar de novo", () => {
    expect(paradaDoErro(new TypeError("Failed to fetch dynamically imported module"))).toBe(
      "falha",
    );
    expect(paradaDoErro(undefined)).toBe("falha");
    expect(textoDaParada("falha").acao).toBe("tentar");
  });

  it("todo código de erro do Recreio tem um motivo com texto", () => {
    for (const codigo of CODIGOS_DE_ERRO) {
      const texto = textoDaParada(paradaDoErro(new ErroDoRecreio(codigo)));
      expect(texto.titulo.length).toBeGreaterThan(5);
      expect(texto.texto.length).toBeGreaterThan(5);
    }
  });

  it("a mudança de acesso avisada pelo SDK vira o mesmo motivo que a recusa", () => {
    expect(paradaDaMudanca({ codigo: "ACESSO_PERDIDO", motivo: "signed_out" })).toBe(
      "saiu_da_conta",
    );
    expect(paradaDaMudanca({ codigo: "ACESSO_PERDIDO" })).toBe("acesso_perdido");
    expect(paradaDaMudanca({ codigo: "SESSAO_ENCERRADA", motivo: "replaced" })).toBe("outro_lugar");
    expect(paradaDaMudanca({ codigo: "SESSAO_INVALIDA" })).toBe("sessao_encerrada");
    expect(paradaDaMudanca({ codigo: "INDISPONIVEL" })).toBe("rede");
  });
});

describe("texto das paradas", () => {
  const PARADAS: Parada[] = [
    "sem_login",
    "sem_acesso",
    "acesso_perdido",
    "jogo_indisponivel",
    "mundo_indisponivel",
    "iniciando",
    "outro_lugar",
    "saiu_da_conta",
    "sessao_encerrada",
    "rede",
    "falha",
  ];

  it("é português simples, sem travessão", () => {
    for (const parada of PARADAS) {
      const { titulo, texto, rotulo } = textoDaParada(parada);
      for (const frase of [titulo, texto, rotulo ?? ""]) expect(frase).not.toMatch(/[—–]/);
    }
  });

  it("jogo iniciando pede para tentar de novo em instantes", () => {
    expect(textoDaParada("iniciando")).toEqual({
      titulo: "O jogo está iniciando",
      texto: "Tente de novo em instantes.",
      acao: "tentar",
    });
  });

  it("só oferece tentar de novo quando tentar pode dar certo", () => {
    const acoes = Object.fromEntries(PARADAS.map((parada) => [parada, textoDaParada(parada).acao]));
    expect(acoes).toEqual({
      sem_login: "entrar",
      sem_acesso: "nada",
      acesso_perdido: "nada",
      jogo_indisponivel: "nada",
      mundo_indisponivel: "nada",
      iniciando: "tentar",
      outro_lugar: "tentar",
      saiu_da_conta: "entrar",
      sessao_encerrada: "tentar",
      rede: "tentar",
      falha: "tentar",
    });
  });
});
