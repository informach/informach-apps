import { INFORMACH_CONTACT } from "@informach/config/contact";
import styles from "../sales.module.css";

/**
 * Quem faz. Só o que é fato: a Informach e o canal para falar com a gente.
 *
 * O canvas previa duas frases dos fundadores e uma foto autoral. Elas dependem
 * deles, e esta seção não publica texto inventado em nome de ninguém: quando
 * chegarem, entram aqui.
 */
export function Who() {
  return (
    <section
      id="quem-faz"
      aria-labelledby="who-title"
      className={[styles.wrap, "scroll-mt-6 py-16 md:py-20"].join(" ")}
    >
      <div className="max-w-[44rem] space-y-3">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
          Quem faz
        </p>
        <h2
          id="who-title"
          className="text-balance text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]"
        >
          A Agenda da Turma é um app da Informach.
        </h2>
        <p className="text-[16px] leading-relaxed text-foreground/80">
          Dúvida, ideia ou um recado que a Agenda leu errado? Fale com a gente no direct do{" "}
          <a
            href={INFORMACH_CONTACT.directMessageUrl}
            className="font-bold text-primary-ink underline underline-offset-4"
          >
            @{INFORMACH_CONTACT.instagramHandle}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
