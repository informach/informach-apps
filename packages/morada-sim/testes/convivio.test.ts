import { describe, expect, it } from "vitest";
import { interacao } from "../src/conteudo";
import type { Morador } from "../src/index";
import { APELIDO_MAX, aplicarMudancas, listar, PERMISSOES_DE_QUEM_DIVIDE } from "../src/index";
import { BRUNO, criarMundoDaProva, criarRoteiro, LIA, moradorDeNome } from "../src/testes";

/** Três pontos livres do quintal, na frente da casa. */
const QUINTAL_A: [number, number] = [6125, 3125];
const QUINTAL_B: [number, number] = [8125, 3125];
const QUINTAL_C: [number, number] = [7125, 3125];

/** Um mundo com a Lia jogando e o Bruno convidado para dividir a família. */
function doisJogadores() {
  const mundo = criarMundoDaProva();
  const roteiro = criarRoteiro(mundo, { conferirACada: 1 });
  const familia = listar(mundo.estado.familias)[0];
  if (!familia) throw new Error("sem família");
  const deLia = roteiro.entrar(LIA, "sessao-lia");
  mundo.aplicar({
    t: "conceder_acesso",
    perfilId: BRUNO,
    familiaId: familia.id,
    permissoes: [...PERMISSOES_DE_QUEM_DIVIDE],
  });
  const deBruno = roteiro.entrar(BRUNO, "sessao-bruno");
  return {
    mundo,
    roteiro,
    familia,
    deLia,
    deBruno,
    lia: moradorDeNome(mundo, "Lia"),
    marcos: moradorDeNome(mundo, "Marcos"),
    nina: moradorDeNome(mundo, "Nina"),
    ana: moradorDeNome(mundo, "Vó Ana"),
  };
}

describe("uma pessoa", () => {
  it("troca entre os quatro moradores e os outros seguem por conta própria", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo, { conferirACada: 10 });
    const sessao = roteiro.entrar(LIA);
    const quatro = ["Lia", "Marcos", "Nina", "Vó Ana"].map((nome) => moradorDeNome(mundo, nome));

    for (const morador of quatro) {
      expect(roteiro.comandar(sessao, morador.id, { t: "reservar" })).toMatchObject({ ok: true });
      // Uma sessão dirige um morador por vez: escolher outro solta o anterior.
      expect(mundo.presenca.reservas).toEqual([
        { moradorId: morador.id, perfilId: LIA, sessaoId: sessao },
      ]);
      roteiro.andar(1500);
    }
    // Enquanto isso, ninguém ficou parado: cada um fez algo por conta própria.
    const agiram = new Set(
      roteiro.saida.mudancas.flatMap((m) =>
        m.t === "p" && m.tabela === "acoes" && m.campos.origem === "autonomia"
          ? [String(m.campos.moradorId)]
          : [],
      ),
    );
    for (const morador of quatro) expect(agiram, morador.nome).toContain(morador.id);
  });

  it("um comando passa à frente do que o morador fazia sozinho", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo, { conferirACada: 10 });
    const sessao = roteiro.entrar(LIA);
    const lia = moradorDeNome(mundo, "Lia");
    // Espera a Lia escolher sozinha algo que pode ser interrompido (ver TV, dormir).
    const interrompivel = () => {
      const acao = lia.acaoAtual ? mundo.estado.acoes.porId[lia.acaoAtual] : undefined;
      return acao?.estado === "executando" && interacao(acao.interacao)?.interruptivel === true;
    };
    roteiro.ate(interrompivel, 20_000, "a Lia escolher algo sozinha");
    const sozinha = lia.acaoAtual;
    roteiro.comandar(sessao, lia.id, { t: "reservar" });

    expect(
      roteiro.comandar(sessao, lia.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 }),
    ).toMatchObject({
      ok: true,
    });
    roteiro.andar(2);
    const atual = lia.acaoAtual ? mundo.estado.acoes.porId[lia.acaoAtual] : undefined;
    expect(atual).toMatchObject({ interacao: "andar_ate", origem: "jogador", autor: LIA });
    expect(sozinha && mundo.estado.acoes.porId[sozinha]).toBeUndefined();
    roteiro.ate(() => lia.acaoAtual === null && lia.fila.length === 0, 1500, "a Lia chegar");
    expect(lia.local).toMatchObject({ t: "lote", pos: QUINTAL_A });
  });

  it("não comanda sem reserva, e não manda andar para dentro da parede", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const lia = moradorDeNome(mundo, "Lia");
    expect(
      roteiro.comandar(sessao, lia.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 }),
    ).toMatchObject({
      ok: false,
      motivo: "sem_reserva",
    });
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    expect(
      roteiro.comandar(sessao, lia.id, { t: "ir_para", pos: [900_000, 900_000], andar: 0 }),
    ).toMatchObject({ ok: false, motivo: "inalcancavel" });
  });
});

