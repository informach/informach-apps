import {
  type AcaoPedida,
  type Alvo,
  bebeNoColoDe,
  type EstadoDoMundo,
  impedimentoDoPedido,
  type Morador,
  type MoradorId,
  objetosDoLote,
  obter,
  ondeEsta,
  PONTO_DENTRO,
  recusaDaInteracao,
  type TipoDePedido,
  temPermissao,
  temPontoLivre,
} from "@informach/morada-sim";
import {
  CONTEUDO,
  CUIDADO_POR_NECESSIDADE,
  comportamento,
  type DefInteracao,
  doCatalogo,
  FASES_QUE_CUIDAM,
  interacao,
} from "@informach/morada-sim/conteudo";
import type { AlvoDoMenu } from "../espelho/loja";
import { textoDaRecusa, textoDoDetalhe, textoDoRequisito } from "./textos";

/**
 * O menu de um objeto ou de um morador: o que o conteúdo do jogo permite ali,
 * com cada opção ligada ou desligada e o motivo. As contas são as mesmas
 * regras puras que o servidor usa, aplicadas ao espelho; o servidor confere
 * tudo de novo quando o pedido chega.
 */

export type OpcaoDoMenu = {
  id: string;
  rotulo: string;
  habilitada: boolean;
  /** Por que está desligada. */
  motivo?: string;
  /** O morador a quem a intenção é dirigida. */
  moradorId: MoradorId | null;
  acao: AcaoPedida;
};

export type Menu = {
  titulo: string;
  /** O que dizer quando não há opção nenhuma. */
  vazio: string;
  opcoes: OpcaoDoMenu[];
};

export type ContextoDoMenu = {
  jogadorId: string;
  /** O morador que a pessoa dirige, se dirige algum. */
  meuMoradorId: MoradorId | null;
};

const SEM_MORADOR = "Escolha um morador pelo retrato primeiro.";
const CUIDADO_DE_DORMIR = "por_para_dormir";

const CATEGORIAS: Record<string, string> = {
  armarios: "Armário",
  banheiro: "Peça do banheiro",
  cadeiras: "Cadeira",
  camas: "Cama",
  cozinha_eletros: "Eletrodoméstico",
  cozinha_moveis: "Armário de cozinha",
  criados: "Criado-mudo",
  estantes: "Estante",
  luminarias: "Luminária",
  mesas: "Mesa",
  objetos: "Objeto",
  quadros: "Quadro",
  racks_tv: "Rack",
  sofas: "Sofá",
  tapetes: "Tapete",
};

/** O nome de um objeto para a pessoa: o do tipo dele, ou o da categoria. */
export function nomeDoObjeto(catalogo: string): string {
  const entrada = doCatalogo(catalogo);
  if (!entrada) return "Objeto";
  return (
    comportamento(entrada.comportamento ?? "")?.rotulo ?? CATEGORIAS[entrada.categoria] ?? "Objeto"
  );
}

/**
 * Por que a interação não pode acontecer agora, em palavras; `null` se pode.
 * Quando o que falta é um requisito, descobre qual, aplicando a regra da
 * simulação a cada um em separado.
 */
export function motivoDaInteracao(
  estado: EstadoDoMundo,
  def: DefInteracao,
  ator: Morador,
  alvo: Alvo,
  jogadorId: string,
): string | null {
  const tick = estado.relogio.tick;
  const recusa = recusaDaInteracao(estado, def, ator, alvo, tick);
  if (recusa === "requisito") {
    for (const teste of def.requer) {
      if (recusaDaInteracao(estado, { ...def, requer: [teste] }, ator, alvo, tick)) {
        return textoDoRequisito(teste);
      }
    }
    return textoDaRecusa(recusa);
  }
  if (recusa) return textoDaRecusa(recusa);
  if (!temPontoLivre(estado, def, alvo)) return "Alguém já está usando.";
  if (def.permissao && !temPermissao(estado, jogadorId, ator.familiaId, def.permissao)) {
    return textoDaRecusa("sem_permissao", def.permissao);
  }
  return null;
}

function opcao(
  id: string,
  rotulo: string,
  moradorId: MoradorId | null,
  acao: AcaoPedida,
  motivo: string | null,
): OpcaoDoMenu {
  return motivo === null
    ? { id, rotulo, habilitada: true, moradorId, acao }
    : { id, rotulo, habilitada: false, motivo, moradorId, acao };
}

