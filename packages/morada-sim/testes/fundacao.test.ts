import { describe, expect, it } from "vitest";
import { BAIRRO_DA_PROVA, BAIRRO_INICIAL } from "../src/conteudo";
import {
  copiar,
  criarMundo,
  criarNavegador,
  type Fato,
  type Intencao,
  listar,
  type Mundo,
  obter,
  type RascunhoDaFamilia,
  reduzirFato,
  relacaoExistente,
  restaurar,
  verificarInvariantes,
} from "../src/index";

function rascunho(
  fases: RascunhoDaFamilia["moradores"][number]["fase"][] = ["adulto"],
): RascunhoDaFamilia {
  return {
    nome: "Família nova",
    moradores: fases.map((fase, i) => ({
      nome: `Morador ${i}`,
      fase,
      linha: "f",
      pele: 0xc68058,
      cabelo: "coque_alto",
      roupa: "casual_vestido",
      tracos: ["carinhoso"],
    })),
    relacoes: [],
  };
}

function novo(): Mundo {
  return criarMundo(
    {
      mundoId: "mundo-inicial",
      semente: 42,
      definicao: BAIRRO_INICIAL,
      fundadores: [],
    },
    { conferirReplicacao: true },
  );
}
function entrar(mundo: Mundo, podeFundarFamilia?: boolean, perfilId = "jogador") {
  mundo.aplicar({ t: "sessao_entrou", sessaoId: perfilId, perfilId, podeFundarFamilia });
  return perfilId;
}
function intencao(dados = rascunho(), comandoId = "criar-familia-1"): Intencao {
  return {
    mundoId: "mundo-inicial",
    comandoId,
    moradorId: null,
    versaoEsperada: 0,
    acao: { t: "fundar_familia", rascunho: dados },
  };
}
function criar(mundo: Mundo, dados = rascunho(), comandoId?: string, sessaoId = "jogador") {
  return mundo.aplicar({ t: "intencao", sessaoId, intencao: intencao(dados, comandoId) });
}

