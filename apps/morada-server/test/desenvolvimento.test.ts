import { REGRAS_DA_PROVA } from "@informach/morada-sim";
import { FECHAMENTO } from "@informach/morada-sim/protocolo";
import type { PerfilId } from "@informach/recreio";
import { afterEach, describe, expect, it } from "vitest";
import { criarPlataformaDeDesenvolvimento } from "../src/desenvolvimento";
import { criarInstancia } from "../src/instancia";
import { criarServidor, type Servidor } from "../src/servidor";
import { ClienteDeTeste } from "./apoio";

/**
 * A plataforma de desenvolvimento (`MORADA_PLATAFORMA=falsa`) com uma
 * instância de verdade: entrar, continuar e renovar a sessão. O tempo é do
 * teste, menos nas rotas HTTP, que rodam em uma porta de verdade.
 */

const ORIGEM = "http://localhost:5173";
const MINUTO = 600;

async function bancadaDeDesenvolvimento() {
  let agoraMs = Date.UTC(2026, 10, 12, 12, 0, 0);
  const dev = await criarPlataformaDeDesenvolvimento({
    urlPublica: "ws://dev.test",
    origens: [ORIGEM],
    relogio: () => agoraMs,
  });
  const instancia = criarInstancia({
    host: dev.host,
    verificador: dev.verificador,
    agora: dev.agora,
    urlPublica: "ws://dev.test",
    versao: "teste",
    capacidade: 5,
    regras: REGRAS_DA_PROVA,
  });
  await instancia.iniciar();

  /** Quem joga pela bancada: guarda o token vigente e o renova, como a fonte do cliente. */
  async function jogador(apelido: string, opcoes: { validadeS?: number } = {}) {
    const cliente = new ClienteDeTeste(apelido, "perfil-de-desenvolvimento" as PerfilId);
    const entrada = await dev.entrar(apelido, opcoes);
    await cliente.ligar(instancia, entrada.mundoId, entrada.sessao);
    let token = entrada.sessao;
    let validadeMs = entrada.validadeMs;
    return {
      cliente,
      mundoId: entrada.mundoId,
      token: () => token,
      validadeMs: () => validadeMs,
      async renovar(): Promise<boolean> {
        const renovada = await dev.renovar(token);
        if (!renovada) return false;
        token = renovada.sessao;
        validadeMs = renovada.validadeMs;
        if (cliente.aberto) await cliente.mandar({ t: "renovar_sessao", sessao: token });
        return true;
      },
      /** Reabre o mundo como a fonte do cliente faz depois de uma queda. */
      async reabrir(continuar: boolean) {
        const outra = await dev.entrar(apelido, { continuar });
        token = outra.sessao;
        await cliente.ligar(instancia, outra.mundoId, token);
      },
    };
  }

  /** Anda o tempo em passos de 100 ms; `aCada` roda depois de cada passo. */
  async function andar(ticks: number, aCada?: (passo: number) => Promise<void>) {
    for (let i = 1; i <= ticks; i++) {
      agoraMs += 100;
      await instancia.passo();
      if (agoraMs % 10_000 === 0) await instancia.batimento();
      await aCada?.(i);
    }
  }

  return { dev, instancia, jogador, andar };
}

describe("sessão de desenvolvimento", () => {
  it("renovada a cada cinco minutos, passa dos quinze; sem renovar, acaba", async () => {
    const { dev, instancia, jogador, andar } = await bancadaDeDesenvolvimento();
    const lia = await jogador("Lia");
    const bruno = await jogador("Bruno");
    expect(lia.validadeMs()).toBe(15 * 60_000);
    const sid = (await dev.verificador.verificar(lia.token())).sid;
    const daLia = lia.cliente.moradorDeNome("Lia").id;
    await lia.cliente.comando(daLia, { t: "reservar" });

    // A Lia renova como a bancada do cliente: a um terço da validade. O Bruno, não.
    const renovacoes: boolean[] = [];
    await andar(31 * MINUTO, async (passo) => {
      if (passo % (5 * MINUTO) === 0) renovacoes.push(await lia.renovar());
    });

    expect(renovacoes).toEqual([true, true, true, true, true, true]);
    expect(bruno.cliente.fechamento).toBe(FECHAMENTO.sessao);
    // Meia hora depois, a Lia é a mesma sessão, na mesma conexão, com o mesmo morador.
    expect(lia.cliente.fechamento).toBeNull();
    expect((await dev.verificador.verificar(lia.token())).sid).toBe(sid);
    expect(lia.cliente.visao?.presenca).toMatchObject({
      jogadores: [{ perfilId: lia.cliente.jogadorId, apelido: "Lia", estado: "presente" }],
      reservas: [{ moradorId: daLia, perfilId: lia.cliente.jogadorId }],
    });
    expect(instancia.ator(lia.mundoId)?.tick).toBe(31 * MINUTO);
  }, 120_000);

  it("com validade curta, o jogo segue enquanto renova e acaba quando para de renovar", async () => {
    const { jogador, andar } = await bancadaDeDesenvolvimento();
    const lia = await jogador("Lia", { validadeS: 3 });
    expect(lia.validadeMs()).toBe(3000);

    // Dez validades seguidas, renovando a cada segundo.
    await andar(300, async (passo) => {
      if (passo % 10 === 0) expect(await lia.renovar()).toBe(true);
    });
    expect(lia.cliente.fechamento).toBeNull();
    // A sessão renovada continua com a validade pedida na entrada.
    expect(lia.validadeMs()).toBe(3000);

    await andar(40);
    expect(lia.cliente.fechamento).toBe(FECHAMENTO.sessao);
    // Token vencido (passada a tolerância de relógio) não renova: é preciso entrar de novo.
    await andar(60);
    expect(await lia.renovar()).toBe(false);
  });

  it("continuar retoma a mesma sessão e a reserva; entrar de novo abre outra", async () => {
    const { dev, instancia, jogador, andar } = await bancadaDeDesenvolvimento();
    const lia = await jogador("Lia");
    const mundo = () => instancia.ator(lia.mundoId)?.simulacao;
    const daLia = lia.cliente.moradorDeNome("Lia").id;
    await lia.cliente.comando(daLia, { t: "reservar" });
    await andar(3);
    const primeiro = lia.token();
    const sid = (await dev.verificador.verificar(primeiro)).sid;

    // A rede cai e o cliente reabre o mundo pedindo para continuar.
    lia.cliente.cair();
    await andar(50);
    await lia.reabrir(true);
    await andar(2);
    expect(lia.token()).not.toBe(primeiro);
    expect((await dev.verificador.verificar(lia.token())).sid).toBe(sid);
    expect(mundo()?.presenca.sessoes).toMatchObject([{ sessaoId: sid, estado: "presente" }]);
    expect(lia.cliente.visao?.presenca.reservas).toEqual([
      { moradorId: daLia, perfilId: lia.cliente.jogadorId },
    ]);

    // Outra janela com o mesmo apelido é uma sessão nova: toma o lugar e começa sem morador.
    const outraJanela = await jogador("Lia");
    await andar(2);
    expect((await dev.verificador.verificar(outraJanela.token())).sid).not.toBe(sid);
    expect(lia.cliente.fechamento).toBe(FECHAMENTO.substituida);
    expect(outraJanela.cliente.jogadorId).toBe(lia.cliente.jogadorId);
    expect(outraJanela.cliente.visao?.presenca.reservas).toEqual([]);
    // A sessão que perdeu o lugar não renova mais; a nova, sim.
    expect(await lia.renovar()).toBe(false);
    expect(await outraJanela.renovar()).toBe(true);
    expect(await dev.renovar("isto não é um token")).toBeNull();
  });
});

