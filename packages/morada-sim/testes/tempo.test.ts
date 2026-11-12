import { describe, expect, it } from "vitest";
import type { Familia, Morador, Mundo, PoliticaDeAvanco } from "../src/index";
import { DIA_MS, listar, ticksPorDia } from "../src/index";
import {
  bairroComCasal,
  bairroComVizinhos,
  criarMundoDaProva,
  criarRoteiro,
  LIA,
  moradorDeNome,
} from "../src/testes";

const VIZINHO = "perfil-vizinho";

/**
 * Duas famílias no mesmo mundo: a Ipê, da Lia, e a Jatobá, de outra pessoa.
 * A Lia joga; a outra pessoa está fora.
 */
function vizinhos(
  politica: PoliticaDeAvanco,
  regras: Parameters<typeof criarMundoDaProva>[0] = {},
) {
  const mundo = criarMundoDaProva({
    definicao: bairroComVizinhos(),
    conferirReplicacao: false,
    regras: { politicaDeAvanco: politica, diasDeJogoPorDiaReal: 1, ...regras.regras },
  });
  const [ipe, jatoba] = listar(mundo.estado.familias) as [Familia, Familia];
  // Cada família tem o seu jogador.
  mundo.aplicar({ t: "revogar_acesso", perfilId: LIA, familiaId: jatoba.id });
  mundo.aplicar({
    t: "conceder_acesso",
    perfilId: VIZINHO,
    familiaId: jatoba.id,
    permissoes: ["ver", "comandar", "decidir_vida"],
  });
  const roteiro = criarRoteiro(mundo, { conferirACada: 500 });
  roteiro.entrar(LIA);
  return { mundo, roteiro, ipe, jatoba, bela: moradorDeNome(mundo, "Bela") };
}

const dias = (mundo: Mundo, n: number) => Math.floor(ticksPorDia(mundo.estado.relogio) * n);

describe("políticas de avanço", () => {
  it("vida em suspenso: a família de quem está fora não envelhece nem muda de fase", () => {
    const { mundo, roteiro, ipe, jatoba, bela } = vizinhos("suspenso");
    // A criança da prova muda de fase em 4 dias.
    roteiro.andar(dias(mundo, 4.2));

    expect(ipe.vidaMs).toBeGreaterThanOrEqual(4 * DIA_MS);
    expect(moradorDeNome(mundo, "Nina").fase).toBe("adolescente");
    expect(jatoba.vidaMs).toBe(0);
    expect(bela.fase).toBe("crianca");
    expect(bela.idadeNaFaseMs).toBe(0);
    // Mas a família ausente continua vivendo: as necessidades andam e ela age.
    const rui = moradorDeNome(mundo, "Rui");
    expect(rui.necessidades.fome).toBeLessThan(900_000);
    const agiu = roteiro.saida.mudancas.some(
      (m) => m.t === "p" && m.tabela === "acoes" && m.campos.moradorId === rui.id,
    );
    expect(agiu).toBe(true);

    // Quando o jogador dela volta, o relógio de vida dela anda de onde parou.
    roteiro.entrar(VIZINHO);
    roteiro.andar(dias(mundo, 0.5));
    expect(jatoba.vidaMs).toBeGreaterThan(0);
    expect(jatoba.vidaMs).toBeLessThan(DIA_MS);
    expect(bela.fase).toBe("crianca");
  }, 120_000);

  it("avanço limitado: anda até o teto do dia real e nada irreversível acontece", () => {
    const { mundo, roteiro, jatoba, bela } = vizinhos("limitado");
    mundo.aplicar({ t: "dia_real", dia: 20_000 });
    roteiro.andar(dias(mundo, 2));
    // O teto é de um dia de jogo por dia real.
    expect(jatoba.vidaMs).toBe(DIA_MS);
    const idade = bela.idadeNaFaseMs;
    roteiro.andar(dias(mundo, 1));
    expect(jatoba.vidaMs).toBe(DIA_MS);
    expect(bela.idadeNaFaseMs).toBe(idade);

    // No dia real seguinte, o teto volta. Em cinco dias reais passam cinco dias de jogo.
    for (let dia = 1; dia <= 4; dia++) {
      mundo.aplicar({ t: "dia_real", dia: 20_000 + dia });
      roteiro.andar(dias(mundo, 1.5));
    }
    expect(jatoba.vidaMs).toBe(5 * DIA_MS);
    // Passou da idade de mudar de fase, mas isso só acontece com alguém presente.
    expect(bela.idadeNaFaseMs).toBeGreaterThan(4 * DIA_MS);
    expect(bela.fase).toBe("crianca");

    roteiro.entrar(VIZINHO);
    roteiro.andar(5);
    expect(bela.fase).toBe("adolescente");
  }, 180_000);

  it("bairro em sincronia: a família ausente vive no mesmo ritmo", () => {
    const { mundo, roteiro, ipe, jatoba, bela } = vizinhos("sincronia");
    roteiro.andar(dias(mundo, 4.2));
    expect(jatoba.vidaMs).toBe(ipe.vidaMs);
    expect(bela.fase).toBe("adolescente");
  }, 120_000);

  it("um mundo em que toda família tem alguém presente anda livre", () => {
    const { mundo, roteiro, ipe, jatoba } = vizinhos("suspenso");
    roteiro.entrar(VIZINHO);
    roteiro.andar(dias(mundo, 0.5));
    expect(jatoba.vidaMs).toBe(ipe.vidaMs);
    expect(jatoba.vidaMs).toBeGreaterThan(0);
  });

  it("quem caiu e ainda pode voltar conta como presente", () => {
    const { mundo, roteiro, jatoba } = vizinhos("suspenso");
    const sessao = roteiro.entrar(VIZINHO);
    roteiro.andar(100);
    const antes = jatoba.vidaMs;
    mundo.aplicar({ t: "sessao_caiu", sessaoId: sessao, agoraMs: 0 });
    roteiro.andar(100);
    expect(jatoba.vidaMs).toBeGreaterThan(antes);
    const naQueda = jatoba.vidaMs;
    mundo.aplicar({ t: "expirar", agoraMs: 30_000 });
    roteiro.andar(100);
    expect(jatoba.vidaMs).toBe(naQueda);
  });
});

