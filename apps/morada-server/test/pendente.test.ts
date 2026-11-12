import { FECHAMENTO } from "@informach/morada-sim/protocolo";
import { POSSE_TTL_MS, type SessaoDeJogoId } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { type Bancada, criarBancada, mundoDe } from "./apoio";

/**
 * Um passo cujos fatos ainda não entraram no diário fica em espera, e o mundo
 * espera com ele. Estes testes conferem que nada passa na frente desse passo
 * nem toma o lugar dele: quem entra, quem sai, a fotografia, o desligamento.
 */

const leitura = new TextDecoder();

function fatosNoDiario(bancada: Bancada, mundoId: Parameters<Bancada["plataforma"]["mundo"]>[0]) {
  return bancada.plataforma
    .mundo(mundoId)
    .diario.map((entrada) => JSON.parse(leitura.decode(entrada.bytes)).dados.tipo as string);
}

/** A Lia joga, dirige a própria moradora e tem um fato esperando o diário, que está fora do ar. */
async function comPassoEmEspera(opcoes: Parameters<typeof criarBancada>[0] = {}) {
  const bancada = await criarBancada(opcoes);
  const { instancia, host } = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const bruno = bancada.jogador("Bruno");
  const mundoId = bancada.criarMundo(lia);
  await bancada.entrar(lia, mundoId);
  const daLia = lia.moradorDeNome("Lia").id;
  await lia.comando(daLia, { t: "reservar" });
  await bancada.andar(3);

  // Definir o preferido é um fato crítico. Só o diário falha: o resto do Recreio responde.
  const preferido = await lia.comando(daLia, { t: "definir_preferido", valor: true });
  host.foraDoAr = true;
  host.soFalha = ["anexarAoDiario"];
  await bancada.andar(1);
  expect(lia.resultados.has(preferido)).toBe(false);
  return { bancada, instancia, host, lia, bruno, mundoId, daLia, preferido };
}

