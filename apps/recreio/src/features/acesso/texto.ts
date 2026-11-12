import type { DecisaoDeAcesso } from "@informach/recreio";

/**
 * O direito de jogar como a pessoa lê, na estante e na conta. Só apresentação:
 * a decisão já veio pronta de `avaliarAcesso`.
 */
export type TextoDoAcesso = {
  titulo: string;
  texto: string;
  /** `ok`: pode jogar. `parado`: não pode. */
  tom: "ok" | "parado";
};

const dia = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

/** "11 de dezembro de 2026", no horário de Brasília. */
export function dataPorExtenso(data: Date): string {
  return dia.format(data);
}

export function descreverAcesso(
  decisao: Pick<DecisaoDeAcesso, "estado" | "origem" | "validoAte">,
  opcoes: { fechado: boolean },
): TextoDoAcesso {
  const ate = decisao.validoAte ? dataPorExtenso(decisao.validoAte) : null;
  switch (decisao.estado) {
    case "ATIVO":
      if (decisao.origem === "concessao")
        return {
          titulo: ate ? `Acesso ativo até ${ate}` : "Acesso ativo",
          texto: "Você joga por convite da equipe do Recreio.",
          tom: "ok",
        };
      return {
        titulo: "Assinatura ativa",
        texto: "O seu plano está em dia.",
        tom: "ok",
      };
    case "CANCELAMENTO_AGENDADO":
      return {
        titulo: ate ? `Acesso ativo até ${ate}` : "Acesso ativo",
        texto: "A assinatura foi cancelada e não renova. Até essa data, tudo continua igual.",
        tom: "ok",
      };
    case "TESTE":
      return {
        titulo: ate ? `Período de teste até ${ate}` : "Período de teste",
        texto: "Durante o teste, os jogos ficam abertos para você.",
        tom: "ok",
      };
    case "TESTE_ENCERRADO":
      return {
        titulo: "O período de teste terminou",
        texto: "O seu perfil e os seus mundos continuam guardados.",
        tom: "parado",
      };
    case "PAGAMENTO_PENDENTE":
      return {
        titulo: "Pagamento pendente",
        texto:
          "Não conseguimos confirmar o último pagamento. O acesso volta assim que ele for confirmado.",
        tom: "parado",
      };
    case "ENCERRADO":
      return {
        titulo: "O seu acesso terminou",
        texto: opcoes.fechado
          ? "O período que a equipe liberou chegou ao fim. O seu perfil e os seus mundos continuam guardados."
          : "O seu perfil e os seus mundos continuam guardados.",
        tom: "parado",
      };
    case "REVOGADO":
      return {
        titulo: "O acesso foi encerrado pela equipe",
        texto: "O seu perfil e os seus mundos continuam guardados.",
        tom: "parado",
      };
    case "SUSPENSO":
      return {
        titulo: "Este perfil está suspenso",
        texto: "Enquanto durar a suspensão, este perfil não entra nos jogos.",
        tom: "parado",
      };
    case "SEM_ACESSO":
      return opcoes.fechado
        ? {
            titulo: "Acesso por convite da equipe",
            texto:
              "Nesta fase, os jogos abrem só para quem a equipe convidou. A sua conta e o seu perfil já estão prontos para quando o convite chegar.",
            tom: "parado",
          }
        : {
            titulo: "Você ainda não tem um plano",
            texto:
              "Os planos do Recreio ainda não estão à venda. A sua conta e o seu perfil já estão prontos.",
            tom: "parado",
          };
  }
}