describe("gravidez e ausência", () => {
  function gravida(politica: PoliticaDeAvanco) {
    const mundo = criarMundoDaProva({
      definicao: bairroComCasal(),
      conferirReplicacao: false,
      regras: { politicaDeAvanco: politica },
    });
    const roteiro = criarRoteiro(mundo, { conferirACada: 500 });
    const sessao = roteiro.entrar(LIA);
    const marcos = moradorDeNome(mundo, "Marcos");
    const duda = moradorDeNome(mundo, "Duda");
    roteiro.comandar(sessao, marcos.id, { t: "reservar" });
    roteiro.comandar(sessao, marcos.id, { t: "propor", tipo: "bebe", alvoId: duda.id });
    roteiro.ate(() => listar(mundo.estado.gravidezes).length === 1, 2000, "a gravidez começar");
    const gravidez = listar(mundo.estado.gravidezes)[0];
    if (!gravidez) throw new Error("sem gravidez");
    return { mundo, roteiro, sessao, gravidez };
  }

  it("vida em suspenso: a gravidez para com a família fora e o prazo anda junto", () => {
    const { mundo, roteiro, sessao, gravidez } = gravida("suspenso");
    roteiro.andar(dias(mundo, 0.25));
    mundo.aplicar({ t: "sessao_saiu", sessaoId: sessao });
    roteiro.andar(dias(mundo, 3));
    expect(gravidez.estado).toBe("em_curso");
    expect(listar(mundo.estado.moradores).some((m) => m.origem.gravidezId)).toBe(false);

    // A família volta: faltam os três quartos de dia que faltavam.
    roteiro.entrar(LIA);
    roteiro.andar(dias(mundo, 0.5));
    expect(gravidez.estado).toBe("em_curso");
    roteiro.andar(dias(mundo, 0.3));
    expect(gravidez.estado).toBe("concluida");
  }, 120_000);

  it("em sincronia a gravidez anda, mas o bebê só nasce com alguém da família presente", () => {
    const { mundo, roteiro, sessao, gravidez } = gravida("sincronia");
    mundo.aplicar({ t: "sessao_saiu", sessaoId: sessao });
    roteiro.andar(dias(mundo, 2));
    expect(gravidez.estado).toBe("em_curso");
    roteiro.entrar(LIA);
    roteiro.andar(5);
    expect(gravidez.estado).toBe("concluida");
    const bebe = mundo.estado.moradores.porId[gravidez.bebeId] as Morador;
    expect(bebe.fase).toBe("colo");
  }, 120_000);

  it("a gravidez nunca anda com o mundo pausado", () => {
    const { mundo, roteiro, sessao, gravidez } = gravida("suspenso");
    roteiro.comandar(sessao, null, { t: "votar_velocidade", velocidade: 0 });
    const familia = listar(mundo.estado.familias)[0] as Familia;
    const antes = familia.vidaMs;
    roteiro.andar(5000);
    expect(familia.vidaMs).toBe(antes);
    expect(gravidez.estado).toBe("em_curso");
  });
});

describe("envelhecimento", () => {
  it("desligado, ninguém muda de fase; a gravidez segue", () => {
    const mundo = criarMundoDaProva({
      conferirReplicacao: false,
      regras: { envelhecimento: "desligado" },
    });
    const roteiro = criarRoteiro(mundo, { conferirACada: 500 });
    roteiro.entrar(LIA);
    roteiro.andar(dias(mundo, 4.5));
    expect(moradorDeNome(mundo, "Nina")).toMatchObject({ fase: "crianca", idadeNaFaseMs: 0 });
    expect((listar(mundo.estado.familias)[0] as Familia).vidaMs).toBeGreaterThan(4 * DIA_MS);
  }, 120_000);

  it("rápido, as fases passam na metade do tempo", () => {
    const mundo = criarMundoDaProva({
      conferirReplicacao: false,
      regras: { envelhecimento: "rapido" },
    });
    const roteiro = criarRoteiro(mundo, { conferirACada: 500 });
    roteiro.entrar(LIA);
    roteiro.andar(dias(mundo, 2.1));
    expect(moradorDeNome(mundo, "Nina").fase).toBe("adolescente");
  }, 120_000);

  it("o idoso não tem fase seguinte", () => {
    const mundo = criarMundoDaProva({
      conferirReplicacao: false,
      regras: {
        diasPorFase: { colo: 1, pequeno: 1, crianca: 1, adolescente: 1, adulto: 1, idoso: null },
      },
    });
    const roteiro = criarRoteiro(mundo, { conferirACada: 500 });
    roteiro.entrar(LIA);
    roteiro.andar(dias(mundo, 2.2));
    expect(moradorDeNome(mundo, "Vó Ana").fase).toBe("idoso");
    expect(moradorDeNome(mundo, "Lia").fase).toBe("idoso");
    expect(moradorDeNome(mundo, "Nina").fase).toBe("adulto");
    roteiro.andar(dias(mundo, 2));
    // Todos chegaram à última fase e ficam nela.
    expect(
      listar(mundo.estado.moradores)
        .filter((m) => m.familiaId)
        .map((m) => m.fase),
    ).toEqual(["idoso", "idoso", "idoso", "idoso"]);
  }, 120_000);
});
