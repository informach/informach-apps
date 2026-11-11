import type { PerfilId } from "../dominio/ids";
import type { Tabela } from "../dominio/tabela";
import type {
  AcessoFamilia,
  EstadoDoMundo,
  Memoria,
  Presenca,
  RegrasDoMundo,
  Velocidade,
} from "../dominio/tipos";
import { canonico, copiar } from "../nucleo/canonico";
import type { ChaveReplicada, TabelaReplicada } from "../sistemas/contexto";

/**
 * O que os clientes veem do mundo e como ficam sabendo do que muda.
 *
 * A visão é o estado sem o que é interno (semente, comandos, contadores,
 * agenda). O cliente guarda um espelho dela e o atualiza com as mudanças de
 * cada passo: só os campos que mudaram, de cada entidade tocada.
 *
 * Na etapa 1 o mundo tem um lote habitado e todos veem a mesma coisa; o
 * filtro por lote entra aqui, sem mudar quem chama.
 */

export const TABELAS_REPLICADAS: readonly TabelaReplicada[] = [
  "lotes",
  "imoveis",
  "objetos",
  "familias",
  "moradores",
  "relacoes",
  "acoes",
  "gravidezes",
  "pedidos",
  "quadro",
];

/**
 * Campos que mudam a cada tick e não precisam chegar a cada tick. São
 * conferidos uma vez por segundo.
 */
const CAMPOS_LENTOS: Partial<Record<TabelaReplicada, readonly string[]>> = {
  moradores: ["necessidades", "idadeNaFaseMs"],
  familias: ["vidaMs"],
};
export const INTERVALO_DOS_CAMPOS_LENTOS = 10;

export type PresencaVista = {
  jogadores: { perfilId: PerfilId; estado: "presente" | "em_graca" }[];
  reservas: { moradorId: string; perfilId: PerfilId }[];
  voto: { velocidade: Velocidade; aFavor: PerfilId[] } | null;
};

export type RelogioVisto = { velocidade: Velocidade; msDeJogoPorTick: number };

export type VisaoDoCliente = {
  mundoId: string;
  tick: number;
  relogio: RelogioVisto;
  regras: RegrasDoMundo;
  acessos: AcessoFamilia[];
  memorias: Memoria[];
  presenca: PresencaVista;
} & { [T in TabelaReplicada]: EstadoDoMundo[T] } & Pick<EstadoDoMundo, "bairros">;

export type Mudanca =
  /** Campos novos de uma entidade. Uma entidade nova chega com todos. */
  | { t: "p"; tabela: TabelaReplicada; id: string; campos: Record<string, unknown>; sem?: string[] }
  /** A entidade deixou de existir. */
  | { t: "r"; tabela: TabelaReplicada; id: string }
  /** Uma parte do estado que é trocada inteira. */
  | { t: "c"; chave: ChaveReplicada; valor: unknown };

function presencaVista(presenca: Presenca): PresencaVista {
  return {
    jogadores: presenca.sessoes.map((sessao) => ({
      perfilId: sessao.perfilId,
      estado: sessao.estado,
    })),
    reservas: presenca.reservas.map((reserva) => ({
      moradorId: reserva.moradorId,
      perfilId: reserva.perfilId,
    })),
    voto: presenca.voto ? { ...presenca.voto, aFavor: [...presenca.voto.aFavor] } : null,
  };
}

function valorDaChave(estado: EstadoDoMundo, presenca: Presenca, chave: ChaveReplicada): unknown {
  switch (chave) {
    case "relogio":
      return {
        velocidade: estado.relogio.velocidade,
        msDeJogoPorTick: estado.relogio.msDeJogoPorTick,
      } satisfies RelogioVisto;
    case "regras":
      return estado.regras;
    case "acessos":
      return estado.acessos;
    case "memorias":
      return estado.memorias;
    case "presenca":
      return presencaVista(presenca);
  }
}

const CHAVES: readonly ChaveReplicada[] = ["relogio", "regras", "acessos", "memorias", "presenca"];

/** A visão inteira, para quem acabou de entrar ou de reconectar. */
export function projetar(estado: EstadoDoMundo, presenca: Presenca): VisaoDoCliente {
  return copiar({
    mundoId: estado.id,
    tick: estado.relogio.tick,
    relogio: valorDaChave(estado, presenca, "relogio") as RelogioVisto,
    regras: estado.regras,
    acessos: estado.acessos,
    memorias: estado.memorias,
    presenca: presencaVista(presenca),
    bairros: estado.bairros,
    lotes: estado.lotes,
    imoveis: estado.imoveis,
    objetos: estado.objetos,
    familias: estado.familias,
    moradores: estado.moradores,
    relacoes: estado.relacoes,
    acoes: estado.acoes,
    gravidezes: estado.gravidezes,
    pedidos: estado.pedidos,
    quadro: estado.quadro,
  });
}

type Tocadas = {
  tocadas: Map<TabelaReplicada, Set<string>>;
  chavesTocadas: Set<ChaveReplicada>;
};

export type Replicador = {
  /** As mudanças desde a última chamada, e limpa o que estava marcado. */
  colher(marcas: Tocadas): Mudanca[];
};

/**
 * Guarda a última forma enviada de cada campo e devolve só o que mudou. Com
 * `conferir`, varre tudo a cada vez e acusa qualquer mudança que não tenha
 * sido marcada: é o modo dos testes.
 */
