import { EDI_HUB, EDI_TOOLS } from "@informach/config/edi-tools";
import type { ReleaseManifest } from "@informach/edi-contracts";
import { cache } from "react";
import { HubIcon, ToolIcon } from "../../components/site/brand";
import { AlertIcon, DownloadIcon, ShieldIcon } from "../../components/site/icons";
import { logger } from "../../lib/logger";
import { getReleases } from "../../lib/releases";
import { formatInstallerSize, windowsPublisherCertified } from "./format";

type Catalog =
  | { state: "published"; manifest: ReleaseManifest }
  | { state: "pending" }
  | { state: "unavailable" };

// One manifest lookup per request, shared by the Hub card and the tool list.
const loadCatalog = cache(async (): Promise<Catalog> => {
  try {
    const manifest = await getReleases().active("stable");
    return manifest ? { state: "published", manifest } : { state: "pending" };
  } catch (error) {
    logger.warn(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "release.downloads_unavailable",
    );
    return { state: "unavailable" };
  }
});

const UNPUBLISHED: Record<Exclude<Catalog["state"], "published">, string> = {
  pending: "O primeiro instalador homologado ainda não foi publicado.",
  unavailable:
    "O catálogo está fora do ar agora. Nenhum instalador sem verificação é oferecido aqui. Tente de novo em alguns minutos.",
};

/** Download card for the Hub, fed by the signed public manifest. */
export async function HubDownload() {
  const catalog = await loadCatalog();
  const artifact =
    catalog.state === "published"
      ? catalog.manifest.artifacts.find((item) => item.appId === EDI_HUB.id)
      : undefined;
  return (
    <div className="download-card mat">
      <div className="download-card__body">
        <div className="download-card__app">
          <HubIcon />
          <span>
            <strong className="display-4">Edi Hub para Windows</strong>
            <small>
              {catalog.state === "published" && artifact
                ? `versão ${catalog.manifest.version} · 64 bits · ${formatInstallerSize(artifact.size)}`
                : "Windows 64 bits"}
            </small>
          </span>
        </div>
        {catalog.state === "published" && artifact ? (
          <a className="button button--primary button--lg button--block" href={artifact.url}>
            <DownloadIcon size={20} />
            Baixar o Edi Hub
          </a>
        ) : (
          <p className="download-card__status" role="status">
            {catalog.state === "published" ? UNPUBLISHED.pending : UNPUBLISHED[catalog.state]}
          </p>
        )}
        <p className="download-card__trust">
          <ShieldIcon size={18} />
          Cada instalador é conferido antes de aparecer aqui. Baixe sempre por edi.informach.com.br.
        </p>
      </div>
      <span className="ruler" aria-hidden="true" />
    </div>
  );
}

/** Individual installers for each tool, from the same manifest. */
export async function ToolDownloads() {
  const catalog = await loadCatalog();
  return (
    <ul className="tool-list">
      {EDI_TOOLS.map((tool) => {
        const artifact =
          catalog.state === "published"
            ? catalog.manifest.artifacts.find((item) => item.appId === tool.id)
            : undefined;
        return (
          <li key={tool.id}>
            <ToolIcon tool={tool.id} />
            <span className="tool-list__name">
              <strong>{tool.name}</strong>
              <span>{tool.description}</span>
            </span>
            {catalog.state === "published" && artifact ? (
              <>
                <span className="tool-list__meta">
                  versão {catalog.manifest.version} · {formatInstallerSize(artifact.size)}
                </span>
                <a className="button button--outline button--sm" href={artifact.url}>
                  Baixar
                  <span className="visually-hidden"> o {tool.name}</span>
                </a>
              </>
            ) : (
              <span className="tool-list__meta">Aguardando publicação</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Explains the SmartScreen warning while the Hub installer lacks a recognised publisher. */
export async function WindowsWarning() {
  const catalog = await loadCatalog();
  const hub =
    catalog.state === "published"
      ? catalog.manifest.artifacts.find((item) => item.appId === EDI_HUB.id)
      : undefined;
  if (hub && windowsPublisherCertified(hub.publisher)) return null;
  return (
    <section id="aviso-windows" className="container" aria-labelledby="aviso">
      <div className="notice notice--strong">
        <AlertIcon size={26} />
        <div>
          <h2 id="aviso" className="display-4">
            Versão piloto: o Windows pode estranhar.
          </h2>
          <p>
            Este instalador ainda não tem o certificado de publicador reconhecido pelo Windows. Se
            aparecer “O Windows protegeu o computador”, confira se o arquivo veio deste site, clique
            em <strong>Mais informações</strong> e depois em <strong>Executar assim mesmo</strong>.
          </p>
          <p className="muted small">
            Em computadores de escola ou de empresa, a instalação pode depender da equipe de TI.
          </p>
        </div>
      </div>
    </section>
  );
}
