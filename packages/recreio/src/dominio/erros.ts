/**
 * Recusas que atravessam a fronteira do Recreio. O código é estável e vai para
 * o cliente; a mensagem é para registro e nunca carrega dado pessoal.
 */
export const CODIGOS_DE_ERRO = [
  "NAO_AUTENTICADO",
  "SEM_PERFIL",
  "ACESSO_NEGADO",
  "ACESSO_PERDIDO",
  "JOGO_INDISPONIVEL",
  "INGRESSO_INVALIDO",
  "SESSAO_INVALIDA",
  "SESSAO_ENCERRADA",
  "JA_ABERTO",
  "NAO_ENCONTRADO",
  "NAO_MEMBRO",
  "LIMITE_DE_MUNDOS",
  "MUNDO_CHEIO",
  "MUNDO_INDISPONIVEL",
  "POLITICA_INCOMPATIVEL",
  "CONVITE_INVALIDO",
  "JA_MEMBRO",
  "SEM_PERMISSAO",
  "SEM_INSTANCIA",
  "POSSE_PERDIDA",
  "POSSE_DE_OUTRA_INSTANCIA",
  "SEQUENCIA",
  "FATO_DUPLICADO",
  "REVISAO_DIVERGENTE",
  "CHECKPOINT_NECESSARIO",
  "CHECKPOINT_PENDENTE",
  "TAMANHO_EXCEDIDO",
  "ENTRADA_INVALIDA",
  "MUITAS_TENTATIVAS",
  "INDISPONIVEL",
] as const;

export type CodigoDeErro = (typeof CODIGOS_DE_ERRO)[number];

const STATUS: Record<CodigoDeErro, number> = {
  NAO_AUTENTICADO: 401,
  SEM_PERFIL: 409,
  ACESSO_NEGADO: 403,
  ACESSO_PERDIDO: 403,
  JOGO_INDISPONIVEL: 404,
  INGRESSO_INVALIDO: 401,
  SESSAO_INVALIDA: 401,
  SESSAO_ENCERRADA: 403,
  JA_ABERTO: 409,
  NAO_ENCONTRADO: 404,
  NAO_MEMBRO: 403,
  LIMITE_DE_MUNDOS: 409,
  MUNDO_CHEIO: 409,
  MUNDO_INDISPONIVEL: 409,
  POLITICA_INCOMPATIVEL: 403,
  CONVITE_INVALIDO: 404,
  JA_MEMBRO: 409,
  SEM_PERMISSAO: 403,
  SEM_INSTANCIA: 503,
  POSSE_PERDIDA: 409,
  POSSE_DE_OUTRA_INSTANCIA: 409,
  SEQUENCIA: 409,
  FATO_DUPLICADO: 409,
  REVISAO_DIVERGENTE: 409,
  CHECKPOINT_NECESSARIO: 409,
  CHECKPOINT_PENDENTE: 409,
  TAMANHO_EXCEDIDO: 413,
  ENTRADA_INVALIDA: 400,
  MUITAS_TENTATIVAS: 429,
  INDISPONIVEL: 503,
};

export function statusDoErro(codigo: CodigoDeErro): number {
  return STATUS[codigo];
}

export class ErroDoRecreio extends Error {
  readonly codigo: CodigoDeErro;
  /** Só dados estruturais (um endereço, um número esperado); nunca dado pessoal. */
  readonly detalhe: Readonly<Record<string, string | number | boolean | null>>;

  constructor(
    codigo: CodigoDeErro,
    detalhe: Record<string, string | number | boolean | null> = {},
    mensagem?: string,
  ) {
    super(mensagem ?? codigo);
    this.name = "ErroDoRecreio";
    this.codigo = codigo;
    this.detalhe = detalhe;
  }

  get status(): number {
    return STATUS[this.codigo];
  }
}

export function ehErroDoRecreio(erro: unknown, codigo?: CodigoDeErro): erro is ErroDoRecreio {
  return erro instanceof ErroDoRecreio && (codigo === undefined || erro.codigo === codigo);
}
