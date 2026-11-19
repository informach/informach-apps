import { listar } from "../dominio/tabela";
import type { EstadoDoMundo } from "../dominio/tipos";
import { ticksPorDia } from "../nucleo/relogio";

/** Projeção pública derivada do estado, compartilhada por salvamento e direitos. */
export function resumoDoEstadoDoMorada(estado: EstadoDoMundo): {
  titulo: string;
  subtitulo: string;
} {
  const familias = listar(estado.familias);
  const moradores = listar(estado.moradores).filter((m) => m.familiaId !== null).length;
  const dia = Math.floor(estado.relogio.tick / ticksPorDia(estado.relogio)) + 1;
  return {
    titulo: familias
      .map((f) => `Família ${f.nome}`)
      .join(" e ")
      .slice(0, 60),
    subtitulo: `Dia ${dia} · ${moradores} ${moradores === 1 ? "morador" : "moradores"}`,
  };
}
