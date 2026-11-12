import {
  canonico,
  listar,
  type Morador,
  type Mundo,
  obter,
  type PontoMm,
  posicaoNoMovimento,
} from "@informach/morada-sim";
import { doCatalogo, interacao } from "@informach/morada-sim/conteudo";
import { BRUNO, criarMundoDaProva, LIA, moradorDeNome } from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { assentar, RelogioDeTeste, ServidorDeMentira } from "../testes/servidor-de-mentira";
import { posicaoFracionada } from "./previsao";
import { Sessao } from "./sessao";

const DA_LIA = "sessao-da-lia";
const DO_BRUNO = "sessao-do-bruno";

function preparar(mundo: Mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] })) {
  const relogio = new RelogioDeTeste();
  const servidor = new ServidorDeMentira({
    mundo,
    sessoes: {
      [DA_LIA]: { jogadorId: LIA, apelido: "Lia" },
      [DO_BRUNO]: { jogadorId: BRUNO, apelido: "Bruno" },
    },
    relogio,
  });
  let comandos = 0;
  const entrar = async (token: string) => {
    const sessao = new Sessao({
      fonte: servidor.fonte(token),
      Soquete: servidor.Soquete,
      agora: relogio.agora,
      agendar: relogio.agendar,
      aleatorio: () => 1,
      novoId: () => `comando-${String(++comandos).padStart(4, "0")}`,
    });
    sessao.iniciar();
    await assentar();
    expect(sessao.loja.conexao.fase).toBe("pronto");
    return sessao;
  };
  /** Anda o servidor e deixa as respostas dos comandos chegarem a quem espera. */
  const andar = async (passos: number) => {
    servidor.andar(passos);
    await assentar();
  };
  return { relogio, servidor, mundo, entrar, andar };
}

function geladeira(mundo: Mundo) {
  const objeto = listar(mundo.estado.objetos).find(
    (candidato) => doCatalogo(candidato.catalogo)?.comportamento === "geladeira",
  );
  if (!objeto) throw new Error("A casa da prova perdeu a geladeira");
  return objeto;
}

