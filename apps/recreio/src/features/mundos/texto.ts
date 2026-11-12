import type { EstadoDeMembro, PapelNoMundo } from "@informach/recreio";

/** Como o portal chama cada papel e cada situação de membro. Só apresentação. */

const PAPEIS: Record<PapelNoMundo, string> = {
  steward: "Responsável",
  coadmin: "Coadministração",
  member: "Membro",
};

export function rotuloDoPapel(papel: PapelNoMundo): string {
  return PAPEIS[papel];
}

/** Só o que foge do normal aparece ao lado do nome; membro ativo não leva aviso. */
export function avisoDoMembro(estado: EstadoDeMembro): string | null {
  if (estado === "no_access") return "sem acesso aos jogos no momento";
  if (estado === "away") return "ausente";
  return null;
}

/** "1 pessoa", "3 pessoas". */
export function contagemDeMembros(total: number): string {
  return total === 1 ? "1 pessoa" : `${total} pessoas`;
}
