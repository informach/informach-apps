import type { EstadoDeAcesso } from "../dominio/acesso";

/** A mesma união de `EstadoDeAcesso`, como lista, para os esquemas de transporte. */
export const ESTADOS_DE_ACESSO_LISTA = [
  "SEM_ACESSO",
  "TESTE",
  "TESTE_ENCERRADO",
  "ATIVO",
  "CANCELAMENTO_AGENDADO",
  "PAGAMENTO_PENDENTE",
  "ENCERRADO",
  "SUSPENSO",
  "REVOGADO",
] as const satisfies readonly EstadoDeAcesso[];

// Se um estado novo entrar na união e faltar aqui, esta linha deixa de compilar.
const _todos: EstadoDeAcesso extends (typeof ESTADOS_DE_ACESSO_LISTA)[number] ? true : never = true;
void _todos;
