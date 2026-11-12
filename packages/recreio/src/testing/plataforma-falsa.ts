import { type GameManifest, jogoPorId, type LimitesDoJogo } from "@informach/config/jogos";
import type {
  ClienteDoHost,
  EntradaDoDiario,
  EntradaPermitida,
  MetaDeFotografia,
  MotivoDeSessaoEncerrada,
  ResumoDoMundo,
} from "../contrato/host";
import { ErroDoRecreio } from "../dominio/erros";
import type { InstanciaId, MembroId, MundoId, PerfilId, SessaoDeJogoId } from "../dominio/ids";
import type { EstadoDeMembro, EstadoDeMundo, PapelNoMundo } from "../dominio/mundos";
import {
  BATIMENTO_MS,
  type EstadoDePosse,
  FOTOGRAFIAS_GUARDADAS,
  POSSE_TTL_MS,
} from "../dominio/posse";

/**
 * Plataforma em memória, para o servidor de um jogo ser escrito e testado sem
 * o Recreio de verdade. Obedece às mesmas regras da API das instâncias: cerca
 * conferida em toda escrita, uma posse aberta por mundo, diário sem buracos,
 * prazo julgado pelo relógio da plataforma.
 *
 * O relógio é manual: os testes o avançam com `avancar`.
 */

type MembroFalso = {
  membroId: MembroId;
  perfilId: PerfilId;
  papel: PapelNoMundo;
  estado: EstadoDeMembro;
  participacao: string | null;
};

type PosseFalsa = {
  cerca: number;
  instanciaId: InstanciaId;
  estado: Exclude<EstadoDePosse, "released">;
  expiraEm: number;
};

type FotografiaFalsa = { meta: MetaDeFotografia; bytes: Uint8Array };

type MundoFalso = {
  id: MundoId;
  jogo: string;
  nome: string;
  estado: EstadoDeMundo;
  schemaVersion: number;
  revisao: number;
  diarioSeq: number;
  epoca: number;
  membros: MembroFalso[];
  posse: PosseFalsa | null;
  fotografias: FotografiaFalsa[];
  diario: EntradaDoDiario[];
  resumo: ResumoDoMundo | null;
};

type InstanciaFalsa = {
  id: InstanciaId;
  jogo: string;
  urlPublica: string;
  capacidade: number;
  estado: "active" | "draining" | "gone";
  vistaEm: number;
};

type PerfilFalso = { id: PerfilId; apelido: string; avatar: string; versaoDaPolitica: number };

type SessaoFalsa = { sid: SessaoDeJogoId; perfilId: PerfilId; jogo: string; encerrada: boolean };

export type EstadoDoMundoFalso = {
  estado: EstadoDeMundo;
  revisao: number;
  diarioSeq: number;
  posse: (PosseFalsa & { vigente: boolean }) | null;
  fotografias: readonly MetaDeFotografia[];
  diario: readonly EntradaDoDiario[];
  membros: readonly MembroFalso[];
  resumo: ResumoDoMundo | null;
};

export type PlataformaFalsa = {
  agora(): number;
  avancar(ms: number): void;

  criarPerfil(dados?: { apelido?: string; avatar?: string }): PerfilId;
  criarMundo(dados: { criador: PerfilId; jogo?: string; nome?: string }): MundoId;
  adicionarMembro(
    mundoId: MundoId,
    perfilId: PerfilId,
    dados?: { papel?: PapelNoMundo; participacao?: string | null },
  ): MembroId;
  mudarEstadoDoMembro(mundoId: MundoId, perfilId: PerfilId, estado: EstadoDeMembro): void;

  /** Registra uma sessão de jogo viva; o token é emitido à parte, pelo emissor de teste. */
  abrirSessao(perfilId: PerfilId, jogo?: string): SessaoDeJogoId;
  encerrarSessao(sid: SessaoDeJogoId, motivo?: MotivoDeSessaoEncerrada): void;

  /**
   * O que o navegador faz ao abrir um mundo: entra na posse vigente ou faz o
   * Recreio escolher uma instância e atribuir uma posse nova.
   */
  abrirMundo(mundoId: MundoId, perfilId: PerfilId): { endereco: string; cerca: number };

  /** Um cliente para uma instância nova. Use `registrar` antes das outras chamadas. */
  cliente(jogo?: string): ClienteDoHost;

  mundo(mundoId: MundoId): EstadoDoMundoFalso;
};

const JOGO_PADRAO = "morada";

