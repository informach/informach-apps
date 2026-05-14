export type AppEntry = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  audience: string;
  status: "live" | "soon";
};

export const APPS: ReadonlyArray<AppEntry> = [
  {
    slug: "cozya",
    name: "Cozya",
    tagline: "Cozinhe sem digitar receita.",
    description:
      "Capture receita por foto, voz ou só uma ideia. A IA estrutura em segundos pra você cozinhar sem ficar caçando print no celular.",
    url: "https://cozya.informach.com.br",
    audience: "Pra quem cozinha em casa.",
    status: "live",
  },
  {
    slug: "agenda-da-turma",
    name: "Agenda da Turma",
    tagline: "Organize a rotina escolar sem perder recado.",
    description:
      "Centralize tarefas, provas, recados e calendário dos filhos. A IA ajuda a transformar foto, áudio ou PDF da escola em atividades organizadas.",
    url: "https://agenda-da-turma.informach.com.br",
    audience: "Pra famílias com filhos na escola.",
    status: "live",
  },
] as const;