describe("rotas de desenvolvimento", () => {
  const abertos: Servidor[] = [];
  afterEach(async () => {
    for (const servidor of abertos.splice(0)) await servidor.encerrar();
  });

  async function subir(comRotas: boolean) {
    const dev = await criarPlataformaDeDesenvolvimento({
      urlPublica: "ws://localhost",
      origens: [ORIGEM],
    });
    const instancia = criarInstancia({
      host: dev.host,
      verificador: dev.verificador,
      agora: dev.agora,
      urlPublica: "ws://localhost",
      versao: "teste",
      capacidade: 5,
    });
    const servidor = criarServidor({
      instancia,
      origens: [ORIGEM],
      commit: null,
      tokenDeMetricas: null,
      rotas: comRotas ? dev.rotas : undefined,
    });
    abertos.push(servidor);
    const porta = await servidor.iniciar(0, "127.0.0.1");
    const pedir = (caminho: string, corpo: unknown, metodo = "POST") =>
      fetch(`http://127.0.0.1:${porta}${caminho}`, {
        method: metodo,
        headers: { "content-type": "application/json", origin: ORIGEM },
        body: metodo === "POST" ? JSON.stringify(corpo) : undefined,
      });
    return { dev, pedir };
  }

  it("entrar, continuar e renovar por HTTP", async () => {
    const { dev, pedir } = await subir(true);
    const entrada = await pedir("/dev/entrar", { apelido: "Lia", validadeS: 30 });
    expect(entrada.status).toBe(200);
    expect(entrada.headers.get("access-control-allow-origin")).toBe(ORIGEM);
    const dados = (await entrada.json()) as Record<string, unknown>;
    expect(dados).toMatchObject({ apelido: "Lia", endereco: "ws://localhost" });
    expect(dados.validadeMs).toBeGreaterThan(28_000);
    expect(dados.validadeMs).toBeLessThanOrEqual(30_000);
    const sid = (await dev.verificador.verificar(String(dados.sessao))).sid;

    const renovada = await pedir("/dev/renovar", { sessao: dados.sessao });
    expect(renovada.status).toBe(200);
    const nova = (await renovada.json()) as Record<string, unknown>;
    expect(Object.keys(nova).sort()).toEqual(["sessao", "validadeMs"]);
    expect(nova.sessao).not.toBe(dados.sessao);
    expect((await dev.verificador.verificar(String(nova.sessao))).sid).toBe(sid);

    const continuada = await pedir("/dev/entrar", { apelido: "Lia", continuar: true });
    const mesma = (await continuada.json()) as Record<string, unknown>;
    expect(mesma.mundoId).toBe(dados.mundoId);
    expect((await dev.verificador.verificar(String(mesma.sessao))).sid).toBe(sid);

    // O que não serve é recusado sem abrir sessão nenhuma.
    expect((await pedir("/dev/renovar", { sessao: "lixo" })).status).toBe(401);
    expect((await pedir("/dev/renovar", { token: dados.sessao })).status).toBe(400);
    expect((await pedir("/dev/entrar", { apelido: "L" })).status).toBe(400);
    expect((await pedir("/dev/entrar", { apelido: "Lia", validadeS: "já" })).status).toBe(400);
    expect((await pedir("/dev/renovar", null, "GET")).status).toBe(405);
    expect((await pedir("/dev/renovar", null, "OPTIONS")).status).toBe(204);
  });

  it("sem a plataforma de desenvolvimento, as rotas não existem", async () => {
    // É o que acontece com `MORADA_PLATAFORMA=recreio`: o servidor sobe sem rotas extras.
    const { pedir } = await subir(false);
    expect((await pedir("/dev/entrar", { apelido: "Lia" })).status).toBe(404);
    expect((await pedir("/dev/renovar", { sessao: "x" })).status).toBe(404);
  });
});
