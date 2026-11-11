import { listar, type Morador } from "@informach/morada-sim";
import { FECHAMENTO } from "@informach/morada-sim/protocolo";
import { describe, expect, it } from "vitest";
import { ate, type Bancada, ClienteDeTeste, criarBancada, mundoDe } from "./apoio";

/** Lia cria o mundo e joga; Bruno, de outra conta, é convidado para dividir a família. */
async function liaEBruno(opcoes: Parameters<typeof criarBancada>[0] = {}) {
  const bancada = await criarBancada(opcoes);
  const { instancia, host } = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const bruno = bancada.jogador("Bruno");
  const mundoId = bancada.criarMundo(lia);
  await bancada.entrar(lia, mundoId);
  bancada.convidar(mundoId, bruno, "familia:fam_000001");
  await bancada.entrar(bruno, mundoId);
  return { bancada, instancia, host, lia, bruno, mundoId };
}

async function resposta(bancada: Bancada, cliente: ClienteDeTeste, id: string) {
  await ate(bancada, () => cliente.resultados.has(id), 5, `a resposta de ${id}`);
  return cliente.resultados.get(id);
}

const parado = (morador: Morador | undefined) =>
  morador !== undefined && morador.acaoAtual === null && morador.fila.length === 0;

describe("duas contas no mesmo mundo", () => {
  it("as duas entram na mesma instância e veem o mesmo mundo", async () => {
    const { bancada, instancia, lia, bruno, mundoId } = await liaEBruno();
    expect(instancia.medir()).toMatchObject({ mundos: 1, conexoes: 2 });

    for (const cliente of [lia, bruno]) {
      expect(cliente.quadros.slice(0, 2).map((q) => q.t)).toEqual(["bem_vindo", "fotografia"]);
      expect(cliente.fechamento).toBeNull();
    }
    // Dentro do mundo cada um é o seu id de membro, não o perfil do Recreio.
    expect(lia.jogadorId).not.toBe(lia.perfilId);
    expect(bruno.jogadorId).not.toBe(lia.jogadorId);
    expect(JSON.stringify(lia.visao)).not.toContain(lia.perfilId);
    expect(JSON.stringify(lia.visao)).not.toContain(bruno.perfilId);

    // Quem cria joga a família com todos os direitos; quem divide, sem gerir o mundo.
    const acessos = mundoDe(instancia, mundoId).estado.acessos;
    expect(acessos.find((a) => a.perfilId === lia.jogadorId)?.permissoes).toContain("gerir_mundo");
    const doBruno = acessos.find((a) => a.perfilId === bruno.jogadorId)?.permissoes ?? [];
    expect(doBruno).toContain("comandar");
    expect(doBruno).not.toContain("gerir_mundo");

    await bancada.andar(600);
    const visao = mundoDe(instancia, mundoId).visao("");
    expect(lia.visao).toEqual(visao);
    expect(bruno.visao).toEqual(visao);
  });

  it("cada uma dirige um morador da mesma família, ao mesmo tempo", async () => {
    const { bancada, instancia, lia, bruno, mundoId } = await liaEBruno();
    const daLia = lia.moradorDeNome("Lia").id;
    const doMarcos = bruno.moradorDeNome("Marcos").id;

    expect(await resposta(bancada, lia, await lia.comando(daLia, { t: "reservar" }))).toMatchObject(
      {
        ok: true,
      },
    );
    expect(
      await resposta(bancada, bruno, await bruno.comando(doMarcos, { t: "reservar" })),
    ).toMatchObject({ ok: true });
    // Um morador nunca tem dois condutores.
    expect(
      await resposta(bancada, bruno, await bruno.comando(daLia, { t: "reservar" })),
    ).toMatchObject({ ok: false, motivo: "reservado_por_outro" });

    await lia.comando(daLia, { t: "ir_para", pos: [6125, 3125], andar: 0 });
    await bruno.comando(doMarcos, { t: "ir_para", pos: [8125, 3125], andar: 0 });
    const mundo = mundoDe(instancia, mundoId);
    await bancada.andar(2);
    await ate(
      bancada,
      () =>
        parado(mundo.estado.moradores.porId[daLia]) &&
        parado(mundo.estado.moradores.porId[doMarcos]),
      1500,
      "os dois chegarem",
    );
    expect(mundo.estado.moradores.porId[daLia]?.local).toMatchObject({ pos: [6125, 3125] });
    expect(mundo.estado.moradores.porId[doMarcos]?.local).toMatchObject({ pos: [8125, 3125] });
    // Os dois clientes viram os dois chegarem.
    expect(bruno.visao?.moradores.porId[daLia]?.local).toMatchObject({ pos: [6125, 3125] });
    expect(lia.visao?.presenca.reservas).toHaveLength(2);
  });

  it("uma cai sem avisar e a outra continua; a família, as filas e o mundo ficam inteiros", async () => {
    const { bancada, instancia, lia, bruno, mundoId } = await liaEBruno();
    const daLia = lia.moradorDeNome("Lia").id;
    const doMarcos = bruno.moradorDeNome("Marcos").id;
    await lia.comando(daLia, { t: "reservar" });
    await bruno.comando(doMarcos, { t: "reservar" });
    await bruno.comando(doMarcos, { t: "ir_para", pos: [8125, 3125], andar: 0 });
    await bruno.comando(doMarcos, { t: "ir_para", pos: [6125, 3125], andar: 0 });
    await bancada.andar(5);
    const mundo = mundoDe(instancia, mundoId);
    const moradores = mundo.estado.moradores.ordem.length;

    bruno.cair();
    await bancada.andar(10);
    // A reserva dele espera a volta: ninguém toma o morador por enquanto.
    expect(lia.visao?.presenca.jogadores).toContainEqual({
      perfilId: bruno.jogadorId,
      estado: "em_graca",
    });
    expect(
      await resposta(bancada, lia, await lia.comando(doMarcos, { t: "reservar" })),
    ).toMatchObject({ ok: false, motivo: "reservado_por_outro" });
    // A Lia continua jogando normalmente.
    expect(
      await resposta(
        bancada,
        lia,
        await lia.comando(daLia, { t: "ir_para", pos: [7125, 3125], andar: 0 }),
      ),
    ).toMatchObject({ ok: true });

    // Passada a espera, a reserva é liberada e a fila do morador termina sozinha.
    await bancada.andar(320);
    expect(lia.visao?.presenca.jogadores).toEqual([
      { perfilId: lia.jogadorId, estado: "presente" },
    ]);
    await ate(
      bancada,
      () => parado(mundo.estado.moradores.porId[doMarcos]),
      1500,
      "a fila do Marcos acabar",
    );
    expect(mundo.estado.moradores.porId[doMarcos]?.local).toMatchObject({ pos: [6125, 3125] });
    expect(mundo.estado.moradores.ordem.length).toBe(moradores);
    expect(listar(mundo.estado.familias)).toHaveLength(1);

    // Quem ficou pode assumir o morador.
    expect(
      await resposta(bancada, lia, await lia.comando(doMarcos, { t: "reservar" })),
    ).toMatchObject({ ok: true });
    expect(lia.fechamento).toBeNull();
  });

  it("quem volta a tempo retoma o morador que dirigia", async () => {
    const { bancada, bruno, lia, mundoId } = await liaEBruno();
    const doMarcos = bruno.moradorDeNome("Marcos").id;
    await bruno.comando(doMarcos, { t: "reservar" });
    await bancada.andar(3);
    bruno.cair();
    await bancada.andar(100);

    // Volta com a mesma sessão de jogo, dentro da espera.
    await bancada.entrar(bruno, mundoId);
    await bancada.andar(2);
    expect(bruno.fechamento).toBeNull();
    expect(bruno.visao?.presenca.reservas).toContainEqual({
      moradorId: doMarcos,
      perfilId: bruno.jogadorId,
    });
    expect(lia.visao?.presenca.jogadores).toContainEqual({
      perfilId: bruno.jogadorId,
      estado: "presente",
    });
    await bancada.andar(400);
    expect(bruno.visao?.presenca.reservas).toHaveLength(1);
  });

  it("o mesmo jogador por outra conexão toma o lugar da antiga", async () => {
    const { bancada, bruno, mundoId } = await liaEBruno();
    // Uma sessão de jogo nova do mesmo perfil, como ao abrir o jogo em outra aba.
    const outraAba = new ClienteDeTeste("Bruno2", bruno.perfilId);
    await bancada.entrar(outraAba, mundoId);
    await bancada.andar(2);
    expect(bruno.fechamento).toBe(FECHAMENTO.substituida);
    expect(outraAba.fechamento).toBeNull();
    expect(outraAba.jogadorId).toBe(bruno.jogadorId);
    expect(outraAba.visao?.presenca.jogadores).toHaveLength(2);
  });
});

