import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CONTEUDO } from "../src/conteudo";
import type { AcaoPedida, Mundo } from "../src/index";
import {
  aplicarMudancas,
  listar,
  PERMISSOES_DE_QUEM_DIVIDE,
  resumoDe,
  verificarInvariantes,
} from "../src/index";
import { BRUNO, bairroComCasal, criarMundoDaProva, LIA } from "../src/testes";

/**
 * Roteiros aleatórios: jogadores entram, caem, voltam, reservam, comandam o
 * que der e o que não der, e o tempo anda. Em qualquer ordem, as invariantes
 * do mundo valem depois de cada passo e o espelho do cliente não diverge.
 */

const PERFIS = [LIA, BRUNO, "perfil-estranho"] as const;
const SESSOES = ["s-lia", "s-bruno", "s-estranho"] as const;
const INTERACOES = CONTEUDO.interacoes.map((def) => def.id);
const CUIDADOS = ["dar_mamadeira", "trocar_fralda", "ninar", "pegar_no_colo", "por_para_dormir"];

/** O que um jogador pede, como dado: o roteiro que falha sai legível e pode ser encolhido. */
type Pedido =
  | { k: "reservar" }
  | { k: "liberar" }
  | { k: "preferido"; valor: boolean }
  | { k: "ir"; cx: number; cy: number }
  | { k: "interagir"; interacao: string }
  | { k: "cuidar"; cuidado: string }
  | { k: "propor"; tipo: "namoro" | "casamento" | "morar_junto" | "bebe" }
  | { k: "cancelar" }
  | { k: "responder"; aceita: boolean }
  | { k: "velocidade"; velocidade: 0 | 1 | 2 | 3 }
  | { k: "convidar" };

type Passo =
  | { t: "entrar"; quem: number }
  | { t: "cair"; quem: number }
  | { t: "voltar"; quem: number }
  | { t: "sair"; quem: number }
  | { t: "expirar" }
  | { t: "comando"; quem: number; morador: number; pedido: Pedido; alvo: number }
  | { t: "repetir" }
  | { t: "andar"; ticks: number };

// Quase sempre é um dos dois jogadores da família; às vezes, um estranho.
const quem = fc.constantFrom(0, 0, 0, 1, 1, 2);
const indice = fc.integer({ min: 0, max: 40 });

const pedidos: fc.Arbitrary<Pedido> = fc.oneof(
  fc.constant<Pedido>({ k: "reservar" }),
  fc.constant<Pedido>({ k: "liberar" }),
  fc.boolean().map((valor): Pedido => ({ k: "preferido", valor })),
  fc
    .tuple(fc.integer({ min: 0, max: 59 }), fc.integer({ min: 0, max: 59 }))
    .map(([cx, cy]): Pedido => ({ k: "ir", cx, cy })),
  fc.constantFrom(...INTERACOES).map((interacao): Pedido => ({ k: "interagir", interacao })),
  fc.constantFrom(...CUIDADOS).map((cuidado): Pedido => ({ k: "cuidar", cuidado })),
  fc
    .constantFrom("namoro" as const, "casamento" as const, "morar_junto" as const, "bebe" as const)
    .map((tipo): Pedido => ({ k: "propor", tipo })),
  fc.constant<Pedido>({ k: "cancelar" }),
  fc.boolean().map((aceita): Pedido => ({ k: "responder", aceita })),
  fc
    .constantFrom(0 as const, 1 as const, 2 as const, 3 as const)
    .map((velocidade): Pedido => ({ k: "velocidade", velocidade })),
  fc.constant<Pedido>({ k: "convidar" }),
);

/** Transforma o pedido em uma ação concreta, escolhendo os alvos no mundo como está. */
function resolver(mundo: Mundo, pedido: Pedido, alvo: number): AcaoPedida {
  const moradores = listar(mundo.estado.moradores);
  const objetos = listar(mundo.estado.objetos);
  const morador = moradores[alvo % moradores.length] as (typeof moradores)[0];
  switch (pedido.k) {
    case "reservar":
      return { t: "reservar" };
    case "liberar":
      return { t: "liberar" };
    case "preferido":
      return { t: "definir_preferido", valor: pedido.valor };
    case "ir":
      return { t: "ir_para", pos: [pedido.cx * 250 + 125, pedido.cy * 250 + 125], andar: 0 };
    case "interagir": {
      const def = CONTEUDO.interacoes.find((d) => d.id === pedido.interacao);
      const destino =
        def?.alvo === "objeto"
          ? {
              t: "objeto" as const,
              objetoId: (objetos[alvo % objetos.length] as (typeof objetos)[0]).id,
            }
          : def?.alvo === "morador"
            ? { t: "morador" as const, moradorId: morador.id }
            : { t: "proprio" as const };
      return { t: "interagir", interacao: pedido.interacao, alvo: destino };
    }
    case "cuidar": {
      const bebe = moradores.find((m) => m.fase === "colo") ?? morador;
      return { t: "cuidar", bebeId: bebe.id, cuidado: pedido.cuidado };
    }
    case "propor":
      return { t: "propor", tipo: pedido.tipo, alvoId: morador.id };
    case "cancelar": {
      const ids = mundo.estado.acoes.ordem;
      return { t: "cancelar_acao", acaoId: ids[alvo % Math.max(1, ids.length)] ?? "aca_000000" };
    }
    case "responder": {
      const ids = mundo.estado.pedidos.ordem;
      return {
        t: "responder_pedido",
        pedidoId: ids[alvo % Math.max(1, ids.length)] ?? "ped_000000",
        aceita: pedido.aceita,
      };
    }
    case "velocidade":
      return { t: "votar_velocidade", velocidade: pedido.velocidade };
    case "convidar":
      return { t: "convidar_visita", alvoId: morador.id };
  }
}

