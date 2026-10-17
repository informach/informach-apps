import { INFORMACH_CONTACT } from "@informach/config/contact";
import { EDI_TOOLS } from "@informach/config/edi-tools";
import Link from "next/link";
import { ToolIcon, toolStyle } from "../components/site/brand";
import { SiteFooter } from "../components/site/footer";
import { MarketingHeader } from "../components/site/headers";
import {
  CheckIcon,
  MonitorIcon,
  OfflineIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
} from "../components/site/icons";
import { billingConfigured } from "../features/billing/catalog";
import { suitePricing } from "../features/billing/pricing";
import { FAQ, JOURNEY, TOOL_FEATURES } from "../features/marketing/content";
import {
  AssistantMock,
  LessonWindow,
  TOOL_ILLUSTRATIONS,
} from "../features/marketing/illustrations";
import { PricingSection } from "../features/marketing/pricing-section";
import { DEVICE_LIMIT, OFFLINE_HOURS } from "../lib/desktop-limits";
import { getEnv } from "../lib/env";

// Pilot and launch copy depend on the billing switch of the running environment.
export const dynamic = "force-dynamic";

const toolName = (id: (typeof EDI_TOOLS)[number]["id"]) =>
  EDI_TOOLS.find((tool) => tool.id === id)?.name ?? id;

