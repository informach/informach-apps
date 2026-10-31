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
      preheader="Treinos, minutos e repetições de cada perfil"
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
  appUrl,
  unsubscribeUrl,
}: {
  appUrl: string;
  unsubscribeUrl?: string;
}) {
  return (
    <EmailLayout
      appName="Bora Treinar"
      title="Hora de treinar!"
      preheader="Ninguém da família treinou ainda hoje"
      cta={{ href: `${appUrl}/perfis`, label: "Bora treinar" }}
      unsubscribeUrl={unsubscribeUrl}
    >
      <p style={paragrafo}>
        Ninguém da família treinou ainda hoje. Dez minutinhos já contam: o Aquecimento 5 minutos ou
        o Primeiro treino são um bom começo.
      </p>
    </EmailLayout>
  );
}
