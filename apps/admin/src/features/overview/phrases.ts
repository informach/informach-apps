import type { ServiceKey } from "@/lib/products";

/**
 * Artigo e preposição de cada serviço, para frases inteiras: "A Suíte Edi está
 * fora do ar", "2 no Cozya e 1 na Agenda da Turma".
 */
export const SERVICE_SUBJECT: Record<
  ServiceKey,
  { the: string; inThe: string; feminine: boolean }
> = {
  recreio: { the: "O Recreio", inThe: "no Recreio", feminine: false },
  "morada-server": { the: "O servidor do Morada", inThe: "no servidor do Morada", feminine: false },
  site: { the: "O site Informach", inThe: "no site", feminine: false },
  cozya: { the: "O Cozya", inThe: "no Cozya", feminine: false },
  "agenda-da-turma": { the: "A Agenda da Turma", inThe: "na Agenda da Turma", feminine: true },
  "missao-saber": { the: "A Missão Saber", inThe: "na Missão Saber", feminine: true },
  "bora-treinar": { the: "O Bora Treinar", inThe: "no Bora Treinar", feminine: false },
  "dia-de-estrela": { the: "O Dia de Estrela", inThe: "no Dia de Estrela", feminine: false },
  edi: { the: "A Suíte Edi", inThe: "na Suíte Edi", feminine: true },
};

export function inProduct(app: string): string {
  return SERVICE_SUBJECT[app as ServiceKey]?.inThe ?? `em ${app}`;
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
