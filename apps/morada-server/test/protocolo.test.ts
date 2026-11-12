import { FECHAMENTO, VERSAO_DO_PROTOCOLO } from "@informach/morada-sim/protocolo";
import type { PerfilId, SessaoDeJogoId } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { ClienteDeTeste, criarBancada } from "./apoio";

async function mundoAberto(opcoes: Parameters<typeof criarBancada>[0] = {}) {
  const bancada = await criarBancada(opcoes);
  const { instancia, host } = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const mundoId = bancada.criarMundo(lia);
  await bancada.entrar(lia, mundoId);
  return { bancada, instancia, host, lia, mundoId };
}

/** Uma conexão nova na instância, sem ter entrado em mundo nenhum. */
function conexaoCrua(instancia: Awaited<ReturnType<typeof mundoAberto>>["instancia"]) {
  const cliente = new ClienteDeTeste("cru", "00000000-0000-4000-8000-000000000000" as PerfilId);
  instancia.conectou(cliente.conexao);
  // Liga o cliente à instância sem mandar a entrada.
  (cliente as unknown as { instancia: unknown }).instancia = instancia;
  return cliente;
}

describe("entrada", () => {
  it("recusa sessão que não confere, vencida ou de outro emissor", async () => {
    const { bancada, instancia, lia, mundoId } = await mundoAberto();

    const semToken = conexaoCrua(instancia);
    await semToken.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao: "lixo", mundoId });
    expect(semToken.fechamento).toBe(FECHAMENTO.sessao);

    // Uma sessão emitida e deixada vencer.
    const velho = await bancada.token(lia);
    await bancada.andar(9100, undefined, [lia]);
    const vencido = conexaoCrua(instancia);
    await vencido.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao: velho, mundoId });
    expect(vencido.fechamento).toBe(FECHAMENTO.sessao);

    // Um token bem formado, assinado por outra chave.
    const { criarEmissorDeTeste } = await import("@informach/recreio/testing");
    const impostor = await criarEmissorDeTeste();
    const falso = await impostor.sessao({
      perfilId: lia.perfilId,
      sid: bancada.sessaoDe(lia) as SessaoDeJogoId,
      agora: new Date(bancada.agora()),
    });
    const forjado = conexaoCrua(instancia);
    await forjado.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao: falso, mundoId });
    expect(forjado.fechamento).toBe(FECHAMENTO.sessao);
    expect(lia.fechamento).toBeNull();
  });

  it("sessão válida não dá direito a mundo de que o perfil não é membro", async () => {
    const { bancada, instancia, mundoId } = await mundoAberto();
    const estranho = bancada.jogador("Estranho");
    // O estranho tem conta, perfil e sessão de jogo de verdade; só não é membro.
    bancada.plataforma.criarMundo({ criador: estranho.perfilId });
    const sid = bancada.plataforma.abrirSessao(estranho.perfilId);
    const sessao = await bancada.recreio.sessao({
      perfilId: estranho.perfilId,
      sid,
      agora: new Date(bancada.agora()),
    });
    instancia.conectou(estranho.conexao);
    (estranho as unknown as { instancia: unknown }).instancia = instancia;
    await estranho.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao, mundoId });
    expect(estranho.fechamento).toBe(FECHAMENTO.semAcesso);
    expect(estranho.visao).toBeNull();
    expect(estranho.quadros.filter((q) => q.t === "fotografia")).toEqual([]);
  });

  it("recusa a sessão de outro perfil apresentada com o mundo certo", async () => {
    const { bancada, instancia, lia, mundoId } = await mundoAberto();
    const bruno = bancada.jogador("Bruno");
    // O Bruno não é membro; tenta usar a própria sessão no mundo da Lia.
    const sid = bancada.plataforma.abrirSessao(bruno.perfilId);
    const sessao = await bancada.recreio.sessao({
      perfilId: bruno.perfilId,
      sid,
      agora: new Date(bancada.agora()),
    });
    instancia.conectou(bruno.conexao);
    (bruno as unknown as { instancia: unknown }).instancia = instancia;
    await bruno.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao, mundoId });
    expect(bruno.fechamento).toBe(FECHAMENTO.semAcesso);
    expect(lia.fechamento).toBeNull();
  });

  it("recusa mundo que não tem forma de id e mundo que esta instância não pode abrir", async () => {
    const { bancada, instancia, lia } = await mundoAberto();
    const sessao = await bancada.token(lia);
    const torto = conexaoCrua(instancia);
    await torto.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao, mundoId: "../etc/passwd" });
    expect(torto.fechamento).toBe(FECHAMENTO.semAcesso);

    // Um mundo que existe, mas cuja posse o Recreio não deu a esta instância.
    const outroMundo = bancada.criarMundo(lia);
    const semPosse = conexaoCrua(instancia);
    await semPosse.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao, mundoId: outroMundo });
    expect(semPosse.fechamento).toBe(FECHAMENTO.posse);
    expect(semPosse.quadros).toEqual([{ t: "aviso", codigo: "aguarde" }]);
    expect(instancia.medir().mundos).toBe(1);
  });

  it("não abre mais mundos do que a capacidade", async () => {
    const { bancada, instancia } = await mundoAberto({ capacidade: 1 });
    const clara = bancada.jogador("Clara");
    const outro = bancada.criarMundo(clara);
    // O Recreio não manda mundo a instância cheia.
    await expect(bancada.entrar(clara, outro)).rejects.toMatchObject({ codigo: "SEM_INSTANCIA" });
    expect(instancia.medir().mundos).toBe(1);
  });
});