describe("fundação durável", () => {
  it.each([1, 4, 8])(
    "recebe %i moradores em posições livres, alcançáveis e separadas, preservadas no diário",
    (quantidade) => {
      const mundo = novo();
      entrar(mundo, true);
      const antes = mundo.fotografar();
      const dados = rascunho(Array.from({ length: quantidade }, () => "adulto"));
      expect(criar(mundo, dados).ok).toBe(true);
      const familia = listar(mundo.estado.familias)[0];
      const lote = familia?.loteId ? obter(mundo.estado.lotes, familia.loteId) : null;
      const imovel = lote?.imovelId ? obter(mundo.estado.imoveis, lote.imovelId) : null;
      if (!lote || !imovel) throw new Error("Casa ausente");
      const navegador = criarNavegador(
        lote,
        imovel,
        listar(mundo.estado.objetos).filter((o) => o.loteId === lote.id),
      );
      const moradores = listar(mundo.estado.moradores).filter((m) => m.familiaId === familia?.id);
      expect(moradores).toHaveLength(quantidade);
      const pontos = moradores.map((m) => {
        if (m.local.t !== "lote") throw new Error("Morador não chegou no lote");
        expect(navegador.alcancavel(m.local.pos)).toBe(true);
        return m.local.pos;
      });
      for (let a = 0; a < pontos.length; a++)
        for (let b = a + 1; b < pontos.length; b++) {
          const p = pontos[a],
            q = pontos[b];
          if (!p || !q) throw new Error("Posição ausente");
          expect((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2).toBeGreaterThanOrEqual(1_000_000);
        }
      const fatos = mundo.avancar(0).fatos;
      expect(restaurar(antes, fatos).hash()).toBe(mundo.hash());
      const repetido = novo();
      entrar(repetido, true);
      expect(criar(repetido, dados).ok).toBe(true);
      expect(repetido.hash()).toBe(mundo.hash());
    },
  );

  it("falta de espaço para a chegada recusa antes de consumir IDs ou criar família", () => {
    const mundo = novo();
    entrar(mundo, true);
    const lote = listar(mundo.estado.lotes).find((l) => l.imovelId !== null);
    if (!lote) throw new Error("Lote ausente");
    lote.tamanho = [500, 500];
    lote.entrada = [125, 125];
    const contadores = copiar(mundo.estado.contadores);
    const moradores = copiar(mundo.estado.moradores);
    expect(criar(mundo, rascunho(["adulto", "crianca"]))).toMatchObject({
      ok: false,
      detalhe: "chegada_sem_espaco",
    });
    expect(mundo.estado.contadores).toEqual(contadores);
    expect(mundo.estado.moradores).toEqual(moradores);
    expect(listar(mundo.estado.familias)).toEqual([]);
    expect(mundo.avancar(0).fatos).toEqual([]);
  });

  it("cria uma família mínima, com saldo do jogo e acesso só ao ator autorizado", () => {
    const mundo = novo();
    entrar(mundo, true);
    const resultado = criar(mundo);
    expect(resultado.ok).toBe(true);
    const familias = listar(mundo.estado.familias);
    expect(familias).toHaveLength(1);
    expect(familias[0]?.fundo).toBe(BAIRRO_DA_PROVA.familias[0]?.fundo);
    expect(mundo.estado.acessos).toHaveLength(1);
    expect(mundo.estado.acessos[0]?.perfilId).toBe("jogador");
    expect(mundo.estado.fundacao?.resultado).toEqual(resultado);
    expect(mundo.avancar(0).fatos.map((fato) => fato.dados.tipo)).toEqual(["FamiliaFundada"]);
    expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
  });

  it("um rascunho não concede autoridade; ausência e falsa capacidade são recusadas", () => {
    for (const permissao of [undefined, false]) {
      const mundo = novo();
      entrar(mundo, permissao);
      const antes = mundo.hash();
      expect(criar(mundo)).toMatchObject({ ok: false, motivo: "sem_permissao" });
      expect(mundo.hash()).toBe(antes);
      expect(mundo.avancar(0).fatos).toEqual([]);
    }
  });

  it("retorno sem nova concessão não conserva a capacidade anterior", () => {
    const mundo = novo();
    entrar(mundo, true);
    mundo.aplicar({ t: "sessao_caiu", sessaoId: "jogador", agoraMs: 0 });
    mundo.aplicar({ t: "sessao_voltou", sessaoId: "jogador" });
    expect(criar(mundo)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    mundo.aplicar({ t: "sessao_voltou", sessaoId: "jogador", podeFundarFamilia: true });
    expect(criar(mundo).ok).toBe(true);
  });

  it("repete a confirmação sem novos moradores, saldo, contadores ou fatos", () => {
    const mundo = novo();
    entrar(mundo, true);
    const primeiro = criar(mundo);
    mundo.avancar(0);
    const antes = mundo.hash();
    expect(criar(mundo)).toEqual({ ...primeiro, repetido: true });
    expect(mundo.hash()).toBe(antes);
    expect(mundo.avancar(0).fatos).toEqual([]);
  });

  it("recupera o recibo pelo diário sem checkpoint e com a memória cheia de comandos posteriores", () => {
    const mundo = novo();
    entrar(mundo, true);
    const fotografiaAnterior = mundo.fotografar();
    const resultado = criar(mundo);
    const fatos = mundo.avancar(0).fatos;
    expect(fatos).toHaveLength(1);
    const recuperado = restaurar(fotografiaAnterior, fatos);
    entrar(recuperado, true);
    for (let i = 0; i < 600; i++) {
      recuperado.aplicar({
        t: "intencao",
        sessaoId: "jogador",
        intencao: {
          ...intencao(),
          comandoId: `comando-voto-${i}`,
          acao: { t: "votar_velocidade", velocidade: 1 },
        },
      });
    }
    expect(recuperado.estado.comandos.some((c) => c.comandoId === "criar-familia-1")).toBe(false);
    expect(recuperado.estado.comandos).toHaveLength(512);
    const antes = recuperado.hash();
    expect(criar(recuperado)).toEqual({ ...resultado, repetido: true });
    expect(recuperado.hash()).toBe(antes);
    const fato = fatos[0];
    if (!fato) throw new Error("Fixture sem fato");
    reduzirFato(recuperado.estado, fato);
    expect(recuperado.hash()).toBe(antes);
    expect(recuperado.avancar(0).fatos).toEqual([]);
  });

  it("outro jogador ou outra confirmação não reutiliza a fundação nem recebe acesso", () => {
    const mundo = novo();
    entrar(mundo, true);
    criar(mundo);
    entrar(mundo, true, "outro");
    expect(criar(mundo, rascunho(), undefined, "outro")).toMatchObject({
      ok: false,
      motivo: "ja_resolvido",
    });
    expect(criar(mundo, rascunho(), "outra-confirmacao")).toMatchObject({
      ok: false,
      motivo: "ja_resolvido",
    });
    expect(mundo.estado.acessos.map((a) => a.perfilId)).toEqual(["jogador"]);
    expect(listar(mundo.estado.familias)).toHaveLength(1);
  });

  it("cria genitores e irmãos por índices, conserva relações e identidades ao recuperar", () => {
    const mundo = novo();
    entrar(mundo, true);
    const dados = rascunho(["adulto", "adulto", "crianca", "colo"]);
    dados.relacoes = [
      { a: 0, b: 1, tipo: "casamento" },
      { a: 0, b: 2, tipo: "genitor" },
      { a: 0, b: 3, tipo: "genitor" },
    ];
    const foto = mundo.fotografar();
    expect(criar(mundo, dados).ok).toBe(true);
    const saida = mundo.avancar(0);
    const moradores = listar(mundo.estado.moradores).filter((m) => m.familiaId !== null);
    const [a, b, c, d] = moradores;
    if (!a || !b || !c || !d) throw new Error("Fixture incompleta");
    expect(relacaoExistente(mundo.estado, a.id, b.id)?.casal).toBe("casamento");
    expect(relacaoExistente(mundo.estado, a.id, c.id)?.parentesco).toEqual({
      tipo: "genitor",
      de: a.id,
    });
    expect(relacaoExistente(mundo.estado, c.id, d.id)?.parentesco).toEqual({ tipo: "irmaos" });
    expect(restaurar(foto, saida.fatos).hash()).toBe(mundo.hash());
    expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
  });

  it("um fato copiado não muda de fundador quando reaplicado", () => {
    const mundo = novo();
    entrar(mundo, true);
    criar(mundo);
    const fato = mundo.avancar(0).fatos[0];
    if (fato?.dados.tipo !== "FamiliaFundada") throw new Error("Fixture sem fundação");
    const adulterado: Fato = {
      ...fato,
      dados: { ...fato.dados, recibo: { ...fato.dados.recibo, autor: "outro" } },
    };
    expect(() => reduzirFato(mundo.estado, adulterado)).toThrow(/outro fato/);
    expect(mundo.estado.fundacao?.autor).toBe("jogador");
  });
});