describe("duas pessoas na mesma família", () => {
  it("cada uma dirige um morador, e as duas jogam ao mesmo tempo", () => {
    const { mundo, roteiro, deLia, deBruno, lia, marcos } = doisJogadores();
    expect(roteiro.comandar(deLia, lia.id, { t: "reservar" })).toMatchObject({ ok: true });
    expect(roteiro.comandar(deBruno, marcos.id, { t: "reservar" })).toMatchObject({ ok: true });

    expect(
      roteiro.comandar(deLia, lia.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      roteiro.comandar(deBruno, marcos.id, { t: "ir_para", pos: QUINTAL_B, andar: 0 }),
    ).toMatchObject({ ok: true });
    const parado = (morador: Morador) => morador.acaoAtual === null && morador.fila.length === 0;
    roteiro.ate(() => parado(lia) && parado(marcos), 1200, "os dois chegarem");
    expect(lia.local).toMatchObject({ pos: QUINTAL_A });
    expect(marcos.local).toMatchObject({ pos: QUINTAL_B });
    expect(mundo.presenca.reservas).toHaveLength(2);
  });

  it("um morador nunca tem dois condutores", () => {
    const { roteiro, deLia, deBruno, nina } = doisJogadores();
    expect(roteiro.comandar(deLia, nina.id, { t: "reservar" })).toMatchObject({ ok: true });
    expect(roteiro.comandar(deBruno, nina.id, { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "reservado_por_outro",
    });
    // E quem não reservou não comanda, nem cancela o que o outro mandou.
    expect(
      roteiro.comandar(deBruno, nina.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 }),
    ).toMatchObject({ ok: false, motivo: "reservado_por_outro" });
    roteiro.comandar(deLia, nina.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 });
    const acao = nina.fila[0] ?? nina.acaoAtual;
    if (!acao) throw new Error("sem ação");
    expect(roteiro.comandar(deBruno, nina.id, { t: "cancelar_acao", acaoId: acao })).toMatchObject({
      ok: false,
    });
  });

  it("a família compartilhada é de todos: quem está joga qualquer morador livre", () => {
    const { mundo, roteiro, deLia, deBruno, lia, marcos } = doisJogadores();
    roteiro.comandar(deLia, lia.id, { t: "reservar" });
    roteiro.comandar(deLia, lia.id, { t: "definir_preferido", valor: true });
    expect(mundo.estado.moradores.porId[lia.id]?.preferidoDe).toBe(LIA);
    roteiro.comandar(deBruno, marcos.id, { t: "reservar" });

    // A Lia sai: o Bruno pode assumir até o preferido dela.
    mundo.aplicar({ t: "sessao_saiu", sessaoId: deLia });
    roteiro.andar(1);
    expect(roteiro.comandar(deBruno, lia.id, { t: "reservar" })).toMatchObject({ ok: true });
    expect(mundo.presenca.reservas).toEqual([
      { moradorId: lia.id, perfilId: BRUNO, sessaoId: deBruno },
    ]);
  });

  it("quem entra com preferido livre já chega dirigindo; ocupado, não toma de ninguém", () => {
    const { mundo, roteiro, deLia, deBruno, lia } = doisJogadores();
    roteiro.comandar(deLia, lia.id, { t: "reservar" });
    roteiro.comandar(deLia, lia.id, { t: "definir_preferido", valor: true });
    mundo.aplicar({ t: "sessao_saiu", sessaoId: deLia });
    roteiro.andar(1);

    const voltou = roteiro.entrar(LIA, "sessao-lia-2");
    expect(mundo.presenca.reservas).toContainEqual({
      moradorId: lia.id,
      perfilId: LIA,
      sessaoId: voltou,
    });

    mundo.aplicar({ t: "sessao_saiu", sessaoId: voltou });
    roteiro.comandar(deBruno, lia.id, { t: "reservar" });
    roteiro.entrar(LIA, "sessao-lia-3");
    expect(mundo.presenca.reservas).toEqual([
      { moradorId: lia.id, perfilId: BRUNO, sessaoId: deBruno },
    ]);
  });

  it("o que quem divide não pode: sem o direito, o comando é recusado", () => {
    const { mundo, roteiro, familia, deBruno, marcos } = doisJogadores();
    const duda = moradorDeNome(mundo, "Duda");
    roteiro.comandar(deBruno, marcos.id, { t: "reservar" });
    // Tira do Bruno o direito de decidir namoro e casamento.
    mundo.aplicar({
      t: "conceder_acesso",
      perfilId: BRUNO,
      familiaId: familia.id,
      permissoes: ["ver", "comandar"],
    });
    roteiro.comandar(deBruno, marcos.id, { t: "convidar_visita", alvoId: duda.id });
    roteiro.ate(() => duda.local.t === "lote", 300, "a Duda chegar");
    expect(
      roteiro.comandar(deBruno, marcos.id, { t: "propor", tipo: "namoro", alvoId: duda.id }),
    ).toMatchObject({ ok: false, motivo: "sem_permissao", detalhe: "decidir_vida" });
  });

  it("acesso revogado tira a reserva e os comandos", () => {
    const { mundo, roteiro, familia, deBruno, marcos } = doisJogadores();
    roteiro.comandar(deBruno, marcos.id, { t: "reservar" });
    mundo.aplicar({ t: "revogar_acesso", perfilId: BRUNO, familiaId: familia.id });
    roteiro.andar(1);
    expect(mundo.presenca.reservas).toEqual([]);
    expect(roteiro.comandar(deBruno, marcos.id, { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "sem_acesso",
    });
    expect(mundo.estado.acessos.map((a) => a.perfilId)).toEqual([LIA]);
  });
});

describe("queda sem aviso", () => {
  it("a reserva espera a volta; a família, as filas e o mundo continuam inteiros", () => {
    const { mundo, roteiro, deLia, deBruno, lia, marcos } = doisJogadores();
    roteiro.comandar(deLia, lia.id, { t: "reservar" });
    roteiro.comandar(deBruno, marcos.id, { t: "reservar" });
    roteiro.comandar(deBruno, marcos.id, { t: "ir_para", pos: QUINTAL_B, andar: 0 });
    roteiro.comandar(deBruno, marcos.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 });
    roteiro.andar(5);
    const fila = [...marcos.fila];
    const emCurso = marcos.acaoAtual;
    expect(fila).toHaveLength(1);

    // A conexão do Bruno some. O servidor avisa a simulação com a hora dele.
    mundo.aplicar({ t: "sessao_caiu", sessaoId: deBruno, agoraMs: 1_000_000 });
    roteiro.andar(1);
    expect(mundo.presenca.sessoes.find((s) => s.sessaoId === deBruno)?.estado).toBe("em_graca");
    // Durante a espera ninguém toma o morador dele, e a fila segue como estava.
    expect(roteiro.comandar(deLia, marcos.id, { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "reservado_por_outro",
    });
    expect(marcos.acaoAtual).toBe(emCurso);
    expect(marcos.fila).toEqual(fila);

    // A Lia continua jogando normalmente.
    expect(
      roteiro.comandar(deLia, lia.id, { t: "ir_para", pos: QUINTAL_C, andar: 0 }),
    ).toMatchObject({
      ok: true,
    });

    // Antes do prazo, nada expira.
    mundo.aplicar({ t: "expirar", agoraMs: 1_000_000 + 29_999 });
    roteiro.andar(1);
    expect(mundo.presenca.reservas).toHaveLength(2);

    // Passado o prazo, a reserva é liberada e a autonomia assume, com a fila intacta.
    mundo.aplicar({ t: "expirar", agoraMs: 1_000_000 + 30_000 });
    roteiro.andar(1);
    expect(mundo.presenca.sessoes.map((s) => s.sessaoId)).toEqual([deLia]);
    expect(mundo.presenca.reservas).toEqual([
      { moradorId: lia.id, perfilId: LIA, sessaoId: deLia },
    ]);
    roteiro.ate(
      () => marcos.acaoAtual === null && marcos.fila.length === 0,
      1500,
      "a fila terminar",
    );
    expect(marcos.local).toMatchObject({ pos: QUINTAL_A });

    // E quem ficou pode assumir o morador.
    expect(roteiro.comandar(deLia, marcos.id, { t: "reservar" })).toMatchObject({ ok: true });
    roteiro.andar(600);
  });

  it("quem volta a tempo retoma o morador como deixou", () => {
    const { mundo, roteiro, deBruno, marcos } = doisJogadores();
    roteiro.comandar(deBruno, marcos.id, { t: "reservar" });
    mundo.aplicar({ t: "sessao_caiu", sessaoId: deBruno, agoraMs: 5_000 });
    roteiro.andar(50);
    // Enquanto está fora, não comanda.
    expect(
      roteiro.comandar(deBruno, marcos.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 }),
    ).toMatchObject({ ok: false, motivo: "sem_sessao" });

    expect(mundo.aplicar({ t: "sessao_voltou", sessaoId: deBruno })).toMatchObject({ ok: true });
    mundo.aplicar({ t: "expirar", agoraMs: 999_999 });
    roteiro.andar(1);
    expect(mundo.presenca.reservas).toEqual([
      { moradorId: marcos.id, perfilId: BRUNO, sessaoId: deBruno },
    ]);
    expect(
      roteiro.comandar(deBruno, marcos.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 }),
    ).toMatchObject({ ok: true });
  });

  it("uma conexão nova do mesmo perfil toma o lugar da antiga", () => {
    const { mundo, roteiro, deBruno, marcos } = doisJogadores();
    roteiro.comandar(deBruno, marcos.id, { t: "reservar" });
    const nova = roteiro.entrar(BRUNO, "sessao-bruno-2");
    expect(mundo.presenca.sessoes.map((s) => s.sessaoId).sort()).toEqual([
      "sessao-bruno-2",
      "sessao-lia",
    ]);
    expect(mundo.presenca.reservas).toEqual([]);
    expect(roteiro.comandar(deBruno, marcos.id, { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "sem_sessao",
    });
    expect(roteiro.comandar(nova, marcos.id, { t: "reservar" })).toMatchObject({ ok: true });
  });
});