describe("passo em espera do diário", () => {
  it("o fato do passo em espera chega ao diário mesmo se alguém entra antes da nova tentativa", async () => {
    const { bancada, host, lia, bruno, mundoId, preferido } = await comPassoEmEspera();

    host.foraDoAr = false;
    // Antes de o passo seguinte tentar de novo, o Bruno entra (e ganha acesso: outro fato).
    bancada.convidar(mundoId, bruno);
    await bancada.entrar(bruno, mundoId);
    await bancada.andar(5);

    // Os fatos entram na ordem em que aconteceram, e o comando da Lia é respondido.
    expect(fatosNoDiario(bancada, mundoId)).toEqual([
      "AcessoConcedido",
      "PreferidoDefinido",
      "AcessoConcedido",
    ]);
    expect(lia.resultados.get(preferido)).toMatchObject({ ok: true });
  });

  it("quem entra com um passo em espera só vê o mundo depois que o diário confirma tudo", async () => {
    const { bancada, instancia, host, lia, bruno, mundoId, daLia, preferido } =
      await comPassoEmEspera();
    const diarioAntes = bancada.plataforma.mundo(mundoId).diarioSeq;

    bancada.convidar(mundoId, bruno);
    await bancada.entrar(bruno, mundoId);
    await bancada.andar(15);

    // O Bruno foi aceito, mas não recebeu o mundo: ele traria o que ainda não gravou.
    expect(bruno.fechamento).toBeNull();
    expect(bruno.quadros.filter((quadro) => quadro.t !== "aviso")).toEqual([]);
    // A Lia não soube da entrada dele nem teve a resposta, e o diário não mudou.
    expect(lia.visao?.presenca.jogadores).toHaveLength(1);
    expect(lia.resultados.has(preferido)).toBe(false);
    expect(bancada.plataforma.mundo(mundoId).diarioSeq).toBe(diarioAntes);
    // Enquanto espera, o que o Bruno manda é ignorado, sem derrubar a conexão.
    await bruno.mandar({ t: "pulso", n: 1 });
    expect(bruno.fechamento).toBeNull();

    host.foraDoAr = false;
    await bancada.andar(1);

    expect(fatosNoDiario(bancada, mundoId).slice(-2)).toEqual([
      "PreferidoDefinido",
      "AcessoConcedido",
    ]);
    expect(lia.resultados.get(preferido)).toMatchObject({ ok: true });
    // O Bruno entra agora, já com o preferido da Lia na visão inteira.
    expect(bruno.quadros.slice(0, 2).map((quadro) => quadro.t)).toEqual([
      "bem_vindo",
      "fotografia",
    ]);
    expect(bruno.visao?.moradores.porId[daLia]?.preferidoDe).toBe(lia.jogadorId);
    expect(lia.visao?.presenca.jogadores).toHaveLength(2);

    // E os dois seguem iguais ao mundo do servidor: ninguém perdeu nem repetiu um passo.
    await bancada.andar(20);
    // Os campos lentos da replicação saem nos ticks múltiplos de dez: compara em um deles.
    const mundo = mundoDe(instancia, mundoId);
    while (mundo.estado.relogio.tick % 10 !== 0) await bancada.andar(1);
    const visao = mundo.visao("");
    expect(lia.visao).toEqual(visao);
    expect(bruno.visao).toEqual(visao);
  });

  it("quem sai e a sessão que o Recreio encerra esperam a vez, atrás do passo em espera", async () => {
    const bancada = await criarBancada();
    const { instancia, host } = await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const bruno = bancada.jogador("Bruno");
    const caio = bancada.jogador("Caio");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    for (const convidado of [bruno, caio]) {
      bancada.convidar(mundoId, convidado);
      await bancada.entrar(convidado, mundoId);
    }
    const daLia = lia.moradorDeNome("Lia").id;
    await lia.comando(daLia, { t: "reservar" });
    await bruno.comando(bruno.moradorDeNome("Marcos").id, { t: "reservar" });
    await caio.comando(caio.moradorDeNome("Nina").id, { t: "reservar" });
    await bancada.andar(3);
    expect(lia.visao?.presenca.reservas).toHaveLength(3);

    const preferido = await lia.comando(daLia, { t: "definir_preferido", valor: true });
    host.foraDoAr = true;
    host.soFalha = ["anexarAoDiario"];
    await bancada.andar(1);
    const tick = mundoDe(instancia, mundoId).estado.relogio.tick;

    // O Bruno pede para sair, e a sessão do Caio é encerrada no Recreio.
    await bruno.mandar({ t: "sair" });
    bancada.plataforma.encerrarSessao(bancada.sessaoDe(caio) as SessaoDeJogoId, "signed_out");
    await instancia.batimento();
    await bancada.andar(10);

    // O Caio é desconectado na hora; no mundo, nada andou: nem tempo, nem presença.
    expect(caio.fechamento).toBe(FECHAMENTO.semAcesso);
    expect(bruno.fechamento).toBeNull();
    expect(mundoDe(instancia, mundoId).estado.relogio.tick).toBe(tick);
    expect(mundoDe(instancia, mundoId).presenca.reservas).toHaveLength(3);
    expect(lia.resultados.has(preferido)).toBe(false);

    host.foraDoAr = false;
    await bancada.andar(3);

    // Primeiro o passo que esperava; depois as saídas, que soltam as reservas.
    expect(lia.resultados.get(preferido)).toMatchObject({ ok: true });
    expect(bruno.quadros.at(-1)).toEqual({ t: "saiu", salvo: true });
    expect(bruno.fechamento).toBe(FECHAMENTO.normal);
    expect(lia.visao?.presenca.reservas).toEqual([{ moradorId: daLia, perfilId: lia.jogadorId }]);
    expect(lia.visao?.presenca.jogadores).toHaveLength(1);
    expect(fatosNoDiario(bancada, mundoId).filter((tipo) => tipo === "PreferidoDefinido")).toEqual([
      "PreferidoDefinido",
    ]);
  });

  it("nenhuma fotografia é tirada com um passo em espera; a seguinte cobre o diário inteiro", async () => {
    const { bancada, host, mundoId } = await comPassoEmEspera({ checkpointMs: 1000 });
    const guardado = () => bancada.plataforma.mundo(mundoId);
    const fotografiasAntes = guardado().fotografias.length;

    // Passa muito do intervalo da fotografia, com o passo ainda em espera.
    await bancada.andar(40);
    expect(guardado().fotografias).toHaveLength(fotografiasAntes);

    host.foraDoAr = false;
    await bancada.andar(15);
    expect(guardado().fotografias.length).toBeGreaterThan(fotografiasAntes);
    expect(guardado().fotografias.at(-1)?.diarioSeq).toBe(guardado().diarioSeq);
    expect(fatosNoDiario(bancada, mundoId)).toContain("PreferidoDefinido");
  });

  it("no desligamento, o passo em espera tem uma última tentativa e entra na fotografia final", async () => {
    const { bancada, instancia, host, lia, mundoId, preferido } = await comPassoEmEspera();

    host.foraDoAr = false;
    await instancia.encerrar();

    expect(lia.resultados.get(preferido)).toMatchObject({ ok: true });
    expect(lia.fechamento).toBe(FECHAMENTO.reiniciando);
    const guardado = bancada.plataforma.mundo(mundoId);
    expect(fatosNoDiario(bancada, mundoId)).toContain("PreferidoDefinido");
    expect(guardado.posse).toBeNull();
    expect(guardado.fotografias.at(-1)?.diarioSeq).toBe(guardado.diarioSeq);
  });

  it("desligamento com o diário fora do ar: não fotografa o que não gravou, e o mundo volta do que estava gravado", async () => {
    const { bancada, instancia, host, lia, mundoId, daLia, preferido } = await comPassoEmEspera();
    const antes = bancada.plataforma.mundo(mundoId);
    const [fotografiasAntes, diarioAntes] = [antes.fotografias.length, antes.diarioSeq];

    host.soFalha = null;
    await instancia.encerrar();

    // Ninguém soube do fato, e nada dele foi guardado: nem diário, nem fotografia.
    expect(lia.resultados.has(preferido)).toBe(false);
    expect(lia.fechamento).toBe(FECHAMENTO.reiniciando);
    const guardado = bancada.plataforma.mundo(mundoId);
    expect(guardado.diarioSeq).toBe(diarioAntes);
    expect(guardado.fotografias).toHaveLength(fotografiasAntes);
    // A posse não foi solta: sem fotografia que cubra tudo, ela vence sozinha.
    expect(guardado.posse).not.toBeNull();
    expect(bancada.registros.map((registro) => registro.evento)).toContain(
      "encerramento_sem_salvar",
    );

    // Outra instância assume quando a posse vence. O preferido não existe; a Lia pede de novo.
    const b = await bancada.novaInstancia("wss://b.test");
    lia.cair();
    await bancada.andar(POSSE_TTL_MS / 100 + 1, [b.instancia]);
    await bancada.entrar(lia, mundoId);
    expect(lia.fechamento).toBeNull();
    expect(lia.visao?.moradores.porId[daLia]?.preferidoDe).toBeUndefined();
    await lia.comando(daLia, { t: "reservar" });
    await lia.comando(daLia, { t: "definir_preferido", valor: true }, preferido);
    await bancada.andar(3, [b.instancia]);
    expect(lia.resultados.get(preferido)).toMatchObject({ ok: true });
    expect(fatosNoDiario(bancada, mundoId).filter((tipo) => tipo === "PreferidoDefinido")).toEqual([
      "PreferidoDefinido",
    ]);
  });
});

