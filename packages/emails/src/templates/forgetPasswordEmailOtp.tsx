import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type ForgetPasswordEmailOtpProps = {
  appName: string;
  otp: string;
  expiresInMinutes: number;
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

const otpSectionStyle = {
  margin: "24px 0",
  padding: "24px",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  textAlign: "center" as const,
};

const otpLabelStyle = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
};

const otpCodeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "32px",
  fontWeight: 700,
  letterSpacing: "0.5em",
  color: "#111827",
  margin: 0,
};

const expiresStyle = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "0 0 16px",
};

export function ForgetPasswordEmailOtp({
  appName,
  otp,
  expiresInMinutes,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: ForgetPasswordEmailOtpProps) {
  const t = getTranslator("forgetPasswordEmailOtp", locale);

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { appName })}
      title={t("title")}
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
      <Section style={otpSectionStyle}>
        <Text style={otpLabelStyle}>{t("otpLabel")}</Text>
        <Text style={otpCodeStyle}>{otp}</Text>
      </Section>
      <Text style={expiresStyle}>{t("expiresIn", { minutes: expiresInMinutes })}</Text>
    </EmailLayout>
  );
}

ForgetPasswordEmailOtp.PreviewProps = {
  appName: "Cozya",
  otp: "654321",
  expiresInMinutes: 10,
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies ForgetPasswordEmailOtpProps;

export default ForgetPasswordEmailOtp;
