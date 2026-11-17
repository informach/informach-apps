/** O Node recebe SIGTERM diretamente como processo principal do contêiner. */
export const MORADA_START_COMMAND = ["node", "apps/morada-server/dist/main.mjs"] as const;
