/** Só IDs do recibo autorizado; o caminho nunca aceita uma URL de redirecionamento. */
export type DestinoDeVisita = { jogo: string; mundoId: string; visitaId: string };
export function caminhoDaVisita(destino: DestinoDeVisita) {
  return `/jogar/${encodeURIComponent(destino.jogo)}?${new URLSearchParams({ mundo: destino.mundoId, visita: destino.visitaId })}`;
}
