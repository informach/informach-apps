import { Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

/**
 * Resumo da semana do Bastidores para as contas owner: números do negócio e
 * da operação, já formatados pelo app. Nenhum nome, e-mail ou conteúdo de
 * pessoa entra aqui.
 */
export type AdminWeeklySummaryEmailProps = {
  appName: string;
  /** Período, já formatado ("de 12 a 18 de outubro"). */
  weekLabel: string;
  newAccounts: number;
  /**
   * Por produto: quem tem acesso pago agora (ativas e em teste, a regra de
   * `PRO_STATUSES`) e a receita por mês já formatada. A frase diz "assinantes",
   * que vale para o Pro do Cozya e da Agenda, os planos da Missão Saber e a
   * assinatura da Suíte Edi.
   */
  products: ReadonlyArray<{ name: string; proSubscribers: number; revenue: string }>;
  /** Total da receita estimada por mês, já formatado ("R$ 6.148"). */
  revenueTotal: string;
  /** Custo de IA informado pelo provedor na semana ("US$ 38,40"), ou null se nenhum. */
  aiCost: string | null;
  failedRoutines: ReadonlyArray<{ label: string; failures: number }>;
  outages: ReadonlyArray<{ name: string; duration: string }>;
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

const sectionTitleStyle = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#111827",
  margin: "20px 0 8px",
};

const itemStyle = {
  ...paragraphStyle,
  margin: "0 0 6px",
};

export function AdminWeeklySummaryEmail({
  appName,
  weekLabel,
  newAccounts,
  products,
  revenueTotal,
  aiCost,
  failedRoutines,
  outages,
  ctaUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: AdminWeeklySummaryEmailProps) {
  const t = getTranslator("adminWeeklySummary", locale);
  const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t("preheader", { weekLabel })}
      title={t("title", { weekLabel })}
      cta={{ href: ctaUrl, label: t("cta") }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>{t.rich("accounts", { newAccounts, strong })}</Text>

      <Section>
        <Text style={sectionTitleStyle}>{t("productsTitle")}</Text>
        {products.map((product) => (
          <Text key={product.name} style={itemStyle}>
            {t.rich("productLine", { ...product, strong })}
          </Text>
        ))}
        <Text style={paragraphStyle}>{t.rich("revenueTotal", { revenueTotal, strong })}</Text>
      </Section>

      <Section>
        <Text style={sectionTitleStyle}>{t("operationTitle")}</Text>
        <Text style={itemStyle}>
          {aiCost ? t.rich("aiCost", { aiCost, strong }) : t("aiCostNone")}
        </Text>
        {outages.length === 0 ? (
          <Text style={itemStyle}>{t("outagesNone")}</Text>
        ) : (
          outages.map((outage) => (
            <Text key={`${outage.name}-${outage.duration}`} style={itemStyle}>
              {t("outageLine", outage)}
            </Text>
          ))
        )}
        {failedRoutines.length === 0 ? (
          <Text style={itemStyle}>{t("routinesNone")}</Text>
        ) : (
          failedRoutines.map((routine) => (
            <Text key={routine.label} style={itemStyle}>
              {t("routineLine", routine)}
            </Text>
          ))
        )}
      </Section>

      <Text style={paragraphStyle}>{t("instruction")}</Text>
    </EmailLayout>
  );
}

AdminWeeklySummaryEmail.PreviewProps = {
  appName: "Bastidores",
  weekLabel: "de 12 a 18 de outubro",
  newAccounts: 57,
  products: [
    { name: "Cozya", proSubscribers: 148, revenue: "R$ 2.079" },
    { name: "Agenda da Turma", proSubscribers: 87, revenue: "R$ 1.675" },
  ],
  revenueTotal: "R$ 3.754",
  aiCost: "US$ 38,40",
  failedRoutines: [{ label: "Conciliar cobrança com o Stripe, Cozya", failures: 2 }],
  outages: [{ name: "Suíte Edi", duration: "34 minutos" }],
  ctaUrl: "https://admin.example.com/",
  unsubscribeUrl: "https://admin.example.com/api/email/unsubscribe?t=preview",
} satisfies AdminWeeklySummaryEmailProps;

export default AdminWeeklySummaryEmail;