describe("quadros", () => {
  it("fecha quem manda lixo, formato errado ou campo a mais", async () => {
    const { instancia, lia, mundoId } = await mundoAberto();
    for (const quadro of [
      "isto não é json",
      JSON.stringify({ t: "comando_que_nao_existe" }),
      JSON.stringify({ t: "sair", extra: 1 }),
      JSON.stringify({ t: "entrar", v: 99, sessao: "x", mundoId }),
      JSON.stringify([1, 2, 3]),
    ]) {
      const cliente = conexaoCrua(instancia);
      await cliente.bruto(quadro);
      expect(cliente.fechamento, quadro).toBe(FECHAMENTO.protocolo);
    }
    expect(lia.fechamento).toBeNull();
  });

  it("o primeiro quadro tem de ser a entrada", async () => {
    const { instancia } = await mundoAberto();
    const cliente = conexaoCrua(instancia);
    await cliente.mandar({ t: "pulso", n: 1 });
    expect(cliente.fechamento).toBe(FECHAMENTO.protocolo);
  });

  it("quem já entrou não entra de novo pela mesma conexão", async () => {
    const { bancada, lia, mundoId } = await mundoAberto();
    await lia.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: await bancada.token(lia),
      mundoId,
    });
    expect(lia.fechamento).toBe(FECHAMENTO.protocolo);
  });

  it("fecha quadro grande demais", async () => {
    const { instancia } = await mundoAberto();
    const cliente = conexaoCrua(instancia);
    await cliente.bruto(
      JSON.stringify({ t: "entrar", v: 1, sessao: "x".repeat(20_000), mundoId: "m" }),
    );
    expect(cliente.fechamento).toBe(FECHAMENTO.protocolo);
  });

  it("fecha quem manda comandos demais, e deixa passar o ritmo de quem joga", async () => {
    const { bancada, lia } = await mundoAberto();
    const daLia = lia.moradorDeNome("Lia").id;
    // Um jogador rápido: cinco comandos por segundo, por dez segundos.
    for (let i = 0; i < 50; i++) {
      await lia.comando(daLia, { t: "reservar" });
      await bancada.andar(2);
    }
    expect(lia.fechamento).toBeNull();

    // Uma rajada sem intervalo.
    for (let i = 0; i < 60 && lia.fechamento === null; i++) {
      await lia.comando(daLia, { t: "reservar" });
    }
    expect(lia.fechamento).toBe(FECHAMENTO.protocolo);
  });

  it("comando com o id de outro mundo é recusado pela simulação", async () => {
    const { bancada, lia } = await mundoAberto();
    await lia.mandar({
      t: "intencao",
      intencao: {
        comandoId: "comando-de-outro-mundo",
        mundoId: "outro-mundo",
        moradorId: lia.moradorDeNome("Lia").id,
        acao: { t: "reservar" },
        versaoEsperada: 0,
      },
    });
    await bancada.andar(2);
    expect(lia.resultados.get("comando-de-outro-mundo")).toMatchObject({
      ok: false,
      motivo: "mundo_errado",
    });
  });

  it("o mesmo comando duas vezes tem efeito uma vez, também depois de reconectar", async () => {
    const { bancada, lia, mundoId } = await mundoAberto();
    const daLia = lia.moradorDeNome("Lia").id;
    await lia.comando(daLia, { t: "reservar" });
    await lia.comando(daLia, { t: "ir_para", pos: [6125, 3125], andar: 0 }, "andar-uma-vez");
    await bancada.andar(2);
    expect(lia.resultados.get("andar-uma-vez")).toMatchObject({ ok: true });

    await lia.comando(daLia, { t: "ir_para", pos: [6125, 3125], andar: 0 }, "andar-uma-vez");
    await bancada.andar(2);
    expect(lia.resultados.get("andar-uma-vez")).toMatchObject({ ok: true, repetido: true });

    // A conexão cai antes de a resposta chegar; ao voltar, o cliente manda de novo.
    lia.cair();
    await bancada.andar(10);
    await bancada.entrar(lia, mundoId);
    await lia.comando(daLia, { t: "ir_para", pos: [6125, 3125], andar: 0 }, "andar-uma-vez");
    await bancada.andar(2);
    expect(lia.resultados.get("andar-uma-vez")).toMatchObject({ ok: true, repetido: true });
    // No mundo inteiro, só uma ação nasceu daquele comando.
    const criadas = lia.quadros.flatMap((quadro) =>
      quadro.t === "passo"
        ? quadro.mudancas.filter(
            (m) => m.t === "p" && m.tabela === "acoes" && m.campos.comandoId === "andar-uma-vez",
          )
        : [],
    );
    expect(criadas).toHaveLength(1);
  });
});

