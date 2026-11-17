import { Toaster } from "@informach/ui/components/sonner";
import { ThemeProvider } from "@informach/ui/components/theme-provider";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { SITE_PRODUCTS } from "@/lib/products";
import { SITE } from "@/lib/site";
import "./globals.css";

const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-variable.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});

/* Fonte arredondada da seção do Sistema Zero, a mesma do site dele. */
const nunito = localFont({
  src: "./fonts/nunito-variable.woff2",
  variable: "--font-nunito",
  weight: "200 900",
  display: "swap",
});

const TITLE = "Informach: feito em casa, para a sua família";
const DESCRIPTION =
  "Somos Helena e Júlio, desenvolvedores e pais do André. Fazemos o Sistema Zero, onde crianças de 9 a 14 anos aprendem programação criando jogos, e também a Missão Saber, a Agenda da Turma, o Cozya, o Bora Treinar e a Suíte Edi.";

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
    { media: "(prefers-color-scheme: light)", color: "#f8f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1a25" },
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
      taxID: SITE.cnpj,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: SITE.contact.directMessageUrl,
        availableLanguage: "pt-BR",
      },
      sameAs: [SITE.instagramUrl, ...SITE_PRODUCTS.map((product) => product.url)],
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
    <html
      lang="pt-BR"
      className={`${jakarta.variable} ${nunito.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
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
