import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type CreditsPurchasedEmailProps = {
  appName: string;
  /** Number of credits added by this purchase. */
  creditAmount: number;
  /** Total available credits AFTER this purchase. */
  balanceAfter: number;
  dashboardUrl: string;
  unsubscribeUrl?: string;
  unsubscribeMailto?: string;
  preheader?: string;
  locale?: Locale;
};

const paragraphStyle = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#111827",
  margin: "0 0 12px",
};

export function CreditsPurchasedEmail({
  appName,
  creditAmount,
  balanceAfter,
  dashboardUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: CreditsPurchasedEmailProps) {
  const t = getTranslator("creditsPurchased", locale);
  const creditAmountStr = formatNumber(creditAmount, locale);
  const balanceAfterStr = formatNumber(balanceAfter, locale);

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { creditAmount: creditAmountStr })}
      title={t("title")}
      cta={{ href: dashboardUrl, label: t("cta") }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>
        {t.rich("body", {
          appName,
          creditAmount: creditAmountStr,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text style={paragraphStyle}>
        {t.rich("instruction", {
          balanceAfter: balanceAfterStr,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
    </EmailLayout>
  );
}

function formatNumber(value: number, locale: Locale): string {
  // Locale-aware thousands separator (5000 → "5.000" in pt-BR).
  return new Intl.NumberFormat(locale).format(value);
}

CreditsPurchasedEmail.PreviewProps = {
  appName: "Cozya",
  creditAmount: 5000,
  balanceAfter: 5000,
  dashboardUrl: "https://app.example.com/settings/billing",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies CreditsPurchasedEmailProps;

export default CreditsPurchasedEmail;
