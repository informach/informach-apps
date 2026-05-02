import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type PaymentFailedEmailProps = {
  appName: string;
  /** Current dunning attempt (1-indexed). */
  attempt: number;
  /** Total attempts before subscription is canceled. Default 3 — match billing config. */
  maxAttempts?: number;
  /** URL to the Billing Portal where the user can update payment method. */
  updatePaymentUrl: string;
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

const warningStyle = {
  ...paragraphStyle,
  color: "#92400e",
  background: "#fef3c7",
  padding: "12px",
  borderRadius: "8px",
};

export function PaymentFailedEmail({
  appName,
  attempt,
  maxAttempts = 3,
  updatePaymentUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: PaymentFailedEmailProps) {
  const t = getTranslator("paymentFailed", locale);
  const attemptStr = String(attempt);
  const maxStr = String(maxAttempts);

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { appName })}
      title={t("title")}
      cta={{ href: updatePaymentUrl, label: t("cta") }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>
        {t.rich("body", {
          appName,
          attempt: attemptStr,
          maxAttempts: maxStr,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text style={paragraphStyle}>{t("instruction")}</Text>
      <Text style={warningStyle}>{t("warning")}</Text>
    </EmailLayout>
  );
}

PaymentFailedEmail.PreviewProps = {
  appName: "Agenda da Turma",
  attempt: 2,
  maxAttempts: 3,
  updatePaymentUrl: "https://app.example.com/admin/billing/portal",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies PaymentFailedEmailProps;

export default PaymentFailedEmail;
