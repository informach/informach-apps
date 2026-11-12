import { criarMundoDaProva, LIA, moradorDeNome } from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { estadoDoEspelho } from "../espelho/estado";
import { textoDoEvento } from "./eventos";

describe("avisos de uma vez só", () => {
  it("a recusa de uma ação diz o motivo, com o detalhe quando o servidor manda um", () => {
    const mundo = criarMundoDaProva();
    const estado = estadoDoEspelho(mundo.visao(LIA), 0);
    const lia = moradorDeNome(mundo, "Lia");
    const marcos = moradorDeNome(mundo, "Marcos");
    const recusou = { t: "recusou", loteId: null, moradorId: lia.id } as const;

    expect(textoDoEvento(estado, { ...recusou, motivo: "ocupado" }, lia.id)).toEqual({
      tom: "recusa",
      texto: "Lia desistiu: está ocupado agora.",
    });
    // Um pedido de vida que deixou de caber no meio do caminho traz o porquê.
    expect(
      textoDoEvento(estado, { ...recusou, motivo: "requisito", detalhe: "parentes" }, lia.id),
    ).toEqual({ tom: "recusa", texto: "Lia desistiu: são parentes." });
    // A recusa só interessa a quem dirige o morador.
    expect(textoDoEvento(estado, { ...recusou, motivo: "ocupado" }, marcos.id)).toBeNull();
  });

  it("casal e fase chegam como os tipos do domínio e viram frase", () => {
    const mundo = criarMundoDaProva();
    const estado = estadoDoEspelho(mundo.visao(LIA), 0);
    const lia = moradorDeNome(mundo, "Lia");
    const marcos = moradorDeNome(mundo, "Marcos");
    const nina = moradorDeNome(mundo, "Nina");
    expect(
      textoDoEvento(
        estado,
        { t: "casal", loteId: null, a: lia.id, b: marcos.id, casal: "casamento" },
        null,
      )?.texto,
    ).toBe("Lia e Marcos se casaram.");
    expect(
      textoDoEvento(
        estado,
        { t: "cresceu", loteId: null, moradorId: nina.id, fase: "adolescente" },
        null,
      )?.texto,
    ).toBe("Nina cresceu: agora é adolescente.");
  });
});
