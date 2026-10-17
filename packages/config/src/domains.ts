export type Environment = "development" | "staging" | "production";

export const DOMAINS: Record<Environment, { agendaDaTurma: string; cozya: string; edi: string }> = {
  development: {
    edi: "http://localhost:3006",
    agendaDaTurma: "http://localhost:3001",
    cozya: "http://localhost:3002",
  },
  staging: {
    edi: "https://edi.staging.informach.com.br",
    agendaDaTurma: "https://agenda-da-turma.staging.informach.com.br",
    cozya: "https://cozya.staging.informach.com.br",
  },
  production: {
    edi: "https://edi.informach.com.br",
    agendaDaTurma: "https://agenda-da-turma.informach.com.br",
    cozya: "https://cozya.informach.com.br",
  },
};
