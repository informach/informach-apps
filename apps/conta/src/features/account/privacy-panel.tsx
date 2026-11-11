import { getCollectionApps } from "@informach/config/collections";
import { getAppUrl } from "@informach/config/domains";

export function PrivacyPanel({
  environment,
  status,
}: {
  environment: "production" | "development";
  status?: "recente" | "limite" | "erro";
}) {
  return (
    <section id="privacidade" className="section-block privacy-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">05 / Privacidade</p>
          <h2>Seus dados com você.</h2>
        </div>
      </div>
      <article className="sheet">
        <h3>Uma cópia da conta</h3>
        <p>
          Baixe seus dados de cadastro, famílias às quais você tem acesso, extratos compartilhados e
          seu histórico financeiro do Compasso e dos apps web.
        </p>
        <p className="small-note">
          Arquivo JSON, gerado durante o download. Os conteúdos de cada aplicativo ficam nas opções
          abaixo. Para baixar, sua entrada precisa ter sido feita nos últimos 15 minutos.
        </p>
        {status && (
          <p role="status">
            {status === "recente"
              ? "Entre novamente para confirmar sua identidade e depois solicite a cópia."
              : status === "limite"
                ? "Você já solicitou quatro cópias nesta hora. Aguarde antes de tentar novamente."
                : "Não conseguimos preparar sua cópia. Tente novamente em alguns instantes."}
          </p>
        )}
        {status === "recente" ? (
          <a href="/entrar?next=%2F%23privacidade">Confirmar minha entrada ↗</a>
        ) : (
          <a href="/api/account/export">Baixar dados da conta ↗</a>
        )}
      </article>
      <div className="apps-strip">
        {getCollectionApps("compasso", { publishedOnly: true }).map((app) =>
          app.privacyPath ? (
            <a key={app.slug} href={`${getAppUrl(app.slug, environment)}${app.privacyPath}`}>
              <span>Dados do {app.name}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ) : null,
        )}
      </div>
      <p className="small-note">
        Cada aplicativo permite exportar e gerenciar seus próprios dados. O acesso aos perfis
        continua seguindo as permissões da família.
      </p>
      <article className="sheet">
        <h3>Antes de encerrar</h3>
        <p>
          Confira suas responsabilidades na família, contratos pendentes e vínculos com outros
          produtos. A consulta preserva seus dados e exige entrada recente.
        </p>
        <a href="/privacidade/encerramento">Preparar encerramento ↗</a>
      </article>
    </section>
  );
}
