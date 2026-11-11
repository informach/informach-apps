import type { AcaoPedida } from "../comandos/intencao";
import { BAIRRO_DA_PROVA } from "../conteudo";
import type { Fato } from "../dominio/fatos";
import type { MoradorId, PerfilId, SessaoId } from "../dominio/ids";
import { verificarInvariantes } from "../dominio/invariantes";
import { listar } from "../dominio/tabela";
import type { Morador, RegrasDoMundo, Resultado } from "../dominio/tipos";
import { criarMundo, type Mundo, REGRAS_DA_PROVA, type SaidaDoPasso } from "../execucao";
import type { DefinicaoDeBairro } from "../formatos/bairro";
import { copiar } from "../nucleo/canonico";
import type { EventoDeApresentacao } from "../sistemas/contexto";
import type { Mudanca } from "../visao/replicacao";

/**
 * Apoio para testar a simulação e quem a hospeda: um mundo da prova pronto e
 * um roteiro que anda o tempo conferindo as invariantes a cada passo.
 */

export const MUNDO_DE_TESTE = "mundo-de-teste";
export const LIA: PerfilId = "perfil-lia";
export const BRUNO: PerfilId = "perfil-bruno";

/**
 * O bairro da prova com o casal já formado: a Duda mora na casa e é casada
 * com o Marcos. Poupa o namoro inteiro nos testes que começam depois dele.
 */
export function bairroComCasal(): DefinicaoDeBairro {
  const bairro = copiar(BAIRRO_DA_PROVA);
  const duda = bairro.avulsos.find((morador) => morador.ref === "duda");
  const familia = bairro.familias[0];
  if (!duda || !familia) throw new Error("O bairro da prova mudou");
  bairro.avulsos = bairro.avulsos.filter((morador) => morador.ref !== "duda");
  familia.moradores.push(duda);
  bairro.relacoes = bairro.relacoes.filter(
    (relacao) => !(relacao.a === "marcos" && relacao.b === "duda"),
  );
  bairro.relacoes.push({
    a: "marcos",
    b: "duda",
    amizade: 900_000,
    romance: 900_000,
    confianca: 900_000,
    casal: "casamento",
  });
  return bairro;
}

/**
 * O bairro da prova com uma segunda família no lote vazio, para os testes que
 * precisam de uma família presente e outra ausente.
 */
export function bairroComVizinhos(): DefinicaoDeBairro {
  const bairro = copiar(BAIRRO_DA_PROVA);
  bairro.familias.push({
    ref: "familia_jatoba",
    nome: "Jatobá",
    lote: "lote_2",
    fundo: 200_000,
    moradores: [
      {
        ref: "rui",
        nome: "Rui",
        fase: "adulto",
        linha: "m",
        pele: 10_000_000,
        cabelo: "curto_lateral",
        roupa: "casual_camisa",
        tracos: [],
      },
      {
        ref: "bela",
        nome: "Bela",
        fase: "crianca",
        linha: "f",
        pele: 10_000_000,
        cabelo: "trancas",
        roupa: "infantil_macacao",
        tracos: [],
      },
    ],
  });
  bairro.relacoes.push({ a: "rui", b: "bela", amizade: 800_000, parentesco: "genitor" });
  return bairro;
}

export function criarMundoDaProva(
  opcoes: {
    semente?: number;
    regras?: Partial<RegrasDoMundo>;
    fundadores?: readonly PerfilId[];
    conferirReplicacao?: boolean;
    definicao?: DefinicaoDeBairro;
  } = {},
): Mundo {
  return criarMundo(
    {
      mundoId: MUNDO_DE_TESTE,
      semente: opcoes.semente ?? 20261111,
      definicao: opcoes.definicao ?? BAIRRO_DA_PROVA,
      fundadores: opcoes.fundadores ?? [LIA],
      regras: { ...REGRAS_DA_PROVA, ...opcoes.regras },
    },
    { conferirReplicacao: opcoes.conferirReplicacao ?? true },
  );
}

export function moradorDeNome(mundo: Mundo, nome: string): Morador {
  const achado = listar(mundo.estado.moradores).find((morador) => morador.nome === nome);
  if (!achado) throw new Error(`Não há morador chamado ${nome}`);
  return achado;
}

export type Acumulado = {
  fatos: Fato[];
  mudancas: Mudanca[];
  apresentacao: EventoDeApresentacao[];
};

export type Roteiro = {
  mundo: Mundo;
  /** Tudo o que saiu desde o começo do roteiro. */
  saida: Acumulado;
  /** Entra com um perfil; devolve o id da sessão. */
  entrar(perfilId: PerfilId, sessaoId?: SessaoId): SessaoId;
  comandar(
    sessaoId: SessaoId,
    moradorId: MoradorId | null,
    acao: AcaoPedida,
    comandoId?: string,
  ): Resultado;
  /** Anda o tempo, um passo por vez, conferindo as invariantes. */
  andar(ticks: number): void;
  /** Anda até a condição valer; falha se passar do limite. */
  ate(condicao: () => boolean, limiteDeTicks: number, descricao?: string): number;
  conferir(): void;
};

export function criarRoteiro(mundo: Mundo, opcoes: { conferirACada?: number } = {}): Roteiro {
  const conferirACada = opcoes.conferirACada ?? 1;
  const saida: Acumulado = { fatos: [], mudancas: [], apresentacao: [] };
  let comandos = 0;
  let sessoes = 0;

  const guardar = (passo: SaidaDoPasso) => {
    saida.fatos.push(...passo.fatos);
    saida.mudancas.push(...passo.mudancas);
    saida.apresentacao.push(...passo.apresentacao);
  };

  const conferir = () => {
    const problemas = verificarInvariantes(mundo.estado, mundo.presenca);
    if (problemas.length > 0) {
      throw new Error(`Invariantes no tick ${mundo.estado.relogio.tick}: ${problemas.join("; ")}`);
    }
  };

  const andar = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      // Com o mundo acelerado, 100 ms valem mais de um passo; pausado, nenhum.
      guardar(mundo.avancar(100));
      if (mundo.estado.relogio.tick % conferirACada === 0) conferir();
    }
  };

  return {
    mundo,
    saida,
    conferir,
    andar,

    entrar(perfilId, sessaoId = `sessao-${++sessoes}`) {
      mundo.aplicar({ t: "sessao_entrou", sessaoId, perfilId });
      guardar(mundo.avancar(0));
      conferir();
      return sessaoId;
    },

    comandar(
      sessaoId,
      moradorId,
      acao,
      comandoId = `comando-${String(++comandos).padStart(4, "0")}`,
    ) {
      const resultado = mundo.aplicar({
        t: "intencao",
        sessaoId,
        intencao: {
          comandoId,
          mundoId: mundo.estado.id,
          moradorId,
          acao,
          versaoEsperada: 0,
        },
      });
      guardar(mundo.avancar(0));
      conferir();
      return resultado;
    },

    ate(condicao, limiteDeTicks, descricao = "a condição") {
      const inicio = mundo.estado.relogio.tick;
      for (let i = 0; i < limiteDeTicks; i++) {
        if (condicao()) return mundo.estado.relogio.tick - inicio;
        andar(1);
      }
      if (condicao()) return mundo.estado.relogio.tick - inicio;
      throw new Error(`Passaram ${limiteDeTicks} ticks e ${descricao} não aconteceu`);
    },
  };
}
