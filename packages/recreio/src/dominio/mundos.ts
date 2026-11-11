import type { MembroId } from "./ids";

/**
 * Regras do mundo (GameSpace) que não dependem do jogo. Jogar sozinho é um
 * mundo com um membro. Família do Morada, grupo de assinatura e mundo são
 * coisas diferentes: aqui só existe o mundo e quem participa dele.
 */

export const PAPEIS_NO_MUNDO = ["steward", "coadmin", "member"] as const;
/** `steward` é o responsável: configura, convida e nomeia coadministradores. */
export type PapelNoMundo = (typeof PAPEIS_NO_MUNDO)[number];

export const ESTADOS_DE_MEMBRO = ["active", "no_access", "away", "former"] as const;
/**
 * `no_access`: o perfil perdeu o direito de jogar, mas continua membro.
 * `former`: saiu ou teve a conta excluída; o conteúdo do mundo permanece.
 */
export type EstadoDeMembro = (typeof ESTADOS_DE_MEMBRO)[number];

export const ESTADOS_DE_MUNDO = ["active", "hibernating", "archived", "deleted"] as const;
export type EstadoDeMundo = (typeof ESTADOS_DE_MUNDO)[number];

export const MEMBROS_CONVIDAM = ["no", "with_approval", "yes"] as const;
export type MembrosConvidam = (typeof MEMBROS_CONVIDAM)[number];

export const FORMAS_DE_CONVITE = ["member", "visit"] as const;
export type FormaDeConvite = (typeof FORMAS_DE_CONVITE)[number];

export const NOME_DE_MUNDO = { min: 2, max: 40 } as const;
export const APELIDO = { min: 2, max: 20 } as const;
/** Texto opaco que o jogo define no convite e recebe de volta na entrada. */
export const PARTICIPACAO_MAX = 64;

export function nomeDeMundoValido(nome: string): boolean {
  const limpo = nome.trim();
  return limpo.length >= NOME_DE_MUNDO.min && limpo.length <= NOME_DE_MUNDO.max;
}

export type MembroParaSucessao = {
  id: MembroId;
  papel: PapelNoMundo;
  estado: EstadoDeMembro;
  entrouEm: Date;
};

/**
 * Quem assume quando o responsável sai: o coadministrador ativo mais antigo;
 * sem coadministrador, o membro ativo mais antigo. Sem ninguém, o mundo fica
 * sem responsável e hiberna; nunca é apagado.
 */
export function sucessorDoResponsavel(
  membros: readonly MembroParaSucessao[],
): MembroParaSucessao | null {
  const candidatos = membros.filter(
    (membro) => membro.estado === "active" && membro.papel !== "steward",
  );
  const ordem = (a: MembroParaSucessao, b: MembroParaSucessao) =>
    a.entrouEm.getTime() - b.entrouEm.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const coadmins = candidatos.filter((membro) => membro.papel === "coadmin").sort(ordem);
  if (coadmins[0]) return coadmins[0];
  return candidatos.sort(ordem)[0] ?? null;
}

export type DecisaoDeConvite =
  | { pode: true; precisaDeAprovacao: boolean }
  | { pode: false; motivo: "papel" | "forma" };

/**
 * Quem pode convidar. Responsável e coadministradores sempre. Membros seguem a
 * opção do mundo; com "sim", só para a própria família ou como visita, e isso
 * quem confere é o jogo. Na etapa 1 só o responsável convida (ver
 * `SO_RESPONSAVEL_CONVIDA`).
 */
export function podeConvidar(
  papel: PapelNoMundo,
  membrosConvidam: MembrosConvidam,
): DecisaoDeConvite {
  if (papel === "steward" || papel === "coadmin") return { pode: true, precisaDeAprovacao: false };
  if (membrosConvidam === "no") return { pode: false, motivo: "papel" };
  return { pode: true, precisaDeAprovacao: membrosConvidam === "with_approval" };
}
