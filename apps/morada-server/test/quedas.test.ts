import { listar } from "@informach/morada-sim";
import { FECHAMENTO } from "@informach/morada-sim/protocolo";
import { bairroComCasal } from "@informach/morada-sim/testes";
import { POSSE_TTL_MS } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { PontoDeFalha } from "../src/falhas";
import { ate, ateCair, type Bancada, ClienteDeTeste, criarBancada, mundoDe } from "./apoio";

const TTL_EM_TICKS = POSSE_TTL_MS / 100;
const leitura = new TextDecoder();

function fatosNoDiario(bancada: Bancada, mundoId: Parameters<Bancada["plataforma"]["mundo"]>[0]) {
  return bancada.plataforma.mundo(mundoId).diario.map((entrada) => ({
    seq: entrada.seq,
    id: entrada.fatoId,
    tipo: JSON.parse(leitura.decode(entrada.bytes)).dados.tipo as string,
  }));
}

describe("a instância cai e o mundo volta", () => {
  it("duas contas jogam, a instância é derrubada e tudo volta em outra", async () => {
    const bancada = await criarBancada();
    const a = await bancada.novaInstancia("wss://a.test");
    const lia = bancada.jogador("Lia");
    const bruno = bancada.jogador("Bruno");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    bancada.convidar(mundoId, bruno, "familia:fam_000001");
    await bancada.entrar(bruno, mundoId);
    const daLia = lia.moradorDeNome("Lia").id;
    const doMarcos = bruno.moradorDeNome("Marcos").id;
    await lia.comando(daLia, { t: "reservar" });
    await lia.comando(daLia, { t: "definir_preferido", valor: true });
    await bruno.comando(doMarcos, { t: "reservar" });
    await bruno.comando(doMarcos, { t: "definir_preferido", valor: true });
    // Tempo bastante para uma fotografia periódica e mais um pouco de vida depois dela.
    await bancada.andar(450, undefined, [lia, bruno]);
    const antes = structuredClone(mundoDe(a.instancia, mundoId).estado);
    const cercaDeA = bancada.plataforma.mundo(mundoId).posse?.cerca;

    // A instância morre: não escreve mais, não bate mais, as conexões somem.
    a.host.foraDoAr = true;
    lia.cair();
    bruno.cair();

    const b = await bancada.novaInstancia("wss://b.test");
    // Enquanto a posse antiga vale, o Recreio ainda aponta para a instância que caiu: não dá para jogar.
    await bancada.entrar(lia, mundoId);
    expect(lia.fechamento).not.toBeNull();
    expect(b.instancia.medir().mundos).toBe(0);
    lia.cair();
    await bancada.andar(TTL_EM_TICKS + 1, [b.instancia]);

    // Os dois reabrem pelo Recreio e caem na instância nova.
    await bancada.entrar(lia, mundoId);
    await bancada.entrar(bruno, mundoId);
    expect(lia.fechamento).toBeNull();
    expect(bruno.fechamento).toBeNull();
    const posse = bancada.plataforma.mundo(mundoId).posse;
    expect(posse?.cerca).toBe((cercaDeA ?? 0) + 1);

    const depois = mundoDe(b.instancia, mundoId).estado;
    // O que é crítico voltou exatamente.
    expect(depois.acessos).toEqual(antes.acessos);
    expect(listar(depois.familias).map((f) => [f.id, f.fundo])).toEqual(
      listar(antes.familias).map((f) => [f.id, f.fundo]),
    );
    expect(listar(depois.moradores).map((m) => [m.id, m.familiaId, m.fase, m.preferidoDe])).toEqual(
      listar(antes.moradores).map((m) => [m.id, m.familiaId, m.fase, m.preferidoDe]),
    );
    // O resto voltou como estava na última fotografia: no máximo 30 s de mundo para trás.
    expect(depois.relogio.tick).toBeGreaterThan(antes.relogio.tick - 320);
    expect(depois.relogio.tick).toBeLessThanOrEqual(antes.relogio.tick);

    // Cada um volta a dirigir o seu preferido e o jogo segue.
    await bancada.andar(5, [b.instancia]);
    expect(lia.visao?.presenca.reservas).toContainEqual({
      moradorId: daLia,
      perfilId: lia.jogadorId,
    });
    expect(bruno.visao?.presenca.reservas).toContainEqual({
      moradorId: doMarcos,
      perfilId: bruno.jogadorId,
    });
    const id = await lia.comando(daLia, { t: "ir_para", pos: [6125, 3125], andar: 0 });
    await bancada.andar(3, [b.instancia]);
    expect(lia.resultados.get(id)).toMatchObject({ ok: true });
    const fatos = fatosNoDiario(bancada, mundoId).map((f) => f.id);
    expect(new Set(fatos).size).toBe(fatos.length);
  });

  it("desligamento ordenado: salva, solta a posse e os clientes reabrem em outra instância", async () => {
    const bancada = await criarBancada();
    const a = await bancada.novaInstancia("wss://a.test");
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    await bancada.andar(200, undefined, [lia]);
    const antes = mundoDe(a.instancia, mundoId).hash();
    const tick = mundoDe(a.instancia, mundoId).estado.relogio.tick;

    const b = await bancada.novaInstancia("wss://b.test");
    await a.instancia.encerrar();
    expect(lia.quadros.at(-1)).toEqual({ t: "aviso", codigo: "servidor_reiniciando" });
    expect(lia.fechamento).toBe(FECHAMENTO.reiniciando);
    const guardado = bancada.plataforma.mundo(mundoId);
    expect(guardado.posse).toBeNull();
    expect(guardado.fotografias.at(-1)?.diarioSeq).toBe(guardado.diarioSeq);

    // Sem esperar prazo nenhum: a posse foi solta, e a instância que saiu não recebe mundo novo.
    lia.cair();
    await bancada.entrar(lia, mundoId);
    expect(bancada.plataforma.mundo(mundoId).posse?.instanciaId).not.toBeUndefined();
    const voltou = mundoDe(b.instancia, mundoId);
    expect(voltou.estado.relogio.tick).toBe(tick);
    // Nada se perdeu: o mundo volta idêntico ao que era no desligamento.
    expect(voltou.hash()).toBe(antes);
  });
});

