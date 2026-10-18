import { INFORMACH_CONTACT } from "@informach/config/contact";
import Image from "next/image";

/** The same people, photo and words as the Informach site, adapted only to name the Cozya. */
export function Founders() {
  return (
    <section
      id="quem-faz"
      className="landing-shell landing-section founders-grid"
      aria-labelledby="founders-title"
    >
      <div className="founders-photo">
        <Image
          src="/marketing/helena-julio.webp"
          alt="Helena e Júlio sorrindo, lado a lado"
          width={360}
          height={360}
          sizes="(max-width: 767px) calc(100vw - 40px), 360px"
        />
      </div>
      <div className="founders-copy">
        <p className="landing-eyebrow">Quem faz</p>
        <h2 className="landing-title" id="founders-title">
          Uma família que faz tecnologia para outras famílias.
        </h2>
        <p className="landing-description">
          Somos Helena e Júlio, desenvolvedores de sistemas formados em Sistemas de Informação, e
          pais do André. A Informach é a nossa empresa, o Núcleo de Aprendizagem por trás do Cozya.
        </p>
        <p className="landing-description">
          O Cozya segue o mesmo critério dos nossos outros produtos: só sai daqui o que a gente
          usaria em casa.
        </p>
        <a
          href={INFORMACH_CONTACT.directMessageUrl}
          className="founders-contact"
          target="_blank"
          rel="noopener noreferrer"
        >
          Fale com a gente no Instagram: @{INFORMACH_CONTACT.instagramHandle}
        </a>
      </div>
    </section>
  );
}