const passo: fc.Arbitrary<Passo> = fc.oneof(
  { weight: 3, arbitrary: quem.map((q) => ({ t: "entrar", quem: q }) as Passo) },
  { weight: 1, arbitrary: quem.map((q) => ({ t: "cair", quem: q }) as Passo) },
  { weight: 1, arbitrary: quem.map((q) => ({ t: "voltar", quem: q }) as Passo) },
  { weight: 1, arbitrary: quem.map((q) => ({ t: "sair", quem: q }) as Passo) },
  { weight: 1, arbitrary: fc.constant({ t: "expirar" } as Passo) },
  {
    weight: 14,
    arbitrary: fc
      .tuple(quem, indice, pedidos, indice)
      .map(
        ([q, morador, pedido, alvo]) => ({ t: "comando", quem: q, morador, pedido, alvo }) as Passo,
      ),
  },
  { weight: 2, arbitrary: fc.constant({ t: "repetir" } as Passo) },
  {
    weight: 8,
    arbitrary: fc.integer({ min: 1, max: 400 }).map((ticks) => ({ t: "andar", ticks }) as Passo),
  },
);

/** O mundo inteiro, menos a lista dos comandos já vistos. */
function semComandos(mundo: Mundo): string {
  return resumoDe({ estado: { ...mundo.estado, comandos: [] }, presenca: mundo.presenca });
}

/** Quanto os roteiros exercitaram de verdade, para a prova não passar à toa. */
const contagem = { comandos: 0, aceitos: 0, fatos: 0 };

