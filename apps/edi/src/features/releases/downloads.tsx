import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import type { ReleaseManifest } from "@informach/edi-contracts";
import { logger } from "../../lib/logger";
import { getReleases } from "../../lib/releases";
export async function Downloads() {
  let manifest: ReleaseManifest | null = null;
  let message = "O primeiro instalador homologado ainda não foi publicado.";
  try {
    manifest = await getReleases().active("stable");
    if (manifest) message = `Versão ${manifest.version} · Windows 64 bits`;
  } catch (error) {
    logger.warn(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "release.downloads_unavailable",
    );
    message =
      "O catálogo está temporariamente indisponível. Nenhum instalador não verificado é oferecido aqui.";
  }
  return (
    <section aria-label="Instaladores do piloto">
      <p role="status">{message}</p>
      <div className="tools">
        {EDI_DESKTOP_APPS.map((app) => {
          const artifact = manifest?.artifacts.find((item) => item.appId === app.id);
          return (
            <article className="tool" key={app.id}>
              <h2>{app.name}</h2>
              <p>
                {app.id === "edi-hub"
                  ? "Instale e gerencie as cinco ferramentas da sua bancada."
                  : "A interface é preservada. Funções ainda em desenvolvimento serão concluídas em etapas posteriores."}
              </p>
              {artifact ? (
                <>
                  <a className="button" href={artifact.url}>
                    Baixar instalador do piloto
                  </a>
                  <small>Integridade verificada pelo manifesto da suíte · sem Authenticode</small>
                </>
              ) : (
                <span className="muted">Aguardando publicação homologada</span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
