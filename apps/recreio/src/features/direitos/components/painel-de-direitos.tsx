"use client";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelarPreviaAction, prepararDireitosAction } from "../actions";
import type { consultarMeusDireitos, prepararPedidoDeDireitos } from "../service";

type Estado = Awaited<ReturnType<typeof consultarMeusDireitos>>;
type Previa = Awaited<ReturnType<typeof prepararPedidoDeDireitos>>;
type Tipo = "retirar_perfil" | "encerrar_conta";
type Pedido = { pedidoId: string; tipo: Tipo; perfis: string[] };
const data = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
const situacoes = { preparada: "Preparada", expirada: "Vencida", cancelada: "Cancelada" };

export function PainelDeDireitos({ estado }: { estado: Estado }) {
  const router = useRouter();
  const hidratado = useHydrated();
  const [pendente, iniciar] = useTransition();
  const [tipo, definirTipo] = useState<Tipo>("retirar_perfil");
  const [perfilId, definirPerfil] = useState("");
  const [conferi, conferir] = useState(false);
  const [pedido, definirPedido] = useState<Pedido | null>(null);
  const [previa, definirPrevia] = useState<Previa | null>(null);
  const [erro, definirErro] = useState("");
  const [recente, definirRecente] = useState(false);
  const [incerta, definirIncerta] = useState(false);
  const bloqueado = !hidratado || pendente;

  function tratar(resposta: { code: string; error: string }) {
    definirErro(resposta.error);
    definirRecente(resposta.code === "AUTH" || resposta.code === "LOGIN_RECENTE");
    definirIncerta(resposta.code === "UNEXPECTED");
  }
  function novaPrevia() {
    definirPedido(null);
    definirPrevia(null);
    conferir(false);
    definirErro("");
    definirIncerta(false);
  }
  function preparar() {
    if (bloqueado || !conferi || (tipo === "retirar_perfil" && !perfilId)) return;
    const atual = pedido ?? {
      pedidoId: crypto.randomUUID(),
      tipo,
      perfis: tipo === "encerrar_conta" ? estado.perfis.map((p) => p.id).sort() : [perfilId],
    };
    definirPedido(atual);
    definirErro("");
    definirRecente(false);
    iniciar(async () => {
      try {
        const resposta = await prepararDireitosAction(atual);
        if (resposta.ok) {
          definirPrevia(resposta.data);
          definirIncerta(false);
          router.refresh();
        } else tratar(resposta);
      } catch {
        definirErro("A resposta não chegou. Confira a mesma prévia antes de iniciar outra.");
        definirIncerta(true);
      }
    });
  }
  function cancelar(ref: { preparacaoId: string; planoSha256: string }) {
    if (bloqueado) return;
    definirErro("");
    definirRecente(false);
    iniciar(async () => {
      try {
        const resposta = await cancelarPreviaAction({
          preparacaoId: ref.preparacaoId,
          planoSha256: ref.planoSha256,
        });
        if (resposta.ok) {
          definirPrevia((anterior) =>
            anterior?.preparacaoId === ref.preparacaoId
              ? { ...anterior, situacao: "cancelada" }
              : anterior,
          );
          definirIncerta(false);
          router.refresh();
        } else tratar(resposta);
      } catch {
        definirErro("A resposta não chegou. Reabra a página para conferir a situação da prévia.");
      }
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <section aria-labelledby="previa-direitos" className="painel p-5 sm:p-6">
        <h2 id="previa-direitos" className="font-display text-2xl font-bold">
          Antes de decidir
        </h2>
        <p className="mt-3 text-tinta-suave">
          Prepare uma prévia dos perfis e mundos envolvidos. Preparar não exclui dados, não cancela
          assinatura e não encerra sua conta Informach.
        </p>
        <p className="mt-3 text-sm text-tinta-suave">
          A confirmação da exclusão ainda não está disponível nesta área.
        </p>
        <form
          className="mt-5 space-y-5"
          onSubmit={(evento) => {
            evento.preventDefault();
            preparar();
          }}
        >
          <fieldset disabled={bloqueado || incerta || pedido !== null} className="space-y-4">
            <legend className="font-bold">O que deseja conferir?</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="tipo-direitos"
                checked={tipo === "retirar_perfil"}
                onChange={() => {
                  definirTipo("retirar_perfil");
                  conferir(false);
                }}
                className="size-5"
              />
              Retirar um perfil
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="tipo-direitos"
                checked={tipo === "encerrar_conta"}
                onChange={() => {
                  definirTipo("encerrar_conta");
                  conferir(false);
                }}
                className="size-5"
              />
              Encerrar minha participação no Recreio
            </label>
            {tipo === "retirar_perfil" && (
              <div>
                <label htmlFor="direitos-perfil" className="block font-semibold">
                  Perfil
                </label>
                <select
                  id="direitos-perfil"
                  value={perfilId}
                  onChange={(e) => {
                    definirPerfil(e.target.value);
                    conferir(false);
                  }}
                  className="mt-2 h-12 w-full rounded-controle border border-linha-forte bg-fundo px-3 text-tinta"
                  required
                >
                  <option value="">Escolha um perfil</option>
                  {estado.perfis.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.apelido}
                      {p.tipo === "minor" ? " — sob minha responsabilidade" : " — meu perfil"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tipo === "retirar_perfil" && estado.perfis.length === 0 && (
              <p className="text-tinta-suave">
                Você não tem perfil próprio ou sob sua responsabilidade. Sua conta pode encerrar a
                participação sem criar um jogador.
              </p>
            )}
            {tipo === "encerrar_conta" && (
              <div>
                <p>O escopo inclui seu perfil e todos os perfis sob sua responsabilidade atual:</p>
                {estado.perfis.length ? (
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {estado.perfis.map((p) => (
                      <li key={p.id}>{p.apelido}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 font-semibold">
                    Sua conta não tem perfil de jogador ou responsabilidade por perfil.
                  </p>
                )}
                <p className="mt-3 text-sm text-tinta-suave">
                  Os dados dos demais adultos e participantes dos mundos precisam ser preservados.
                  Esta prévia não transfere responsabilidades.
                </p>
              </div>
            )}
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                checked={conferi}
                onChange={(e) => conferir(e.target.checked)}
                className="mt-1 size-5 shrink-0"
              />
              <span>
                Conferi a seleção e quero preparar a prévia. Isso ainda não autoriza exclusão.
              </span>
            </label>
          </fieldset>
          <button
            type="submit"
            className="rb rb-sol"
            disabled={bloqueado || !conferi || (tipo === "retirar_perfil" && !perfilId)}
          >
            {pendente ? "Conferindo…" : pedido ? "Conferir esta prévia" : "Preparar prévia"}
          </button>
        </form>
        {erro && (
          <p role="alert" className="mt-4 font-semibold text-erro">
            {erro}
          </p>
        )}
        {recente && (
          <Link href="/entrar?recente=1&next=%2Fconta%2Fdados" className="rb rb-vazado mt-4">
            Entrar novamente para continuar
          </Link>
        )}
      </section>
      {previa && (
        <section
          aria-labelledby="resultado-previa"
          className="painel p-5 sm:p-6"
          aria-live="polite"
        >
          <h2 id="resultado-previa" className="font-display text-2xl font-bold">
            Sua prévia
          </h2>
          <p className="mt-3 font-semibold">{situacoes[previa.situacao]}</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="font-semibold">Perfis selecionados</dt>
              <dd>{previa.plano.perfis.length}</dd>
            </div>
            <div>
              <dt className="font-semibold">Mundos com vínculos a resolver</dt>
              <dd>{previa.plano.mundos.length}</dd>
            </div>
            <div>
              <dt className="font-semibold">Validade da prévia</dt>
              <dd>
                <time dateTime={previa.expiraEm}>{data(previa.expiraEm)}</time>
              </dd>
            </div>
          </dl>
          {previa.desatualizada && (
            <p className="mt-4 font-semibold text-erro">
              O escopo mudou. Esta prévia não pode confirmar uma exclusão; prepare outra.
            </p>
          )}
          <p className="mt-4 text-tinta-suave">
            Nenhum dado foi excluído. Sua conta Informach e seus contratos financeiros continuam
            separados deste pedido.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {previa.situacao === "preparada" && (
              <button
                type="button"
                className="rb rb-vazado"
                disabled={bloqueado}
                onClick={() => cancelar(previa)}
              >
                Cancelar esta prévia
              </button>
            )}
            {!incerta && (
              <button
                type="button"
                className="rb rb-vazado"
                disabled={bloqueado}
                onClick={novaPrevia}
              >
                Preparar outra prévia
              </button>
            )}
          </div>
        </section>
      )}
      <section aria-labelledby="historico-previas" className="painel p-5 sm:p-6">
        <h2 id="historico-previas" className="font-display text-2xl font-bold">
          Prévias recentes
        </h2>
        {estado.preparacoes.length ? (
          <ul className="mt-4 divide-y divide-tinta/10">
            {estado.preparacoes.map((p) => (
              <li key={p.preparacaoId} className="py-4">
                <p className="font-semibold">
                  {p.tipo === "retirar_perfil" ? "Retirada de perfil" : "Participação no Recreio"} ·{" "}
                  {situacoes[p.situacao]}
                </p>
                <p className="mt-1 text-sm text-tinta-suave">
                  Preparada em <time dateTime={p.criadaEm}>{data(p.criadaEm)}</time>
                </p>
                {p.situacao === "preparada" && (
                  <button
                    type="button"
                    className="rb rb-vazado mt-3"
                    disabled={bloqueado}
                    onClick={() => cancelar(p)}
                  >
                    Cancelar prévia
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-tinta-suave">Você ainda não preparou um pedido nesta área.</p>
        )}
        {estado.temMais && (
          <p className="mt-3 text-sm text-tinta-suave">
            Esta lista mostra as vinte prévias mais recentes.
          </p>
        )}
      </section>
      <p className="text-sm text-tinta-suave">
        Para atendimento sobre seus dados,{" "}
        <a
          href={INFORMACH_CONTACT.directMessageUrl}
          className="font-bold text-ceu underline underline-offset-4"
        >
          fale com a Informach
        </a>
        .
      </p>
    </div>
  );
}
