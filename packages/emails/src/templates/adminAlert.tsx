import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

/**
 * Aviso do Bastidores para a equipe quando um serviço cai (duas verificações
 * seguidas sem resposta) e quando volta. Leva só o nome do serviço, horários e
 * o motivo curto da verificação: nada de pessoas ou contas.
 */
export type AdminAlertEmailProps = {
  appName: string;
  kind: "down" | "up";
  serviceName: string;
  /** Início da queda, já formatado (por exemplo "17 de outubro, 13:58"). */
  downSince: string;
  /** Quando voltou, já formatado. Só no aviso de volta. */
  upAt?: string;
  /** Tempo fora do ar, já formatado ("34 minutos"). Só no aviso de volta. */
  duration?: string;
  /** Motivo curto da última verificação ("não respondeu em 10 segundos"). Só na queda. */
  problem?: string;
  /** Página do Bastidores que explica o estado dos serviços. */
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

export function AdminAlertEmail({
  appName,
  kind,
  serviceName,
  downSince,
  upAt,
  duration,
  problem,
  ctaUrl,
  unsubscribeUrl,
  unsubscribeMailto,
  preheader,
  locale = DEFAULT_LOCALE,
}: AdminAlertEmailProps) {
  const t = getTranslator("adminAlert", locale);
  const values = {
    serviceName,
    downSince,
    upAt: upAt ?? "",
    duration: duration ?? "",
    problem: problem ?? "",
  };
  const down = kind === "down";

  return (
    <EmailLayout
      appName={appName}
      preheader={preheader ?? t(down ? "preheaderDown" : "preheaderUp", values)}
      title={t(down ? "titleDown" : "titleUp", values)}
      cta={{ href: ctaUrl, label: t("cta") }}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeMailto={unsubscribeMailto}
      locale={locale}
    >
      <Text style={paragraphStyle}>
        {t.rich(down ? (problem ? "bodyDown" : "bodyDownNoReason") : "bodyUp", {
          ...values,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text style={paragraphStyle}>{t(down ? "instructionDown" : "instructionUp")}</Text>
    </EmailLayout>
  );
}

AdminAlertEmail.PreviewProps = {
  appName: "Bastidores",
  kind: "down",
  serviceName: "Suíte Edi",
  downSince: "17 de outubro, 13:58",
  problem: "não respondeu em 10 segundos",
  ctaUrl: "https://admin.example.com/operacao",
  unsubscribeUrl: "https://admin.example.com/api/email/unsubscribe?t=preview",
} satisfies AdminAlertEmailProps;

export default AdminAlertEmail;
