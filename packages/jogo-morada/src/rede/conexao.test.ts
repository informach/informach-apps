import { FECHAMENTO, SUBPROTOCOLO, VERSAO_DO_PROTOCOLO } from "@informach/morada-sim/protocolo";
import { criarMundoDaProva, LIA } from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { assentar, RelogioDeTeste, ServidorDeMentira } from "../testes/servidor-de-mentira";
import {
  Conexao,
  destinoDoFechamento,
  ESPERA_MAXIMA_MS,
  ESPERA_MINIMA_MS,
  type EstadoDaConexao,
  esperaDaTentativa,
  PRAZO_SEM_SINAL_MS,
} from "./conexao";

const TOKEN = "sessao-da-lia";

function preparar() {
  const relogio = new RelogioDeTeste();
  const servidor = new ServidorDeMentira({
    mundo: criarMundoDaProva({ fundadores: [LIA] }),
    sessoes: { [TOKEN]: { jogadorId: LIA, apelido: "Lia" } },
    relogio,
  });
  const fonte = servidor.fonte(TOKEN);
  const estados: EstadoDaConexao[] = [];
  const recebido = { fotografias: 0, passos: 0, bemVindos: 0 };
  const conexao = new Conexao({
    fonte,
    Soquete: servidor.Soquete,
    agora: relogio.agora,
    agendar: relogio.agendar,
    // Sempre a espera inteira, para o teste saber quanto andar.
    aleatorio: () => 1,
    ouvintes: {
      estado: (estado) => estados.push(estado),
      bemVindo: () => {
        recebido.bemVindos++;
      },
      fotografia: () => {
        recebido.fotografias++;
      },
      passo: () => {
        recebido.passos++;
      },
      resultado: () => {},
      pulso: () => {},
    },
  });
  const fases = () => estados.map((estado) => estado.fase);
  return { relogio, servidor, fonte, conexao, estados, fases, recebido };
}

describe("entrada no mundo", () => {
  it("apresenta a sessão no primeiro quadro, nunca no endereço, e passa pelos estados na ordem", async () => {
    const { servidor, conexao, fases, recebido } = preparar();
    servidor.abrirSozinho = false;
    conexao.iniciar();
    expect(conexao.estado.fase).toBe("conectando");
    await assentar();

    const soquete = servidor.ultimo;
    expect(soquete.subprotocolo).toBe(SUBPROTOCOLO);
    expect(soquete.endereco).not.toContain(TOKEN);
    expect(soquete.recebidas).toEqual([]);

    servidor.abrir(soquete);
    expect(soquete.recebidas).toEqual([
      { t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao: TOKEN, mundoId: servidor.mundo.estado.id },
    ]);
    expect(fases()).toEqual(["entrando", "montando", "pronto"]);
    expect(recebido).toMatchObject({ bemVindos: 1, fotografias: 1 });
    expect(conexao.mundoId).toBe(servidor.mundo.estado.id);
  });

  it("só manda quadros depois de entrar", async () => {
    const { servidor, conexao } = preparar();
    servidor.abrirSozinho = false;
    conexao.iniciar();
    await assentar();
    expect(conexao.enviar({ t: "pulso", n: 1 })).toBe(false);
    servidor.abrir(servidor.ultimo);
    expect(conexao.enviar({ t: "pulso", n: 1 })).toBe(true);
  });
});

