import type { GrupoId, PerfilId } from "./ids";

/**
 * Direito de jogar. Uma função só decide, a partir de fatos já carregados:
 * plano, teste, situação do pagamento, sanções e concessões auditadas. Não lê
 * banco nem relógio; quem chama entrega `agora`.
 */

export type EstadoDeAcesso =
  | "SEM_ACESSO"
  | "TESTE"
  | "TESTE_ENCERRADO"
  | "ATIVO"
  | "CANCELAMENTO_AGENDADO"
  | "PAGAMENTO_PENDENTE"
  | "ENCERRADO"
  | "SUSPENSO"
  | "REVOGADO";

export type MotivoDeRecusa =
  | "perfil_suspenso"
  | "perfil_sem_cobertura"
  | "pagamento_pendente"
  | "concessao_revogada"
  | "teste_encerrado"
  | "assinatura_encerrada"
  | "concessao_encerrada"
  | "sem_plano";

export type TierDoPlano = "individual" | "family";

/** Situações que o `@informach/billing` espelha da Stripe. */
export type StatusDaAssinatura =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "canceled"
  | "paused";

/** O mesmo conjunto de `PRO_STATUSES` do billing: só estes dão acesso. */
export const STATUS_QUE_JOGAM: readonly StatusDaAssinatura[] = ["active", "trialing"];

/** Cobrança em aberto: sem acesso enquanto pendente, como nos outros apps. */
export const STATUS_PENDENTES: readonly StatusDaAssinatura[] = ["past_due", "unpaid", "incomplete"];

export type AssinaturaDoGrupo = {
  id: string;
  status: StatusDaAssinatura;
  tier: TierDoPlano;
  /** Data em que o acesso termina por cancelamento agendado, se houver. */
  cancelaEm: Date | null;
};

export type TipoDeConcessao = "courtesy" | "trial";

export type Concessao = {
  id: string;
  kind: TipoDeConcessao;
  tier: TierDoPlano;
  inicio: Date;
  fim: Date;
  revogadaEm: Date | null;
};

export type FatosDeAcesso = {
  agora: Date;
  perfil: {
    id: PerfilId;
    status: "active" | "suspended";
    grupoId: GrupoId | null;
    /** O grupo cobre este perfil (dentro do limite do plano). */
    coberto: boolean;
    versaoDaPolitica: number;
  };
  assinatura: AssinaturaDoGrupo | null;
  /** O grupo já teve alguma assinatura, mesmo encerrada. */
  teveAssinatura: boolean;
  concessoes: readonly Concessao[];
};

export type DecisaoDeAcesso = {
  estado: EstadoDeAcesso;
  podeJogar: boolean;
  motivo: MotivoDeRecusa | null;
  origem: "assinatura" | "concessao" | null;
  origemId: string | null;
  /** Quantos perfis o plano em vigor cobre; 0 quando não há plano. */
  limiteDePerfis: number;
  /** Fim conhecido do acesso. A sessão de jogo nunca passa desta data. */
  validoAte: Date | null;
  versaoDaPolitica: number;
};

export function limiteDePerfisDoTier(tier: TierDoPlano): number {
  return tier === "family" ? 4 : 1;
}

function concessaoVigente(concessao: Concessao, agora: Date): boolean {
  return (
    concessao.revogadaEm === null &&
    concessao.inicio.getTime() <= agora.getTime() &&
    agora.getTime() < concessao.fim.getTime()
  );
}

/** Cortesia vem antes de teste; entre iguais, a que termina por último. */
function melhorConcessao(concessoes: readonly Concessao[], agora: Date): Concessao | null {
  let melhor: Concessao | null = null;
  for (const concessao of concessoes) {
    if (!concessaoVigente(concessao, agora)) continue;
    if (melhor === null) {
      melhor = concessao;
      continue;
    }
    const cortesiaGanha = concessao.kind === "courtesy" && melhor.kind !== "courtesy";
    const mesmaClasse = concessao.kind === melhor.kind;
    if (cortesiaGanha || (mesmaClasse && concessao.fim.getTime() > melhor.fim.getTime())) {
      melhor = concessao;
    }
  }
  return melhor;
}

function maisRecente(concessoes: readonly Concessao[]): Concessao | null {
  let ultima: Concessao | null = null;
  for (const concessao of concessoes) {
    if (ultima === null || concessao.inicio.getTime() > ultima.inicio.getTime()) ultima = concessao;
  }
  return ultima;
}

export function decidirAcesso(fatos: FatosDeAcesso): DecisaoDeAcesso {
  const versaoDaPolitica = fatos.perfil.versaoDaPolitica;
  const recusa = (estado: EstadoDeAcesso, motivo: MotivoDeRecusa): DecisaoDeAcesso => ({
    estado,
    podeJogar: false,
    motivo,
    origem: null,
    origemId: null,
    limiteDePerfis: 0,
    validoAte: null,
    versaoDaPolitica,
  });

  if (fatos.perfil.status === "suspended") return recusa("SUSPENSO", "perfil_suspenso");
  if (fatos.perfil.grupoId === null || !fatos.perfil.coberto) {
    return recusa("SEM_ACESSO", "perfil_sem_cobertura");
  }

  const assinatura = fatos.assinatura;
  if (assinatura !== null && STATUS_QUE_JOGAM.includes(assinatura.status)) {
    return {
      estado: assinatura.cancelaEm === null ? "ATIVO" : "CANCELAMENTO_AGENDADO",
      podeJogar: true,
      motivo: null,
      origem: "assinatura",
      origemId: assinatura.id,
      limiteDePerfis: limiteDePerfisDoTier(assinatura.tier),
      validoAte: assinatura.cancelaEm,
      versaoDaPolitica,
    };
  }

  const concessao = melhorConcessao(fatos.concessoes, fatos.agora);
  if (concessao !== null) {
    return {
      estado: concessao.kind === "courtesy" ? "ATIVO" : "TESTE",
      podeJogar: true,
      motivo: null,
      origem: "concessao",
      origemId: concessao.id,
      limiteDePerfis: limiteDePerfisDoTier(concessao.tier),
      validoAte: concessao.fim,
      versaoDaPolitica,
    };
  }

  if (assinatura !== null && STATUS_PENDENTES.includes(assinatura.status)) {
    return recusa("PAGAMENTO_PENDENTE", "pagamento_pendente");
  }

  const ultima = maisRecente(fatos.concessoes);
  if (ultima !== null && ultima.revogadaEm !== null)
    return recusa("REVOGADO", "concessao_revogada");
  if (fatos.teveAssinatura) return recusa("ENCERRADO", "assinatura_encerrada");
  if (ultima !== null) {
    return ultima.kind === "trial"
      ? recusa("TESTE_ENCERRADO", "teste_encerrado")
      : recusa("ENCERRADO", "concessao_encerrada");
  }
  return recusa("SEM_ACESSO", "sem_plano");
}
