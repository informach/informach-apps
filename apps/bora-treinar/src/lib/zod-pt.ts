import { z } from "zod";

/**
 * Mensagens do zod em português, no navegador e no servidor. Sem isso o editor mostrava o texto
 * cru da biblioteca ("Too small: expected string to have >=1 characters"). Importado pelos
 * schemas que validam na tela; os campos importantes ainda têm mensagem própria, mais clara.
 */
z.config(z.locales.ptBR());
