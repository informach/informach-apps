export type Environment = "development" | "staging" | "production";

export const DOMAINS: Record<Environment, { agendaDaTurma: string; cozya: string }> = {
  development: {
    agendaDaTurma: "http://localhost:3001",
    cozya: "http://localhost:3002",
  },
  staging: {
    agendaDaTurma: "https://agenda-da-turma.staging.informach.com.br",
    cozya: "https://cozya.staging.informach.com.br",
  },
  production: {
    agendaDaTurma: "https://agenda-da-turma.informach.com.br",
    cozya: "https://cozya.informach.com.br",
  },
};