describe("o parto acontece uma vez só, em qualquer ponto de queda", () => {
  /** Uma gravidez perto do fim, com a Lia jogando na instância A e a B pronta para assumir. */
  async function pertoDoParto() {
    const bancada = await criarBancada({ definicao: bairroComCasal(), checkpointMs: 30_000 });
    const a = await bancada.novaInstancia("wss://a.test");
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    const marcos = lia.moradorDeNome("Marcos").id;
    const duda = lia.moradorDeNome("Duda").id;
    await lia.comando(marcos, { t: "reservar" });
    await lia.comando(marcos, { t: "propor", tipo: "bebe", alvoId: duda });
    const mundo = mundoDe(a.instancia, mundoId);
    await ate(
      bancada,
      () => listar(mundo.estado.gravidezes).length === 1,
      2500,
      "a gravidez começar",
      [lia],
    );
    const gravidez = listar(mundo.estado.gravidezes)[0];
    if (!gravidez) throw new Error("sem gravidez");
    const familia = listar(mundo.estado.familias)[0];
    if (!familia) throw new Error("sem família");
    // Chega a um minuto de jogo do parto.
    await ate(
      bancada,
      () => familia.vidaMs >= gravidez.previstaVidaMs - 60_000,
      30_000,
      "chegar a hora do parto",
      [lia],
    );
    const b = await bancada.novaInstancia("wss://b.test");
    return { bancada, a, b, lia, mundoId, gravidez: structuredClone(gravidez) };
  }

  const eParto = (contexto: Record<string, unknown>) =>
    (contexto.fatos as { dados: { tipo: string } }[] | undefined)?.some(
      (fato) => fato.dados.tipo === "NascimentoRegistrado",
    ) ?? false;

  it.each<[PontoDeFalha, number]>([
    ["antes_do_diario", 0],
    ["depois_do_diario", 1],
    ["depois_de_avisar", 1],
  ])(
    "queda em %s",
    async (ponto, partosNoDiarioNaQueda) => {
      const { bancada, a, b, lia, mundoId, gravidez } = await pertoDoParto();
      a.falhas.armar(ponto, eParto);
      expect(await ateCair(bancada, 400, [lia])).toBe(ponto);
      expect(a.instancia.medir().viva).toBe(false);

      const partos = () =>
        fatosNoDiario(bancada, mundoId).filter((f) => f.id === `nasc:${gravidez.id}`);
      expect(partos()).toHaveLength(partosNoDiarioNaQueda);
      // Quem estava jogando só soube do bebê se o aviso chegou a sair.
      const soube = lia.visao?.moradores.porId[gravidez.bebeId] !== undefined;
      expect(soube).toBe(ponto === "depois_de_avisar");

      // A outra instância assume quando a posse vence, e a família volta a jogar.
      lia.cair();
      await bancada.andar(TTL_EM_TICKS + 1, [b.instancia]);
      await bancada.entrar(lia, mundoId);
      await bancada.andar(400, [b.instancia], [lia]);

      const mundo = mundoDe(b.instancia, mundoId);
      const bebes = listar(mundo.estado.moradores).filter(
        (m) => m.origem.gravidezId === gravidez.id,
      );
      expect(bebes.map((m) => m.id)).toEqual([gravidez.bebeId]);
      expect(partos()).toHaveLength(1);
      expect(listar(mundo.estado.gravidezes)[0]?.estado).toBe("concluida");
      expect(lia.visao?.moradores.porId[gravidez.bebeId]).toMatchObject({ fase: "colo" });
      const ids = fatosNoDiario(bancada, mundoId).map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
    60_000,
  );
});

describe("instância obsoleta", () => {
  async function congelada() {
    const bancada = await criarBancada();
    const a = await bancada.novaInstancia("wss://a.test");
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    // O mundo abre na A; a B só chega depois, e fica de reserva.
    await bancada.entrar(lia, mundoId);
    const b = await bancada.novaInstancia("wss://b.test");
    const daLia = lia.moradorDeNome("Lia").id;
    await lia.comando(daLia, { t: "reservar" });
    await bancada.andar(100, undefined, [lia]);
    expect(a.instancia.medir().mundos).toBe(1);
    return { bancada, a, b, lia, mundoId, daLia };
  }

  it("congelada além do prazo, volta e não escreve nada; o mundo é da que assumiu", async () => {
    const { bancada, a, b, lia, mundoId, daLia } = await congelada();
    const antiga = lia;

    // A instância A para de rodar (um processo suspenso), sem saber de nada.
    await bancada.andar(TTL_EM_TICKS + 1, [b.instancia]);

    // A Lia reabre e cai na B, que assume com uma cerca maior e passa a escrever.
    const nova = new ClienteDeTeste("Lia2", lia.perfilId);
    await bancada.entrar(nova, mundoId);
    const id = await nova.comando(daLia, { t: "reservar" });
    await nova.comando(daLia, { t: "definir_preferido", valor: true });
    await bancada.andar(5, [b.instancia]);
    expect(nova.resultados.get(id)).toMatchObject({ ok: true });
    const doDiario = fatosNoDiario(bancada, mundoId);
    const chamadasDeA = a.host.chamadas.length;

    // A acorda. O relógio dela pulou: a posse local venceu, e ela não simula nem escreve.
    await bancada.andar(20, [a.instancia, b.instancia]);
    const escritas = a.host.chamadas.slice(chamadasDeA).filter((nome) => nome !== "batimento");
    expect(escritas).toEqual([]);
    expect(fatosNoDiario(bancada, mundoId)).toEqual(doDiario);

    // No batimento seguinte ela fica sabendo, larga o mundo e fecha as conexões que tinha.
    await a.instancia.batimento();
    expect(a.instancia.medir().mundos).toBe(0);
    expect(antiga.fechamento).toBe(FECHAMENTO.posse);
    expect(nova.fechamento).toBeNull();
    expect(mundoDe(b.instancia, mundoId).estado.moradores.porId[daLia]?.preferidoDe).toBe(
      nova.jogadorId,
    );
  });

  it("sem batimento confirmado, o mundo para sozinho antes de a posse vencer", async () => {
    const { bancada, a, lia, mundoId } = await congelada();
    const mundo = mundoDe(a.instancia, mundoId);
    // O Recreio fica fora do ar: os batimentos falham, e o diário também falharia.
    a.host.foraDoAr = true;
    await bancada.andar(220, [a.instancia], []);
    const noMeio = mundo.estado.relogio.tick;
    await bancada.andar(100, [a.instancia], []);
    const parado = mundo.estado.relogio.tick;
    // Andou enquanto a posse valia com folga, e parou antes dos 30 s.
    expect(parado).toBeGreaterThanOrEqual(noMeio);
    await bancada.andar(100, [a.instancia], []);
    expect(mundo.estado.relogio.tick).toBe(parado);
    expect(lia.fechamento).toBeNull();

    // O Recreio volta, mas a posse já venceu por lá: a instância larga o mundo.
    a.host.foraDoAr = false;
    await a.instancia.batimento();
    expect(a.instancia.medir().mundos).toBe(0);
    expect(lia.fechamento).toBe(FECHAMENTO.posse);
  });

  it("uma falha curta do Recreio não derruba ninguém", async () => {
    const { bancada, a, lia, mundoId } = await congelada();
    const mundo = mundoDe(a.instancia, mundoId);
    const antes = mundo.estado.relogio.tick;
    a.host.foraDoAr = true;
    await bancada.andar(150, [a.instancia], []);
    a.host.foraDoAr = false;
    await bancada.andar(150, [a.instancia], [lia]);
    expect(mundo.estado.relogio.tick).toBe(antes + 300);
    expect(lia.fechamento).toBeNull();
    expect(a.instancia.medir().mundos).toBe(1);
  });
});