describe("o que é crítico vai para o diário antes de qualquer cliente saber", () => {
  it("com o diário fora do ar, o mundo espera e ninguém recebe o passo", async () => {
    const { bancada, instancia, host, lia, bruno, mundoId } = await liaEBruno();
    const daLia = lia.moradorDeNome("Lia").id;
    await lia.comando(daLia, { t: "reservar" });
    await bancada.andar(3);
    const diarioAntes = bancada.plataforma.mundo(mundoId).diarioSeq;
    const quadrosAntes = bruno.quadros.length;

    host.foraDoAr = true;
    // Definir o preferido é um fato crítico.
    const id = await lia.comando(daLia, { t: "definir_preferido", valor: true });
    await bancada.andar(1);
    const tick = mundoDe(instancia, mundoId).estado.relogio.tick;
    await bancada.andar(20);

    // O mundo não andou, o comando não foi respondido e o outro cliente não soube de nada.
    expect(mundoDe(instancia, mundoId).estado.relogio.tick).toBe(tick);
    expect(lia.resultados.has(id)).toBe(false);
    expect(bruno.quadros.slice(quadrosAntes).filter((q) => q.t === "passo")).toEqual([]);
    expect(bruno.visao?.moradores.porId[daLia]?.preferidoDe).toBeUndefined();
    expect(bancada.plataforma.mundo(mundoId).diarioSeq).toBe(diarioAntes);

    host.foraDoAr = false;
    await bancada.andar(2);
    expect(bancada.plataforma.mundo(mundoId).diarioSeq).toBe(diarioAntes + 1);
    expect(lia.resultados.get(id)).toMatchObject({ ok: true });
    expect(bruno.visao?.moradores.porId[daLia]?.preferidoDe).toBe(lia.jogadorId);
    // E o fato entrou uma vez só, mesmo com as tentativas repetidas.
    const fatos = bancada.plataforma.mundo(mundoId).diario.map((e) => e.fatoId);
    expect(new Set(fatos).size).toBe(fatos.length);
  });

  it("o acesso de quem entra é um fato gravado antes de ele ver o mundo", async () => {
    const { bancada, mundoId } = await liaEBruno();
    const fatos = bancada.plataforma
      .mundo(mundoId)
      .diario.map((e) => JSON.parse(new TextDecoder().decode(e.bytes)).dados.tipo);
    expect(fatos).toEqual(["AcessoConcedido", "AcessoConcedido"]);
  });
});

