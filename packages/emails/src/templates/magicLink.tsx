import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type MagicLinkEmailProps = {
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

export function MagicLinkEmail({
  appName,
  url,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: MagicLinkEmailProps) {
  const t = getTranslator("magicLink", locale);

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
    </EmailLayout>
  );
}

MagicLinkEmail.PreviewProps = {
  appName: "Cozya",
  url: "https://app.example.com/magic?token=preview-token",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;
