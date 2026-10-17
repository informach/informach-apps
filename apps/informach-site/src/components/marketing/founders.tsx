import Image from "next/image";
import { SITE } from "@/lib/site";

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" />
    </svg>
  );
}

export function Founders() {
  return (
    <section
      id="quem-faz"
      aria-labelledby="quem-titulo"
      className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-12 px-4 py-20 sm:px-6 md:py-28 lg:px-10"
    >
      <div className="grid min-w-0 flex-[0_1_360px] place-items-center">
        <div className="relative aspect-square w-full max-w-[320px] rounded-full bg-sphere p-3.5">
          <Image
            src="/sistema-zero/helena-julio.webp"
            alt="Helena e Júlio sorrindo, lado a lado"
            width={360}
            height={360}
            sizes="320px"
            className="size-full rounded-full border-[6px] border-paper object-cover"
          />
        </div>
      </div>
      <div className="grid min-w-0 flex-[1_1_480px] gap-[18px] text-ink">
        <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-sphere-ink">
          Quem faz
        </p>
        <h2
          id="quem-titulo"
          className="text-balance text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[52px]"
        >
          Uma família que faz tecnologia para outras famílias.
        </h2>
        <p className="text-lg text-ink-soft">
          Somos Helena e Júlio, desenvolvedores de sistemas formados em Sistemas de Informação, e
          pais do André. A Informach é a nossa empresa, o Núcleo de Aprendizagem por trás de cada
          produto desta página.
        </p>
        <p className="text-lg text-ink-soft">
          O Sistema Zero começou nos jogos que criamos com o nosso filho. Os outros produtos seguem
          o mesmo critério: só sai daqui o que a gente usaria em casa.
        </p>
        <div id="contato" className="mt-2 flex flex-wrap items-center gap-3.5">
          <a
            href={SITE.contact.directMessageUrl}
            className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full bg-ink px-[22px] font-extrabold text-paper no-underline transition-opacity hover:opacity-90"
          >
            <InstagramIcon />
            Mandar um direct
          </a>
          <span className="text-ink-soft">
            Fale com a gente no Instagram,{" "}
            <strong className="text-ink">@{SITE.contact.instagramHandle}</strong>
          </span>
        </div>
      </div>
    </section>
  );
}
