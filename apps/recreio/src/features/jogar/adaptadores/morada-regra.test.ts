import { ErroDoRecreio, type MundoId } from "@informach/recreio";
import type { MudancaDeAcesso, RecreioGameContext } from "@informach/recreio/sdk";
import { describe, expect, it } from "vitest";
import { paradaDoErro } from "../estado";
import { ehRecusaPassageira, ligarMoradaAoRecreio, PRAZO_DA_PERGUNTA_MS } from "./morada-regra";

/**
 * Quem fala quando o Morada para: a faixa do jogo ou o aviso da página. O
 * contexto do Recreio é um dublê que responde o que cada teste manda; a regra
 * e a tradução para o aviso da página (`paradaDoErro`) são as de verdade.
 */

const MUNDO = "5f0c4c3e-6f6b-4d55-9d1e-0f8a1b2c3d4e" as MundoId;
const OUTRO_MUNDO = "7a1d9e2b-3c4f-4a5b-8c6d-9e0f1a2b3c4d" as MundoId;
const ENDERECO = "ws://localhost:3110";

type Resposta<T> = T | ErroDoRecreio | Error | "sem_resposta";

function responder<T>(resposta: Resposta<T>): Promise<T> {
  if (resposta === "sem_resposta") return new Promise<T>(() => {});
  if (resposta instanceof Error) return Promise.reject(resposta);
  return Promise.resolve(resposta);
}

function montar(
  opcoes: { abrir?: Resposta<{ endereco: string }>[]; listar?: Resposta<MundoId[]> } = {},
) {
  const aberturas = [...(opcoes.abrir ?? [{ endereco: ENDERECO }])];
  const ouvintesDeAcesso = new Set<(mudanca: MudancaDeAcesso) => void>();
  const ouvintesDeRenovacao = new Set<(token: string) => void>();
  const agendados: { chamar: () => void; emMs: number; cancelado: boolean }[] = [];
  const pagina = {
    saiu: 0,
    falhas: [] as unknown[],
    escondido: 0,
    entradas: 0,
    listagens: 0,
  };
  const contexto = {
    sessao: {
      token: () => "token-da-sessao",
      aoRenovar(ouvinte: (token: string) => void) {
        ouvintesDeRenovacao.add(ouvinte);
        return () => ouvintesDeRenovacao.delete(ouvinte);
      },
      aoMudarAcesso(ouvinte: (mudanca: MudancaDeAcesso) => void) {
        ouvintesDeAcesso.add(ouvinte);
        return () => ouvintesDeAcesso.delete(ouvinte);
      },
    },
    mundos: {
      abrir: async (id: MundoId) => {
        const proxima = aberturas.length > 1 ? aberturas.shift() : aberturas[0];
        const aberto = await responder(proxima ?? { endereco: ENDERECO });
        return { mundoId: id, endereco: aberto.endereco };
      },
      listar: async () => {
        pagina.listagens++;
        const ids = await responder(opcoes.listar ?? [MUNDO]);
        return ids.map((id) => ({ id }));
      },
    },
  } as unknown as RecreioGameContext;

  const ponte = ligarMoradaAoRecreio(contexto, {
    mundoId: MUNDO,
    aoSair: () => {
      pagina.saiu++;
    },
    aoFalhar: (erro) => {
      pagina.falhas.push(erro);
    },
    esconder: () => {
      pagina.escondido++;
    },
    aoEntrar: () => {
      pagina.entradas++;
    },
    agendar(chamar, emMs) {
      const agendado = { chamar, emMs, cancelado: false };
      agendados.push(agendado);
      return () => {
        agendado.cancelado = true;
      };
    },
  });
  // O jogo se inscreve nas mudanças de acesso ao iniciar, como `Conexao.iniciar` faz.
  const motivosNoJogo: string[] = [];
  ponte.opcoes.fonte.aoPerderAcesso?.((motivo) => motivosNoJogo.push(motivo));

  return {
    ponte,
    pagina,
    motivosNoJogo,
    ouvintesDeAcesso,
    ouvintesDeRenovacao,
    /** O que a página mostraria com a falha recebida. */
    paradas: () => pagina.falhas.map(paradaDoErro),
    perderAcesso(mudanca: MudancaDeAcesso) {
      for (const ouvinte of [...ouvintesDeAcesso]) ouvinte(mudanca);
    },
    vencerPrazo() {
      for (const agendado of agendados) if (!agendado.cancelado) agendado.chamar();
    },
    agendados,
  };
}

/** Deixa as promessas pendentes andarem. */
const assentar = () => new Promise((resolver) => setTimeout(resolver, 0));

/** Uma abertura que a regra entregou à página não termina: o jogo está saindo da tela. */
async function naoTermina(promessa: Promise<unknown>): Promise<boolean> {
  const fim = Symbol("fim");
  const primeiro = await Promise.race([promessa.then(() => fim), assentar().then(() => null)]);
  return primeiro !== fim;
}

