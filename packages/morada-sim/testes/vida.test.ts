import { describe, expect, it } from "vitest";
import type { AcaoPedida, Fato, Morador, MoradorId } from "../src/index";
import { listar, relacaoId, ticksPorDia } from "../src/index";
import { criarMundoDaProva, criarRoteiro, LIA, moradorDeNome, type Roteiro } from "../src/testes";

/** Manda o morador fazer algo e espera ele terminar. */
function fazer(roteiro: Roteiro, sessao: string, moradorId: MoradorId, acao: AcaoPedida): void {
  const resultado = roteiro.comandar(sessao, moradorId, acao);
  expect(resultado, `${JSON.stringify(acao)} → ${JSON.stringify(resultado)}`).toMatchObject({
    ok: true,
  });
  const morador = () => roteiro.mundo.estado.moradores.porId[moradorId] as Morador;
  roteiro.ate(
    () => morador().acaoAtual === null && morador().fila.length === 0,
    3000,
    `terminar ${JSON.stringify(acao)}`,
  );
}

function fatosDoTipo<T extends Fato["dados"]["tipo"]>(roteiro: Roteiro, tipo: T) {
  return roteiro.saida.fatos.filter((fato) => fato.dados.tipo === tipo);
}

/**
 * Marcos e Duda se conhecem: ele a convida e os dois conversam e flertam até
 * o vínculo sustentar um pedido de namoro. É o começo do segundo passo do
 * teste decisivo.
 */
function conhecerADuda() {
  const mundo = criarMundoDaProva();
  const roteiro = criarRoteiro(mundo, { conferirACada: 5 });
  const sessao = roteiro.entrar(LIA);
  const marcos = moradorDeNome(mundo, "Marcos");
  const duda = moradorDeNome(mundo, "Duda");
  const eixos = () =>
    mundo.estado.relacoes.porId[relacaoId(marcos.id, duda.id)]?.eixos ?? {
      amizade: 0,
      romance: 0,
      confianca: 0,
    };

  expect(roteiro.comandar(sessao, marcos.id, { t: "reservar" })).toMatchObject({ ok: true });

  /** Faz algo com a Duda; se a visita já acabou, convida de novo antes. */
  const com = (interacao: string) => {
    if (duda.local.t === "fora") {
      fazer(roteiro, sessao, marcos.id, { t: "convidar_visita", alvoId: duda.id });
      roteiro.ate(() => duda.local.t !== "fora", 300, "a Duda chegar");
    }
    fazer(roteiro, sessao, marcos.id, {
      t: "interagir",
      interacao,
      alvo: { t: "morador", moradorId: duda.id },
    });
  };
  /** Repete interações até os eixos chegarem aos valores pedidos. */
  const ate = (alvo: Partial<ReturnType<typeof eixos>>, interacoes: string[]) => {
    const falta = () =>
      (Object.keys(alvo) as (keyof typeof alvo)[]).some(
        (eixo) => eixos()[eixo] < (alvo[eixo] ?? 0),
      );
    for (let i = 0; i < 40 && falta(); i++) com(interacoes[i % interacoes.length] as string);
    expect(falta(), JSON.stringify(eixos())).toBe(false);
  };

  ate({ amizade: 520_000 }, ["conversar"]);
  ate({ romance: 520_000 }, ["flertar"]);
  return { mundo, roteiro, sessao, marcos, duda, com, ate, eixos };
}