describe("velocidade", () => {
  it("sozinho, pausar e acelerar valem na hora", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    for (const velocidade of [2, 3, 0, 1] as const) {
      expect(roteiro.comandar(sessao, null, { t: "votar_velocidade", velocidade })).toMatchObject({
        ok: true,
      });
      expect(mundo.estado.relogio.velocidade).toBe(velocidade);
    }
  });

  it("com mais gente, ninguém acelera sem o acordo de todos", () => {
    const { mundo, roteiro, deLia, deBruno } = doisJogadores();
    // O voto é aceito e fica à vista; a velocidade só muda quando todos concordam.
    expect(roteiro.comandar(deLia, null, { t: "votar_velocidade", velocidade: 3 })).toMatchObject({
      ok: true,
    });
    expect(mundo.estado.relogio.velocidade).toBe(1);
    expect(mundo.presenca.voto).toEqual({ velocidade: 3, aFavor: [LIA] });

    expect(roteiro.comandar(deBruno, null, { t: "votar_velocidade", velocidade: 3 })).toMatchObject(
      {
        ok: true,
      },
    );
    expect(mundo.estado.relogio.velocidade).toBe(3);
    expect(mundo.presenca.voto).toBeNull();

    // Voltar ao ritmo normal não precisa de acordo.
    expect(roteiro.comandar(deBruno, null, { t: "votar_velocidade", velocidade: 1 })).toMatchObject(
      {
        ok: true,
      },
    );
    expect(mundo.estado.relogio.velocidade).toBe(1);
  });

  it("quem chega não concordou: o mundo volta ao ritmo normal", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    roteiro.comandar(sessao, null, { t: "votar_velocidade", velocidade: 3 });
    expect(mundo.estado.relogio.velocidade).toBe(3);
    roteiro.entrar(BRUNO);
    expect(mundo.estado.relogio.velocidade).toBe(1);
  });

  it("quem cai deixa de travar o acordo", () => {
    const { mundo, roteiro, deLia, deBruno } = doisJogadores();
    roteiro.comandar(deLia, null, { t: "votar_velocidade", velocidade: 2 });
    mundo.aplicar({ t: "sessao_caiu", sessaoId: deBruno, agoraMs: 1 });
    roteiro.andar(1);
    expect(mundo.estado.relogio.velocidade).toBe(2);
  });
});

