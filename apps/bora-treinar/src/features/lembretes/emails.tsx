import { EmailLayout } from "@informach/emails/templates";
import type { BlocoPerfil } from "./conteudo";

const titulo = { fontSize: "18px", lineHeight: "26px", margin: "24px 0 6px", color: "#111827" };
const paragrafo = { fontSize: "15px", lineHeight: "24px", margin: "0 0 8px", color: "#374151" };

export function ResumoSemanalEmail({
  blocos,
  linhaDesafio,
  appUrl,
  unsubscribeUrl,
}: {
  blocos: BlocoPerfil[];
  linhaDesafio: string | null;
  appUrl: string;
  unsubscribeUrl?: string;
}) {
  return (
    <EmailLayout
      appName="Bora Treinar"
      title="A semana da família"
      preheader="A meta da semana, os treinos e os recordes de cada perfil"
      cta={{ href: `${appUrl}/perfis`, label: "Treinar agora" }}
      unsubscribeUrl={unsubscribeUrl}
    >
      {blocos.map((b) => (
        <div key={b.id}>
          <h2 style={titulo}>{b.nome}</h2>
          {b.linhas.map((l) => (
            <p key={l} style={paragrafo}>
              {l}
            </p>
          ))}
        </div>
      ))}
      {linhaDesafio ? (
        <p style={{ ...paragrafo, marginTop: "20px", fontWeight: 600 }}>{linhaDesafio}</p>
      ) : null}
    </EmailLayout>
  );
}

export function LembreteEmail({
  linhas,
  sugestao,
  appUrl,
  unsubscribeUrl,
}: {
  /** um perfil por linha: "Helena: 1 de 3 dias nesta semana." */
  linhas: string[];
  sugestao: string;
  appUrl: string;
  unsubscribeUrl?: string;
}) {
  return (
    <EmailLayout
      appName="Bora Treinar"
      title="Hora de treinar!"
      preheader={linhas[0] ?? "Ainda falta o treino de hoje"}
      cta={{ href: `${appUrl}/perfis`, label: "Bora treinar" }}
      unsubscribeUrl={unsubscribeUrl}
    >
      <p style={paragrafo}>Ainda falta o treino de hoje:</p>
      {linhas.map((l) => (
        <p key={l} style={{ ...paragrafo, fontWeight: 600 }}>
          {l}
        </p>
      ))}
      <p style={{ ...paragrafo, marginTop: "16px" }}>{sugestao}</p>
    </EmailLayout>
  );
}
