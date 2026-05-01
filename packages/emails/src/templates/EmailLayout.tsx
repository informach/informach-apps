import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";

export type EmailLayoutProps = {
  appName: string;
  preheader?: string;
  title: string;
  cta: { href: string; label: string };
  children: ReactNode;
  unsubscribeUrl?: string;
  unsubscribeMailto?: string;
  locale?: Locale;
};

const containerStyle = {
  maxWidth: "520px",
  margin: "0 auto",
  background: "#ffffff",
  borderRadius: "12px",
  padding: "32px",
};

const bodyStyle = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  background: "#f5f5f5",
  padding: "24px",
  margin: 0,
};

const eyebrowStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  margin: 0,
};

const headingStyle = {
  fontSize: "20px",
  margin: "0 0 16px",
};

const buttonStyle = {
  background: "#111827",
  color: "#ffffff",
  textDecoration: "none",
  padding: "12px 20px",
  borderRadius: "8px",
  display: "inline-block",
};

const footerWrapperStyle = {
  marginTop: "32px",
  paddingTop: "16px",
  borderTop: "1px solid #e5e7eb",
};

const footerTextStyle = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "0 0 8px",
};

const footerMailtoStyle = {
  fontSize: "11px",
  color: "#9ca3af",
  margin: 0,
};

const footerLinkStyle = {
  color: "#6b7280",
  textDecoration: "underline",
};

const footerMailtoLinkStyle = {
  color: "#9ca3af",
  textDecoration: "underline",
};

export function EmailLayout({
  appName,
  preheader,
  title,
  cta,
  children,
  unsubscribeUrl,
  unsubscribeMailto,
  locale = DEFAULT_LOCALE,
}: EmailLayoutProps) {
  const t = getTranslator("common", locale);

  return (
    <Html lang={locale}>
      <Head />
      {preheader ? <Preview>{preheader}</Preview> : null}
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={{ marginBottom: "24px" }}>
            <Text style={eyebrowStyle}>{appName}</Text>
          </Section>
          <Heading as="h1" style={headingStyle}>
            {title}
          </Heading>
          {children}
          <Section style={{ margin: "24px 0" }}>
            <Button href={cta.href} style={buttonStyle}>
              {cta.label}
            </Button>
          </Section>
          <Section style={footerWrapperStyle}>
            <Text style={footerTextStyle}>{appName}</Text>
            {unsubscribeUrl ? (
              <Text style={footerTextStyle}>
                {t("footer.unsubscribePrefix")}{" "}
                <Link href={unsubscribeUrl} style={footerLinkStyle}>
                  {t("footer.unsubscribeLink")}
                </Link>
                .
              </Text>
            ) : null}
            {unsubscribeMailto ? (
              <Text style={footerMailtoStyle}>
                {t("footer.mailtoPrefix")}{" "}
                <Link href={`mailto:${unsubscribeMailto}`} style={footerMailtoLinkStyle}>
                  {unsubscribeMailto}
                </Link>
                .
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

EmailLayout.displayName = "EmailLayout";