describe("comandos", () => {
  it("repetir o mesmo comando não faz de novo", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const lia = moradorDeNome(mundo, "Lia");
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    const primeira = roteiro.comandar(
      sessao,
      lia.id,
      { t: "ir_para", pos: QUINTAL_A, andar: 0 },
      "comando-unico-1",
    );
    const acoes = mundo.estado.acoes.ordem.length;
    const segunda = roteiro.comandar(
      sessao,
      lia.id,
      { t: "ir_para", pos: QUINTAL_A, andar: 0 },
      "comando-unico-1",
    );
    expect(primeira).toMatchObject({ ok: true });
    expect(segunda).toMatchObject({ ok: true, repetido: true });
    expect(mundo.estado.acoes.ordem.length).toBe(acoes);

    // Um comando recusado também fica lembrado.
    const recusa = roteiro.comandar(
      sessao,
      lia.id,
      { t: "ir_para", pos: [900_000, 0], andar: 0 },
      "comando-unico-2",
    );
    const denovo = roteiro.comandar(
      sessao,
      lia.id,
      { t: "ir_para", pos: QUINTAL_A, andar: 0 },
      "comando-unico-2",
    );
    expect(recusa).toMatchObject({ ok: false, motivo: "inalcancavel" });
    expect(denovo).toMatchObject({ ok: false, motivo: "inalcancavel", repetido: true });
  });

  it("recusa agir em outro mundo, em morador que não existe ou de quem o perfil não tem acesso", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const estranho = roteiro.entrar("perfil-estranho");
    const lia = moradorDeNome(mundo, "Lia");
    const duda = moradorDeNome(mundo, "Duda");

    expect(
      mundo.aplicar({
        t: "intencao",
        sessaoId: sessao,
        intencao: {
          comandoId: "comando-de-outro-mundo",
          mundoId: "outro-mundo",
          moradorId: lia.id,
          acao: { t: "reservar" },
          versaoEsperada: 0,
        },
      }),
    ).toMatchObject({ ok: false, motivo: "mundo_errado" });
    expect(roteiro.comandar(sessao, "mor_999999", { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "nao_existe",
    });
    // Sem acesso à família, trocar o id não adianta.
    expect(roteiro.comandar(estranho, lia.id, { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "sem_acesso",
    });
    // Morador avulso não é de ninguém para dirigir.
    expect(roteiro.comandar(sessao, duda.id, { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "sem_acesso",
    });
    expect(roteiro.comandar("sessao-inventada", lia.id, { t: "reservar" })).toMatchObject({
      ok: false,
      motivo: "sem_sessao",
    });
    expect(mundo.presenca.reservas).toEqual([]);
  });

  it("recusa entrada fora do formato", () => {
    const mundo = criarMundoDaProva();
    expect(() => mundo.aplicar({ t: "sessao_entrou" } as never)).toThrow();
    expect(() =>
      mundo.aplicar({
        t: "intencao",
        sessaoId: "s",
        intencao: {
          comandoId: "comando-com-campo-a-mais",
          mundoId: mundo.estado.id,
          moradorId: null,
          acao: { t: "votar_velocidade", velocidade: 9 },
          versaoEsperada: 0,
        },
      } as never),
    ).toThrow();
  });

  it("versão antiga do morador é recusada quando o cliente a informa", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const lia = moradorDeNome(mundo, "Lia");
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    roteiro.comandar(sessao, lia.id, { t: "ir_para", pos: QUINTAL_A, andar: 0 });
    const resultado = mundo.aplicar({
      t: "intencao",
      sessaoId: sessao,
      intencao: {
        comandoId: "comando-com-versao",
        mundoId: mundo.estado.id,
        moradorId: lia.id,
        acao: { t: "ir_para", pos: QUINTAL_C, andar: 0 },
        versaoEsperada: 1,
      },
    });
    expect(resultado).toMatchObject({ ok: false, motivo: "versao_antiga" });
  });
});

