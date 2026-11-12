import type { EstadoDoCasal, Fase, Morador, MotivoDeRecusa } from "@informach/morada-sim";
import type { Humor, Teste } from "@informach/morada-sim/conteudo";
import { comportamento } from "@informach/morada-sim/conteudo";
import type { MotivoDeReabertura, MotivoDoFim } from "../rede/conexao";

/**
 * Tudo o que o jogo diz à pessoa quando algo não pode ser feito, em um lugar
 * só. Os motivos vêm do servidor como códigos; aqui viram frases.
 */

const MOTIVOS: Record<MotivoDeRecusa, string> = {
  mundo_errado: "Este pedido era de outro mundo. Tente de novo.",
  sem_sessao: "Você ainda está voltando para o mundo. Tente de novo em instantes.",
  sem_acesso: "Você não joga com esta família.",
  sem_permissao: "Você não tem permissão para isso neste mundo.",
  sem_reserva: "Escolha um morador pelo retrato antes de dar ordens.",
  reservado_por_outro: "Outra pessoa está dirigindo este morador.",
  versao_antiga: "O morador mudou enquanto você pedia. Tente de novo.",
  nao_existe: "Isso não existe mais.",
  fase_nao_permite: "Não é coisa para esta idade.",
  requisito: "Ainda não dá para fazer isso.",
  ocupado: "Está ocupado agora.",
  inalcancavel: "Não dá para chegar lá.",
  limite_da_familia: "A família já está no limite de moradores.",
  ja_resolvido: "Isso já foi resolvido.",
  politica_do_mundo: "As regras deste mundo não deixam.",
  comando_invalido: "O jogo não entendeu o pedido.",
};

/** Detalhes que o servidor manda junto do motivo e que mudam a frase. */
const DETALHES: Record<string, string> = {
  fila_cheia: "A fila já está cheia. Espere uma ação terminar ou cancele alguma.",
  sem_cuidador: "Não há ninguém livre na casa para cuidar agora.",
  executor: "Este morador não pode cuidar do bebê agora.",
  decidir_vida: "Você não tem permissão para decidir a vida desta família.",
  chamar_morador: "Você não tem permissão para chamar alguém para morar aqui.",
  proprio_pedido: "Quem responde ao pedido é a outra pessoa.",
  // Cuidado
  longe: "O bebê não está nesta casa.",
  no_colo_de_outro: "O bebê está no colo de outra pessoa.",
  ja_no_berco: "O bebê já está no berço.",
  sem_berco: "Não há berço livre na casa.",
  maos_ocupadas: "Já há outro bebê no colo.",
  // Pedidos de vida
  fase: "Só adultos decidem isso.",
  parentes: "São parentes.",
  ja_sao_casal: "Já são um casal.",
  precisa_namorar: "Precisam estar namorando.",
  precisa_ser_casal: "Só entre um casal.",
  sem_familia: "É preciso ter uma família para isso.",
  ja_moram_juntos: "Já moram juntos.",
  outra_familia: "Unir duas famílias ainda não é possível.",
  familia_cheia: "A família já está no limite de moradores.",
  ninguem_pode_gestar: "Nenhum dos dois pode gestar agora.",
};

export function textoDoDetalhe(detalhe: string): string | undefined {
  return DETALHES[detalhe];
}

function ehMotivo(motivo: string): motivo is MotivoDeRecusa {
  return Object.hasOwn(MOTIVOS, motivo);
}

/** A frase de uma recusa. Um motivo que este cliente ainda não conhece vira a frase genérica. */
export function textoDaRecusa(motivo: string, detalhe?: string): string {
  const doDetalhe = detalhe ? DETALHES[detalhe] : undefined;
  return doDetalhe ?? (ehMotivo(motivo) ? MOTIVOS[motivo] : MOTIVOS.requisito);
}