function menuDoObjeto(
  estado: EstadoDoMundo,
  objetoId: Extract<AlvoDoMenu, { t: "objeto" }>["objetoId"],
  ator: Morador | null,
  contexto: ContextoDoMenu,
): Menu | null {
  const objeto = obter(estado.objetos, objetoId);
  if (!objeto) return null;
  const oferecidas = comportamento(doCatalogo(objeto.catalogo)?.comportamento ?? "")?.interacoes;
  const alvo: Alvo = { t: "objeto", objetoId };
  const opcoes: OpcaoDoMenu[] = [];
  for (const id of oferecidas ?? []) {
    const def = interacao(id);
    if (!def) continue;
    const motivo = ator
      ? motivoDaInteracao(estado, def, ator, alvo, contexto.jogadorId)
      : SEM_MORADOR;
    opcoes.push(
      opcao(
        def.id,
        def.rotulo,
        ator?.id ?? null,
        { t: "interagir", interacao: def.id, alvo },
        motivo,
      ),
    );
  }
  return { titulo: nomeDoObjeto(objeto.catalogo), vazio: "Nada para fazer aqui.", opcoes };
}

/** O que impede pôr o bebê para dormir. As mesmas condições que o servidor confere. */
function motivoDeDormir(
  estado: EstadoDoMundo,
  cuidador: Morador | null,
  bebe: Morador,
): string | null {
  const onde = ondeEsta(estado, bebe, estado.relogio.tick);
  if (!onde) return textoDoDetalhe("longe") ?? null;
  const bercos = objetosDoLote(estado, onde.loteId).filter(
    (objeto) => doCatalogo(objeto.catalogo)?.comportamento === "berco",
  );
  if (bebe.local.t === "objeto" && bercos.some((berco) => berco.id === objetoDoLocal(bebe))) {
    return textoDoDetalhe("ja_no_berco") ?? null;
  }
  if (!bercos.some((berco) => berco.ocupacao[PONTO_DENTRO] === undefined)) {
    return textoDoDetalhe("sem_berco") ?? null;
  }
  if (cuidador) {
    if (bebe.local.t === "colo" && bebe.local.de !== cuidador.id) {
      return textoDoDetalhe("no_colo_de_outro") ?? null;
    }
    const carregado = bebeNoColoDe(estado, cuidador.id);
    if (carregado && carregado.id !== bebe.id) return textoDoDetalhe("maos_ocupadas") ?? null;
  }
  return null;
}

function objetoDoLocal(morador: Morador): string | null {
  return morador.local.t === "objeto" ? morador.local.objetoId : null;
}

/** Os cuidados que servem a um bebê ou a uma criança pequena, na ordem do conteúdo. */
function cuidadosDaFase(bebe: Morador): string[] {
  const porNecessidade = new Set(Object.values(CUIDADO_POR_NECESSIDADE[bebe.fase]));
  const extras = bebe.fase === "colo" ? ["ninar", "pegar_no_colo"] : [];
  const ids = CONTEUDO.interacoes
    .filter((def) => porNecessidade.has(def.id) || extras.includes(def.id))
    .map((def) => def.id);
  if (porNecessidade.has(CUIDADO_DE_DORMIR)) ids.push(CUIDADO_DE_DORMIR);
  return ids;
}

/**
 * As opções de cuidado. Quem executa é o morador que a pessoa dirige, se ele
 * pode cuidar; senão o pedido vai sem executor e a simulação escolhe um adulto
 * livre da casa.
 */
function opcoesDeCuidado(
  estado: EstadoDoMundo,
  bebe: Morador,
  ator: Morador | null,
  contexto: ContextoDoMenu,
): OpcaoDoMenu[] {
  const cuidador =
    ator && FASES_QUE_CUIDAM.includes(ator.fase) && ator.id !== bebe.id ? ator : null;
  const alvo: Alvo = { t: "morador", moradorId: bebe.id };
  const semAcesso = temPermissao(estado, contexto.jogadorId, bebe.familiaId, "comandar")
    ? null
    : textoDaRecusa("sem_acesso");
  return cuidadosDaFase(bebe).map((cuidado) => {
    const acao: AcaoPedida = cuidador
      ? { t: "cuidar", bebeId: bebe.id, cuidado, executorId: cuidador.id }
      : { t: "cuidar", bebeId: bebe.id, cuidado };
    if (cuidado === CUIDADO_DE_DORMIR) {
      return opcao(
        cuidado,
        "Pôr para dormir",
        ator?.id ?? null,
        acao,
        semAcesso ?? motivoDeDormir(estado, cuidador, bebe),
      );
    }
    const def = interacao(cuidado);
    const motivo =
      semAcesso ??
      (def && cuidador ? motivoDaInteracao(estado, def, cuidador, alvo, contexto.jogadorId) : null);
    return opcao(cuidado, def?.rotulo ?? cuidado, ator?.id ?? null, acao, motivo);
  });
}

