import type { ContaId, PerfilId } from "./ids";
import type { PoliticaEfetivaDoMenor } from "./politicas";

export type PerfilSocial = {
  id: PerfilId;
  ativo: boolean;
} & (
  | { tipo: "adulto" }
  | {
      tipo: "protegido";
      reconhecida: boolean;
      politica: Pick<PoliticaEfetivaDoMenor, "contatos" | "faixaSocial" | "presenca">;
      responsabilidade: { contaId: ContaId; vinculoId: string; geracao: string };
    }
);

/** Fato relido no servidor, nunca prova enviada pelo navegador ou pelo jogo. */
export type AprovacaoSocial = {
  perfilId: PerfilId;
  contaId: ContaId;
  vinculoId: string;
  geracao: string;
};
export type RelacaoSocial = {
  bloqueadoPorUmaDasPartes: boolean;
  amizadeAceita: boolean;
  aprovacaoDaOrigem: AprovacaoSocial | null;
  aprovacaoDoDestino: AprovacaoSocial | null;
};

export function contatoDisponivel(perfil: PerfilSocial): boolean {
  return (
    perfil.ativo &&
    (perfil.tipo === "adulto" || (perfil.reconhecida && perfil.politica.contatos !== "disabled"))
  );
}
export function exigeAprovacaoDoResponsavel(perfil: PerfilSocial): boolean {
  return (
    perfil.tipo === "protegido" &&
    (perfil.politica.faixaSocial === "ate_12" || perfil.politica.contatos === "approval")
  );
}
export function aprovacaoSocialAtual(
  perfil: PerfilSocial,
  aprovacao: AprovacaoSocial | null,
): boolean {
  if (!exigeAprovacaoDoResponsavel(perfil)) return true;
  return (
    perfil.tipo === "protegido" &&
    aprovacao?.perfilId === perfil.id &&
    aprovacao.contaId === perfil.responsabilidade.contaId &&
    aprovacao.vinculoId === perfil.responsabilidade.vinculoId &&
    aprovacao.geracao === perfil.responsabilidade.geracao
  );
}

/** Sem assinatura, relógio, busca pública ou autoridade sobre mundos. */
export function decidirPedidoDeAmizade(entrada: {
  origem: PerfilSocial;
  destino: PerfilSocial;
  codigoVigente: boolean;
  bloqueadoPorUmaDasPartes: boolean;
}):
  | { permitido: false; motivo: "origem" | "destino" | "codigo" | "bloqueio" | "proprio" }
  | {
      permitido: true;
      aprovarOrigem: boolean;
      aprovarDestino: boolean;
      avisarResponsavelDaOrigem: boolean;
      avisarResponsavelDoDestino: boolean;
    } {
  if (!contatoDisponivel(entrada.origem)) return { permitido: false, motivo: "origem" };
  if (!entrada.codigoVigente) return { permitido: false, motivo: "codigo" };
  if (entrada.origem.id === entrada.destino.id) return { permitido: false, motivo: "proprio" };
  if (entrada.bloqueadoPorUmaDasPartes) return { permitido: false, motivo: "bloqueio" };
  if (!contatoDisponivel(entrada.destino)) return { permitido: false, motivo: "destino" };
  return {
    permitido: true,
    aprovarOrigem: exigeAprovacaoDoResponsavel(entrada.origem),
    aprovarDestino: exigeAprovacaoDoResponsavel(entrada.destino),
    avisarResponsavelDaOrigem: entrada.origem.tipo === "protegido",
    avisarResponsavelDoDestino: entrada.destino.tipo === "protegido",
  };
}

export function amizadeDisponivel(
  origem: PerfilSocial,
  destino: PerfilSocial,
  relacao: RelacaoSocial,
): boolean {
  return (
    origem.id !== destino.id &&
    contatoDisponivel(origem) &&
    contatoDisponivel(destino) &&
    !relacao.bloqueadoPorUmaDasPartes &&
    relacao.amizadeAceita &&
    aprovacaoSocialAtual(origem, relacao.aprovacaoDaOrigem) &&
    aprovacaoSocialAtual(destino, relacao.aprovacaoDoDestino)
  );
}

/** Somente estado online; o resultado não contém local, rotina ou conteúdo do jogo. */
export function presencaSocialVisivel(entrada: {
  observador: PerfilSocial;
  observado: PerfilSocial;
  relacao: RelacaoSocial;
  preferenciaDoAdulto: "online" | "friends" | "invisible";
  membrosDoMesmoMundo: boolean;
}): boolean {
  const { observador, observado, relacao } = entrada;
  if (
    observador.id === observado.id ||
    relacao.bloqueadoPorUmaDasPartes ||
    !contatoDisponivel(observador) ||
    !contatoDisponivel(observado)
  )
    return false;
  const preferencia =
    observado.tipo === "protegido" ? observado.politica.presenca : entrada.preferenciaDoAdulto;
  if (preferencia === "invisible") return false;
  if (amizadeDisponivel(observador, observado, relacao)) return true;
  // A superfície só conhece não amigos por uma participação de mundo atual.
  // Uma participação comercial ou código de amizade não comprova esse vínculo.
  return (
    observado.tipo === "adulto" &&
    observador.tipo === "adulto" &&
    preferencia === "online" &&
    entrada.membrosDoMesmoMundo
  );
}
