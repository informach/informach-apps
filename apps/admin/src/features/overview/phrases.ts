import type { ServiceKey } from "@/lib/products";

/**
 * Artigo e preposição de cada serviço, para frases inteiras: "A Suíte Edi está
 * fora do ar", "2 no Cozya e 1 na Agenda da Turma".
 */
export const SERVICE_SUBJECT: Record<
  ServiceKey,
  { the: string; inThe: string; feminine: boolean }
> = {
  site: { the: "O site Informach", inThe: "no site", feminine: false },
  cozya: { the: "O Cozya", inThe: "no Cozya", feminine: false },
  "agenda-da-turma": { the: "A Agenda da Turma", inThe: "na Agenda da Turma", feminine: true },
  "missao-saber": { the: "A Missão Saber", inThe: "na Missão Saber", feminine: true },
  edi: { the: "A Suíte Edi", inThe: "na Suíte Edi", feminine: true },
};

export function inProduct(app: string): string {
  return SERVICE_SUBJECT[app as ServiceKey]?.inThe ?? `em ${app}`;
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
