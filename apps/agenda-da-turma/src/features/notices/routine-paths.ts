/**
 * As telas que mostram a rotina, e que por isso envelhecem juntas.
 *
 * Mora fora de `actions.ts` porque a lista tem dois consumidores — as server
 * actions e a rota de status da fila offline — e duas cópias divergem na
 * primeira vez que uma tela nova entrar na rotina. `"use server"` exporta só
 * funções assíncronas, então a constante não podia ficar lá.
 */
export const ROUTINE_PATHS = ["/dashboard", "/recados", "/calendario", "/atividades"] as const;