/** Por que um requisito de interação não passa, em palavras. */
export function textoDoRequisito(teste: Teste): string {
  switch (teste.t) {
    case "ator_carrega_bebe":
      return teste.valor
        ? "Só com um bebê no colo."
        : "Com o bebê no colo não dá. Acomode o bebê primeiro.";
    case "objeto_no_lote":
      return `Falta ${comportamento(teste.comportamento)?.rotulo ?? "um móvel"} na casa.`;
    case "alvo_na_fase":
      return "Não é coisa para a idade dele.";
    case "alvo_no_colo":
      return teste.valor ? "Só com o bebê no colo." : "O bebê já está no colo de alguém.";
    case "sem_parentesco":
      return "São parentes.";
    case "casal":
      if (teste.em.includes("nenhum")) return "Já são um casal.";
      if (teste.em.includes("casamento")) return "Só entre um casal.";
      return "Precisam estar namorando.";
    case "vinculo":
      if (teste.eixo === "romance") return "Ainda falta romance entre os dois.";
      if (teste.eixo === "confianca") return "Ainda falta confiança entre os dois.";
      return "Ainda falta amizade entre os dois.";
  }
}

const FIM: Record<MotivoDoFim, { titulo: string; texto: string }> = {
  saiu: { titulo: "Você saiu do mundo", texto: "O que aconteceu até aqui está salvo." },
  sessao: {
    titulo: "Sua sessão de jogo terminou",
    texto: "Volte ao Recreio e entre de novo para continuar de onde parou.",
  },
  sem_acesso: {
    titulo: "Sem acesso a este mundo",
    texto: "Peça um convite a quem cuida do mundo ou escolha outro na sua estante.",
  },
  acesso_encerrado: {
    titulo: "Seu acesso ao jogo acabou",
    texto: "O mundo foi salvo. Veja a sua conta no Recreio para voltar a jogar.",
  },
  substituida: {
    titulo: "Você entrou por outra janela",
    texto: "O jogo continua lá. Esta janela parou para não haver dois de você no mundo.",
  },
  protocolo: {
    titulo: "O jogo precisa ser atualizado",
    texto: "Esta página e o servidor estão em versões diferentes. Recarregue a página.",
  },
};

export function textoDoFim(motivo: MotivoDoFim): { titulo: string; texto: string } {
  return FIM[motivo];
}

const REABERTURA: Record<MotivoDeReabertura, string> = {
  rede: "A conexão caiu. Voltando ao mundo",
  posse: "O mundo mudou de servidor. Voltando",
  reiniciando: "O servidor está reiniciando. Voltando ao mundo",
  atrasado: "A conexão ficou lenta. Buscando o mundo de novo",
  cheio: "O servidor está cheio. Tentando de novo",
  lacuna: "Uma parte do mundo se perdeu no caminho. Buscando de novo",
  sem_sinal: "O servidor parou de responder. Voltando ao mundo",
  fonte: "O Recreio não respondeu. Tentando de novo",
};

export function textoDaReabertura(motivo: MotivoDeReabertura): string {
  return REABERTURA[motivo];
}

const FASES_F: Record<Fase, string> = {
  colo: "bebê",
  pequeno: "criança pequena",
  crianca: "criança",
  adolescente: "adolescente",
  adulto: "adulta",
  idoso: "idosa",
};

const FASES_M: Record<Fase, string> = { ...FASES_F, adulto: "adulto", idoso: "idoso" };

export function rotuloDaFase(morador: Pick<Morador, "fase" | "aparencia">): string {
  return (morador.aparencia.linha === "f" ? FASES_F : FASES_M)[morador.fase];
}

const HUMORES: Record<Humor, string> = {
  alegre: "Alegre",
  tranquilo: "Tranquilo",
  focado: "Focado",
  inspirado: "Inspirado",
  triste: "Triste",
  irritado: "Irritado",
  tenso: "Tenso",
  envergonhado: "Envergonhado",
  apaixonado: "Apaixonado",
};

export function rotuloDoHumor(humor: Humor): string {
  return HUMORES[humor];
}

const PEDIDOS = {
  namoro: "pediu em namoro",
  casamento: "pediu em casamento",
  morar_junto: "chamou para morar junto",
  bebe: "quer ter um bebê com",
} as const;

export function verboDoPedido(tipo: keyof typeof PEDIDOS): string {
  return PEDIDOS[tipo];
}

const CASAIS: Record<EstadoDoCasal, string> = {
  namoro: "estão namorando",
  casamento: "se casaram",
  ex: "se separaram",
  nenhum: "não são mais um casal",
};

export function verboDoCasal(casal: EstadoDoCasal): string {
  return CASAIS[casal];
}
