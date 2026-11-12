import type { LimitesDoJogo } from "@informach/config/jogos";
import { beforeEach, describe, expect, it } from "vitest";
import type { ClienteDoHost, EntradaDoDiario } from "../contrato/host";
import type { MundoId, PerfilId, SessaoDeJogoId } from "../dominio/ids";
import { BATIMENTO_MS, FOTOGRAFIAS_GUARDADAS, POSSE_TTL_MS } from "../dominio/posse";
import type { PlataformaFalsa } from "./plataforma-falsa";

/**
 * As regras da API das instâncias, escritas uma vez. A plataforma em memória e
 * o Recreio de verdade passam pela mesma lista: se as duas divergirem, o
 * servidor do jogo testado contra a falsa não vale contra a real.
 */

type Talvez<T> = T | Promise<T>;

/** O que os testes precisam controlar na plataforma. A falsa já tem esta forma. */
export type AmbienteDoHost = {
  [Chave in
    | "avancar"
    | "criarPerfil"
    | "criarMundo"
    | "adicionarMembro"
    | "mudarEstadoDoMembro"
    | "abrirSessao"
    | "encerrarSessao"
    | "abrirMundo"
    | "mundo"]: PlataformaFalsa[Chave] extends (...args: infer A) => infer R
    ? (...args: A) => Talvez<R>
    : never;
} & { cliente(jogo?: string): ClienteDoHost };

export type FabricaDeAmbiente = (opcoes?: {
  limites?: Partial<LimitesDoJogo>;
}) => Talvez<AmbienteDoHost>;

const texto = new TextEncoder();

function fato(seq: number, id = `fato:${seq}`, conteudo = `conteudo ${seq}`): EntradaDoDiario {
  return { seq, tick: seq * 10, fatoId: id, bytes: texto.encode(conteudo) };
}

async function recusa(promessa: Promise<unknown>, codigo: string) {
  await expect(promessa).rejects.toMatchObject({ codigo });
}