describe("política de reabertura pelo motivo do fechamento", () => {
  it.each([
    [FECHAMENTO.posse, "posse"],
    [FECHAMENTO.reiniciando, "reiniciando"],
    [FECHAMENTO.atrasado, "atrasado"],
    [FECHAMENTO.cheio, "cheio"],
    [1006, "rede"],
    [1001, "rede"],
  ])("fechamento %i reabre pelo Recreio e entra de novo", async (codigo, motivo) => {
    const { relogio, servidor, fonte, conexao, recebido } = preparar();
    conexao.iniciar();
    await assentar();
    expect(conexao.estado.fase).toBe("pronto");
    expect(fonte.aberturas).toBe(1);

    servidor.ultimo.fechar(codigo);
    expect(conexao.estado).toEqual({ fase: "reconectando", tentativa: 1, motivo });
    // Antes da espera, nada de abrir de novo.
    relogio.avancar(ESPERA_MINIMA_MS - 1);
    await assentar();
    expect(fonte.aberturas).toBe(1);

    relogio.avancar(1);
    await assentar();
    expect(fonte.aberturas).toBe(2);
    expect(servidor.soquetes).toHaveLength(2);
    expect(servidor.ultimo.recebidas[0]).toMatchObject({ t: "entrar", sessao: TOKEN });
    expect(conexao.estado.fase).toBe("pronto");
    expect(recebido.fotografias).toBe(2);
  });

  it.each([
    [FECHAMENTO.sessao, "sessao"],
    [FECHAMENTO.semAcesso, "sem_acesso"],
    [FECHAMENTO.substituida, "substituida"],
    [FECHAMENTO.protocolo, "protocolo"],
  ])("fechamento %i para o jogo e diz por quê", async (codigo, motivo) => {
    const { relogio, servidor, fonte, conexao } = preparar();
    conexao.iniciar();
    await assentar();
    servidor.ultimo.fechar(codigo);
    expect(conexao.estado).toEqual({ fase: "encerrado", motivo });
    relogio.avancar(60_000);
    await assentar();
    expect(fonte.aberturas).toBe(1);
    expect(servidor.soquetes).toHaveLength(1);
  });

  it("a tabela de destinos cobre todos os fechamentos do protocolo", () => {
    for (const codigo of Object.values(FECHAMENTO)) {
      if (codigo === FECHAMENTO.normal) continue;
      const destino = destinoDoFechamento(codigo);
      expect("fim" in destino || "reabrir" in destino).toBe(true);
    }
    expect(destinoDoFechamento(FECHAMENTO.posse)).toEqual({ reabrir: "posse" });
    expect(destinoDoFechamento(FECHAMENTO.sessao)).toEqual({ fim: "sessao" });
  });

  it("recusado na entrada com 4003 depois do aviso de acesso encerrado: o motivo é o do Recreio", async () => {
    const { servidor, conexao } = preparar();
    conexao.iniciar();
    await assentar();
    servidor.ultimo.entregar({ t: "aviso", codigo: "acesso_encerrado" });
    servidor.ultimo.fechar(FECHAMENTO.semAcesso);
    expect(conexao.estado).toEqual({ fase: "encerrado", motivo: "acesso_encerrado" });
  });

  it("a espera dobra a cada tentativa até o teto, com folga sorteada", () => {
    expect(esperaDaTentativa(1, 1)).toBe(500);
    expect(esperaDaTentativa(2, 1)).toBe(1000);
    expect(esperaDaTentativa(3, 1)).toBe(2000);
    expect(esperaDaTentativa(5, 1)).toBe(ESPERA_MAXIMA_MS);
    expect(esperaDaTentativa(12, 1)).toBe(ESPERA_MAXIMA_MS);
    expect(esperaDaTentativa(1, 0)).toBe(250);
    expect(esperaDaTentativa(12, 0)).toBe(ESPERA_MAXIMA_MS / 2);
  });

  it("insiste com espera crescente enquanto o servidor recusa, e recomeça a contagem ao entrar", async () => {
    const { relogio, servidor, fonte, conexao } = preparar();
    conexao.iniciar();
    await assentar();
    servidor.recusarCom = FECHAMENTO.reiniciando;
    servidor.ultimo.fechar(FECHAMENTO.reiniciando);

    const esperas: number[] = [];
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      expect(conexao.estado).toMatchObject({ fase: "reconectando", tentativa });
      const espera = esperaDaTentativa(tentativa, 1);
      esperas.push(espera);
      relogio.avancar(espera);
      await assentar();
    }
    expect(esperas).toEqual([500, 1000, 2000, 4000]);
    expect(fonte.aberturas).toBe(5);

    servidor.recusarCom = null;
    relogio.avancar(esperaDaTentativa(5, 1));
    await assentar();
    expect(conexao.estado.fase).toBe("pronto");

    servidor.ultimo.fechar(1006);
    expect(conexao.estado).toMatchObject({ fase: "reconectando", tentativa: 1 });
  });

  it("se o Recreio não responde ao abrir, tenta de novo", async () => {
    const { relogio, servidor } = preparar();
    let falhar = true;
    const fonte = servidor.fonte(TOKEN);
    const estados: string[] = [];
    const teimosa = new Conexao({
      fonte: {
        ...fonte,
        abrir: () => {
          if (falhar) return Promise.reject(new Error("fora do ar"));
          return fonte.abrir();
        },
      },
      Soquete: servidor.Soquete,
      agora: relogio.agora,
      agendar: relogio.agendar,
      aleatorio: () => 1,
      ouvintes: {
        estado: (estado) => estados.push(estado.fase),
        bemVindo: () => {},
        fotografia: () => {},
        passo: () => {},
        resultado: () => {},
        pulso: () => {},
      },
    });
    teimosa.iniciar();
    await assentar();
    expect(teimosa.estado).toEqual({ fase: "reconectando", tentativa: 1, motivo: "fonte" });
    falhar = false;
    relogio.avancar(500);
    await assentar();
    expect(teimosa.estado.fase).toBe("pronto");
  });
});

