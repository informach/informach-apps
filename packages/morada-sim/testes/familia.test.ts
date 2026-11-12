import { describe, expect, it } from "vitest";
import { listar, ticksPorDia, verificarInvariantes } from "../src/index";
import { criarMundoDaProva, LIA } from "../src/testes";

describe("uma casa que funciona", () => {
  it("quatro moradores vivem sete dias por conta própria", () => {
    const mundo = criarMundoDaProva({
      conferirReplicacao: false,
      // Sete dias sem que ninguém mude de fase: a prova é do dia a dia.
      regras: { envelhecimento: "desligado" },
    });
    mundo.aplicar({ t: "sessao_entrou", sessaoId: "s", perfilId: LIA });
    const dia = ticksPorDia(mundo.estado.relogio);
    const familia = listar(mundo.estado.familias)[0];
    if (!familia) throw new Error("sem família");
    const quatro = listar(mundo.estado.moradores).filter((m) => m.familiaId === familia.id);
    expect(quatro).toHaveLength(4);

    const zerado: Record<string, number> = {};
    const pior: Record<string, number> = {};
    const fez: Record<string, Set<string>> = {};
    const porDia: Record<string, Set<string>>[] = [];

    for (let tick = 1; tick <= dia * 7; tick++) {
      mundo.avancar(100);
      if (tick % 100 === 0) {
        const problemas = verificarInvariantes(mundo.estado, mundo.presenca);
        if (problemas.length > 0) throw new Error(`tick ${tick}: ${problemas.join("; ")}`);
      }
      if (tick % 10 !== 0) continue;
      for (const morador of quatro) {
        for (const [necessidade, nivel] of Object.entries(morador.necessidades)) {
          const chave = `${morador.nome}:${necessidade}`;
          zerado[chave] = nivel === 0 ? (zerado[chave] ?? 0) + 10 : 0;
          pior[chave] = Math.max(pior[chave] ?? 0, zerado[chave] ?? 0);
        }
        const acao = morador.acaoAtual ? mundo.estado.acoes.porId[morador.acaoAtual] : undefined;
        if (acao?.estado === "executando") {
          fez[morador.nome] ??= new Set();
          fez[morador.nome]?.add(acao.interacao);
        }
      }
      if (tick % dia === 0) {
        porDia.push(
          Object.fromEntries(Object.entries(fez).map(([nome, feito]) => [nome, new Set(feito)])),
        );
        for (const nome of Object.keys(fez)) fez[nome] = new Set();
      }
    }

    // Nenhuma necessidade fica presa no zero: uma hora de jogo é o máximo tolerado.
    const presas = Object.entries(pior).filter(([, ticks]) => ticks >= 1200);
    expect(presas).toEqual([]);

    // Todo dia, todo mundo dormiu, comeu, foi ao banheiro e se lavou.
    expect(porDia).toHaveLength(7);
    porDia.forEach((feito, n) => {
      for (const morador of quatro) {
        const interacoes = feito[morador.nome] ?? new Set<string>();
        const algumaDe = (...opcoes: string[]) => opcoes.some((opcao) => interacoes.has(opcao));
        expect(algumaDe("dormir", "dormir_no_chao"), `${morador.nome} dormir no dia ${n + 1}`).toBe(
          true,
        );
        expect(algumaDe("comer", "cozinhar"), `${morador.nome} comer no dia ${n + 1}`).toBe(true);
        expect(algumaDe("usar_vaso"), `${morador.nome} banheiro no dia ${n + 1}`).toBe(true);
      }
    });
    const semana = new Set(porDia.flatMap((feito) => Object.values(feito).flatMap((s) => [...s])));
    for (const interacao of ["tomar_banho", "conversar", "ver_tv"]) {
      expect(semana, interacao).toContain(interacao);
    }

    // Ninguém desmaiou de sono mais de uma vez na semana.
    const desmaios = porDia.filter((feito) =>
      Object.values(feito).some((interacoes) => interacoes.has("dormir_no_chao")),
    ).length;
    expect(desmaios).toBeLessThanOrEqual(1);

    // Vida sem jogador comandando não cria fato nenhum além do que a vida exige.
    expect(listar(mundo.estado.gravidezes)).toEqual([]);
    expect(quatro.map((m) => m.familiaId)).toEqual(Array(4).fill(familia.id));
  }, 240_000);
});