function tipoDoPedido(def: DefInteracao): TipoDePedido | null {
  switch (def.especial) {
    case "propor_namoro":
      return "namoro";
    case "propor_casamento":
      return "casamento";
    case "propor_morar_junto":
      return "morar_junto";
    case "propor_bebe":
      return "bebe";
    default:
      return null;
  }
}

/** A interação faz sentido para a idade deste alvo. As outras nem aparecem. */
function serveParaAFase(def: DefInteracao, alvo: Morador): boolean {
  return def.requer.every((teste) => teste.t !== "alvo_na_fase" || teste.em.includes(alvo.fase));
}

function menuDoMorador(
  estado: EstadoDoMundo,
  moradorId: MoradorId,
  ator: Morador | null,
  contexto: ContextoDoMenu,
): Menu | null {
  const alvoMorador = obter(estado.moradores, moradorId);
  if (!alvoMorador) return null;
  const opcoes: OpcaoDoMenu[] = [];

  // O próprio morador: o que ele faz sozinho.
  if (ator && ator.id === moradorId) {
    const alvo: Alvo = { t: "proprio" };
    for (const def of CONTEUDO.interacoes) {
      if (def.alvo !== "proprio" || def.id === "dormir_no_chao") continue;
      if (!def.quem.includes(ator.fase)) continue;
      opcoes.push(
        opcao(
          def.id,
          def.rotulo,
          ator.id,
          { t: "interagir", interacao: def.id, alvo },
          motivoDaInteracao(estado, def, ator, alvo, contexto.jogadorId),
        ),
      );
    }
    return { titulo: alvoMorador.nome, vazio: "Nada para fazer sozinho agora.", opcoes };
  }

  const alvo: Alvo = { t: "morador", moradorId };
  if (alvoMorador.fase === "colo" || alvoMorador.fase === "pequeno") {
    opcoes.push(...opcoesDeCuidado(estado, alvoMorador, ator, contexto));
  }
  const cuidados = new Set(opcoes.map((o) => o.id));
  for (const def of CONTEUDO.interacoes) {
    if (def.alvo !== "morador" || def.id === "receber" || cuidados.has(def.id)) continue;
    if (!serveParaAFase(def, alvoMorador)) continue;
    // Despedir-se só faz sentido com quem está de visita.
    if (def.especial === "despedir" && alvoMorador.familiaId !== null) continue;
    // Quem não tem idade para a interação nem a vê no menu.
    if (ator && !def.quem.includes(ator.fase)) continue;

    const pedido = tipoDoPedido(def);
    if (pedido) {
      let motivo: string | null = SEM_MORADOR;
      if (ator) {
        const impedimento = impedimentoDoPedido(estado, pedido, ator, alvoMorador);
        motivo = impedimento
          ? (textoDoDetalhe(impedimento) ?? textoDaRecusa("requisito"))
          : motivoDaInteracao(estado, def, ator, alvo, contexto.jogadorId);
      }
      opcoes.push(
        opcao(
          def.id,
          def.rotulo,
          ator?.id ?? null,
          { t: "propor", tipo: pedido, alvoId: moradorId },
          motivo,
        ),
      );
      continue;
    }
    opcoes.push(
      opcao(
        def.id,
        def.rotulo,
        ator?.id ?? null,
        { t: "interagir", interacao: def.id, alvo },
        ator ? motivoDaInteracao(estado, def, ator, alvo, contexto.jogadorId) : SEM_MORADOR,
      ),
    );
  }
  return { titulo: alvoMorador.nome, vazio: "Nada para fazer com este morador agora.", opcoes };
}

/** O menu do alvo clicado; `null` se o alvo não existe mais. */
export function menuDoAlvo(
  estado: EstadoDoMundo,
  alvo: AlvoDoMenu,
  contexto: ContextoDoMenu,
): Menu | null {
  const ator = contexto.meuMoradorId
    ? (obter(estado.moradores, contexto.meuMoradorId) ?? null)
    : null;
  switch (alvo.t) {
    case "objeto":
      return menuDoObjeto(estado, alvo.objetoId, ator, contexto);
    case "morador":
      return menuDoMorador(estado, alvo.moradorId, ator, contexto);
    case "cuidados": {
      const bebe = obter(estado.moradores, alvo.bebeId);
      if (!bebe) return null;
      return {
        titulo: `Cuidar de ${bebe.nome}`,
        vazio: "Nenhum cuidado para esta idade.",
        opcoes: opcoesDeCuidado(estado, bebe, ator, contexto),
      };
    }
  }
}