describe("sair e voltar", () => {
  it("quando a última pessoa sai, o mundo é fotografado, hiberna e solta a posse", async () => {
    const bancada = await criarBancada();
    const { instancia } = await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    const daLia = lia.moradorDeNome("Lia").id;
    await lia.comando(daLia, { t: "reservar" });
    await lia.comando(daLia, { t: "definir_preferido", valor: true });
    await bancada.andar(900);
    const tick = mundoDe(instancia, mundoId).estado.relogio.tick;

    await lia.mandar({ t: "sair" });
    await bancada.andar(2);
    expect(lia.quadros.at(-1)).toEqual({ t: "saiu", salvo: true });
    expect(lia.fechamento).toBe(FECHAMENTO.normal);
    expect(instancia.medir().mundos).toBe(0);

    const guardado = bancada.plataforma.mundo(mundoId);
    expect(guardado.estado).toBe("hibernating");
    expect(guardado.posse).toBeNull();
    expect(guardado.fotografias.at(-1)).toMatchObject({
      tipo: "hibernate",
      diarioSeq: guardado.diarioSeq,
    });
    expect(guardado.resumo).toEqual({ titulo: "Família Ipê", subtitulo: "Dia 1 · 4 moradores" });

    // Ninguém presente, nada anda. Uma hora depois, o mundo volta de onde parou.
    await bancada.andar(36_000);
    await bancada.entrar(lia, mundoId, true);
    const voltou = mundoDe(instancia, mundoId);
    // O passo em que a saída foi atendida ainda andou um tick; depois disso, nada.
    expect(voltou.estado.relogio.tick).toBe(tick + 1);
    expect(lia.visao?.moradores.porId[daLia]?.preferidoDe).toBe(lia.jogadorId);
    // O preferido volta com a pessoa.
    expect(lia.visao?.presenca.reservas).toEqual([{ moradorId: daLia, perfilId: lia.jogadorId }]);
  });

  it("a queda de todos também leva à hibernação, depois da espera", async () => {
    const bancada = await criarBancada();
    const { instancia } = await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    await bancada.andar(50);
    lia.cair();
    await bancada.andar(200);
    expect(instancia.medir().mundos).toBe(1);
    await bancada.andar(150);
    expect(instancia.medir().mundos).toBe(0);
    expect(bancada.plataforma.mundo(mundoId).estado).toBe("hibernating");
  });

  it("vários mundos na mesma instância não se misturam", async () => {
    const bancada = await criarBancada();
    const { instancia } = await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const clara = bancada.jogador("Clara");
    const mundoDaLia = bancada.criarMundo(lia);
    const mundoDaClara = bancada.criarMundo(clara);
    await bancada.entrar(lia, mundoDaLia);
    await bancada.entrar(clara, mundoDaClara);
    expect(instancia.medir().mundos).toBe(2);

    await lia.comando(lia.moradorDeNome("Lia").id, { t: "reservar" });
    await bancada.andar(300);
    expect(lia.visao?.mundoId).toBe(mundoDaLia);
    expect(clara.visao?.mundoId).toBe(mundoDaClara);
    expect(clara.visao?.presenca.reservas).toEqual([]);
    expect(lia.visao?.presenca.jogadores).toHaveLength(1);
    // Mundos diferentes nascem diferentes: a semente vem do id.
    expect(mundoDe(instancia, mundoDaLia).hash()).not.toBe(mundoDe(instancia, mundoDaClara).hash());

    // Um perfil que não é membro não entra no mundo de outro, mesmo sabendo o id.
    const intruso = bancada.jogador("Intruso");
    bancada.plataforma.criarMundo({ criador: intruso.perfilId });
    await expect(bancada.entrar(intruso, mundoDaLia)).rejects.toMatchObject({
      codigo: "NAO_MEMBRO",
    });
  });
});