function id<T extends string>(): T {
  return crypto.randomUUID() as T;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const resumo = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mesmosBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function criarPlataformaFalsa(
  opcoes: { inicio?: number; limites?: Partial<LimitesDoJogo>; membrosMax?: number } = {},
): PlataformaFalsa {
  let relogio = opcoes.inicio ?? Date.UTC(2026, 10, 11, 12, 0, 0);
  const perfis = new Map<PerfilId, PerfilFalso>();
  const mundos = new Map<MundoId, MundoFalso>();
  const instancias = new Map<InstanciaId, InstanciaFalsa>();
  const sessoes = new Map<SessaoDeJogoId, SessaoFalsa>();
  const encerramentos: { n: number; sid: SessaoDeJogoId; motivo: MotivoDeSessaoEncerrada }[] = [];

  function manifesto(jogo: string): GameManifest {
    const encontrado = jogoPorId(jogo);
    if (!encontrado) throw new ErroDoRecreio("JOGO_INDISPONIVEL");
    return encontrado;
  }

  function limites(jogo: string): LimitesDoJogo {
    return { ...manifesto(jogo).limites, ...opcoes.limites };
  }

  function obterMundo(mundoId: MundoId): MundoFalso {
    const mundo = mundos.get(mundoId);
    if (!mundo) throw new ErroDoRecreio("NAO_ENCONTRADO");
    return mundo;
  }

  function vigente(posse: PosseFalsa | null): posse is PosseFalsa {
    return posse !== null && posse.expiraEm > relogio;
  }

  function instanciaViva(instancia: InstanciaFalsa): boolean {
    return instancia.estado === "active" && relogio - instancia.vistaEm < POSSE_TTL_MS;
  }

  function possesAbertasDe(instanciaId: InstanciaId): number {
    let total = 0;
    for (const mundo of mundos.values()) {
      if (vigente(mundo.posse) && mundo.posse.instanciaId === instanciaId) total++;
    }
    return total;
  }

  /** A regra central: só a instância dona da posse aberta, com a cerca atual, escreve. */
  function conferirPosse(mundo: MundoFalso, cerca: number, instanciaId: InstanciaId): PosseFalsa {
    const posse = mundo.posse;
    if (
      !vigente(posse) ||
      posse.cerca !== cerca ||
      posse.instanciaId !== instanciaId ||
      posse.estado !== "held"
    ) {
      throw new ErroDoRecreio("POSSE_PERDIDA");
    }
    return posse;
  }

  function bytesPendentes(mundo: MundoFalso): number {
    const coberto = mundo.fotografias.at(-1)?.meta.diarioSeq ?? 0;
    let total = 0;
    for (const entrada of mundo.diario) if (entrada.seq > coberto) total += entrada.bytes.length;
    return total;
  }

  function aparar(mundo: MundoFalso): void {
    const comuns = mundo.fotografias.filter((foto) => foto.meta.tipo !== "pinned");
    const sobra = comuns.length - FOTOGRAFIAS_GUARDADAS;
    if (sobra > 0) {
      const descartadas = new Set(comuns.slice(0, sobra));
      mundo.fotografias = mundo.fotografias.filter((foto) => !descartadas.has(foto));
    }
    const maisAntiga = mundo.fotografias[0]?.meta.diarioSeq ?? 0;
    mundo.diario = mundo.diario.filter((entrada) => entrada.seq > maisAntiga);
  }

  function criarCliente(jogo: string): ClienteDoHost {
    let instanciaId: InstanciaId | null = null;

    function eu(): InstanciaFalsa {
      const instancia = instanciaId ? instancias.get(instanciaId) : undefined;
      if (!instancia) throw new ErroDoRecreio("NAO_AUTENTICADO");
      return instancia;
    }

    function mundoDoJogo(mundoId: MundoId): MundoFalso {
      const mundo = obterMundo(mundoId);
      // Um segredo de jogo só alcança os mundos daquele jogo.
      if (mundo.jogo !== jogo) throw new ErroDoRecreio("NAO_ENCONTRADO");
      return mundo;
    }

    return {
      async registrar(registro) {
        manifesto(jogo);
        const instancia: InstanciaFalsa = {
          id: id<InstanciaId>(),
          jogo,
          urlPublica: registro.urlPublica,
          capacidade: registro.capacidade,
          estado: "active",
          vistaEm: relogio,
        };
        instancias.set(instancia.id, instancia);
        instanciaId = instancia.id;
        return { instanciaId: instancia.id, batimentoMs: BATIMENTO_MS, posseTtlMs: POSSE_TTL_MS };
      },

      async batimento(batimento) {
        const instancia = eu();
        instancia.vistaEm = relogio;
        const posses = batimento.mundos.map((relato) => {
          const mundo = mundos.get(relato.mundoId);
          const posse = mundo?.posse ?? null;
          if (
            !mundo ||
            mundo.jogo !== jogo ||
            !vigente(posse) ||
            posse.cerca !== relato.cerca ||
            posse.instanciaId !== instancia.id
          ) {
            return { mundoId: relato.mundoId, estado: "perdida" as const, expiraEm: 0 };
          }
          posse.expiraEm = relogio + POSSE_TTL_MS;
          return { mundoId: relato.mundoId, estado: "ok" as const, expiraEm: posse.expiraEm };
        });
        const desde = batimento.cursor === null ? 0 : Number(batimento.cursor);
        const sessoesEncerradas = encerramentos
          .filter((evento) => evento.n > desde && sessoes.get(evento.sid)?.jogo === jogo)
          .map(({ sid, motivo }) => ({ sid, motivo }));
        return {
          posses,
          sessoesEncerradas,
          cursor: String(encerramentos.at(-1)?.n ?? desde),
          drenar: instancia.estado === "draining",
        };
      },

      async drenar() {
        eu().estado = "draining";
      },

      async reivindicarPosse(mundoId) {
        const instancia = eu();
        const mundo = mundoDoJogo(mundoId);
        const posse = mundo.posse;
        if (!vigente(posse)) throw new ErroDoRecreio("POSSE_PERDIDA");
        if (posse.instanciaId !== instancia.id) {
          const dona = instancias.get(posse.instanciaId);
          throw new ErroDoRecreio("POSSE_DE_OUTRA_INSTANCIA", {
            endereco: dona?.urlPublica ?? null,
          });
        }
        posse.estado = "held";
        posse.expiraEm = relogio + POSSE_TTL_MS;
        mundo.estado = "active";
        return {
          cerca: posse.cerca,
          expiraEm: posse.expiraEm,
          schemaVersion: mundo.schemaVersion,
          revisao: mundo.revisao,
          diarioSeq: mundo.diarioSeq,
          fotografia: mundo.fotografias.at(-1)?.meta ?? null,
        };
      },

      async lerFotografia({ mundoId, cerca }) {
        const mundo = mundoDoJogo(mundoId);
        conferirPosse(mundo, cerca, eu().id);
        const foto = mundo.fotografias.at(-1);
        return foto ? { meta: foto.meta, bytes: foto.bytes.slice() } : null;
      },

      async lerDiario({ mundoId, cerca, apos }) {
        const mundo = mundoDoJogo(mundoId);
        conferirPosse(mundo, cerca, eu().id);
        return mundo.diario
          .filter((entrada) => entrada.seq > apos)
          .map((entrada) => ({ ...entrada, bytes: entrada.bytes.slice() }));
      },

      async verificarEntrada({ mundoId, cerca, sid, perfilId }): Promise<EntradaPermitida> {
        const mundo = mundoDoJogo(mundoId);
        conferirPosse(mundo, cerca, eu().id);
        const sessao = sessoes.get(sid);
        if (!sessao || sessao.encerrada || sessao.perfilId !== perfilId || sessao.jogo !== jogo) {
          throw new ErroDoRecreio("SESSAO_ENCERRADA");
        }
        const membro = mundo.membros.find((m) => m.perfilId === perfilId);
        if (membro?.estado !== "active") throw new ErroDoRecreio("NAO_MEMBRO");
        const perfil = perfis.get(perfilId);
        if (!perfil) throw new ErroDoRecreio("NAO_MEMBRO");
        return {
          membroId: membro.membroId,
          papel: membro.papel,
          participacao: membro.participacao,
          apelido: perfil.apelido,
          avatar: perfil.avatar,
          politica: { multiplayer: true, textoLivre: false, versao: perfil.versaoDaPolitica },
        };
      },

      async anexarAoDiario({ mundoId, cerca, entradas }) {
        const mundo = mundoDoJogo(mundoId);
        conferirPosse(mundo, cerca, eu().id);
        const limite = limites(jogo);
        const novas: EntradaDoDiario[] = [];
        let proxima = mundo.diarioSeq + 1;
        const fatos = new Set(mundo.diario.map((entrada) => entrada.fatoId));
        // Tudo é conferido antes de qualquer mudança, como em uma transação.
        for (const entrada of entradas) {
          if (entrada.seq <= mundo.diarioSeq) {
            const gravada = mundo.diario.find((e) => e.seq === entrada.seq);
            // Repetir exatamente o que já foi gravado não faz nada. Uma entrada
            // já compactada só pode ser repetição.
            const repeticao =
              !gravada ||
              (gravada.fatoId === entrada.fatoId && mesmosBytes(gravada.bytes, entrada.bytes));
            if (!repeticao || novas.length > 0) {
              throw new ErroDoRecreio("SEQUENCIA", { esperado: mundo.diarioSeq + 1 });
            }
            continue;
          }
          if (entrada.seq !== proxima) throw new ErroDoRecreio("SEQUENCIA", { esperado: proxima });
          if (fatos.has(entrada.fatoId)) throw new ErroDoRecreio("FATO_DUPLICADO");
          fatos.add(entrada.fatoId);
          novas.push({ ...entrada, bytes: entrada.bytes.slice() });
          proxima++;
        }
        const tamanho = novas.reduce((total, entrada) => total + entrada.bytes.length, 0);
        if (tamanho > limite.diarioLoteMaxBytes) throw new ErroDoRecreio("TAMANHO_EXCEDIDO");
        if (bytesPendentes(mundo) + tamanho > limite.diarioPendenteMaxBytes) {
          throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
        }
        mundo.diario.push(...novas);
        mundo.diarioSeq = proxima - 1;
        return { confirmadoAte: mundo.diarioSeq };
      },

      async gravarFotografia(foto) {
        const mundo = mundoDoJogo(foto.mundoId);
        conferirPosse(mundo, foto.cerca, eu().id);
        if (foto.revisaoEsperada !== mundo.revisao) {
          throw new ErroDoRecreio("REVISAO_DIVERGENTE", { atual: mundo.revisao });
        }
        const anterior = mundo.fotografias.at(-1)?.meta.diarioSeq ?? 0;
        if (foto.diarioSeq > mundo.diarioSeq || foto.diarioSeq < anterior) {
          throw new ErroDoRecreio("ENTRADA_INVALIDA");
        }
        if (foto.bytes.length > limites(jogo).fotografiaMaxBytes) {
          throw new ErroDoRecreio("TAMANHO_EXCEDIDO");
        }
        const hash = await sha256Hex(foto.bytes);
        // A posse pode ter mudado enquanto o resumo era calculado.
        conferirPosse(mundo, foto.cerca, eu().id);
        if (foto.revisaoEsperada !== mundo.revisao) {
          throw new ErroDoRecreio("REVISAO_DIVERGENTE", { atual: mundo.revisao });
        }
        mundo.revisao++;
        mundo.schemaVersion = foto.schemaVersion;
        mundo.fotografias.push({
          meta: {
            revisao: mundo.revisao,
            diarioSeq: foto.diarioSeq,
            tick: foto.tick,
            schemaVersion: foto.schemaVersion,
            tipo: foto.tipo,
            bytes: foto.bytes.length,
            sha256: hash,
          },
          bytes: foto.bytes.slice(),
        });
        if (foto.resumo) mundo.resumo = foto.resumo;
        aparar(mundo);
        return { revisao: mundo.revisao };
      },

      async liberarPosse({ mundoId, cerca, motivo }) {
        const mundo = mundoDoJogo(mundoId);
        conferirPosse(mundo, cerca, eu().id);
        if (motivo !== "erro") {
          const ultima = mundo.fotografias.at(-1);
          if (!ultima || ultima.meta.diarioSeq !== mundo.diarioSeq) {
            throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
          }
        }
        mundo.posse = null;
        mundo.estado = "hibernating";
      },
    };
  }

  return {
    agora: () => relogio,
    avancar(ms) {
      if (ms < 0) throw new Error("O relógio da plataforma não volta");
      relogio += ms;
    },

    criarPerfil(dados = {}) {
      const perfil: PerfilFalso = {
        id: id<PerfilId>(),
        apelido: dados.apelido ?? `Perfil ${perfis.size + 1}`,
        avatar: dados.avatar ?? "padrao",
        versaoDaPolitica: 1,
      };
      perfis.set(perfil.id, perfil);
      return perfil.id;
    },

    criarMundo({ criador, jogo = JOGO_PADRAO, nome = "Mundo de teste" }) {
      if (!perfis.has(criador)) throw new ErroDoRecreio("SEM_PERFIL");
      const mundo: MundoFalso = {
        id: id<MundoId>(),
        jogo,
        nome,
        estado: "hibernating",
        schemaVersion: 1,
        revisao: 0,
        diarioSeq: 0,
        epoca: 0,
        membros: [
          {
            membroId: id<MembroId>(),
            perfilId: criador,
            papel: "steward",
            estado: "active",
            participacao: null,
          },
        ],
        posse: null,
        fotografias: [],
        diario: [],
        resumo: null,
      };
      mundos.set(mundo.id, mundo);
      return mundo.id;
    },

    adicionarMembro(mundoId, perfilId, dados = {}) {
      const mundo = obterMundo(mundoId);
      if (!perfis.has(perfilId)) throw new ErroDoRecreio("SEM_PERFIL");
      if (mundo.membros.some((m) => m.perfilId === perfilId)) throw new ErroDoRecreio("JA_MEMBRO");
      const teto = opcoes.membrosMax ?? manifesto(mundo.jogo).capacidades.mundos.membrosMax;
      if (mundo.membros.filter((m) => m.estado === "active").length >= teto) {
        throw new ErroDoRecreio("MUNDO_CHEIO");
      }
      const membro: MembroFalso = {
        membroId: id<MembroId>(),
        perfilId,
        papel: dados.papel ?? "member",
        estado: "active",
        participacao: dados.participacao ?? null,
      };
      mundo.membros.push(membro);
      return membro.membroId;
    },

    mudarEstadoDoMembro(mundoId, perfilId, estado) {
      const membro = obterMundo(mundoId).membros.find((m) => m.perfilId === perfilId);
      if (!membro) throw new ErroDoRecreio("NAO_MEMBRO");
      membro.estado = estado;
    },

    abrirSessao(perfilId, jogo = JOGO_PADRAO) {
      if (!perfis.has(perfilId)) throw new ErroDoRecreio("SEM_PERFIL");
      const sid = id<SessaoDeJogoId>();
      sessoes.set(sid, { sid, perfilId, jogo, encerrada: false });
      return sid;
    },

    encerrarSessao(sid, motivo = "left") {
      const sessao = sessoes.get(sid);
      if (!sessao || sessao.encerrada) return;
      sessao.encerrada = true;
      encerramentos.push({ n: encerramentos.length + 1, sid, motivo });
    },

    abrirMundo(mundoId, perfilId) {
      const mundo = obterMundo(mundoId);
      const membro = mundo.membros.find((m) => m.perfilId === perfilId);
      if (membro?.estado !== "active") throw new ErroDoRecreio("NAO_MEMBRO");
      if (mundo.estado === "archived" || mundo.estado === "deleted") {
        throw new ErroDoRecreio("MUNDO_INDISPONIVEL");
      }
      if (vigente(mundo.posse)) {
        const dona = instancias.get(mundo.posse.instanciaId);
        if (dona) return { endereco: dona.urlPublica, cerca: mundo.posse.cerca };
      }
      const candidatas = [...instancias.values()]
        .filter(
          (instancia) =>
            instancia.jogo === mundo.jogo &&
            instanciaViva(instancia) &&
            possesAbertasDe(instancia.id) < instancia.capacidade,
        )
        .sort((a, b) => possesAbertasDe(a.id) - possesAbertasDe(b.id) || (a.id < b.id ? -1 : 1));
      const escolhida = candidatas[0];
      if (!escolhida) throw new ErroDoRecreio("SEM_INSTANCIA");
      mundo.epoca++;
      mundo.posse = {
        cerca: mundo.epoca,
        instanciaId: escolhida.id,
        estado: "assigned",
        expiraEm: relogio + POSSE_TTL_MS,
      };
      return { endereco: escolhida.urlPublica, cerca: mundo.posse.cerca };
    },

    cliente: (jogo = JOGO_PADRAO) => criarCliente(jogo),

    mundo(mundoId) {
      const mundo = obterMundo(mundoId);
      return {
        estado: mundo.estado,
        revisao: mundo.revisao,
        diarioSeq: mundo.diarioSeq,
        posse: mundo.posse ? { ...mundo.posse, vigente: vigente(mundo.posse) } : null,
        fotografias: mundo.fotografias.map((foto) => foto.meta),
        diario: mundo.diario.map((entrada) => ({ ...entrada })),
        membros: mundo.membros.map((membro) => ({ ...membro })),
        resumo: mundo.resumo,
      };
    },
  };
}
