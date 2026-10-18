import "server-only";

import { cache } from "react";
import { getTomorrowSubjectsForProfiles } from "./today-subjects-service";

/**
 * O horário de amanhã, memorizado por requisição.
 *
 * À noite a mochila do topo de Hoje e a folha "Amanhã" perguntam a mesma
 * coisa na mesma página; a segunda pergunta não vai ao banco. Os argumentos
 * são primitivos de propósito: `cache` compara por identidade, e um objeto de
 * opções novo a cada chamada nunca acertaria.
 */
export const getTomorrowSubjectsCached = cache((userId: string, profileFilter: string | null) =>
  getTomorrowSubjectsForProfiles(userId, { profileFilter }),
);