export function criarReplicador(
  estado: EstadoDoMundo,
  presenca: Presenca,
  opcoes: { conferir?: boolean } = {},
): Replicador {
  const ultimo = new Map<TabelaReplicada, Map<string, Map<string, string>>>();
  const ultimasChaves = new Map<ChaveReplicada, string>();

  const tabelaDe = (nome: TabelaReplicada) =>
    estado[nome] as unknown as Tabela<string, Record<string, unknown>>;

  function comparar(
    nome: TabelaReplicada,
    id: string,
    comLentos: boolean,
    saida: Mudanca[] | null,
  ): boolean {
    let conhecidas = ultimo.get(nome);
    if (!conhecidas) {
      conhecidas = new Map();
      ultimo.set(nome, conhecidas);
    }
    const entidade = tabelaDe(nome).porId[id];
    const anterior = conhecidas.get(id);
    if (entidade === undefined) {
      if (!anterior) return false;
      conhecidas.delete(id);
      saida?.push({ t: "r", tabela: nome, id });
      return true;
    }
    const lentos = CAMPOS_LENTOS[nome] ?? [];
    const campos: Record<string, unknown> = {};
    const sem: string[] = [];
    const atual = anterior ?? new Map<string, string>();
    let mudou = false;
    for (const campo of Object.keys(entidade).sort()) {
      if (anterior && !comLentos && lentos.includes(campo)) continue;
      const valor = entidade[campo];
      if (valor === undefined) continue;
      const forma = canonico(valor);
      if (atual.get(campo) === forma) continue;
      atual.set(campo, forma);
      campos[campo] = copiar(valor);
      mudou = true;
    }
    for (const campo of [...atual.keys()]) {
      if (entidade[campo] === undefined) {
        atual.delete(campo);
        sem.push(campo);
        mudou = true;
      }
    }
    if (!anterior) conhecidas.set(id, atual);
    if (mudou) {
      saida?.push(
        sem.length > 0
          ? { t: "p", tabela: nome, id, campos, sem }
          : { t: "p", tabela: nome, id, campos },
      );
    }
    return mudou;
  }

  function compararChave(chave: ChaveReplicada, saida: Mudanca[] | null): boolean {
    const valor = valorDaChave(estado, presenca, chave);
    const forma = canonico(valor);
    if (ultimasChaves.get(chave) === forma) return false;
    ultimasChaves.set(chave, forma);
    saida?.push({ t: "c", chave, valor: copiar(valor) });
    return true;
  }

  let ultimaJanela = Math.floor(estado.relogio.tick / INTERVALO_DOS_CAMPOS_LENTOS);

  // O ponto de partida: tudo como está agora, sem emitir nada.
  for (const nome of TABELAS_REPLICADAS) {
    for (const id of tabelaDe(nome).ordem) comparar(nome, id, true, null);
  }
  for (const chave of CHAVES) compararChave(chave, null);

  return {
    colher(marcas) {
      const saida: Mudanca[] = [];
      // Com o mundo acelerado um passo pula vários ticks: o que conta é ter
      // cruzado a fronteira, não cair exatamente nela.
      const janela = Math.floor(estado.relogio.tick / INTERVALO_DOS_CAMPOS_LENTOS);
      const comLentos = janela !== ultimaJanela;
      ultimaJanela = janela;

      for (const nome of TABELAS_REPLICADAS) {
        const marcadas = marcas.tocadas.get(nome) ?? new Set<string>();
        const ids = new Set<string>(marcadas);
        // Uma vez por segundo, todos entram por causa dos campos lentos.
        if (comLentos && CAMPOS_LENTOS[nome]) for (const id of tabelaDe(nome).ordem) ids.add(id);
        // Na ordem de criação, para o espelho guardar a mesma ordem do mundo;
        // por último as que deixaram de existir.
        const vivas = tabelaDe(nome).ordem.filter((id) => ids.has(id));
        const mortas = [...ids].filter((id) => tabelaDe(nome).porId[id] === undefined).sort();
        for (const id of [...vivas, ...mortas]) comparar(nome, id, comLentos, saida);

        if (opcoes.conferir) {
          const conhecidas = ultimo.get(nome) ?? new Map<string, Map<string, string>>();
          const todos = new Set([...tabelaDe(nome).ordem, ...conhecidas.keys()]);
          for (const id of todos) {
            if (ids.has(id)) continue;
            if (comparar(nome, id, false, null)) {
              throw new Error(`Mudança em ${nome}/${id} sem marcar para replicação`);
            }
          }
        }
      }

      for (const chave of CHAVES) {
        if (marcas.chavesTocadas.has(chave)) compararChave(chave, saida);
        else if (opcoes.conferir && compararChave(chave, null)) {
          throw new Error(`Mudança em ${chave} sem marcar para replicação`);
        }
      }

      marcas.tocadas.clear();
      marcas.chavesTocadas.clear();
      return saida;
    },
  };
}

/** Aplica as mudanças de um passo ao espelho do cliente. */
export function aplicarMudancas(
  visao: VisaoDoCliente,
  tick: number,
  mudancas: readonly Mudanca[],
): void {
  visao.tick = tick;
  for (const mudanca of mudancas) {
    if (mudanca.t === "c") {
      (visao as unknown as Record<string, unknown>)[mudanca.chave] = copiar(mudanca.valor);
      continue;
    }
    const tabela = visao[mudanca.tabela] as unknown as Tabela<string, Record<string, unknown>>;
    if (mudanca.t === "r") {
      if (Object.hasOwn(tabela.porId, mudanca.id)) {
        delete tabela.porId[mudanca.id];
        tabela.ordem.splice(tabela.ordem.indexOf(mudanca.id), 1);
      }
      continue;
    }
    let entidade = tabela.porId[mudanca.id];
    if (!entidade) {
      entidade = {};
      tabela.porId[mudanca.id] = entidade;
      tabela.ordem.push(mudanca.id);
    }
    for (const campo of Object.keys(mudanca.campos)) {
      entidade[campo] = copiar(mudanca.campos[campo]);
    }
    for (const campo of mudanca.sem ?? []) delete entidade[campo];
  }
}