describe("sequência dos quadros", () => {
  it("um passo fora de ordem faz reabrir para receber a visão inteira de novo", async () => {
    const { relogio, servidor, conexao, recebido } = preparar();
    conexao.iniciar();
    await assentar();
    servidor.andar(12);
    const antes = recebido.passos;
    expect(antes).toBeGreaterThan(0);

    servidor.perderUmQuadro(servidor.ultimo);
    servidor.andar(10);
    // O passo com a lacuna não é entregue ao espelho.
    expect(recebido.passos).toBe(antes);
    expect(conexao.estado).toMatchObject({ fase: "reconectando", motivo: "lacuna" });
    expect(servidor.soquetes[0]?.fechadoPeloCliente).not.toBeNull();

    relogio.avancar(500);
    await assentar();
    expect(conexao.estado.fase).toBe("pronto");
    expect(recebido.fotografias).toBe(2);
    servidor.andar(10);
    expect(recebido.passos).toBeGreaterThan(antes);
  });

  it("um servidor que para de dar sinal é tratado como queda", async () => {
    const { relogio, servidor, conexao } = preparar();
    conexao.iniciar();
    await assentar();
    servidor.ultimo.retido = [];
    relogio.avancar(PRAZO_SEM_SINAL_MS + PRAZO_SEM_SINAL_MS / 3 + 1);
    expect(conexao.estado).toMatchObject({ fase: "reconectando", motivo: "sem_sinal" });
  });
});

describe("renovar e sair", () => {
  it("manda renovar_sessao quando a fonte avisa", async () => {
    const { servidor } = preparar();
    const relogio = new RelogioDeTeste();
    const inscritos: ((token: string) => void)[] = [];
    const conexao = new Conexao({
      fonte: {
        ...servidor.fonte(TOKEN),
        aoRenovar: (ouvinte) => {
          inscritos.push(ouvinte);
          return () => {
            inscritos.length = 0;
          };
        },
      },
      Soquete: servidor.Soquete,
      agora: relogio.agora,
      agendar: relogio.agendar,
      ouvintes: {
        estado: () => {},
        bemVindo: () => {},
        fotografia: () => {},
        passo: () => {},
        resultado: () => {},
        pulso: () => {},
      },
    });
    conexao.iniciar();
    await assentar();
    expect(inscritos).toHaveLength(1);
    inscritos[0]?.("sessao-renovada");
    expect(servidor.ultimo.recebidas.at(-1)).toEqual({
      t: "renovar_sessao",
      sessao: "sessao-renovada",
    });
  });

  it("perder o acesso pela fonte para o jogo com o motivo", async () => {
    const { servidor } = preparar();
    const relogio = new RelogioDeTeste();
    const inscritos: ((motivo: string) => void)[] = [];
    const conexao = new Conexao({
      fonte: {
        ...servidor.fonte(TOKEN),
        aoPerderAcesso: (ouvinte) => {
          inscritos.push(ouvinte);
          return () => {};
        },
      },
      Soquete: servidor.Soquete,
      agora: relogio.agora,
      agendar: relogio.agendar,
      ouvintes: {
        estado: () => {},
        bemVindo: () => {},
        fotografia: () => {},
        passo: () => {},
        resultado: () => {},
        pulso: () => {},
      },
    });
    conexao.iniciar();
    await assentar();
    inscritos[0]?.("ASSINATURA_ENCERRADA");
    expect(conexao.estado).toEqual({
      fase: "encerrado",
      motivo: "acesso_encerrado",
      detalhe: "ASSINATURA_ENCERRADA",
    });
    expect(servidor.ultimo.fechadoPeloCliente).not.toBeNull();
  });

  it("sair avisa o servidor, espera o saiu e termina sem reabrir", async () => {
    const { relogio, servidor, fonte, conexao } = preparar();
    conexao.iniciar();
    await assentar();
    const salvo = await conexao.sair();
    expect(salvo).toBe(true);
    expect(servidor.ultimo.recebidas.at(-1)).toEqual({ t: "sair" });
    expect(conexao.estado).toEqual({ fase: "encerrado", motivo: "saiu" });
    // A sessão saiu do mundo na hora, sem janela de espera.
    expect(servidor.mundo.presenca.sessoes).toEqual([]);
    relogio.avancar(30_000);
    await assentar();
    expect(fonte.aberturas).toBe(1);
  });

  it("sair não fica esperando para sempre um servidor mudo", async () => {
    const { relogio, servidor, conexao } = preparar();
    conexao.iniciar();
    await assentar();
    servidor.ultimo.surdo = true;
    const saindo = conexao.sair(1500);
    relogio.avancar(1500);
    expect(await saindo).toBe(false);
    expect(conexao.estado).toEqual({ fase: "encerrado", motivo: "saiu" });
  });
});
