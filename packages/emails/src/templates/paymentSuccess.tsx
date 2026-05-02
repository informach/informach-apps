import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type PaymentSuccessEmailProps = {
  appName: string;
  /** Display label for the line item (e.g., "Agenda Pro Mensal", "5000 créditos"). */
  productName: string;
  /** Pre-formatted amount including currency (e.g., "R$ 100,00"). */
  amountFormatted: string;
  /** URL to the Billing Portal — let the user manage payment method/invoices. */
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

export function PaymentSuccessEmail({
  appName,
  productName,
  amountFormatted,
  manageBillingUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: PaymentSuccessEmailProps) {
  const t = getTranslator("paymentSuccess", locale);

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { amountFormatted })}
      title={t("title")}
      cta={{ href: manageBillingUrl, label: t("cta") }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>
        {t.rich("body", {
          appName,
          amountFormatted,
          productName,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text style={paragraphStyle}>{t("instruction")}</Text>
    </EmailLayout>
  );
}

PaymentSuccessEmail.PreviewProps = {
  appName: "Agenda da Turma",
  productName: "Agenda Pro Mensal",
  amountFormatted: "R$ 49,90",
  manageBillingUrl: "https://app.example.com/admin/billing",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies PaymentSuccessEmailProps;

export default PaymentSuccessEmail;
