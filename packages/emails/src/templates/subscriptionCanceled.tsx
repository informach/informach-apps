import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type SubscriptionCanceledEmailProps = {
  appName: string;
  productName: string;
  /** Pre-formatted last day of access (e.g., "30/05/2026"). */
  accessUntil: string;
  /** URL to re-subscribe (typically `/admin/billing` checkout page). */
  reactivateUrl: string;
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

export function SubscriptionCanceledEmail({
  appName,
  productName,
  accessUntil,
  reactivateUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: SubscriptionCanceledEmailProps) {
  const t = getTranslator("subscriptionCanceled", locale);

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { productName })}
      title={t("title")}
      cta={{ href: reactivateUrl, label: t("cta") }}
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
          accessUntil,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
    </EmailLayout>
  );
}

SubscriptionCanceledEmail.PreviewProps = {
  appName: "Agenda da Turma",
  productName: "Agenda Pro Mensal",
  accessUntil: "30/05/2026",
  reactivateUrl: "https://app.example.com/admin/billing",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies SubscriptionCanceledEmailProps;

export default SubscriptionCanceledEmail;
