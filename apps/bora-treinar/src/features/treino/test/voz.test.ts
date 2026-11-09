import { describe, expect, it } from "vitest";
import { contagemPelaVoz, ditos, JuntaContagem, numerosDitos, SALTO_MAXIMO } from "../engine/voz";
import { ajudaDaVoz, navegadorDe } from "../permissoes";

describe("o que mais a pessoa diz", () => {
  it("'mais um' soma um, sem precisar dizer o número", () => {
    expect(ditos("mais um")).toEqual([{ tipo: "mais" }]);
    expect(contagemPelaVoz(4, ditos("mais uma"))).toBe(5);
    expect(contagemPelaVoz(4, ditos("mais um, mais um"))).toBe(6);
  });

  it("'um' e 'uma' como artigo não contam", () => {
    expect(numerosDitos("uma vez")).toEqual([]);
    expect(numerosDitos("só um pouco")).toEqual([]);
    expect(numerosDitos("falta um")).toEqual([1]);
    expect(numerosDitos("um dois três")).toEqual([1, 2, 3]);
    expect(numerosDitos("um")).toEqual([1]);
  });

  it("entende o que o reconhecedor escreve do jeito que ouviu", () => {
    expect(numerosDitos("treis quatro sinco meia")).toEqual([3, 4, 5, 6]);
    expect(numerosDitos("deis")).toEqual([10]);
  });
});

describe("câmera e voz juntas", () => {
  it("a voz adiantada absorve a repetição que a câmera vê logo depois", () => {
    const j = new JuntaContagem(2500);
    j.voz(5, 6, 1000); // disse "seis" antes da câmera ver
    expect(j.camera(1800)).toBe(false); // é a mesma repetição
    expect(j.camera(3000)).toBe(true); // a próxima conta
  });

  it("se a câmera não confirma a tempo, a voz fica valendo sozinha", () => {
    const j = new JuntaContagem(2500);
    j.voz(5, 6, 1000);
    expect(j.camera(5000)).toBe(true);
  });

  it("série nova não herda nada adiantado", () => {
    const j = new JuntaContagem();
    j.voz(0, 2, 0);
    j.zerar();
    expect(j.camera(100)).toBe(true);
  });
});

describe("ajuda quando a voz não liga", () => {
  it("reconhece o navegador pelo agente", () => {
    expect(
      navegadorDe(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("ios");
    expect(
      navegadorDe(
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36",
      ),
    ).toBe("android-chrome");
    expect(
      navegadorDe("Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0"),
    ).toBe("firefox");
  });

  it("diz o caminho certo para cada falha", () => {
    expect(ajudaDaVoz("negado", "ios").texto).toMatch(/Ajustes › Safari › Microfone/);
    expect(ajudaDaVoz("servico", "ios").texto).toMatch(/Ditado/);
    expect(ajudaDaVoz("indisponivel", "firefox").titulo).toMatch(/não reconhece/);
  });
});

describe("números ditos", () => {
  it("entende por extenso, com e sem acento, e em algarismos", () => {
    expect(numerosDitos("um, dois, Três... quatro")).toEqual([1, 2, 3, 4]);
    expect(numerosDitos("tres")).toEqual([3]);
    expect(numerosDitos("1 2 3")).toEqual([1, 2, 3]);
    expect(numerosDitos("uma duas")).toEqual([1, 2]);
  });

  it("junta dezena e unidade ditas com 'e'", () => {
    expect(numerosDitos("dezenove vinte vinte e um vinte e dois")).toEqual([19, 20, 21, 22]);
    expect(numerosDitos("quatorze catorze quinze")).toEqual([14, 14, 15]);
    expect(numerosDitos("trinta e cinco")).toEqual([35]);
  });

  it("ignora o resto da fala", () => {
    expect(numerosDitos("vamos lá, força")).toEqual([]);
    expect(numerosDitos("quase lá: oito!")).toEqual([8]);
  });
});

describe("contagem pela voz", () => {
  it("só avança e aceita um número perdido no meio", () => {
    expect(contagemPelaVoz(0, [1, 2, 3])).toBe(3);
    expect(contagemPelaVoz(5, [7])).toBe(7);
  });

  it("ignora repetição, eco e números menores", () => {
    expect(contagemPelaVoz(6, [6, 5, 1])).toBe(6);
  });

  it("recusa saltos grandes, mais prováveis de serem erro de reconhecimento", () => {
    expect(contagemPelaVoz(2, [2 + SALTO_MAXIMO + 1])).toBe(2);
    expect(contagemPelaVoz(2, [20, 3])).toBe(3);
  });
});