describe("casamento com um morador do bairro", () => {
  it("quem ninguém dirige responde pelo vínculo: cedo demais é não, depois é sim", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo, { conferirACada: 5 });
    const sessao = roteiro.entrar(LIA);
    const marcos = moradorDeNome(mundo, "Marcos");
    const duda = moradorDeNome(mundo, "Duda");
    roteiro.comandar(sessao, marcos.id, { t: "reservar" });
    fazer(roteiro, sessao, marcos.id, { t: "convidar_visita", alvoId: duda.id });
    roteiro.ate(() => duda.local.t === "lote", 300, "a Duda chegar");

    fazer(roteiro, sessao, marcos.id, { t: "propor", tipo: "namoro", alvoId: duda.id });
    expect(fatosDoTipo(roteiro, "CasalMudou")).toHaveLength(0);
    expect(roteiro.saida.apresentacao).toContainEqual(
      expect.objectContaining({ t: "resposta", de: marcos.id, para: duda.id, aceito: false }),
    );
    expect(marcos.sensacoes.map((s) => s.id)).toContain("rejeitado");
  }, 60_000);

  it("namoro, casamento e mudança, com a Duda sendo a mesma pessoa de antes", () => {
    const { mundo, roteiro, sessao, marcos, duda, ate } = conhecerADuda();
    const caio = moradorDeNome(mundo, "Caio");
    const antes = {
      id: duda.id,
      habilidades: { ...duda.habilidades },
      tracos: [...duda.tracos],
      carteira: duda.carteira,
      aparencia: { ...duda.aparencia },
    };
    const irmaos = structuredClone(mundo.estado.relacoes.porId[relacaoId(duda.id, caio.id)]);
    const familia = marcos.familiaId;

    fazer(roteiro, sessao, marcos.id, { t: "propor", tipo: "namoro", alvoId: duda.id });
    expect(mundo.estado.relacoes.porId[relacaoId(marcos.id, duda.id)]?.casal).toBe("namoro");

    ate({ romance: 720_000, confianca: 560_000 }, ["beijar", "conversar"]);
    fazer(roteiro, sessao, marcos.id, { t: "propor", tipo: "casamento", alvoId: duda.id });
    expect(mundo.estado.relacoes.porId[relacaoId(marcos.id, duda.id)]?.casal).toBe("casamento");

    // Casar e morar junto são decisões separadas.
    expect(duda.familiaId).toBeNull();
    fazer(roteiro, sessao, marcos.id, { t: "propor", tipo: "morar_junto", alvoId: duda.id });

    const agora = moradorDeNome(mundo, "Duda");
    expect(agora.familiaId).toBe(familia);
    expect(agora.id).toBe(antes.id);
    expect(agora.habilidades).toEqual(antes.habilidades);
    expect(agora.tracos).toEqual(antes.tracos);
    expect(agora.carteira).toBe(antes.carteira);
    expect(agora.aparencia).toEqual(antes.aparencia);
    expect(mundo.estado.relacoes.porId[relacaoId(duda.id, caio.id)]).toEqual(irmaos);

    // Entrou na família: aparece nos retratos e pode ser dirigida por quem joga a família.
    const retratos = listar(mundo.estado.moradores).filter((m) => m.familiaId === familia);
    expect(retratos.map((m) => m.nome)).toContain("Duda");
    expect(roteiro.comandar(sessao, duda.id, { t: "reservar" })).toMatchObject({ ok: true });

    // E fica: a visita não a leva embora.
    roteiro.andar(4000);
    expect(agora.local.t).not.toBe("fora");

    const tipos = roteiro.saida.fatos.map((fato) => fato.dados.tipo);
    expect(tipos.filter((t) => t === "CasalMudou")).toHaveLength(2);
    expect(tipos.filter((t) => t === "FamiliaMudou")).toHaveLength(1);
    for (const fato of roteiro.saida.fatos) {
      expect(fato.causa.autor, fato.id).toBeDefined();
      expect(fato.causa.motivo.length, fato.id).toBeGreaterThan(0);
    }
    expect(mundo.estado.memorias.map((m) => m.tipo)).toEqual(["namoro", "casamento", "mudanca"]);
  }, 120_000);

  it("parentes não namoram e um pedido repetido não casa duas vezes", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const marcos = moradorDeNome(mundo, "Marcos");
    const lia = moradorDeNome(mundo, "Lia");
    roteiro.comandar(sessao, marcos.id, { t: "reservar" });
    expect(
      roteiro.comandar(sessao, marcos.id, { t: "propor", tipo: "namoro", alvoId: lia.id }),
    ).toMatchObject({ ok: false, motivo: "requisito", detalhe: "parentes" });
    expect(
      roteiro.comandar(sessao, marcos.id, { t: "propor", tipo: "casamento", alvoId: lia.id }),
    ).toMatchObject({ ok: false });
  });
});

