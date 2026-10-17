import { INFORMACH_CONTACT } from "@informach/config/contact";
import Image from "next/image";
import { EYEBROW, GRID2, H2, LEAD, SEC, WRAP } from "../landing-ui";

/**
 * Quem faz: a foto e o texto que estão publicados no site da Informach
 * (`apps/informach-site/src/components/marketing/founders.tsx`), por decisão
 * da Helena em 17/10/2026. A adaptação é só a que a página pede (lá o texto
 * fala dos produtos "desta página" e do Sistema Zero); nenhum fato novo. A
 * foto mora em `public/` deste app, sem apontar para outro domínio, e o
 * contato é o direct do Instagram.
 *
 * O desenho é o da prancha: a foto à esquerda, e à direita o título, o texto e
 * o link do direct. A foto fica quadrada e com até 360 px, e não no quadro de
 * 4 por 3 da prancha: o arquivo publicado tem 360 por 360 e sairia ampliado e
 * cortado.
 */
export function Who() {
  return (
    <section id="quem-faz" aria-labelledby="who-title" className={SEC}>
      <div className={`${WRAP} ${GRID2}`}>
        <Image
          src="/helena-julio.webp"
          alt="Helena e Júlio sorrindo, lado a lado"
          width={360}
          height={360}
          sizes="360px"
          className="aspect-square w-full max-w-[360px] justify-self-center rounded-[24px] object-cover"
        />
        <div className="flex flex-col gap-[22px]">
          <p className={EYEBROW}>Quem faz</p>
          <h2 id="who-title" className={H2}>
            Uma família que faz tecnologia para outras famílias.
          </h2>
          <p className={LEAD}>
            Somos Helena e Júlio, desenvolvedores de sistemas formados em Sistemas de Informação, e
            pais do André. A Informach é a nossa empresa, o Núcleo de Aprendizagem por trás da
            Agenda da Turma.
          </p>
          <p className={LEAD}>
            A Agenda segue o critério de todos os nossos produtos: só sai daqui o que a gente usaria
            em casa.
          </p>
          <a
            href={INFORMACH_CONTACT.directMessageUrl}
            className="text-[17px] font-bold text-primary-ink underline hover:text-foreground"
          >
            Fale com a gente no direct do @{INFORMACH_CONTACT.instagramHandle}
          </a>
        </div>
      </div>
    </section>
  );
}
