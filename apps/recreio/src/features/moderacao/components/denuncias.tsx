import type { acompanharDenuncias } from "../acompanhamento-service";
import { ReverDenuncia } from "./rever-denuncia";

const NOMES: Record<string, string> = {
  contato_indesejado: "Contato indesejado",
  assedio: "Insistência, ofensa ou perseguição",
  conteudo_inadequado: "Conteúdo inadequado",
  dados_pessoais: "Dados pessoais",
  ameaca: "Ameaça ou risco",
  outro: "Outro cuidado",
  aberta: "Recebida pela equipe",
  em_analise: "Em análise",
  recurso: "Revisão recebida",
  resolvida: "Resposta da equipe",
  encerrada: "Atendimento encerrado",
  sem_elementos: "Não foram encontrados elementos suficientes para uma medida.",
  medida_aplicada: "A equipe registrou uma medida para este caso.",
  duplicada: "O caso já estava registrado em outra denúncia.",
};
const data = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
export function DenunciasDoPerfil({
  pagina,
  gestor,
  destino,
  protocolo,
}: {
  pagina: Awaited<ReturnType<typeof acompanharDenuncias>>;
  gestor: boolean;
  destino: string;
  protocolo?: string;
}) {
  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Acompanhar denúncias</h1>
      <p className="mt-4 text-tinta-suave">
        Veja a situação dos pedidos enviados por este perfil. Denunciar ou pedir revisão não aplica
        punição automática. Informações de outras pessoas ficam protegidas.
      </p>
      <form action={destino} className="painel mt-6 p-5">
        <label htmlFor="consulta-denuncia" className="font-semibold">
          Protocolo completo
        </label>
        <input
          id="consulta-denuncia"
          name="protocolo"
          required
          maxLength={36}
          defaultValue={protocolo ?? ""}
          className="mt-2 min-h-12 w-full min-w-0 rounded-controle border border-linha bg-fundo px-3 font-mono text-sm"
        />
        <button type="submit" className="rb rb-vazado mt-3">
          Consultar protocolo
        </button>
        <a href={destino} className="mt-3 flex min-h-11 items-center font-bold text-ceu underline">
          Ver os dez pedidos mais recentes
        </a>
      </form>
      {pagina.denuncias.length === 0 ? (
        <p className="painel mt-6 p-5">
          Nenhuma denúncia disponível nesta consulta para este perfil.
        </p>
      ) : (
        <ul className="mt-6 grid gap-5">
          {pagina.denuncias.map((r) => (
            <li className="painel min-w-0 p-5" key={`${r.protocolo}:${r.revisao}`}>
              <h2 className="font-display text-xl font-bold">{NOMES[r.situacao]}</h2>
              <p className="mt-2 text-sm text-tinta-suave">
                {NOMES[r.categoria]} · Recebida em {data.format(new Date(r.recebidaEm))} (Brasília).
              </p>
              <p className="mt-3 break-all font-mono text-sm">{r.protocolo}</p>
              {r.decisao && (
                <p className="mt-3 font-semibold">
                  {r.recursoEm && ["recurso", "em_analise"].includes(r.situacao)
                    ? "Resposta anterior: "
                    : ""}
                  {NOMES[r.decisao]}
                </p>
              )}
              {r.recursoEm && (
                <p className="mt-3 text-sm text-tinta-suave">
                  Revisão solicitada em {data.format(new Date(r.recursoEm))} (Brasília). O histórico
                  anterior permanece registrado.
                </p>
              )}
              {r.prazoParaRevisao && (
                <p className="mt-3 text-sm text-tinta-suave">
                  Você pode pedir revisão até {data.format(new Date(r.prazoParaRevisao))}{" "}
                  (Brasília).
                </p>
              )}
              {r.podePedirRevisao && (
                <ReverDenuncia
                  perfilId={pagina.perfilId}
                  protocolo={r.protocolo}
                  revisao={r.revisao}
                  gestor={gestor}
                  destino={destino}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
