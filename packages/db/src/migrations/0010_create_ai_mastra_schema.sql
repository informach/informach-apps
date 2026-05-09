-- Schema dedicado para tabelas geridas pelo Mastra (mastra_threads,
-- mastra_messages, mastra_traces, mastra_scorers, mastra_evals,
-- mastra_workflow_snapshot, mastra_resources). Drizzle não gerencia este
-- schema (ai_mastra ausente do schemaFilter em drizzle.config.ts), então
-- db:generate nunca propõe DROP nem DDL contra ele. O migrator chama
-- PostgresStore.init() para criar/atualizar as tabelas dentro do schema.
CREATE SCHEMA IF NOT EXISTS "ai_mastra";
