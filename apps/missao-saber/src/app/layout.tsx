import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});
const fredoka = Fredoka({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Missão Saber · Uma descoberta por dia", template: "%s · Missão Saber" },
  description:
    "Raciocínio, matemática e educação financeira em missões autorais para o 6º e 7º ano.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#17B26A",
  colorScheme: "light",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${nunito.variable} ${fredoka.variable}`}>
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
