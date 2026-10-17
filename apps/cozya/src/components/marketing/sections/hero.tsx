import { ArrowDown } from "lucide-react";
import Image from "next/image";
import { CozyaMark } from "@/components/brand/cozya-logo";
import { LunchboxIcon } from "@/components/brand/lunchbox-icon";
import { TrialCta } from "../trial-cta";

export function Hero() {
  return (
    <section className="landing-shell landing-hero" id="inicio" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="landing-eyebrow">
          <span className="landing-dot" /> Sua semana à mesa
        </p>
        <h1 id="hero-title">
          O que tem pra janta? <span className="hero-accent">Já está decidido.</span>
        </h1>
        <p className="hero-description">
          Escolha as receitas da casa uma vez por semana. O Cozya ajusta as porções, monta a lista
          do mercado e mostra o passo a passo na hora de cozinhar.
        </p>
        <TrialCta id="primeiro-convite" />
        <a className="landing-text-link hero-demo-link" href="#como-funciona">
          <ArrowDown size={17} aria-hidden /> Ver uma semana de exemplo
        </a>
      </div>
      <div className="hero-scene">
        <div className="hero-photo">
          <Image
            src="/marketing/jantar.webp"
            alt="Macarrão com tomate e grão-de-bico num prato de cerâmica, com uma porção separada numa marmita de vidro."
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1280px) 52vw, 650px"
            preload
          />
        </div>
        <figure className="hero-phone" aria-label="Exemplo da tela Hoje do Cozya">
          <div className="hero-phone-top">
            <span>Terça, 20 de outubro</span>
            <CozyaMark className="hero-phone-mark" />
          </div>
          <p className="hero-phone-label">Hoje tem</p>
          <p className="hero-phone-title">Strogonoff de frango</p>
          <p className="hero-phone-tags">
            <span>3 na mesa</span>
            <span className="tag-peach">
              <LunchboxIcon width={13} height={13} />+ 1 marmita
            </span>
          </p>
          <span className="hero-phone-button">Começar a cozinhar</span>
          <figcaption>Amanhã: marmita no almoço, omelete no jantar</figcaption>
        </figure>
      </div>
    </section>
  );
}
