import { listar, type Mundo, PERMISSOES_DE_QUEM_DIVIDE } from "@informach/morada-sim";
import {
  BRUNO,
  bairroComCasal,
  criarMundoDaProva,
  criarRoteiro,
  LIA,
  moradorDeNome,
} from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { estadoDoEspelho } from "../espelho/estado";
import {
  filaDe,
  horaDoJogo,
  humorDe,
  necessidadesDe,
  pedidosAbertos,
  votoPendente,
} from "./painel";
import { resumoDaPresenca, retratosDe, vizinhosDe } from "./retratos";

/** Os retratos como um jogador os vê: sobre a visão que o servidor manda para ele. */
function retratos(mundo: Mundo, jogadorId: string) {
  const visao = mundo.visao(jogadorId);
  return retratosDe(estadoDoEspelho(visao, visao.tick), visao.presenca, { jogadorId });
}

function presenca(mundo: Mundo, jogadorId: string) {
  return resumoDaPresenca(mundo.visao(jogadorId).presenca, jogadorId);
}

function resumo(lista: ReturnType<typeof retratos>) {
  return Object.fromEntries(lista.map((r) => [r.nome, `${r.estado}: ${r.legenda}`]));
}

describe("retratos com duas pessoas", () => {
  it("mostram a família inteira e o estado de cada morador para cada jogador", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
    const roteiro = criarRoteiro(mundo);
    // O apelido de cada pessoa chega com ela, pela visão do servidor.
    const daLia = roteiro.entrar(LIA, undefined, "Lia");
    const doBruno = roteiro.entrar(BRUNO, undefined, "Bruno");

    // Ninguém escolheu ainda: os quatro livres, e os moradores do bairro ficam fora.
    expect(resumo(retratos(mundo, LIA))).toEqual({
      Lia: "disponivel: Disponível",
      Marcos: "disponivel: Disponível",
      Nina: "disponivel: Disponível",
      "Vó Ana": "disponivel: Disponível",
    });

    roteiro.comandar(daLia, moradorDeNome(mundo, "Lia").id, { t: "reservar" });
    roteiro.comandar(doBruno, moradorDeNome(mundo, "Marcos").id, { t: "reservar" });

    expect(resumo(retratos(mundo, LIA))).toEqual({
      Lia: "voce: Dirigido por você",
      Marcos: "outro: Dirigido por Bruno",
      Nina: "disponivel: Disponível",
      "Vó Ana": "disponivel: Disponível",
    });
    expect(resumo(retratos(mundo, BRUNO))).toEqual({
      Lia: "outro: Dirigido por Lia",
      Marcos: "voce: Dirigido por você",
      Nina: "disponivel: Disponível",
      "Vó Ana": "disponivel: Disponível",
    });
    // Na plaquinha vai o apelido de quem dirige.
    expect(retratos(mundo, LIA).find((r) => r.nome === "Marcos")).toMatchObject({
      placa: "Bruno",
      emEspera: false,
    });
    expect(retratos(mundo, LIA).find((r) => r.nome === "Lia")?.placa).toBe("você");
    // E a linha da presença diz quem está no mundo com a pessoa.
    expect(presenca(mundo, LIA)).toEqual({ presentes: 2, emEspera: 0, texto: "Você e Bruno" });
    expect(presenca(mundo, BRUNO).texto).toBe("Você e Lia");

    // Quem cai continua com o nome, agora em espera.
    mundo.aplicar({ t: "sessao_caiu", sessaoId: doBruno, agoraMs: 10_000 });
    expect(retratos(mundo, LIA).find((r) => r.nome === "Marcos")).toMatchObject({
      legenda: "Dirigido por Bruno, em espera",
      placa: "em espera",
    });
    expect(presenca(mundo, LIA)).toEqual({
      presentes: 1,
      emEspera: 1,
      texto: "Só você no mundo · Bruno em espera",
    });
  });

  it("sem apelido na visão, o jogo não inventa nome", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
    const roteiro = criarRoteiro(mundo);
    roteiro.entrar(LIA);
    const doBruno = roteiro.entrar(BRUNO);
    roteiro.comandar(doBruno, moradorDeNome(mundo, "Marcos").id, { t: "reservar" });
    expect(retratos(mundo, LIA).find((r) => r.nome === "Marcos")).toMatchObject({
      legenda: "Dirigido por outra pessoa",
      placa: "ocupado",
    });
    expect(presenca(mundo, LIA).texto).toBe("Você e mais 1 pessoa");
  });

  it("a linha da presença nomeia quem cabe e conta o resto", () => {
    const linha = (...outros: [apelido: string | null, estado: "presente" | "em_graca"][]) =>
      resumoDaPresenca(
        {
          jogadores: [
            { perfilId: "eu", apelido: "Lia", estado: "presente" },
            ...outros.map(([apelido, estado], n) => ({ perfilId: `outro-${n}`, apelido, estado })),
          ],
          reservas: [],
          voto: null,
        },
        "eu",
      ).texto;
    expect(linha()).toBe("Só você no mundo");
    expect(linha(["Bruno", "presente"], ["Ana", "presente"])).toBe("Você, Bruno e Ana");
    expect(linha(["Bruno", "presente"], [null, "presente"])).toBe("Você, Bruno e mais 1 pessoa");
    expect(
      linha(
        ["Bruno", "presente"],
        ["Ana", "presente"],
        ["Caio", "presente"],
        ["Duda", "presente"],
        [null, "presente"],
      ),
    ).toBe("Você, Bruno, Ana, Caio e mais 2 pessoas");
    expect(linha(["Bruno", "presente"], ["Ana", "em_graca"])).toBe("Você e Bruno · Ana em espera");
    expect(linha(["Bruno", "em_graca"], [null, "em_graca"])).toBe(
      "Só você no mundo · Bruno e mais 1 em espera",
    );
    expect(linha([null, "em_graca"], [null, "em_graca"])).toBe("Só você no mundo · 2 em espera");
  });

  it("quem cai fica em espera e, passada a janela, o morador volta a ficar livre", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
    const roteiro = criarRoteiro(mundo);
    roteiro.entrar(LIA);
    const doBruno = roteiro.entrar(BRUNO);
    roteiro.comandar(doBruno, moradorDeNome(mundo, "Marcos").id, { t: "reservar" });

    mundo.aplicar({ t: "sessao_caiu", sessaoId: doBruno, agoraMs: 10_000 });
    const emEspera = retratos(mundo, LIA).find((r) => r.nome === "Marcos");
    expect(emEspera).toMatchObject({
      estado: "outro",
      emEspera: true,
      legenda: "Dirigido por outra pessoa, em espera",
      placa: "em espera",
    });
    const visao = mundo.visao(LIA);
    expect(resumoDaPresenca(visao.presenca, LIA)).toMatchObject({
      presentes: 1,
      emEspera: 1,
      texto: "Só você no mundo · 1 em espera",
    });

    mundo.aplicar({ t: "expirar", agoraMs: 10_000 + mundo.estado.regras.janelaDeGracaMs });
    expect(retratos(mundo, LIA).find((r) => r.nome === "Marcos")).toMatchObject({
      estado: "disponivel",
      emEspera: false,
    });
    expect(resumoDaPresenca(mundo.visao(LIA).presenca, LIA).texto).toBe("Só você no mundo");
  });

  it("quem não tem acesso à família não vê retrato nenhum", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA] });
    criarRoteiro(mundo).entrar(LIA);
    expect(retratos(mundo, "perfil-de-fora")).toEqual([]);
    expect(retratos(mundo, LIA)).toHaveLength(4);
  });

  it("quem só pode olhar vê os moradores como autônomos", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA] });
    const familia = listar(mundo.estado.familias)[0];
    if (!familia) throw new Error("sem família");
    mundo.aplicar({
      t: "conceder_acesso",
      perfilId: "perfil-visita",
      familiaId: familia.id,
      permissoes: ["ver"],
    });
    mundo.avancar(0);
    expect(new Set(retratos(mundo, "perfil-visita").map((r) => r.legenda))).toEqual(
      new Set(["Autônomo"]),
    );
    // Quem divide a família pode assumir qualquer um.
    mundo.aplicar({
      t: "conceder_acesso",
      perfilId: BRUNO,
      familiaId: familia.id,
      permissoes: [...PERMISSOES_DE_QUEM_DIVIDE],
    });
    mundo.avancar(0);
    expect(new Set(retratos(mundo, BRUNO).map((r) => r.estado))).toEqual(new Set(["disponivel"]));
  });

  it("os moradores do bairro aparecem como vizinhos, fora dos retratos", () => {
    const mundo = criarMundoDaProva();
    const visao = mundo.visao(LIA);
    const vizinhos = vizinhosDe(estadoDoEspelho(visao, visao.tick));
    expect(vizinhos.map((v) => [v.nome, v.deVisita])).toEqual([
      ["Duda", false],
      ["Caio", false],
    ]);
  });
});

