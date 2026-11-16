import {
  listar,
  type Mundo,
  PERMISSOES_DE_QUEM_DIVIDE,
  PERMISSOES_DO_FUNDADOR,
} from "@informach/morada-sim";
import type { EntradaPermitida } from "@informach/recreio/host";

/**
 * Projeção atual do Recreio, separada do direito do fundador registrado no mundo.
 * Os IDs aqui são de membros, como na admissão; não são e-mails ou nomes.
 * Hoje os acessos vêm da fundação e desta projeção. Novas concessões próprias
 * do jogo precisam de proveniência própria antes de entrar neste contrato.
 */
export function reconciliarAcessos(
  mundo: Mundo,
  jogadorId: string,
  entrada: Pick<EntradaPermitida, "papel" | "participacao">,
): boolean {
  const familias = listar(mundo.estado.familias);
  const participacao = entrada.participacao;
  const indicada =
    participacao === null
      ? familias[0]
      : participacao.startsWith("familia:")
        ? familias.find((f) => f.id === participacao.slice("familia:".length))
        : undefined;
  // Um convite para uma família ausente não concede a primeira por aproximação.
  if (entrada.papel !== "steward" && participacao !== null && !indicada) return false;

  const esperados = new Map<string, typeof PERMISSOES_DO_FUNDADOR>();
  const fundacao = mundo.estado.fundacao;
  if (fundacao?.autor === jogadorId && familias.some((f) => f.id === fundacao.familiaId))
    esperados.set(fundacao.familiaId, PERMISSOES_DO_FUNDADOR);
  if (entrada.papel === "steward") {
    for (const familia of familias) esperados.set(familia.id, PERMISSOES_DO_FUNDADOR);
  } else if (indicada && !esperados.has(indicada.id)) {
    esperados.set(indicada.id, PERMISSOES_DE_QUEM_DIVIDE);
  }

  for (const acesso of [...mundo.estado.acessos]) {
    if (acesso.perfilId !== jogadorId || esperados.has(acesso.familiaId)) continue;
    const resultado = mundo.aplicar({
      t: "revogar_acesso",
      perfilId: jogadorId,
      familiaId: acesso.familiaId,
    });
    if (!resultado.ok) throw new Error("Não foi possível reconciliar o acesso ao mundo.");
  }
  for (const familia of familias) {
    const permissoes = esperados.get(familia.id);
    if (!permissoes) continue;
    const atual = mundo.estado.acessos.find(
      (a) => a.perfilId === jogadorId && a.familiaId === familia.id,
    );
    if (
      atual &&
      atual.permissoes.length === permissoes.length &&
      permissoes.every((p) => atual.permissoes.includes(p))
    )
      continue;
    const resultado = mundo.aplicar({
      t: "conceder_acesso",
      perfilId: jogadorId,
      familiaId: familia.id,
      permissoes: [...permissoes],
    });
    if (!resultado.ok) throw new Error("Não foi possível reconciliar o acesso ao mundo.");
  }
  return true;
}
