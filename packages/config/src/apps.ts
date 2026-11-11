export type CollectionId = "compasso" | "edi" | "recreio";

export type AppMetadata = {
  slug: string;
  name: string;
  domain: string;
  localPort: number;
  collection: CollectionId | null;
  published: boolean;
  /** Authenticated app page containing its own export/cleanup controls. */
  privacyPath?: `/${string}`;
};

export const APPS = {
  conta: {
    slug: "conta",
    name: "Minha conta",
    domain: "conta.informach.com.br",
    localPort: 3011,
    collection: null,
    published: false,
  },
  edi: {
    slug: "edi",
    name: "Suíte Edi",
    domain: "edi.informach.com.br",
    localPort: 3006,
    collection: "edi",
    published: true,
  },
  missaoSaber: {
    slug: "missao-saber",
    name: "Missão Saber",
    domain: "missao-saber.informach.com.br",
    localPort: 3005,
    collection: "compasso",
    published: true,
    privacyPath: "/familia/conta",
  },
  boraTreinar: {
    slug: "bora-treinar",
    name: "Bora Treinar",
    domain: "bora-treinar.informach.com.br",
    localPort: 3007,
    collection: "compasso",
    published: true,
    privacyPath: "/conta",
  },
  diaDeEstrela: {
    slug: "dia-de-estrela",
    name: "Dia de Estrela",
    domain: "dia-de-estrela.informach.com.br",
    localPort: 3008,
    collection: "compasso",
    published: false,
    privacyPath: "/ajustes",
  },
  agendaDaTurma: {
    slug: "agenda-da-turma",
    name: "Agenda da Turma",
    domain: "agenda-da-turma.informach.com.br",
    localPort: 3001,
    collection: "compasso",
    published: true,
    privacyPath: "/settings/account",
  },
  cozya: {
    slug: "cozya",
    name: "Cozya",
    domain: "cozya.informach.com.br",
    localPort: 3002,
    collection: "compasso",
    published: true,
    privacyPath: "/settings/account",
  },
} as const satisfies Record<string, AppMetadata>;

export type AppKey = keyof typeof APPS;
export type AppSlug = (typeof APPS)[AppKey]["slug"];

export function findApp(slug: string): AppMetadata | undefined {
  return Object.values(APPS).find((app) => app.slug === slug);
}