describe("espelho", () => {
  it("fica igual à visão do servidor depois de um roteiro com duas pessoas", async () => {
    const { servidor, mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    await andar(37);
    // O Bruno entra com o mundo andando: recebe a visão inteira e segue pelas mudanças.
    const bruno = await entrar(DO_BRUNO);

    const moradorDaLia = moradorDeNome(mundo, "Lia");
    const moradorDoBruno = moradorDeNome(mundo, "Marcos");
    void lia.comandar(moradorDaLia.id, { t: "reservar" });
    void bruno.comandar(moradorDoBruno.id, { t: "reservar" });
    await andar(3);
    void lia.comandar(moradorDaLia.id, {
      t: "interagir",
      interacao: "comer",
      alvo: { t: "objeto", objetoId: geladeira(mundo).id },
    });
    void bruno.comandar(moradorDoBruno.id, { t: "ir_para", pos: [6125, 3125], andar: 0 });
    void bruno.comandar(null, { t: "votar_velocidade", velocidade: 2 });

    for (let rodada = 0; rodada < 8; rodada++) {
      await andar(100);
      // No tick múltiplo de dez saem também os campos lentos: o espelho está completo.
      expect(mundo.estado.relogio.tick % 10).toBe(0);
      for (const [sessao, perfil] of [
        [lia, LIA],
        [bruno, BRUNO],
      ] as const) {
        expect(canonico(sessao.loja.visao)).toBe(canonico(mundo.visao(perfil)));
      }
      if (rodada === 3) void lia.comandar(null, { t: "votar_velocidade", velocidade: 2 });
    }
    // O acordo de velocidade fechou e o mundo andou mais depressa.
    expect(mundo.estado.relogio.velocidade).toBe(2);
    expect(lia.loja.visao?.relogio.velocidade).toBe(2);
    expect(lia.loja.meuMoradorId()).toBe(moradorDaLia.id);
    expect(bruno.loja.meuMoradorId()).toBe(moradorDoBruno.id);
    expect(servidor.soquetes).toHaveLength(2);
  });

  it("o tick estimado acompanha o do servidor entre os passos", async () => {
    const { relogio, mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    await andar(60);
    const doServidor = mundo.estado.relogio.tick;
    // A estimativa nunca passa do servidor e fica a menos de um tick dele.
    const estimado = lia.tickFracionado();
    expect(estimado).toBeLessThanOrEqual(doServidor);
    expect(estimado).toBeGreaterThan(doServidor - 1);
    // Meio passo depois, sem mensagem nenhuma, a estimativa já andou meio tick.
    relogio.avancar(50);
    expect(lia.tickFracionado() - estimado).toBeCloseTo(0.5, 5);
  });
});

describe("comandos", () => {
  it("o que ficou sem resposta vai de novo com o mesmo id depois de reconectar", async () => {
    const { relogio, servidor, mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    const morador = moradorDeNome(mundo, "Lia");
    const primeiro = servidor.ultimo;

    // A rede engole o pedido: o servidor nem fica sabendo.
    primeiro.surdo = true;
    const resposta = lia.comandar(morador.id, { t: "reservar" });
    await andar(5);
    expect(lia.comandos.emAberto()).toHaveLength(1);
    const enviado = primeiro.recebidas.at(-1);
    expect(enviado).toMatchObject({ t: "intencao" });
    expect(mundo.presenca.reservas).toEqual([]);

    primeiro.fechar(1006);
    relogio.avancar(500);
    await assentar();
    expect(lia.loja.conexao.fase).toBe("pronto");
    const segundo = servidor.ultimo;
    expect(segundo).not.toBe(primeiro);
    // Depois de entrar, o mesmo quadro, com o mesmo id.
    expect(segundo.recebidas.map((m) => m.t)).toEqual(["entrar", "intencao"]);
    expect(segundo.recebidas[1]).toEqual(enviado);

    await andar(1);
    expect(await resposta).toMatchObject({ ok: true });
    expect(lia.comandos.emAberto()).toEqual([]);
    expect(mundo.presenca.reservas).toHaveLength(1);
    expect(lia.loja.meuMoradorId()).toBe(morador.id);
  });

  it("um comando que o servidor já tinha feito não é feito de novo", async () => {
    const { relogio, servidor, mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    const morador = moradorDeNome(mundo, "Lia");
    void lia.comandar(morador.id, { t: "reservar" });
    await andar(2);

    // O servidor recebe e faz, mas a resposta se perde junto com a conexão.
    const primeiro = servidor.ultimo;
    primeiro.retido = [];
    const resposta = lia.comandar(morador.id, {
      t: "interagir",
      interacao: "comer",
      alvo: { t: "objeto", objetoId: geladeira(mundo).id },
    });
    await andar(2);
    const acoesDepoisDoPrimeiro = mundo.estado.acoes.ordem.length;
    const pedidas = () =>
      listar(mundo.estado.acoes).filter((acao) => acao.origem === "jogador").length;
    expect(pedidas()).toBe(1);
    expect(lia.comandos.emAberto()).toHaveLength(1);

    primeiro.fechar(1006);
    relogio.avancar(500);
    await assentar();
    await andar(2);
    const resultado = await resposta;
    expect(resultado).toMatchObject({ ok: true, repetido: true });
    expect(pedidas()).toBe(1);
    expect(mundo.estado.acoes.ordem.length).toBeLessThanOrEqual(acoesDepoisDoPrimeiro + 1);
    expect(lia.comandos.emAberto()).toEqual([]);
  });

  it("uma recusa vira aviso em português para a pessoa", async () => {
    const { mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    const bruno = await entrar(DO_BRUNO);
    const morador = moradorDeNome(mundo, "Lia");
    void lia.comandar(morador.id, { t: "reservar" });
    await andar(1);
    const resposta = bruno.comandar(morador.id, { t: "reservar" });
    await andar(1);
    expect(await resposta).toMatchObject({ ok: false, motivo: "reservado_por_outro" });
    expect(bruno.loja.avisos.map((aviso) => aviso.texto)).toEqual([
      "Outra pessoa está dirigindo este morador.",
    ]);
    expect(lia.loja.avisos).toEqual([]);
  });
});

/** Anda até a ação do comando começar a andar no servidor, e devolve o morador. */
async function ateARota(
  mundo: Mundo,
  andar: (passos: number) => Promise<void>,
  moradorId: Morador["id"],
  comandoId: string,
): Promise<Morador> {
  for (let i = 0; i < 20; i++) {
    await andar(1);
    const morador = obter(mundo.estado.moradores, moradorId);
    const acao = morador?.acaoAtual ? obter(mundo.estado.acoes, morador.acaoAtual) : undefined;
    if (morador?.movimento && acao?.comandoId === comandoId) return morador;
  }
  throw new Error("O servidor não começou a andar");
}

describe("previsão do ir até aqui", () => {
  it("a rota local é a mesma que o servidor dá ao mesmo clique", async () => {
    const { mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    const morador = moradorDeNome(mundo, "Lia");
    void lia.comandar(morador.id, { t: "reservar" });
    await andar(1);

    // Da entrada do lote até a cozinha: atravessa a porta da frente e a sala.
    const destino: PontoMm = [8875, 6125];
    expect(lia.irPara(destino)).toBe("previsto");
    const prevista = lia.previsao.rota;
    const comandoId = lia.previsao.comandoId;
    expect(prevista).not.toBeNull();
    expect(prevista?.length).toBeGreaterThan(2);
    // O desenho já anda, antes de o servidor dizer qualquer coisa.
    expect(lia.previsao.ativaPara(morador.id)).toBe(true);

    const noServidor = await ateARota(mundo, andar, morador.id, comandoId ?? "");
    expect(noServidor.movimento?.rota).toEqual(prevista);
    // Com a rota do servidor no espelho, a previsão acabou e o desenho segue a curva dele.
    expect(lia.previsao.ativaPara(morador.id)).toBe(false);
    expect(lia.loja.avisos).toEqual([]);
  });

  it("a posição fracionada concorda com a da simulação nos ticks inteiros", async () => {
    const { mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    const morador = moradorDeNome(mundo, "Lia");
    void lia.comandar(morador.id, { t: "reservar" });
    await andar(1);
    lia.irPara([8875, 6125]);
    const andando = await ateARota(mundo, andar, morador.id, lia.previsao.comandoId ?? "");
    const movimento = andando.movimento;
    if (!movimento) throw new Error("sem movimento");
    for (let tick = movimento.inicioTick - 2; tick < movimento.inicioTick + 120; tick++) {
      const inteira = posicaoNoMovimento(movimento, tick);
      const fracionada = posicaoFracionada(movimento, tick).pos;
      expect(Math.abs(fracionada[0] - inteira[0])).toBeLessThan(1);
      expect(Math.abs(fracionada[1] - inteira[1])).toBeLessThan(1);
    }
    // Entre dois ticks, fica entre as duas posições inteiras.
    const meio = posicaoFracionada(movimento, movimento.inicioTick + 10.5).pos;
    const antes = posicaoNoMovimento(movimento, movimento.inicioTick + 10);
    const depois = posicaoNoMovimento(movimento, movimento.inicioTick + 11);
    expect(Math.hypot(meio[0] - antes[0], meio[1] - antes[1])).toBeLessThan(movimento.mmPorTick);
    expect(Math.hypot(meio[0] - depois[0], meio[1] - depois[1])).toBeLessThan(movimento.mmPorTick);
  });

  it("quem está sentado por conta própria se levanta pelo mesmo lugar nos dois lados", async () => {
    const { mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    // Deixa a família viver até alguém se sentar ou deitar sozinho, em algo que pode ser interrompido.
    let sentado: Morador | undefined;
    for (let i = 0; i < 4000 && !sentado; i++) {
      await andar(5);
      sentado = listar(mundo.estado.moradores).find((morador) => {
        const acao = morador.acaoAtual ? obter(mundo.estado.acoes, morador.acaoAtual) : undefined;
        return (
          morador.familiaId !== null &&
          morador.local.t === "objeto" &&
          acao?.origem === "autonomia" &&
          acao.estado === "executando" &&
          interacao(acao.interacao)?.interruptivel === true
        );
      });
    }
    if (!sentado) throw new Error("Ninguém se sentou em 2000 segundos de jogo");
    void lia.comandar(sentado.id, { t: "reservar" });
    await andar(1);
    expect(lia.loja.meuMoradorId()).toBe(sentado.id);

    const destino: PontoMm = [6125, 5125];
    expect(lia.irPara(destino)).toBe("previsto");
    const prevista = lia.previsao.rota;
    const noServidor = await ateARota(mundo, andar, sentado.id, lia.previsao.comandoId ?? "");
    expect(noServidor.movimento?.rota).toEqual(prevista);
  });

  it("uma recusa do servidor cancela a previsão e avisa o motivo", async () => {
    const { servidor, mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    const morador = moradorDeNome(mundo, "Lia");
    void lia.comandar(morador.id, { t: "reservar" });
    await andar(1);
    expect(lia.loja.meuMoradorId()).toBe(morador.id);

    // O servidor solta a reserva, mas a notícia ainda não chegou ao cliente.
    const soquete = servidor.ultimo;
    soquete.retido = [];
    mundo.aplicar({
      t: "intencao",
      sessaoId: DA_LIA,
      intencao: {
        comandoId: "solta-por-fora",
        mundoId: mundo.estado.id,
        moradorId: morador.id,
        acao: { t: "liberar" },
        versaoEsperada: 0,
      },
    });
    expect(lia.irPara([8875, 6125])).toBe("previsto");
    expect(lia.previsao.ativaPara(morador.id)).toBe(true);

    servidor.andar(1);
    soquete.soltar();
    await assentar();
    expect(lia.previsao.ativaPara(morador.id)).toBe(false);
    expect(lia.previsao.rota).toBeNull();
    expect(lia.loja.avisos.map((aviso) => aviso.texto)).toEqual([
      "Escolha um morador pelo retrato antes de dar ordens.",
    ]);
    // O morador não saiu do lugar no servidor.
    expect(obter(mundo.estado.moradores, morador.id)?.movimento).toBeNull();
  });

  it("clique em lugar bloqueado nem chega ao servidor", async () => {
    const { servidor, mundo, entrar, andar } = preparar();
    const lia = await entrar(DA_LIA);
    const morador = moradorDeNome(mundo, "Lia");
    void lia.comandar(morador.id, { t: "reservar" });
    await andar(1);
    const enviados = servidor.ultimo.recebidas.length;
    // O centro da geladeira é chão ocupado.
    const objeto = geladeira(mundo);
    expect(lia.irPara([objeto.pos[0], objeto.pos[1]])).toBe("bloqueado");
    expect(servidor.ultimo.recebidas).toHaveLength(enviados);
    expect(lia.previsao.rota).toBeNull();
  });

  it("sem morador escolhido, o clique no chão só explica o que falta", async () => {
    const { servidor, entrar } = preparar();
    const lia = await entrar(DA_LIA);
    const enviados = servidor.ultimo.recebidas.length;
    expect(lia.irPara([6125, 3125])).toBe("sem_morador");
    expect(servidor.ultimo.recebidas).toHaveLength(enviados);
    expect(lia.loja.avisos.map((aviso) => aviso.texto)).toEqual([
      "Escolha um morador pelo retrato para andar pela casa.",
    ]);
  });
});