function executar(passos: Passo[]): void {
  // A replicação é conferida a cada passo: mudança sem marca derruba o teste.
  const mundo = criarMundoDaProva({ definicao: bairroComCasal(), fundadores: [LIA] });
  const familia = listar(mundo.estado.familias)[0];
  if (!familia) throw new Error("sem família");
  mundo.aplicar({
    t: "conceder_acesso",
    perfilId: BRUNO,
    familiaId: familia.id,
    permissoes: [...PERMISSOES_DE_QUEM_DIVIDE],
  });
  // Os dois jogadores da família já estão no mundo quando o roteiro começa.
  mundo.aplicar({ t: "sessao_entrou", sessaoId: SESSOES[0], perfilId: PERFIS[0] });
  mundo.aplicar({ t: "sessao_entrou", sessaoId: SESSOES[1], perfilId: PERFIS[1] });
  mundo.avancar(0);
  const espelho = mundo.visao(LIA);
  let agoraMs = 0;
  let comandos = 0;
  let ultimo: Parameters<Mundo["aplicar"]>[0] | null = null;

  const conferir = () => {
    const saida = mundo.avancar(0);
    aplicarMudancas(espelho, saida.tick, saida.mudancas);
    const problemas = verificarInvariantes(mundo.estado, mundo.presenca);
    if (problemas.length > 0) throw new Error(problemas.join("; "));
    const fatos = saida.fatos.map((fato) => fato.id);
    if (new Set(fatos).size !== fatos.length) throw new Error("fato repetido no mesmo passo");
    contagem.fatos += fatos.length;
  };

  for (const p of passos) {
    agoraMs += 1000;
    switch (p.t) {
      case "entrar":
        mundo.aplicar({
          t: "sessao_entrou",
          sessaoId: SESSOES[p.quem] as string,
          perfilId: PERFIS[p.quem] as string,
        });
        break;
      case "cair":
        mundo.aplicar({ t: "sessao_caiu", sessaoId: SESSOES[p.quem] as string, agoraMs });
        break;
      case "voltar":
        mundo.aplicar({ t: "sessao_voltou", sessaoId: SESSOES[p.quem] as string });
        break;
      case "sair":
        mundo.aplicar({ t: "sessao_saiu", sessaoId: SESSOES[p.quem] as string });
        break;
      case "expirar":
        agoraMs += 40_000;
        mundo.aplicar({ t: "expirar", agoraMs });
        break;
      case "comando": {
        const moradores = listar(mundo.estado.moradores);
        const morador = moradores[p.morador % moradores.length];
        // Metade das vezes o jogador faz o que se espera: escolhe o morador antes de comandar.
        if (p.alvo % 2 === 0 && morador) {
          mundo.aplicar({
            t: "intencao",
            sessaoId: SESSOES[p.quem] as string,
            intencao: {
              comandoId: `comando-${String(++comandos).padStart(5, "0")}`,
              mundoId: mundo.estado.id,
              moradorId: morador.id,
              acao: { t: "reservar" },
              versaoEsperada: 0,
            },
          });
        }
        ultimo = {
          t: "intencao",
          sessaoId: SESSOES[p.quem] as string,
          intencao: {
            comandoId: `comando-${String(++comandos).padStart(5, "0")}`,
            mundoId: mundo.estado.id,
            moradorId: morador?.id ?? null,
            acao: resolver(mundo, p.pedido, p.alvo),
            versaoEsperada: 0,
          },
        };
        conferir();
        const antes = semComandos(mundo);
        const resultado = mundo.aplicar(ultimo);
        contagem.comandos++;
        if (resultado.ok) contagem.aceitos++;
        // Um comando recusado não muda nada, além de ficar registrado.
        else if (semComandos(mundo) !== antes) {
          throw new Error(`comando recusado (${resultado.motivo}) mudou o mundo`);
        }
        break;
      }
      case "repetir": {
        // O mesmo comando de novo nunca muda o mundo. Só vale para o que o
        // mundo chegou a registrar: um comando de quem não tinha sessão não é
        // lembrado, e pode ser tentado de novo depois de entrar.
        if (ultimo?.t !== "intencao") break;
        const id = ultimo.intencao.comandoId;
        if (!mundo.estado.comandos.some((registro) => registro.comandoId === id)) break;
        conferir();
        const antes = mundo.hash("tudo");
        const resultado = mundo.aplicar(ultimo);
        if (mundo.hash("tudo") !== antes) throw new Error("comando repetido mudou o mundo");
        if (!resultado.repetido && resultado.ok)
          throw new Error("comando repetido foi aceito de novo");
        break;
      }
      case "andar":
        for (let i = 0; i < p.ticks; i++) {
          const saida = mundo.avancar(100);
          aplicarMudancas(espelho, saida.tick, saida.mudancas);
        }
        break;
    }
    conferir();
  }

  // No fim, o espelho alimentado só por mudanças é a visão. As necessidades
  // chegam uma vez por segundo, então alinha no tick cheio antes de comparar.
  while (mundo.estado.relogio.velocidade === 0 || mundo.estado.relogio.tick % 10 !== 0) {
    if (mundo.estado.relogio.velocidade === 0) {
      mundo.aplicar({ t: "sessao_entrou", sessaoId: "s-final", perfilId: LIA });
      mundo.aplicar({
        t: "intencao",
        sessaoId: "s-final",
        intencao: {
          comandoId: `comando-final-${mundo.estado.relogio.tick}`,
          mundoId: mundo.estado.id,
          moradorId: null,
          acao: { t: "votar_velocidade", velocidade: 1 },
          versaoEsperada: 0,
        },
      });
    }
    const saida = mundo.avancar(100);
    aplicarMudancas(espelho, saida.tick, saida.mudancas);
  }
  const resto = mundo.avancar(0);
  aplicarMudancas(espelho, resto.tick, resto.mudancas);
  expect(espelho).toEqual(mundo.visao(LIA));
}

describe("roteiros aleatórios", () => {
  it("as invariantes valem depois de qualquer sequência de entradas", () => {
    fc.assert(
      fc.property(fc.array(passo, { minLength: 20, maxLength: 90 }), (passos) => {
        executar(passos);
      }),
      { numRuns: 40, seed: 20261111, endOnFailure: true },
    );
    // Os roteiros fizeram coisas de verdade: comandos aceitos e fatos críticos.
    expect(contagem, JSON.stringify(contagem)).toMatchObject({
      comandos: expect.any(Number),
    });
    expect(contagem.comandos).toBeGreaterThan(400);
    expect(contagem.aceitos, JSON.stringify(contagem)).toBeGreaterThan(150);
    expect(contagem.fatos, JSON.stringify(contagem)).toBeGreaterThan(20);
  }, 600_000);
});