describe("o que os clientes veem", () => {
  it("o espelho alimentado só pelas mudanças é igual à visão", () => {
    const { mundo, roteiro, deLia, deBruno, lia, marcos, nina } = doisJogadores();
    const espelho = mundo.visao(LIA);
    let aplicadas = 0;
    const acompanhar = () => {
      const novas = roteiro.saida.mudancas.slice(aplicadas);
      aplicadas = roteiro.saida.mudancas.length;
      aplicarMudancas(espelho, mundo.estado.relogio.tick, novas);
    };

    roteiro.comandar(deLia, lia.id, { t: "reservar" });
    roteiro.comandar(deBruno, marcos.id, { t: "reservar" });
    roteiro.comandar(deLia, lia.id, {
      t: "interagir",
      interacao: "abracar",
      alvo: { t: "morador", moradorId: nina.id },
    });
    for (let i = 0; i < 40; i++) {
      roteiro.andar(100);
      acompanhar();
      // As necessidades chegam uma vez por segundo; nos ticks cheios o espelho bate inteiro.
      expect(espelho).toEqual(mundo.visao(LIA));
    }
    mundo.aplicar({ t: "sessao_caiu", sessaoId: deBruno, agoraMs: 10 });
    mundo.aplicar({ t: "expirar", agoraMs: 100_000 });
    roteiro.andar(10);
    acompanhar();
    expect(espelho).toEqual(mundo.visao(LIA));
    expect(espelho.presenca.jogadores).toEqual([
      { perfilId: LIA, apelido: null, estado: "presente" },
    ]);
  });

  it("a visão leva o apelido de quem está no mundo, e nada disso é gravado", () => {
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
    const roteiro = criarRoteiro(mundo);
    const espelho = mundo.visao(LIA);
    const duravel = mundo.hash("duravel");
    roteiro.entrar(LIA, "sessao-lia", "Liloca");
    const deBruno = roteiro.entrar(BRUNO, "sessao-bruno", "Bruno");
    aplicarMudancas(espelho, mundo.estado.relogio.tick, roteiro.saida.mudancas);
    expect(espelho.presenca.jogadores).toEqual([
      { perfilId: LIA, apelido: "Liloca", estado: "presente" },
      { perfilId: BRUNO, apelido: "Bruno", estado: "presente" },
    ]);
    // A presença é só de quem está conectado: a fotografia não muda com quem entrou.
    expect(mundo.hash("duravel")).toBe(duravel);
    const foto = JSON.stringify(mundo.fotografar());
    expect(foto).not.toContain("Liloca");
    expect(foto).not.toContain("Bruno");

    // Quem cai continua com o nome enquanto espera; quem volta pode trazer o apelido novo.
    mundo.aplicar({ t: "sessao_caiu", sessaoId: deBruno, agoraMs: 10 });
    roteiro.andar(1);
    expect(mundo.visao(LIA).presenca.jogadores[1]).toEqual({
      perfilId: BRUNO,
      apelido: "Bruno",
      estado: "em_graca",
    });
    mundo.aplicar({ t: "sessao_voltou", sessaoId: deBruno, apelido: "Bruno B." });
    roteiro.andar(1);
    expect(mundo.visao(LIA).presenca.jogadores[1]).toEqual({
      perfilId: BRUNO,
      apelido: "Bruno B.",
      estado: "presente",
    });

    // O apelido é texto de fora: maior que o limite, a entrada é recusada.
    expect(() =>
      mundo.aplicar({
        t: "sessao_entrou",
        sessaoId: "sessao-de-nome-grande",
        perfilId: "perfil-de-nome-grande",
        apelido: "a".repeat(APELIDO_MAX + 1),
      }),
    ).toThrow();
    expect(mundo.presenca.sessoes).toHaveLength(2);
  });

  it("a visão não leva a semente, os comandos nem os contadores", () => {
    const mundo = criarMundoDaProva();
    const visao = mundo.visao(LIA) as unknown as Record<string, unknown>;
    for (const interno of ["semente", "comandos", "contadores", "agenda", "avancoDoDia"]) {
      expect(visao[interno], interno).toBeUndefined();
    }
    const morador = listar(mundo.estado.moradores)[0] as Morador;
    expect((visao.moradores as { porId: Record<string, unknown> }).porId[morador.id]).toEqual(
      morador,
    );
  });
});