describe("sessão de jogo", () => {
  it("sem renovar, a conexão fecha quando a sessão vence; renovando, segue", async () => {
    const { bancada, lia, mundoId } = await mundoAberto();
    const bruno = bancada.jogador("Bruno");
    bancada.convidar(mundoId, bruno);
    await bancada.entrar(bruno, mundoId);

    // A Lia renova a cada cinco minutos, como o SDK; o Bruno não.
    await bancada.andar(9050, undefined, [lia]);
    expect(lia.fechamento).toBeNull();
    expect(bruno.fechamento).toBe(FECHAMENTO.sessao);
    // A queda por sessão vencida é como qualquer queda: a reserva espera e depois é liberada.
    await bancada.andar(320, undefined, [lia]);
    expect(lia.visao?.presenca.jogadores).toEqual([
      { perfilId: lia.jogadorId, apelido: "Lia", estado: "presente" },
    ]);
  });

  it("a renovação precisa ser da mesma sessão", async () => {
    const { bancada, lia } = await mundoAberto();
    const bruno = bancada.jogador("Bruno");
    const sid = bancada.plataforma.abrirSessao(bruno.perfilId);
    const deOutro = await bancada.recreio.sessao({
      perfilId: bruno.perfilId,
      sid,
      agora: new Date(bancada.agora()),
    });
    await lia.mandar({ t: "renovar_sessao", sessao: deOutro });
    expect(lia.fechamento).toBe(FECHAMENTO.sessao);
  });

  it("quando o Recreio encerra a sessão, o jogador sai no batimento seguinte, sem espera", async () => {
    const { bancada, instancia, lia, mundoId } = await mundoAberto();
    const bruno = bancada.jogador("Bruno");
    bancada.convidar(mundoId, bruno);
    await bancada.entrar(bruno, mundoId);
    const doMarcos = bruno.moradorDeNome("Marcos").id;
    await bruno.comando(doMarcos, { t: "reservar" });
    await bancada.andar(5, undefined, [lia, bruno]);

    // O acesso do Bruno caiu no Recreio (pagamento, revogação, saída da conta).
    bancada.plataforma.encerrarSessao(bancada.sessaoDe(bruno) as SessaoDeJogoId, "access_lost");
    await instancia.batimento();
    expect(bruno.quadros.at(-1)).toEqual({ t: "aviso", codigo: "acesso_encerrado" });
    expect(bruno.fechamento).toBe(FECHAMENTO.semAcesso);

    // Sem janela de espera: a reserva dele é liberada já, e a Lia segue.
    await bancada.andar(2, undefined, [lia]);
    expect(lia.visao?.presenca.reservas).toEqual([]);
    expect(lia.visao?.presenca.jogadores).toEqual([
      { perfilId: lia.jogadorId, apelido: "Lia", estado: "presente" },
    ]);
    expect(lia.fechamento).toBeNull();

    // E ele não volta com a sessão encerrada.
    await bancada.entrar(bruno, mundoId);
    expect(bruno.fechamento).toBe(FECHAMENTO.semAcesso);
  });
});