describe("abrir o mundo", () => {
  it("entrega ao jogo o endereço e a sessão de jogo do Recreio", async () => {
    const { ponte, pagina, ouvintesDeRenovacao } = montar();
    await expect(ponte.opcoes.fonte.abrir()).resolves.toEqual({
      endereco: ENDERECO,
      mundoId: MUNDO,
    });
    expect(ponte.opcoes.fonte.token()).toBe("token-da-sessao");
    const renovados: string[] = [];
    ponte.opcoes.fonte.aoRenovar?.((token) => renovados.push(token));
    for (const ouvinte of ouvintesDeRenovacao) ouvinte("token-novo");
    expect(renovados).toEqual(["token-novo"]);
    expect(pagina.falhas).toEqual([]);
  });

  it.each([
    ["SEM_INSTANCIA", "iniciando"],
    ["INDISPONIVEL", "rede"],
    ["NAO_MEMBRO", "mundo_indisponivel"],
    ["MUNDO_INDISPONIVEL", "mundo_indisponivel"],
    ["ACESSO_NEGADO", "sem_acesso"],
    ["SESSAO_INVALIDA", "sessao_encerrada"],
  ] as const)(
    "antes de o mundo aparecer, %s vai para a página (%s) e o jogo sai da vista",
    async (codigo, parada) => {
      const { ponte, pagina, paradas } = montar({ abrir: [new ErroDoRecreio(codigo)] });
      expect(await naoTermina(ponte.opcoes.fonte.abrir())).toBe(true);
      expect(paradas()).toEqual([parada]);
      expect(pagina.escondido).toBe(1);
    },
  );

  it.each(["SEM_INSTANCIA", "INDISPONIVEL", "MUITAS_TENTATIVAS"] as const)(
    "depois que o mundo apareceu, %s ao reabrir fica com o jogo, que insiste com a faixa dele",
    async (codigo) => {
      const { ponte, pagina } = montar({
        abrir: [{ endereco: ENDERECO }, new ErroDoRecreio(codigo), { endereco: ENDERECO }],
      });
      await ponte.opcoes.fonte.abrir();
      ponte.opcoes.aoEntrar();
      expect(pagina.entradas).toBe(1);

      // O jogo recebe o erro e tenta de novo; a página não fica sabendo de nada.
      await expect(ponte.opcoes.fonte.abrir()).rejects.toMatchObject({ codigo });
      expect(pagina.falhas).toEqual([]);
      expect(pagina.escondido).toBe(0);
      await expect(ponte.opcoes.fonte.abrir()).resolves.toMatchObject({ endereco: ENDERECO });
      expect(ehRecusaPassageira(new ErroDoRecreio(codigo))).toBe(true);
    },
  );

  it.each([
    [new ErroDoRecreio("NAO_MEMBRO"), "mundo_indisponivel"],
    [new ErroDoRecreio("MUNDO_INDISPONIVEL"), "mundo_indisponivel"],
    [new ErroDoRecreio("ACESSO_PERDIDO"), "acesso_perdido"],
    [new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "signed_out" }), "saiu_da_conta"],
    [new ErroDoRecreio("SESSAO_INVALIDA"), "sessao_encerrada"],
    [new TypeError("resposta estranha"), "falha"],
  ] as const)(
    "depois que o mundo apareceu, recusa definitiva ao reabrir vai para a página na hora",
    async (erro, parada) => {
      const { ponte, pagina, paradas } = montar({ abrir: [{ endereco: ENDERECO }, erro] });
      await ponte.opcoes.fonte.abrir();
      ponte.opcoes.aoEntrar();
      expect(await naoTermina(ponte.opcoes.fonte.abrir())).toBe(true);
      expect(paradas()).toEqual([parada]);
      expect(pagina.escondido).toBe(1);
    },
  );
});

