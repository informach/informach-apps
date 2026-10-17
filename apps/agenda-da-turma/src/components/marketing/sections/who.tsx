import { INFORMACH_CONTACT } from "@informach/config/contact";
import Image from "next/image";
import styles from "../sales.module.css";

/** O mesmo desenho do site institucional: o ícone de marca do lucide saiu de linha. */
function InstagramIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" />
    </svg>
  );
}

/**
 * Quem faz: a foto e o texto que estão publicados no site da Informach
 * (`apps/informach-site/src/components/marketing/founders.tsx`), por decisão
 * da Helena em 17/10/2026. A adaptação é só a que a página pede (lá o texto
 * fala dos produtos "desta página" e do Sistema Zero); nenhum fato novo. A
 * foto mora em `public/` deste app, sem apontar para outro domínio, e o
 * contato é o direct do Instagram.
 */
export function Who() {
  return (
    <section
      id="quem-faz"
      aria-labelledby="who-title"
      className={[
        styles.wrap,
        "grid scroll-mt-6 items-center gap-10 py-16 md:py-24 lg:grid-cols-[0.8fr_1.2fr]",
      ].join(" ")}
    >
      <div className="mx-auto w-full max-w-[300px] rounded-full bg-chart-4/20 p-3">
        <Image
          src="/helena-julio.webp"
          alt="Helena e Júlio sorrindo, lado a lado"
          width={360}
          height={360}
          sizes="300px"
          className="aspect-square size-full rounded-full border-[6px] border-background object-cover"
        />
      </div>
      <div className="space-y-4">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
          Quem faz
        </p>
        <h2
          id="who-title"
          className="text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
        >
          Uma família que faz tecnologia para outras famílias.
        </h2>
        <p className="text-[17px] leading-relaxed text-foreground/80">
          Somos Helena e Júlio, desenvolvedores de sistemas formados em Sistemas de Informação, e
          pais do André. A Informach é a nossa empresa, o Núcleo de Aprendizagem por trás da Agenda
          da Turma.
        </p>
        <p className="text-[17px] leading-relaxed text-foreground/80">
          A Agenda segue o critério de todos os nossos produtos: só sai daqui o que a gente usaria
          em casa.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
          <a href={INFORMACH_CONTACT.directMessageUrl} className={styles.button}>
            <InstagramIcon />
            Mandar um direct
          </a>
          <span className="text-[15px] text-muted-foreground">
            Fale com a gente no Instagram,{" "}
            <strong className="text-foreground">@{INFORMACH_CONTACT.instagramHandle}</strong>
          </span>
        </div>
      </div>
    </section>
  );
}
