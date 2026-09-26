import type { TrackDefinition } from "../types";
import { legacyTracks } from "./legacy";

/**
 * Registro das trilhas, por onda de publicação. Uma trilha só entra aqui
 * quando todas as habilidades dela existem em `skills/`; o catálogo recusa
 * habilidade desconhecida. Os `bankSeed` novos começam em 200 e avançam de
 * 24 em 24, para os intervalos de questões reservadas nunca se cruzarem.
 */
export const trackDefinitions: TrackDefinition[] = [...legacyTracks];