describe("o servidor do jogo encerra", () => {
  it("outra janela tomou o lugar: a página diz que o jogo continuou em outro lugar, sem perguntar nada", async () => {
    const { ponte, pagina, paradas } = montar();
    ponte.opcoes.aoEncerrar("substituida");
    expect(paradas()).toEqual(["outro_lugar"]);
    expect(pagina.listagens).toBe(0);
    expect(pagina.escondido).toBe(1);
  });

  it("protocolo diferente é falha do jogo, não recusa do Recreio", () => {
    const { ponte, paradas } = montar();
    ponte.opcoes.aoEncerrar("protocolo");
    expect(paradas()).toEqual(["falha"]);
  });

  it.each([
    ["replaced", "outro_lugar"],
    ["signed_out", "saiu_da_conta"],
    ["access_lost", "acesso_perdido"],
    ["expired", "sessao_encerrada"],
  ] as const)(
    "acesso encerrado sem motivo: o Recreio conta que foi %s e a página mostra %s",
    async (motivo, parada) => {
      const { ponte, pagina, paradas } = montar({
        listar: new ErroDoRecreio("SESSAO_ENCERRADA", { motivo }),
      });
      ponte.opcoes.aoEncerrar("acesso_encerrado");
      // O jogo sai da vista antes da resposta: o aviso dele não chega a aparecer.
      expect(pagina.escondido).toBe(1);
      expect(pagina.falhas).toEqual([]);
      await assentar();
      expect(paradas()).toEqual([parada]);
      expect(pagina.listagens).toBe(1);
    },
  );

  it("sem acesso ao mundo: se o mundo saiu da lista do perfil, a página diz que ele não está disponível", async () => {
    const { ponte, pagina } = montar({ listar: [OUTRO_MUNDO] });
    ponte.opcoes.aoEncerrar("sem_acesso");
    await assentar();
    expect(pagina.falhas).toMatchObject([{ codigo: "NAO_MEMBRO" }]);
    expect(pagina.falhas.map(paradaDoErro)).toEqual(["mundo_indisponivel"]);
  });

  it("sessão recusada pelo servidor do jogo, com o Recreio dizendo que está tudo certo: abrir de novo", async () => {
    const { ponte, paradas } = montar({ listar: [MUNDO] });
    ponte.opcoes.aoEncerrar("sessao");
    await assentar();
    expect(paradas()).toEqual(["sessao_encerrada"]);
  });

  it.each([
    ["sessao", "sessao_encerrada"],
    ["sem_acesso", "mundo_indisponivel"],
    ["acesso_encerrado", "sessao_encerrada"],
  ] as const)(
    "%s: se o Recreio não responde a tempo, vale o aviso padrão (%s)",
    async (motivo, parada) => {
      for (const listar of ["sem_resposta", new ErroDoRecreio("INDISPONIVEL")] as const) {
        const { ponte, pagina, paradas, vencerPrazo, agendados } = montar({ listar });
        ponte.opcoes.aoEncerrar(motivo);
        expect(agendados.map((agendado) => agendado.emMs)).toEqual([PRAZO_DA_PERGUNTA_MS]);
        await assentar();
        vencerPrazo();
        expect(paradas()).toEqual([parada]);
        expect(pagina.escondido).toBe(1);
      }
    },
  );

  it("o SDK avisou que o acesso caiu: o jogo para com o motivo e a página recebe o mesmo, uma vez", async () => {
    const { ponte, pagina, paradas, motivosNoJogo, perderAcesso } = montar();
    await ponte.opcoes.fonte.abrir();
    ponte.opcoes.aoEntrar();
    perderAcesso({ tipo: "perdido", codigo: "ACESSO_PERDIDO", motivo: "signed_out" });
    expect(motivosNoJogo).toEqual(["ACESSO_PERDIDO"]);
    // O jogo, avisado, encerra com `acesso_encerrado`: não é preciso perguntar ao Recreio.
    ponte.opcoes.aoEncerrar("acesso_encerrado");
    expect(paradas()).toEqual(["saiu_da_conta"]);
    expect(pagina.listagens).toBe(0);
  });
});

describe("uma causa, um aviso", () => {
  it("depois da primeira falha, nada mais chega à página", async () => {
    const { ponte, pagina, perderAcesso } = montar({
      abrir: [{ endereco: ENDERECO }, new ErroDoRecreio("NAO_MEMBRO")],
    });
    await ponte.opcoes.fonte.abrir();
    ponte.opcoes.aoEntrar();
    void ponte.opcoes.fonte.abrir();
    await assentar();
    expect(pagina.falhas).toHaveLength(1);

    ponte.opcoes.aoEncerrar("sem_acesso");
    ponte.opcoes.aoEncerrar("substituida");
    ponte.opcoes.aoNaoCarregar();
    ponte.opcoes.aoSair();
    perderAcesso({ tipo: "perdido", codigo: "ACESSO_PERDIDO" });
    await assentar();
    expect(pagina.falhas).toHaveLength(1);
    expect(pagina.saiu).toBe(0);
    expect(pagina.listagens).toBe(0);
  });

  it("sair por dentro do jogo avisa a página uma vez e mais nada", () => {
    const { ponte, pagina } = montar();
    ponte.opcoes.aoSair();
    ponte.opcoes.aoSair();
    ponte.opcoes.aoEncerrar("sessao");
    expect(pagina.saiu).toBe(1);
    expect(pagina.falhas).toEqual([]);
  });

  it("desmontado, o jogo não fala mais com a página nem ouve o SDK", async () => {
    const { ponte, pagina, ouvintesDeAcesso, vencerPrazo } = montar({ listar: "sem_resposta" });
    ponte.opcoes.aoEncerrar("sessao");
    ponte.desligar();
    vencerPrazo();
    ponte.opcoes.aoEncerrar("substituida");
    ponte.opcoes.aoEntrar();
    await assentar();
    expect(pagina.falhas).toEqual([]);
    expect(pagina.entradas).toBe(0);
    expect(ouvintesDeAcesso.size).toBe(0);
  });

  it("o código do jogo que não chega vira o aviso de rede da página", () => {
    const { ponte, paradas } = montar();
    ponte.opcoes.aoNaoCarregar();
    expect(paradas()).toEqual(["rede"]);
  });
});