describe("painéis", () => {
  it("o relógio começa às 8 da manhã do dia 1 e vira o dia depois de 16 horas", () => {
    const mundo = criarMundoDaProva();
    const estado = (tick: number) => estadoDoEspelho(mundo.visao(LIA), tick);
    expect(horaDoJogo(estado(0))).toEqual({ dia: 1, diaDaSemana: "segunda", hora: "08:00" });
    // 3 s de jogo por tick: 20 ticks são um minuto.
    expect(horaDoJogo(estado(20 * 90)).hora).toBe("09:30");
    expect(horaDoJogo(estado(20 * 60 * 16))).toEqual({
      dia: 2,
      diaDaSemana: "terça",
      hora: "00:00",
    });
  });

  it("o voto de velocidade diz quem ainda precisa concordar", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
    const roteiro = criarRoteiro(mundo);
    const daLia = roteiro.entrar(LIA, undefined, "Lia");
    const doBruno = roteiro.entrar(BRUNO, undefined, "Bruno");
    expect(votoPendente(mundo.visao(LIA).presenca, { jogadorId: LIA })).toBeNull();

    roteiro.comandar(daLia, null, { t: "votar_velocidade", velocidade: 3 });
    expect(mundo.estado.relogio.velocidade).toBe(1);
    expect(votoPendente(mundo.visao(LIA).presenca, { jogadorId: LIA })).toEqual({
      velocidade: 3,
      euConcordei: true,
      faltam: ["Bruno"],
    });
    expect(votoPendente(mundo.visao(BRUNO).presenca, { jogadorId: BRUNO })).toEqual({
      velocidade: 3,
      euConcordei: false,
      faltam: ["você"],
    });

    roteiro.comandar(doBruno, null, { t: "votar_velocidade", velocidade: 3 });
    expect(mundo.estado.relogio.velocidade).toBe(3);
    expect(votoPendente(mundo.visao(LIA).presenca, { jogadorId: LIA })).toBeNull();
  });

  it("a fila mostra a ação em curso primeiro e diz o que foi pedido e o que é por conta própria", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const lia = moradorDeNome(mundo, "Lia");
    const marcos = moradorDeNome(mundo, "Marcos");
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    roteiro.comandar(sessao, lia.id, { t: "ir_para", pos: [6125, 3125], andar: 0 });
    roteiro.comandar(sessao, lia.id, {
      t: "interagir",
      interacao: "conversar",
      alvo: { t: "morador", moradorId: marcos.id },
    });
    roteiro.andar(2);

    const fila = filaDe(estadoDoEspelho(mundo.visao(LIA), mundo.estado.relogio.tick), lia.id);
    expect(fila.map((item) => [item.rotulo, item.situacao, item.pedida])).toEqual([
      ["Ir até aqui", "indo", true],
      ["Conversar · Marcos", "na_fila", true],
    ]);
    expect(fila.every((item) => item.cancelavel)).toBe(true);

    // Quando a Lia vai até ele, o Marcos passa a dar atenção, e isso ele não pode largar.
    roteiro.ate(
      () => {
        const atual = filaDe(mundo.estado, lia.id)[0];
        return atual?.rotulo === "Conversar · Marcos" && atual.situacao === "executando";
      },
      600,
      "a conversa",
    );
    expect(filaDe(mundo.estado, marcos.id)[0]).toMatchObject({
      rotulo: "Dar atenção a Lia",
      cancelavel: false,
      pedida: false,
    });
    const conversa = filaDe(mundo.estado, lia.id)[0];
    expect(conversa).toMatchObject({ rotulo: "Conversar · Marcos", situacao: "executando" });
    expect(conversa?.progresso).toBeGreaterThanOrEqual(0);
    expect(conversa?.progresso).toBeLessThan(1);
  });

  it("necessidades e humor saem do espelho", () => {
    const mundo = criarMundoDaProva();
    const lia = moradorDeNome(mundo, "Lia");
    const necessidades = necessidadesDe(lia);
    expect(necessidades.map((n) => n.rotulo)).toEqual([
      "Fome",
      "Energia",
      "Higiene",
      "Bexiga",
      "Social",
      "Diversão",
    ]);
    expect(necessidades.every((n) => n.nivel > 0.5 && n.nivel <= 1 && !n.critica)).toBe(true);
    expect(humorDe(lia, 0)).toEqual({ humor: "tranquilo", sensacoes: [] });
    const comFome = {
      ...lia,
      necessidades: { ...lia.necessidades, fome: 100_000 },
      sensacoes: [
        { id: "com_fome", ateTick: 500 },
        { id: "limpinho", ateTick: 500 },
        { id: "abraco", ateTick: 3 },
      ],
    };
    expect(necessidadesDe(comFome).find((n) => n.id === "fome")).toMatchObject({ critica: true });
    // A sensação que já venceu não conta.
    expect(humorDe(comFome, 10)).toEqual({
      humor: "irritado",
      sensacoes: ["Com fome", "Limpinho"],
    });
  });

  it("um pedido aberto aparece para quem pode responder e para quem pediu", () => {
    // O casal já formado: a Duda mora na casa e é casada com o Marcos.
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO], definicao: bairroComCasal() });
    const roteiro = criarRoteiro(mundo);
    const daLia = roteiro.entrar(LIA);
    const doBruno = roteiro.entrar(BRUNO);
    const marcos = moradorDeNome(mundo, "Marcos");
    const duda = moradorDeNome(mundo, "Duda");
    roteiro.comandar(daLia, marcos.id, { t: "reservar" });
    roteiro.comandar(doBruno, duda.id, { t: "reservar" });
    const abertos = (jogadorId: string) => {
      const visao = mundo.visao(jogadorId);
      return pedidosAbertos(estadoDoEspelho(visao, visao.tick), visao.presenca, jogadorId);
    };
    expect(abertos(LIA)).toEqual([]);

    expect(
      roteiro.comandar(daLia, marcos.id, { t: "propor", tipo: "bebe", alvoId: duda.id }),
    ).toMatchObject({ ok: true });
    // A Duda é dirigida pelo Bruno: quem responde é ele, e o pedido espera.
    roteiro.ate(() => listar(mundo.estado.pedidos).length > 0, 3000, "o pedido");

    const paraOBruno = abertos(BRUNO);
    expect(paraOBruno).toEqual([
      {
        pedidoId: listar(mundo.estado.pedidos)[0]?.id,
        texto: "Marcos quer ter um bebê com Duda",
        podeResponder: true,
        meu: false,
      },
    ]);
    expect(abertos(LIA)).toMatchObject([{ podeResponder: false, meu: true }]);

    const pedidoId = paraOBruno[0]?.pedidoId;
    if (!pedidoId) throw new Error("sem pedido");
    // Quem pediu não responde ao próprio pedido; o outro responde.
    expect(
      roteiro.comandar(daLia, null, { t: "responder_pedido", pedidoId, aceita: true }),
    ).toMatchObject({ ok: false });
    expect(
      roteiro.comandar(doBruno, null, { t: "responder_pedido", pedidoId, aceita: true }),
    ).toMatchObject({ ok: true });
    expect(abertos(BRUNO)).toEqual([]);
    expect(abertos(LIA)).toEqual([]);
    expect(listar(mundo.estado.gravidezes)).toHaveLength(1);
  });
});