export function descreverConformidadeDoHost(nome: string, criarAmbiente: FabricaDeAmbiente): void {
  describe(`API das instâncias: ${nome}`, () => {
    let ambiente: AmbienteDoHost;
    let lia: PerfilId;
    let mundoId: MundoId;

    beforeEach(async () => {
      ambiente = await criarAmbiente();
      lia = await ambiente.criarPerfil({ apelido: "Lia" });
      mundoId = await ambiente.criarMundo({ criador: lia });
    });

    async function instancia(url = "wss://a.test") {
      const cliente = ambiente.cliente();
      const registro = await cliente.registrar({ urlPublica: url, versao: "t", capacidade: 10 });
      return { cliente, ...registro };
    }

    /** Uma instância registrada, com a posse do mundo já reivindicada. */
    async function executando(url = "wss://a.test") {
      const a = await instancia(url);
      await ambiente.abrirMundo(mundoId, lia);
      const posse = await a.cliente.reivindicarPosse(mundoId);
      return { ...a, cerca: posse.cerca };
    }

    const foto = (cerca: number, revisaoEsperada: number, diarioSeq: number) => ({
      mundoId,
      cerca,
      revisaoEsperada,
      diarioSeq,
      tick: diarioSeq * 10,
      schemaVersion: 1,
      tipo: "checkpoint" as const,
      bytes: texto.encode(`estado até ${diarioSeq}`),
    });

    describe("posse", () => {
      it("informa o intervalo do batimento e a validade da posse", async () => {
        const a = await instancia();
        expect(a.batimentoMs).toBe(BATIMENTO_MS);
        expect(a.posseTtlMs).toBe(POSSE_TTL_MS);
      });

      it("sem instância viva, o mundo não abre", async () => {
        await recusa(
          Promise.resolve().then(() => ambiente.abrirMundo(mundoId, lia)),
          "SEM_INSTANCIA",
        );
      });

      it("a instância escolhida reivindica e recebe a primeira cerca", async () => {
        const a = await instancia();
        const aberto = await ambiente.abrirMundo(mundoId, lia);
        expect(aberto.endereco).toBe("wss://a.test");

        const posse = await a.cliente.reivindicarPosse(mundoId);
        expect(posse).toMatchObject({ cerca: 1, revisao: 0, diarioSeq: 0, fotografia: null });
        // Reivindicar de novo devolve a mesma posse.
        expect((await a.cliente.reivindicarPosse(mundoId)).cerca).toBe(1);
        expect((await ambiente.mundo(mundoId)).posse).toMatchObject({ estado: "held", cerca: 1 });
      });

      it("um mundo aberto tem uma posse só: o segundo jogador entra na mesma instância", async () => {
        const a = await executando();
        await instancia("wss://b.test");
        const bruno = await ambiente.criarPerfil({ apelido: "Bruno" });
        await ambiente.adicionarMembro(mundoId, bruno);

        const aberto = await ambiente.abrirMundo(mundoId, bruno);
        expect(aberto).toEqual({ endereco: "wss://a.test", cerca: a.cerca });
      });

      it("outra instância não reivindica a posse alheia e fica sabendo onde ela está", async () => {
        await executando();
        const b = await instancia("wss://b.test");
        await expect(b.cliente.reivindicarPosse(mundoId)).rejects.toMatchObject({
          codigo: "POSSE_DE_OUTRA_INSTANCIA",
          detalhe: { endereco: "wss://a.test" },
        });
      });

      it("quem não é membro ativo não abre o mundo", async () => {
        await instancia();
        const estranho = await ambiente.criarPerfil();
        await recusa(
          Promise.resolve().then(() => ambiente.abrirMundo(mundoId, estranho)),
          "NAO_MEMBRO",
        );
      });

      it("instância em drenagem não recebe mundo novo", async () => {
        const a = await instancia();
        await a.cliente.drenar();
        expect((await a.cliente.batimento({ mundos: [], cursor: null })).drenar).toBe(true);
        await recusa(
          Promise.resolve().then(() => ambiente.abrirMundo(mundoId, lia)),
          "SEM_INSTANCIA",
        );
      });
    });

    describe("batimento", () => {
      it("renova a posse; sem batimento ela vence", async () => {
        const a = await executando();
        await ambiente.avancar(POSSE_TTL_MS - 1000);
        const resposta = await a.cliente.batimento({
          mundos: [{ mundoId, cerca: a.cerca, jogadores: 1, tick: 5 }],
          cursor: null,
        });
        expect(resposta.posses).toMatchObject([{ mundoId, estado: "ok" }]);

        await ambiente.avancar(POSSE_TTL_MS - 1000);
        expect((await ambiente.mundo(mundoId)).posse?.vigente).toBe(true);

        await ambiente.avancar(1000);
        expect((await ambiente.mundo(mundoId)).posse?.vigente).toBe(false);
        const tarde = await a.cliente.batimento({
          mundos: [{ mundoId, cerca: a.cerca, jogadores: 1, tick: 9 }],
          cursor: resposta.cursor,
        });
        expect(tarde.posses).toMatchObject([{ mundoId, estado: "perdida" }]);
      });

      it("avisa uma vez cada sessão encerrada", async () => {
        const a = await executando();
        const sid = await ambiente.abrirSessao(lia);
        const primeiro = await a.cliente.batimento({ mundos: [], cursor: null });
        expect(primeiro.sessoesEncerradas).toEqual([]);

        await ambiente.encerrarSessao(sid, "access_lost");
        const segundo = await a.cliente.batimento({ mundos: [], cursor: primeiro.cursor });
        expect(segundo.sessoesEncerradas).toEqual([{ sid, motivo: "access_lost" }]);

        const terceiro = await a.cliente.batimento({ mundos: [], cursor: segundo.cursor });
        expect(terceiro.sessoesEncerradas).toEqual([]);
      });
    });

    describe("diário", () => {
      it("grava em sequência, sem buracos", async () => {
        const a = await executando();
        const resposta = await a.cliente.anexarAoDiario({
          mundoId,
          cerca: a.cerca,
          entradas: [fato(1), fato(2)],
        });
        expect(resposta.confirmadoAte).toBe(2);

        await expect(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(4)] }),
        ).rejects.toMatchObject({ codigo: "SEQUENCIA", detalhe: { esperado: 3 } });
        expect((await ambiente.mundo(mundoId)).diarioSeq).toBe(2);
      });

      it("repetir exatamente uma entrada gravada não faz nada", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1), fato(2)] });
        const repetida = await a.cliente.anexarAoDiario({
          mundoId,
          cerca: a.cerca,
          entradas: [fato(2), fato(3)],
        });
        expect(repetida.confirmadoAte).toBe(3);
        expect((await ambiente.mundo(mundoId)).diario.map((e) => e.seq)).toEqual([1, 2, 3]);
      });

      it("recusa reescrever uma entrada com outro conteúdo", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1)] });
        await recusa(
          a.cliente.anexarAoDiario({
            mundoId,
            cerca: a.cerca,
            entradas: [fato(1, "fato:1", "outro")],
          }),
          "SEQUENCIA",
        );
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1, "fato:x")] }),
          "SEQUENCIA",
        );
      });

      it("o mesmo fato nunca entra duas vezes", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({
          mundoId,
          cerca: a.cerca,
          entradas: [fato(1, "nasc:g1")],
        });
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(2, "nasc:g1")] }),
          "FATO_DUPLICADO",
        );
        expect((await ambiente.mundo(mundoId)).diarioSeq).toBe(1);
      });

      it("um lote com uma entrada inválida não grava nenhuma", async () => {
        const a = await executando();
        await recusa(
          a.cliente.anexarAoDiario({
            mundoId,
            cerca: a.cerca,
            entradas: [fato(1), fato(2), fato(2, "fato:outro")],
          }),
          "SEQUENCIA",
        );
        expect((await ambiente.mundo(mundoId)).diarioSeq).toBe(0);
      });

      it("devolve as entradas depois de um ponto, em ordem e com o conteúdo", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({
          mundoId,
          cerca: a.cerca,
          entradas: [fato(1), fato(2), fato(3)],
        });
        const lidas = await a.cliente.lerDiario({ mundoId, cerca: a.cerca, apos: 1 });
        expect(lidas.map((e) => [e.seq, e.fatoId, new TextDecoder().decode(e.bytes)])).toEqual([
          [2, "fato:2", "conteudo 2"],
          [3, "fato:3", "conteudo 3"],
        ]);
      });
    });

    describe("fotografia", () => {
      it("só grava sobre a revisão que a instância conhece", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1)] });
        expect(await a.cliente.gravarFotografia(foto(a.cerca, 0, 1))).toEqual({ revisao: 1 });

        await expect(a.cliente.gravarFotografia(foto(a.cerca, 0, 1))).rejects.toMatchObject({
          codigo: "REVISAO_DIVERGENTE",
          detalhe: { atual: 1 },
        });
        expect((await ambiente.mundo(mundoId)).revisao).toBe(1);
      });

      it("não cobre diário que não existe nem volta atrás", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1), fato(2)] });
        await recusa(a.cliente.gravarFotografia(foto(a.cerca, 0, 3)), "ENTRADA_INVALIDA");
        await a.cliente.gravarFotografia(foto(a.cerca, 0, 2));
        await recusa(a.cliente.gravarFotografia(foto(a.cerca, 1, 1)), "ENTRADA_INVALIDA");
      });

      it("devolve a última com resumo de conteúdo conferível", async () => {
        const a = await executando();
        await a.cliente.gravarFotografia({
          ...foto(a.cerca, 0, 0),
          resumo: { titulo: "Família Ipê", subtitulo: "Dia 1" },
        });
        const lida = await a.cliente.lerFotografia({ mundoId, cerca: a.cerca });
        expect(new TextDecoder().decode(lida?.bytes)).toBe("estado até 0");
        expect(lida?.meta).toMatchObject({ revisao: 1, diarioSeq: 0, tipo: "checkpoint" });
        expect(lida?.meta.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(lida?.meta.bytes).toBe(lida?.bytes.length);
        expect((await ambiente.mundo(mundoId)).resumo).toEqual({
          titulo: "Família Ipê",
          subtitulo: "Dia 1",
        });
      });

      it(`guarda as ${FOTOGRAFIAS_GUARDADAS} mais novas e compacta o diário só até a mais antiga`, async () => {
        const a = await executando();
        for (let n = 1; n <= 8; n++) {
          await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(n)] });
          await a.cliente.gravarFotografia(foto(a.cerca, n - 1, n));
        }
        const estado = await ambiente.mundo(mundoId);
        expect(estado.fotografias.map((f) => f.revisao)).toEqual([4, 5, 6, 7, 8]);
        expect(estado.diario.map((e) => e.seq)).toEqual([5, 6, 7, 8]);
        expect(estado.diarioSeq).toBe(8);
      });
    });

    describe("liberar e reabrir", () => {
      it("não solta um mundo com diário fora da fotografia", async () => {
        const a = await executando();
        await recusa(
          a.cliente.liberarPosse({ mundoId, cerca: a.cerca, motivo: "vazio" }),
          "CHECKPOINT_PENDENTE",
        );
        await a.cliente.gravarFotografia(foto(a.cerca, 0, 0));
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1)] });
        await recusa(
          a.cliente.liberarPosse({ mundoId, cerca: a.cerca, motivo: "drenagem" }),
          "CHECKPOINT_PENDENTE",
        );
        expect((await ambiente.mundo(mundoId)).posse?.vigente).toBe(true);
      });

      it("depois de solto o mundo hiberna, e reabrir dá uma cerca maior", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1)] });
        await a.cliente.gravarFotografia(foto(a.cerca, 0, 1));
        await a.cliente.liberarPosse({ mundoId, cerca: a.cerca, motivo: "vazio" });

        const solto = await ambiente.mundo(mundoId);
        expect(solto.estado).toBe("hibernating");
        expect(solto.posse).toBeNull();
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(2)] }),
          "POSSE_PERDIDA",
        );

        await ambiente.abrirMundo(mundoId, lia);
        const posse = await a.cliente.reivindicarPosse(mundoId);
        expect(posse).toMatchObject({ cerca: a.cerca + 1, revisao: 1, diarioSeq: 1 });
        expect(posse.fotografia).toMatchObject({ revisao: 1, diarioSeq: 1 });
        expect((await ambiente.mundo(mundoId)).estado).toBe("active");
      });

      it("em erro a instância solta sem fotografia e nada do diário se perde", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1)] });
        await a.cliente.liberarPosse({ mundoId, cerca: a.cerca, motivo: "erro" });

        await ambiente.abrirMundo(mundoId, lia);
        const posse = await a.cliente.reivindicarPosse(mundoId);
        expect(posse).toMatchObject({ diarioSeq: 1, fotografia: null });
        const diario = await a.cliente.lerDiario({ mundoId, cerca: posse.cerca, apos: 0 });
        expect(diario.map((e) => e.fatoId)).toEqual(["fato:1"]);
      });
    });

    describe("instância obsoleta", () => {
      it("depois que outra assume, nada do que a antiga escreve entra", async () => {
        const a = await executando();
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1)] });
        await a.cliente.gravarFotografia(foto(a.cerca, 0, 1));

        // A some sem avisar. B continua batendo e assume quando a posse vence.
        const b = await instancia("wss://b.test");
        await ambiente.avancar(POSSE_TTL_MS - 1000);
        await b.cliente.batimento({ mundos: [], cursor: null });
        await ambiente.avancar(1000);

        const aberto = await ambiente.abrirMundo(mundoId, lia);
        expect(aberto.endereco).toBe("wss://b.test");
        const posse = await b.cliente.reivindicarPosse(mundoId);
        expect(posse.cerca).toBe(a.cerca + 1);
        expect(posse).toMatchObject({ revisao: 1, diarioSeq: 1 });
        await b.cliente.anexarAoDiario({
          mundoId,
          cerca: posse.cerca,
          entradas: [fato(2, "de:b")],
        });

        // A volta e tenta de tudo com a cerca velha.
        const antes = await ambiente.mundo(mundoId);
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(2, "de:a")] }),
          "POSSE_PERDIDA",
        );
        await recusa(a.cliente.gravarFotografia(foto(a.cerca, 1, 1)), "POSSE_PERDIDA");
        await recusa(
          a.cliente.liberarPosse({ mundoId, cerca: a.cerca, motivo: "erro" }),
          "POSSE_PERDIDA",
        );
        await recusa(a.cliente.lerDiario({ mundoId, cerca: a.cerca, apos: 0 }), "POSSE_PERDIDA");
        await recusa(a.cliente.lerFotografia({ mundoId, cerca: a.cerca }), "POSSE_PERDIDA");
        // Nem com a cerca nova: a posse é de outra instância.
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: posse.cerca, entradas: [fato(3, "de:a")] }),
          "POSSE_PERDIDA",
        );
        const batida = await a.cliente.batimento({
          mundos: [{ mundoId, cerca: a.cerca, jogadores: 1, tick: 1 }],
          cursor: null,
        });
        expect(batida.posses).toMatchObject([{ estado: "perdida" }]);

        const depois = await ambiente.mundo(mundoId);
        expect(depois).toEqual(antes);
        expect(depois.diario.map((e) => e.fatoId)).toEqual(["de:b"]);
      });

      it("posse vencida não escreve, mesmo sem ninguém ter assumido", async () => {
        const a = await executando();
        await ambiente.avancar(POSSE_TTL_MS);
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [fato(1)] }),
          "POSSE_PERDIDA",
        );
        await recusa(a.cliente.reivindicarPosse(mundoId), "POSSE_PERDIDA");
        expect((await ambiente.mundo(mundoId)).diarioSeq).toBe(0);
      });

      it("posse atribuída e ainda não reivindicada não escreve", async () => {
        const a = await instancia();
        const { cerca } = await ambiente.abrirMundo(mundoId, lia);
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca, entradas: [fato(1)] }),
          "POSSE_PERDIDA",
        );
      });
    });

    describe("entrada de jogador", () => {
      let sid: SessaoDeJogoId;

      beforeEach(async () => {
        sid = await ambiente.abrirSessao(lia);
      });

      it("devolve o membro, o papel e o que mostrar do perfil", async () => {
        const a = await executando();
        const bruno = await ambiente.criarPerfil({ apelido: "Bruno" });
        const membroId = await ambiente.adicionarMembro(mundoId, bruno, {
          participacao: "familia:fam_1",
        });
        const sessaoDoBruno = await ambiente.abrirSessao(bruno);

        const dona = await a.cliente.verificarEntrada({
          mundoId,
          cerca: a.cerca,
          sid,
          perfilId: lia,
        });
        expect(dona).toMatchObject({ papel: "steward", participacao: null, apelido: "Lia" });

        const convidado = await a.cliente.verificarEntrada({
          mundoId,
          cerca: a.cerca,
          sid: sessaoDoBruno,
          perfilId: bruno,
        });
        expect(convidado).toMatchObject({
          membroId,
          papel: "member",
          participacao: "familia:fam_1",
          apelido: "Bruno",
        });
        expect(convidado.membroId).not.toBe(dona.membroId);
      });

      it("recusa quem não é membro, quem perdeu o acesso e sessão trocada", async () => {
        const a = await executando();
        const estranho = await ambiente.criarPerfil();
        const sessaoDoEstranho = await ambiente.abrirSessao(estranho);
        const pedido = { mundoId, cerca: a.cerca };

        await recusa(
          a.cliente.verificarEntrada({ ...pedido, sid: sessaoDoEstranho, perfilId: estranho }),
          "NAO_MEMBRO",
        );
        // A sessão é da Lia; dizer que é de outro perfil não adianta.
        await recusa(
          a.cliente.verificarEntrada({ ...pedido, sid, perfilId: estranho }),
          "SESSAO_ENCERRADA",
        );
        await recusa(
          a.cliente.verificarEntrada({ ...pedido, sid: sessaoDoEstranho, perfilId: lia }),
          "SESSAO_ENCERRADA",
        );

        await ambiente.mudarEstadoDoMembro(mundoId, lia, "no_access");
        await recusa(a.cliente.verificarEntrada({ ...pedido, sid, perfilId: lia }), "NAO_MEMBRO");
      });

      it("recusa sessão encerrada", async () => {
        const a = await executando();
        await ambiente.encerrarSessao(sid, "signed_out");
        await recusa(
          a.cliente.verificarEntrada({ mundoId, cerca: a.cerca, sid, perfilId: lia }),
          "SESSAO_ENCERRADA",
        );
      });
    });

    describe("limites de tamanho", () => {
      it("recusa fotografia e lote grandes demais e exige checkpoint com diário acumulado", async () => {
        ambiente = await criarAmbiente({
          limites: { fotografiaMaxBytes: 16, diarioLoteMaxBytes: 40, diarioPendenteMaxBytes: 60 },
        });
        lia = await ambiente.criarPerfil();
        mundoId = await ambiente.criarMundo({ criador: lia });
        const a = await executando();
        const pedaco = (seq: number, tamanho: number): EntradaDoDiario => ({
          seq,
          tick: seq,
          fatoId: `f:${seq}`,
          bytes: new Uint8Array(tamanho),
        });

        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [pedaco(1, 41)] }),
          "TAMANHO_EXCEDIDO",
        );
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [pedaco(1, 40)] });
        await recusa(
          a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [pedaco(2, 21)] }),
          "CHECKPOINT_NECESSARIO",
        );

        await recusa(
          a.cliente.gravarFotografia({ ...foto(a.cerca, 0, 1), bytes: new Uint8Array(17) }),
          "TAMANHO_EXCEDIDO",
        );
        await a.cliente.gravarFotografia({ ...foto(a.cerca, 0, 1), bytes: new Uint8Array(16) });
        // Com o diário coberto pela fotografia, volta a caber.
        await a.cliente.anexarAoDiario({ mundoId, cerca: a.cerca, entradas: [pedaco(2, 21)] });
        expect((await ambiente.mundo(mundoId)).diarioSeq).toBe(2);
      });
    });
  });
}
