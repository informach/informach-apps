import { INFORMACH_CONTACT } from "@informach/config/contact";

export const SITE = {
  name: "Informach",
  legalName: "Informach Núcleo de Aprendizagem Ltda",
  cnpj: "43.588.758/0001-03",
  url: "https://informach.com.br",
  tagline: "Feito em casa, para a sua família.",
  founders: "Helena e Júlio",
  /** Páginas públicas não mostram e-mail: o contato é o direct do Instagram. */
  contact: INFORMACH_CONTACT,
  instagramUrl: `https://www.instagram.com/${INFORMACH_CONTACT.instagramHandle}/`,
} as const;
