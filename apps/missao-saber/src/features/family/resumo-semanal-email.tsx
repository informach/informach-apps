import { EmailLayout } from "@informach/emails/templates";
import { listaPtBr } from "@/lib/texto";

export type BlocoResumo = {
  /** Id do perfil: só chave de renderização, não aparece no e-mail. */
  id: string;
  nome: string;
  linhas: string[];
  apoio: readonly string[];
};

const titulo = { fontSize: "18px", lineHeight: "26px", margin: "24px 0 6px", color: "#111827" };
const paragrafo = { fontSize: "15px", lineHeight: "24px", margin: "0 0 8px", color: "#374151" };
const lista = { margin: "0 0 8px", paddingLeft: "20px" };
const item = { fontSize: "15px", lineHeight: "24px", color: "#374151" };
const rodape = { fontSize: "13px", lineHeight: "20px", margin: "24px 0 0", color: "#6b7280" };

/**
 * Corpo do resumo semanal no layout compartilhado dos e-mails Informach:
 * cabeçalho do app, botão para o relatório e rodapé com o link de descadastro
 * visível, que o corpo solto de antes não tinha.
 */
export function ResumoSemanalEmail({
  blocos,
  appUrl,
  unsubscribeUrl,
}: {
  blocos: BlocoResumo[];
  appUrl: string;
  unsubscribeUrl?: string;
}) {
  return (
    <EmailLayout
      appName="Missão Saber"
      title="O que aconteceu nesta semana"
      preheader={`Resumo de ${listaPtBr(blocos.map((bloco) => bloco.nome))}`}
      cta={{ href: `${appUrl}/familia/acompanhamento`, label: "Ver o relatório completo" }}
      unsubscribeUrl={unsubscribeUrl}
    >
      {blocos.map((bloco) => (
        <div key={bloco.id}>
          <h2 style={titulo}>{bloco.nome}</h2>
          <p style={paragrafo}>{bloco.linhas.join(" ")}</p>
          {bloco.apoio.length ? (
            <>
              <p style={{ ...paragrafo, fontWeight: 600 }}>Para conversar em casa, sem tela:</p>
              <ul style={lista}>
                {bloco.apoio.map((ideia) => (
                  <li key={ideia} style={item}>
                    {ideia}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ))}
      <p style={rodape}>
        Este resumo vai só para a conta do responsável. Nenhum lembrete é enviado ao estudante.
      </p>
    </EmailLayout>
  );
}
