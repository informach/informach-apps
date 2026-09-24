-- O recado por e-mail saiu do produto: na escola das famílias que usam a
-- Agenda, tarefa não chega por e-mail. O canal serve a assunto
-- administrativo e financeiro, e a premissa da feature estava errada.
--
-- A queda é segura: as duas tabelas nunca receberam linha em produção,
-- porque a feature dependia de um MX que nunca existiu. Migração para a
-- frente, como todas as outras — a 0060 fica no histórico.
DROP TABLE "agenda"."inbox_addresses" CASCADE;--> statement-breakpoint
DROP TABLE "agenda"."inbox_messages" CASCADE;