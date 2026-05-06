import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

/**
 * Threshold value (percentage of monthly cap consumed) that triggered this
 * warning. Three steps cover the typical usage curve without spamming:
 * - 50: heads-up nudge
 * - 80: action recommended
 * - 100: out of credits, must top-up or wait for renewal
 */
export type CreditsWarningThreshold = 50 | 80 | 100;

export type BillingCreditsWarningEmailProps = {
  appName: string;
  /** Credits left in the cycle. */
  remaining: number;
  /** Total credits granted by the active subscription this cycle. */
  total: number;
  threshold: CreditsWarningThreshold;
  ctaUrl: string;
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

export function BillingCreditsWarningEmail({
  appName,
  remaining,
  total,
  threshold,
  ctaUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: BillingCreditsWarningEmailProps) {
  const t = getTranslator("billingCreditsWarning", locale);
  const remainingStr = formatNumber(remaining, locale);
  const totalStr = formatNumber(total, locale);
  const thresholdStr = String(threshold);

  // Title and body strings vary by threshold (50/80/100) — picked from the
  // i18n bundle. Keeping them as separate keys instead of dynamic
  // interpolation avoids subtle plural/agreement issues in PT-BR.
  const titleKey = threshold === 100 ? "title100" : threshold === 80 ? "title80" : "title50";
  const bodyKey = threshold === 100 ? "body100" : threshold === 80 ? "body80" : "body50";
  const ctaKey = threshold === 100 ? "cta100" : "cta";

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { remaining: remainingStr, total: totalStr })}
      title={t(titleKey, { remaining: remainingStr, total: totalStr })}
      cta={{ href: ctaUrl, label: t(ctaKey) }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>
        {t.rich(bodyKey, {
          appName,
          remaining: remainingStr,
          total: totalStr,
          threshold: thresholdStr,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text style={paragraphStyle}>
        {t.rich("instruction", {
          remaining: remainingStr,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
    </EmailLayout>
  );
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

BillingCreditsWarningEmail.PreviewProps = {
  appName: "Cozya",
  remaining: 6,
  total: 30,
  threshold: 80,
  ctaUrl: "https://app.example.com/settings/billing",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=preview",
  unsubscribeMailto: "unsubscribe@app.example.com",
} satisfies BillingCreditsWarningEmailProps;

export default BillingCreditsWarningEmail;