describe("bebê", () => {
  it("nasce uma vez, aparece nos retratos, é cuidado e cresce sendo a mesma pessoa", () => {
    const { mundo, roteiro, sessao, marcos, duda, ate } = conhecerADuda();
    fazer(roteiro, sessao, marcos.id, { t: "propor", tipo: "namoro", alvoId: duda.id });
    ate({ romance: 660_000, confianca: 600_000 }, ["beijar", "conversar"]);
    fazer(roteiro, sessao, marcos.id, { t: "propor", tipo: "morar_junto", alvoId: duda.id });
    expect(duda.familiaId).toBe(marcos.familiaId);
    fazer(roteiro, sessao, marcos.id, { t: "propor", tipo: "bebe", alvoId: duda.id });

    const gravidez = listar(mundo.estado.gravidezes)[0];
    expect(gravidez).toMatchObject({
      gestanteId: duda.id,
      outroGenitorId: marcos.id,
      estado: "em_curso",
    });
    if (!gravidez) throw new Error("sem gravidez");
    expect(mundo.estado.moradores.porId[gravidez.bebeId]).toBeUndefined();

    // A gravidez anda pelo relógio de vida da família, com alguém dela presente.
    const dia = ticksPorDia(mundo.estado.relogio);
    roteiro.ate(() => gravidez.estado === "concluida", dia + 200, "o bebê nascer");
    const bebe = mundo.estado.moradores.porId[gravidez.bebeId] as Morador;
    expect(bebe).toMatchObject({ fase: "colo", familiaId: marcos.familiaId });
    expect(bebe.local).toEqual({ t: "colo", de: duda.id });
    expect(fatosDoTipo(roteiro, "NascimentoRegistrado").map((f) => f.id)).toEqual([
      `nasc:${gravidez.id}`,
    ]);

    // Retratos: o bebê é da família desde que nasce, e pode ser escolhido.
    const retratos = listar(mundo.estado.moradores).filter((m) => m.familiaId === marcos.familiaId);
    expect(retratos.map((m) => m.id)).toContain(bebe.id);
    expect(roteiro.comandar(sessao, bebe.id, { t: "reservar" })).toMatchObject({ ok: true });
    // Dirigir um bebê é pedir cuidado: quem executa é um adulto.
    expect(
      roteiro.comandar(sessao, bebe.id, { t: "ir_para", pos: [6125, 3125], andar: 0 }),
    ).toMatchObject({
      ok: false,
      motivo: "fase_nao_permite",
    });
    expect(
      roteiro.comandar(sessao, bebe.id, { t: "cuidar", bebeId: bebe.id, cuidado: "ninar" }),
    ).toMatchObject({ ok: true });

    // Parentesco: filho dos dois, e sem virar parente de quem não é.
    expect(mundo.estado.relacoes.porId[relacaoId(duda.id, bebe.id)]?.parentesco).toEqual({
      tipo: "genitor",
      de: duda.id,
    });
    expect(mundo.estado.relacoes.porId[relacaoId(marcos.id, bebe.id)]?.parentesco).toEqual({
      tipo: "genitor",
      de: marcos.id,
    });

    // Cuidado: nenhuma necessidade do bebê fica zerada por muito tempo.
    const id = bebe.id;
    const relacoes = [...bebe.relacoes].sort();
    const zerado: Record<string, number> = {};
    const pior: Record<string, number> = {};
    const fases = [bebe.fase];
    for (let tick = 0; tick < dia * 2 + 400; tick++) {
      roteiro.andar(1);
      const atual = mundo.estado.moradores.porId[id] as Morador;
      if (fases.at(-1) !== atual.fase) fases.push(atual.fase);
      for (const [necessidade, nivel] of Object.entries(atual.necessidades)) {
        const chave = `${atual.fase}:${necessidade}`;
        zerado[chave] = nivel === 0 ? (zerado[chave] ?? 0) + 1 : 0;
        pior[chave] = Math.max(pior[chave] ?? 0, zerado[chave] ?? 0);
      }
    }
    // Meia hora de jogo é o máximo que uma necessidade fica zerada.
    const demoradas = Object.entries(pior).filter(([, ticks]) => ticks >= 600);
    expect(demoradas).toEqual([]);

    // Cresceu duas vezes e é a mesma pessoa: mesmo id, mesmas relações, mesma origem.
    const crescido = mundo.estado.moradores.porId[id] as Morador;
    expect(fases).toEqual(["colo", "pequeno", "crianca"]);
    expect(crescido.id).toBe(id);
    expect(crescido.origem).toEqual({ gravidezId: gravidez.id });
    expect(crescido.aparencia.corpo).toMatch(/^crianca_/);
    expect([...crescido.relacoes].sort()).toEqual(expect.arrayContaining(relacoes));
    expect(crescido.local.t).not.toBe("colo");
    expect(Object.keys(crescido.necessidades).sort()).toEqual([
      "bexiga",
      "diversao",
      "energia",
      "fome",
      "higiene",
      "social",
    ]);
    expect(
      listar(mundo.estado.moradores).filter((m) => m.origem.gravidezId === gravidez.id),
    ).toHaveLength(1);
    expect(
      fatosDoTipo(roteiro, "FaseMudou").filter((f) => f.id.startsWith(`fase:${id}:`)),
    ).toHaveLength(2);
  }, 240_000);
});
