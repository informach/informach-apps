import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site/footer";
import { AccountHeader, MarketingHeader } from "@/components/site/headers";
import { FileIcon } from "@/components/site/icons";
import { billingConfigured } from "@/features/billing/catalog";
import { HubDownload, ToolDownloads, WindowsWarning } from "@/features/releases/downloads";
import { getAuth } from "@/lib/auth";
import { OFFLINE_HOURS } from "@/lib/desktop-limits";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Downloads" };

export default async function DownloadsPage() {
  // Quem chega pela navegação da conta continua vendo o cabeçalho da conta.
  // headers() antes de getAuth(): o env só é lido depois de a rota virar dinâmica.
  const incoming = new Headers(await headers());
  const user = await getAuth().getCurrentUser(incoming);
  return (
    <>
      {user ? (
        <AccountHeader name={user.name} current="downloads" />
      ) : (
        <MarketingHeader current="downloads" billingOpen={billingConfigured(getEnv())} />
      )}
      <main id="conteudo">
        <section className="container download-hero" aria-labelledby="titulo">
          <div>
            <span className="eyebrow">Downloads · Windows 64 bits</span>
            <h1 id="titulo" className="display-1">
              Comece pelo Edi Hub.
            </h1>
            <p className="lede">
              O Hub instala as cinco ferramentas, mantém tudo atualizado e conecta a sua assinatura.
              Você baixa um arquivo e o resto acontece por lá.
            </p>
          </div>
          <Suspense
            fallback={
              <p className="download-card mat download-card__body" role="status">
                Consultando a versão publicada…
              </p>
            }
          >
            <HubDownload />
          </Suspense>
        </section>

        <Suspense fallback={null}>
          <WindowsWarning />
        </Suspense>

        <section id="instalar" className="container section" aria-labelledby="passos">
          <h2 id="passos" className="display-2">
            Instale em três passos.
          </h2>
          <ol className="steps">
            <li className="step step--tint">
              <span className="step__number">01</span>
              <h3 className="display-4">Abra o instalador</h3>
              <p>Dois cliques no arquivo baixado e siga as telas. Leva poucos minutos.</p>
              <span className="notice">
                <FileIcon size={18} />
                Instalador do Edi Hub
              </span>
            </li>
            <li className="step step--tint">
              <span className="step__number">02</span>
              <h3 className="display-4">Conecte sua conta</h3>
              <p>
                O Hub mostra um código. Digite em edi.informach.com.br/conectar e autorize o
                computador.
              </p>
              <span className="code-chip" aria-hidden="true">
                WDJB MJHT
              </span>
            </li>
            <li className="step step--tint">
              <span className="step__number">03</span>
              <h3 className="display-4">Escolha as ferramentas</h3>
              <p>Instale só as que vai usar agora. As outras ficam a um clique.</p>
            </li>
          </ol>
        </section>

        <section className="container" aria-labelledby="avulsas">
          <h2 id="avulsas" className="display-3">
            Precisa de uma ferramenta avulsa?
          </h2>
          <p className="lede">
            O Hub instala e atualiza todas. Os instaladores separados servem para reinstalar uma
            delas sem passar pelo Hub.
          </p>
          <Suspense fallback={<p role="status">Consultando os instaladores…</p>}>
            <ToolDownloads />
          </Suspense>
        </section>

        <section className="container section" aria-labelledby="requisitos">
          <h2 id="requisitos" className="display-3">
            O que o computador precisa.
          </h2>
          <div className="spec-grid">
            <div className="spec">
              <span className="eyebrow">Sistema</span>
              <strong>Windows 64 bits</strong>
              <p>A suíte ainda não tem versão para Mac ou Linux.</p>
            </div>
            <div className="spec">
              <span className="eyebrow">Internet</span>
              <strong>Para conectar e a cada {OFFLINE_HOURS} horas</strong>
              <p>No resto do tempo, as ferramentas trabalham sem rede.</p>
            </div>
            <div className="spec">
              <span className="eyebrow">Placa de vídeo</span>
              <strong>NVIDIA opcional</strong>
              <p>Deixa a gravação, a transcrição e a exportação do EdiAula mais rápidas.</p>
            </div>
            <div className="spec">
              <span className="eyebrow">Transcrição</span>
              <strong>Modelo baixado à parte</strong>
              <p>O EdiAula instala o motor de transcrição na primeira vez que você usar.</p>
            </div>
          </div>
          <p className="small muted license-note">
            O EdiAula usa FFmpeg e FFprobe, sob a licença GPLv3, como programas separados. As
            licenças e o código-fonte correspondente acompanham o instalador, em
            resources/native-media/Corresponding-Source.tar.xz.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
