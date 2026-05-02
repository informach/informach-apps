import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type SubscriptionRenewedEmailProps = {
  appName: string;
  productName: string;
  /** Pre-formatted next billing date (e.g., "01/06/2026"). */
  nextBillingDate: string;
  manageBillingUrl: string;
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

export function SubscriptionRenewedEmail({
  appName,
  productName,
  nextBillingDate,
  manageBillingUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: SubscriptionRenewedEmailProps) {
  const t = getTranslator("subscriptionRenewed", locale);

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { productName })}
      title={t("title")}
      cta={{ href: manageBillingUrl, label: t("cta") }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>
        {t.rich("body", {
          appName,
          productName,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text style={paragraphStyle}>
        {t.rich("instruction", {
          nextBillingDate,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
    </EmailLayout>
  );
}

SubscriptionRenewedEmail.PreviewProps = {
  appName: "Agenda da Turma",
  productName: "Agenda Pro Mensal",
  nextBillingDate: "01/06/2026",
  manageBillingUrl: "https://app.example.com/admin/billing",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies SubscriptionRenewedEmailProps;

export default SubscriptionRenewedEmail;
