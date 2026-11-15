import { corpoDaFase } from "../conteudo";
import type { MoradorInicial } from "../formatos/bairro";
import { sorteioAte } from "../nucleo/sorteio";
import { necessidadesIniciais } from "./estado";
import type { FamiliaId, MoradorId } from "./ids";
import type { EstadoDoMundo, Morador } from "./tipos";

/** Constrói dados; inserir no estado é responsabilidade do criador ou do redutor do fato. */
export function montarMoradorInicial(
  mundo: Pick<EstadoDoMundo, "id" | "semente">,
  id: MoradorId,
  inicial: MoradorInicial,
  familiaId: FamiliaId | null,
  local: Morador["local"],
): Morador {
  const necessidades = necessidadesIniciais(inicial.fase);
  for (const chave of Object.keys(necessidades).sort()) {
    necessidades[chave] =
      600_000 + sorteioAte(350_000, mundo.semente, "inicio", `${id}:${chave}`, 0);
  }
  return {
    id,
    mundoId: mundo.id,
    familiaId,
    versao: 1,
    nome: inicial.nome,
    fase: inicial.fase,
    idadeNaFaseMs: 0,
    origem: {},
    aparencia: {
      linha: inicial.linha,
      corpo: corpoDaFase(inicial.linha, inicial.fase),
      pele: inicial.pele,
      cabelo: inicial.cabelo,
      roupa: inicial.roupa,
      semente: sorteioAte(0x7fffffff, mundo.semente, "aparencia", id, 0),
    },
    local,
    movimento: null,
    necessidades: local.t === "fora" ? {} : necessidades,
    sensacoes: [],
    tracos: [...inicial.tracos],
    habilidades: { ...(inicial.habilidades ?? {}) },
    relacoes: [],
    fila: [],
    acaoAtual: null,
    carteira: 0,
  };
}
