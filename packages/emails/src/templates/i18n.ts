import { createTranslator } from "next-intl";
import ptBR from "../../messages/pt-BR.json" with { type: "json" };

export const SUPPORTED_LOCALES = ["pt-BR"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";

type Messages = typeof ptBR;

const MESSAGES: Record<Locale, Messages> = {
  "pt-BR": ptBR,
};

export type EmailNamespace =
  | "common"
  | "verification"
  | "passwordReset"
  | "magicLink"
  | "invitation"
  | "accountDeletion";

export function getTranslator(namespace: EmailNamespace, locale: Locale = DEFAULT_LOCALE) {
  const messages = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return createTranslator({
    locale,
    namespace,
    messages,
  });
}
