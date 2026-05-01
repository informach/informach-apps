export type AppMetadata = {
  slug: string;
  name: string;
  domain: string;
};

export const APPS = {
  agendaDaTurma: {
    slug: "agenda-da-turma",
    name: "Agenda da Turma",
    domain: "agenda-da-turma.informach.com.br",
  },
  cozya: {
    slug: "cozya",
    name: "Cozya",
    domain: "cozya.informach.com.br",
  },
} as const satisfies Record<string, AppMetadata>;

export type AppKey = keyof typeof APPS;