export default function Home() {
  const billingOpen = billingConfigured(getEnv());
  const pricing = suitePricing();
  return (
    <>
      {!billingOpen && (
        <p className="pilot-banner">
          <strong>Fase piloto.</strong> As assinaturas abrem quando a homologação terminar. Você já
          pode criar a conta, baixar o Edi Hub e conectar o computador; as ferramentas abrem com a
          assinatura.
        </p>
      )}
      <div className="mat">
        <MarketingHeader tone="mat" billingOpen={billingOpen} />
      </div>
      <main id="conteudo">
        <section className="mat" aria-labelledby="titulo">
          <div className="container hero">
            <div className="hero__copy">
              <span className="eyebrow">Suíte Edi · 5 ferramentas para Windows</span>
              <h1 id="titulo" className="display-1">
                Tudo o que sua aula precisa, numa <span className="tape">bancada</span> só.
              </h1>
              <p className="lede">
                Grave a tela com teleprompter, edite o vídeo pelo texto da fala, explique com
                prints, crie a capa, organize o PDF e anime o mascote. Uma assinatura, e seus
                arquivos continuam no seu computador.
              </p>
              <div className="hero__actions">
                {billingOpen ? (
                  <Link
                    className="button button--primary button--lg"
                    href={{ pathname: "/", hash: "precos" }}
                  >
                    Assinar por {pricing.monthly.price}/mês
                  </Link>
                ) : (
                  <Link className="button button--primary button--lg" href="/entrar?criar=1">
                    Criar minha conta
                  </Link>
                )}
                <Link
                  className="button button--on-mat button--lg"
                  href={{ pathname: "/", hash: "ferramentas" }}
                >
                  Ver o que cada uma faz
                </Link>
              </div>
              <p className="hero__facts">
                Windows 64 bits · até {DEVICE_LIMIT} computadores ·{" "}
                {billingOpen ? "cancele quando quiser" : "seus arquivos com você"}
              </p>
            </div>
            <LessonWindow />
          </div>
          <div className="container tool-strip">
            {EDI_TOOLS.map((tool, index) => {
              const feature = TOOL_FEATURES.find((item) => item.tool === tool.id);
              return (
                <Link
                  key={tool.id}
                  className="tool-tile"
                  href={{ pathname: "/", hash: feature?.anchor ?? "ferramentas" }}
                >
                  <span className="tool-tile__top">
                    <ToolIcon tool={tool.id} />
                    <span className="mono small muted">0{index + 1}</span>
                  </span>
                  <span>
                    <span className="tool-tile__name">{tool.name}</span>
                    <span className="tool-tile__line">{tool.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <span className="ruler" aria-hidden="true" />
        </section>

        <section className="container section" aria-labelledby="jornada">
          <div className="section-head">
            <span className="eyebrow">Do roteiro à entrega</span>
            <h2 id="jornada" className="display-2">
              Uma aula passa por cinco mesas. Agora elas ficam lado a lado.
            </h2>
            <p className="lede">
              Você não precisa mais de cinco programas, cinco contas e cinco jeitos de salvar. Cada
              ferramenta cuida de uma etapa e todas se instalam e se atualizam pelo mesmo lugar.
            </p>
          </div>
          <ol className="journey">
            {JOURNEY.map((step, index) => (
              <li key={step.tool} style={toolStyle(step.tool)}>
                <span className="journey__dot" aria-hidden="true" />
                <span className="journey__tool">
                  0{index + 1} · {toolName(step.tool)}
                </span>
                <strong className="journey__title">{step.title}</strong>
                <span className="muted">{step.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <div id="ferramentas" className="container">
          <h2 className="visually-hidden">As cinco ferramentas</h2>
          {TOOL_FEATURES.map((feature, index) => {
            const Illustration = TOOL_ILLUSTRATIONS[feature.tool];
            return (
              <article
                key={feature.tool}
                id={feature.anchor}
                className={index % 2 === 1 ? "tool-feature tool-feature--reverse" : "tool-feature"}
                style={toolStyle(feature.tool)}
              >
                <div className="tool-feature__copy">
                  <p className="tool-feature__label">
                    <ToolIcon tool={feature.tool} size="sm" />0{index + 1} ·{" "}
                    {toolName(feature.tool)}
                  </p>
                  <h3 className="display-3">
                    {feature.title.before}
                    <span className="swipe">{feature.title.highlight}</span>
                    {feature.title.after}
                  </h3>
                  <p>{feature.body}</p>
                  <ul className="check-list">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet}>
                        <span className="check-list__mark" aria-hidden="true">
                          <CheckIcon size={14} />
                        </span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                  {feature.limits && (
                    <p className="limits">
                      <strong>LIMITES DESTA VERSÃO</strong>
                      {feature.limits}
                    </p>
                  )}
                </div>
                <div className="tool-feature__visual">
                  <Illustration />
                </div>
              </article>
            );
          })}
        </div>

        <section className="mat section" aria-labelledby="ia">
          <div className="container ai-section">
            <div className="ai-section__copy">
              <span className="eyebrow">Inteligência artificial</span>
              <h2 id="ia" className="display-2">
                A IA que você já tem, trabalhando dentro das ferramentas.
              </h2>
              <p>
                EdiAula, EdiFoto e EdiSVG se conectam ao Claude ou ao ChatGPT que você já assina.
                Você pede em português e vê cada edição acontecendo na tela.
              </p>
              <p className="small">
                A assinatura da suíte não inclui consumo de IA. Você usa a sua conta do Claude ou do
                ChatGPT, ou uma chave própria da Anthropic.
              </p>
            </div>
            <div className="ai-section__visual">
              <AssistantMock />
            </div>
            <div className="rule-grid">
              <div className="rule-card">
                <h3 className="display-4">Você aprova antes</h3>
                <p>Edições grandes chegam como proposta destacada. Nada muda sem o seu clique.</p>
              </div>
              <div className="rule-card">
                <h3 className="display-4">Um pedido, um Ctrl+Z</h3>
                <p>
                  Não gostou do resultado? Desfaz tudo o que a IA fez naquele pedido de uma vez.
                </p>
              </div>
              <div className="rule-card">
                <h3 className="display-4">O que é protegido fica</h3>
                <p>Marque um trecho da fala como protegido e nenhuma limpeza encosta nele.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--tint" aria-labelledby="seu-trabalho">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Seu trabalho é seu</span>
              <h2 id="seu-trabalho" className="display-2">
                Seus projetos moram no seu computador. Não na nossa nuvem.
              </h2>
            </div>
            <div className="feature-grid">
              <div className="feature-card">
                <MonitorIcon size={28} />
                <h3 className="display-4">Arquivos na sua máquina</h3>
                <p>
                  Projetos salvos nas suas pastas, com cópia de segurança automática no EdiAula.
                </p>
              </div>
              <div className="feature-card">
                <OfflineIcon size={28} />
                <h3 className="display-4">Funciona sem internet</h3>
                <p>
                  Depois de conectar, as ferramentas seguem liberadas por até {OFFLINE_HOURS} horas
                  longe da rede.
                </p>
              </div>
              <div className="feature-card">
                <RefreshIcon size={28} />
                <h3 className="display-4">Atualiza sem atrapalhar</h3>
                <p>
                  A versão nova baixa sozinha e espera você fechar a ferramenta. Nenhuma exportação
                  é cortada no meio.
                </p>
              </div>
              <div className="feature-card">
                <ShieldIcon size={28} />
                <h3 className="display-4">Cancelou? Nada some</h3>
                <p>Seus projetos e tudo o que você exportou continuam no seu computador.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="container section" aria-labelledby="passos">
          <div className="section-head">
            <span className="eyebrow">Como funciona</span>
            <h2 id="passos" className="display-2">
              Três passos e a bancada está montada.
            </h2>
          </div>
          <ol className="steps">
            <li className="step">
              <span className="step__number">01</span>
              <h3 className="display-4">
                {billingOpen ? "Assine e crie sua conta" : "Crie sua conta"}
              </h3>
              <p>Uma conta só para as cinco ferramentas, no site e no Edi Hub.</p>
            </li>
            <li className="step">
              <span className="step__number">02</span>
              <h3 className="display-4">Instale o Edi Hub e conecte</h3>
              <p>O Hub mostra um código. Você digita no navegador e o computador fica liberado.</p>
              <span className="code-chip" aria-hidden="true">
                WDJB MJHT
              </span>
            </li>
            <li className="step">
              <span className="step__number">03</span>
              <h3 className="display-4">Escolha as ferramentas</h3>
              <p>Instale só as que vai usar agora. O Hub cuida das atualizações de todas.</p>
              <span className="swatches" aria-hidden="true">
                {EDI_TOOLS.map((tool, index) =>
                  index < 3 ? (
                    <span key={tool.id} style={toolStyle(tool.id)} className="swatch" />
                  ) : (
                    <span key={tool.id} className="swatches__empty" />
                  ),
                )}
              </span>
            </li>
          </ol>
        </section>

        <section id="precos" className="section section--rule" aria-label="Preço">
          <div className="container">
            <PricingSection
              pricing={pricing}
              billingOpen={billingOpen}
              deviceLimit={DEVICE_LIMIT}
              offlineHours={OFFLINE_HOURS}
            >
              <span className="eyebrow">Preço</span>
              <h2 className="display-2">Uma assinatura. A bancada inteira.</h2>
              <p className="lede">
                Sem plano básico, sem ferramenta bloqueada. Mensal ou anual, você recebe exatamente
                a mesma suíte.
              </p>
            </PricingSection>
          </div>
        </section>

        <section id="perguntas" className="section section--tint" aria-labelledby="duvidas">
          <div className="container faq">
            <div className="faq__intro">
              <span className="eyebrow">Perguntas</span>
              <h2 id="duvidas" className="display-2">
                Antes de assinar.
              </h2>
              <p className="muted">
                Ficou alguma dúvida? Mande um direct no Instagram,{" "}
                <a href={INFORMACH_CONTACT.directMessageUrl}>
                  @{INFORMACH_CONTACT.instagramHandle}
                </a>
                .
              </p>
            </div>
            <div className="faq__list">
              {FAQ.map((item, index) => (
                <details key={item.question} className="faq__item" open={index === 0}>
                  <summary>
                    {item.question}
                    <span className="faq__icon">
                      <PlusIcon size={20} />
                    </span>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="chamada-final">
          <div className="container final-cta__inner">
            <h2 id="chamada-final" className="display-2">
              Sua próxima aula começa na bancada.
            </h2>
            {billingOpen ? (
              <div>
                <Link
                  className="button button--ink button--lg"
                  href={{ pathname: "/", hash: "precos" }}
                >
                  Assinar por {pricing.monthly.price}/mês
                </Link>
                <span className="small">ou {pricing.annual.price} por ano</span>
              </div>
            ) : (
              <div>
                <Link className="button button--ink button--lg" href="/downloads">
                  Baixar o Edi Hub
                </Link>
                <span className="small">Versão piloto para Windows 64 bits</span>
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
