import type { TrackDefinition } from "../types";
import { legacyTracks } from "./legacy";
import { wave1aTracks } from "./wave-1a";
import { wave1bTracks } from "./wave-1b";
import { wave2Tracks } from "./wave-2";

/**
 * Registro das trilhas, por onda de publicação. Uma trilha só entra aqui
 * quando todas as habilidades dela existem em `skills/`; o catálogo recusa
 * habilidade desconhecida. Os `bankSeed` novos começam em 200 e avançam de
 * 24 em 24, para os intervalos de questões reservadas nunca se cruzarem.
 *
 * Cada onda é um arquivo. O inventário usa essa divisão para ordenar os
 * bancos reservados: os bancos de uma onda entram logo depois da última
 * habilidade que alguma trilha da onda usa, e assim cada onda fecha em uma
 * faixa contígua de lotes de autoria.
 */
export const trackWaves: TrackDefinition[][] = [
  legacyTracks,
  wave1aTracks,
  wave1bTracks,
  wave2Tracks,
];
export const trackDefinitions: TrackDefinition[] = trackWaves.flat();
