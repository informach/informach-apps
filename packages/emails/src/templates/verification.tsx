import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type VerificationEmailProps = {
  appName: string;
  url: string;
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

export function VerificationEmail({
  appName,
  url,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: VerificationEmailProps) {
  const t = getTranslator("verification", locale);

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { appName })}
      title={t("title")}
      cta={{ href: url, label: t("cta") }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>
        {t.rich("body", {
          appName,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text style={paragraphStyle}>{t("instruction")}</Text>
    </EmailLayout>
  );
}

VerificationEmail.PreviewProps = {
  appName: "Agenda da Turma",
  url: "https://app.example.com/verify?token=preview-token",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies VerificationEmailProps;

export default VerificationEmail;