describe("pulso", () => {
  it("sai uma vez por segundo, depois do passo, com o tick em que o mundo está", async () => {
    const { bancada, instancia, lia, mundoId } = await mundoAberto();
    const ator = instancia.ator(mundoId);
    const pulsos = () => lia.quadros.flatMap((quadro) => (quadro.t === "pulso" ? [quadro] : []));

    await bancada.andar(9);
    expect(pulsos()).toEqual([]);
    await bancada.andar(1);
    // O décimo passo levou o mundo ao tick 10, e é esse o tick do pulso.
    expect(ator?.tick).toBe(10);
    expect(pulsos()).toEqual([{ t: "pulso", n: 10, tick: 10, agoraMs: bancada.agora() }]);
    // O pulso sai por último: o passo do mesmo instante vem antes, com o mesmo tick.
    expect(lia.quadros.slice(-2)).toMatchObject([
      { t: "passo", tick: 10 },
      { t: "pulso", tick: 10 },
    ]);

    // Com o mundo acelerado, cada passo de 100 ms vale três ticks.
    await lia.comando(null, { t: "votar_velocidade", velocidade: 3 });
    await bancada.andar(10);
    expect(ator?.tick).toBe(40);
    expect(lia.quadros.slice(-2)).toMatchObject([
      { t: "passo", tick: 40 },
      { t: "pulso", n: 20, tick: 40 },
    ]);

    // Pausado, o pulso continua saindo e o tick não anda.
    await lia.comando(null, { t: "votar_velocidade", velocidade: 0 });
    await bancada.andar(20);
    expect(ator?.tick).toBe(40);
    expect(pulsos().slice(-2)).toMatchObject([
      { n: 30, tick: 40 },
      { n: 40, tick: 40 },
    ]);
  });

  it("não sai enquanto o diário não confirma o passo", async () => {
    const { bancada, instancia, host, lia, mundoId } = await mundoAberto();
    const daLia = lia.moradorDeNome("Lia").id;
    const pulsos = () => lia.quadros.flatMap((quadro) => (quadro.t === "pulso" ? [quadro] : []));
    await lia.comando(daLia, { t: "reservar" });
    await bancada.andar(9);

    // O décimo passo traz um fato e o Recreio não responde: o mundo espera, sem avisar ninguém.
    const preferido = await lia.comando(daLia, { t: "definir_preferido", valor: true });
    host.foraDoAr = true;
    await bancada.andar(1);
    expect(lia.resultados.has(preferido)).toBe(false);
    expect(pulsos()).toEqual([]);

    // O diário volta e o passo é confirmado; o pulso seguinte sai no segundo seguinte.
    host.foraDoAr = false;
    await bancada.andar(1);
    expect(lia.resultados.get(preferido)).toMatchObject({ ok: true });
    expect(pulsos()).toEqual([]);
    await bancada.andar(10);
    expect(instancia.ator(mundoId)?.tick).toBe(20);
    expect(pulsos()).toMatchObject([{ n: 20, tick: 20 }]);
  });
});

describe("medidas", () => {
  it("conta passos, tempo de simulação, bytes e fotografias por mundo", async () => {
    const { bancada, instancia, lia, mundoId } = await mundoAberto();
    await bancada.andar(400, undefined, [lia]);
    const medidas = instancia.medir();
    expect(medidas).toMatchObject({ mundos: 1, conexoes: 1, drenando: false, viva: true });
    const doMundo = medidas.porMundo[0];
    expect(doMundo).toMatchObject({ mundoId, jogadores: 1, moradores: 6, passos: 400 });
    expect(doMundo?.simulandoMs).toBeGreaterThan(0);
    expect(doMundo?.bytesEnviados).toBeGreaterThan(1000);
    expect(doMundo?.fotografias).toBeGreaterThanOrEqual(2);
    expect(doMundo?.bytesDaUltimaFotografia).toBeGreaterThan(1000);
    // A fotografia do mundo da prova, comprimida, é pequena.
    expect(doMundo?.bytesDaUltimaFotografia).toBeLessThan(40_000);
  });
});
