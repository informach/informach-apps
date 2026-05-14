import { Toaster } from "@informach/ui/components/sonner";
import { ThemeProvider } from "@informach/ui/components/theme-provider";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { APPS } from "@/lib/apps";
import { SITE } from "@/lib/site";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const TITLE = "Informach. Apps com IA pra dores reais do dia a dia.";
const DESCRIPTION =
  "A Informach faz apps com IA pra resolver dores reais do dia a dia. Pra quem quer solução pronta, conheça nossos produtos. Pra quem quer aprender a construir, entre na Comunidade Sistema Zero.";

export const metadata: Metadata = {
  title: { default: TITLE, template: "%s · Informach" },
  description: DESCRIPTION,
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  authors: [{ name: SITE.legalName, url: SITE.url }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "pt_BR",
    url: SITE.url,
    siteName: SITE.name,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1825" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE.url}/#organization`,
      name: SITE.legalName,
      alternateName: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/logo-informach-light.svg`,
      email: SITE.contactEmail,
      taxID: SITE.cnpj,
      sameAs: [SITE.communityUrl, ...APPS.map((app) => app.url)],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      description: DESCRIPTION,
      publisher: { "@id": `${SITE.url}/#organization` },
      inLanguage: "pt-BR",
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={jakarta.variable} suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw JSON in a script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