describe("os tetos do diário", () => {
  it("com muito diário sem fotografia, fotografa logo em vez de esperar o intervalo", async () => {
    const bancada = await criarBancada({ diarioParaFotografarBytes: 1 });
    await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    const guardado = () => bancada.plataforma.mundo(mundoId);
    // A entrada gravou o acesso: o primeiro passo já fotografa, sem esperar os 30 s.
    await bancada.andar(1);
    expect(guardado().fotografias.at(-1)?.diarioSeq).toBe(guardado().diarioSeq);
    const fotografias = guardado().fotografias.length;

    const daLia = lia.moradorDeNome("Lia").id;
    await lia.comando(daLia, { t: "reservar" });
    await lia.comando(daLia, { t: "definir_preferido", valor: true });
    await bancada.andar(2);
    expect(guardado().fotografias.length).toBeGreaterThan(fotografias);
    expect(guardado().fotografias.at(-1)?.diarioSeq).toBe(guardado().diarioSeq);
  });

  it("quando o Recreio exige fotografia para aceitar o diário, o mundo recomeça do que está gravado", async () => {
    const limites = { diarioPendenteMaxBytes: 8 * 1024 * 1024 };
    const bancada = await criarBancada({ limites });
    const { instancia } = await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    const daLia = lia.moradorDeNome("Lia").id;
    await lia.comando(daLia, { t: "reservar" });
    await bancada.andar(3);
    const guardado = () => bancada.plataforma.mundo(mundoId);
    const cerca = guardado().posse?.cerca;

    // O diário sem fotografia (o acesso da Lia) já ocupa todo o teto: o próximo fato não cabe.
    const semFoto = guardado().diario.reduce((total, entrada) => total + entrada.bytes.length, 0);
    expect(semFoto).toBeGreaterThan(0);
    limites.diarioPendenteMaxBytes = semFoto + 10;
    const preferido = await lia.comando(daLia, { t: "definir_preferido", valor: true });
    await bancada.andar(1);

    // O ator larga a memória (que já tinha o passo não gravado) e manda reabrir. A posse fica.
    expect(lia.fechamento).toBe(FECHAMENTO.reiniciando);
    expect(lia.resultados.has(preferido)).toBe(false);
    expect(instancia.medir().mundos).toBe(0);
    expect(guardado().posse?.cerca).toBe(cerca);
    expect(fatosNoDiario(bancada, mundoId)).toEqual(["AcessoConcedido"]);
    expect(bancada.registros).toContainEqual({
      evento: "mundo_recomeca",
      dados: { mundoId, motivo: "CHECKPOINT_NECESSARIO", passosDescartados: 1 },
    });

    // A Lia reabre e cai na mesma instância, que recarrega o que está gravado e fotografa.
    lia.cair();
    await bancada.entrar(lia, mundoId);
    expect(lia.fechamento).toBeNull();
    expect(guardado().posse?.cerca).toBe(cerca);
    expect(guardado().fotografias.at(-1)?.diarioSeq).toBe(guardado().diarioSeq);
    expect(lia.visao?.moradores.porId[daLia]?.preferidoDe).toBeUndefined();

    // Agora o diário aceita: o mesmo comando, mandado de novo, vale uma vez.
    await lia.comando(daLia, { t: "reservar" });
    await lia.comando(daLia, { t: "definir_preferido", valor: true }, preferido);
    await bancada.andar(3);
    expect(lia.resultados.get(preferido)).toMatchObject({ ok: true });
    expect(fatosNoDiario(bancada, mundoId)).toEqual(["AcessoConcedido", "PreferidoDefinido"]);
  });
});
