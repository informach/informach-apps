"use client";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import type { CategoriaDeDenuncia } from "@informach/recreio/contrato";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useId, useRef, useState } from "react";
import { denunciarContatoAction, denunciarContatoDoMenorAction } from "../actions";
import { ErroSocial, useAcaoSocial } from "./acao";

const motivos: { valor: CategoriaDeDenuncia; rotulo: string }[] = [
  { valor: "contato_indesejado", rotulo: "Contato que eu não quero" },
  { valor: "assedio", rotulo: "Insistência, ofensa ou perseguição" },
  { valor: "conteudo_inadequado", rotulo: "Algo que não deveria aparecer aqui" },
  { valor: "dados_pessoais", rotulo: "Pedido ou exposição de dados pessoais" },
  { valor: "ameaca", rotulo: "Ameaça ou risco à segurança" },
  { valor: "outro", rotulo: "Outro cuidado com este contato" },
];
export function DenunciarContato({
  perfilId,
  alvoId,
  responsavel,
  destino,
  acesso,
}: {
  perfilId: string;
  alvoId: string;
  responsavel: boolean;
  destino: string;
  acesso: string;
}) {
  const id = useId(),
    hidratado = useHydrated(),
    acao = useAcaoSocial(destino);
  const [aberto, definirAberto] = useState(false),
    [categoria, definirCategoria] = useState<CategoriaDeDenuncia>("contato_indesejado"),
    [protocolo, definirProtocolo] = useState<string | null>(null);
  const tentativa = useRef<{ categoria: CategoriaDeDenuncia; id: string } | null>(null);
  return (
    <div className="mt-4 border-t border-linha pt-3">
      <button
        type="button"
        className="min-h-11 font-semibold text-coral underline"
        disabled={!hidratado || acao.pendente}
        aria-expanded={aberto}
        aria-controls={`${id}-formulario`}
        onClick={() => definirAberto(!aberto)}
      >
        {aberto ? "Fechar denúncia" : "Denunciar contato"}
      </button>
      {aberto && (
        <form
          id={`${id}-formulario`}
          className="mt-3 rounded-controle border border-linha bg-painel-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tentativa.current || tentativa.current.categoria !== categoria)
              tentativa.current = { categoria, id: crypto.randomUUID() };
            const entrada = { perfilId: alvoId, denunciaId: tentativa.current.id, categoria };
            acao.executar(
              () =>
                responsavel
                  ? denunciarContatoDoMenorAction(perfilId, entrada)
                  : denunciarContatoAction(perfilId, entrada),
              (recibo) => definirProtocolo(recibo.protocolo),
            );
          }}
        >
          <p className="text-sm text-tinta-suave">
            A equipe recebe o motivo e a referência deste contato para analisar. Denunciar não
            bloqueia a pessoa nem aplica uma punição automaticamente.
          </p>
          <fieldset disabled={!hidratado || acao.pendente || protocolo !== null} className="mt-4">
            <legend className="sr-only">Enviar denúncia sobre o contato</legend>
            <label htmlFor={`${id}-motivo`} className="text-sm font-semibold">
              O que aconteceu?
            </label>
            <select
              id={`${id}-motivo`}
              value={categoria}
              onChange={(e) => {
                const escolha = motivos.find((m) => m.valor === e.target.value);
                if (escolha) definirCategoria(escolha.valor);
              }}
              className="mt-2 min-h-12 w-full min-w-0 rounded-controle border border-linha bg-fundo px-3 text-sm text-tinta"
            >
              {motivos.map((motivo) => (
                <option key={motivo.valor} value={motivo.valor}>
                  {motivo.rotulo}
                </option>
              ))}
            </select>
            <button type="submit" className="rb rb-vazado mt-4">
              {acao.pendente ? "Enviando…" : "Enviar denúncia"}
            </button>
          </fieldset>
          {protocolo && (
            <div role="status" className="mt-4 text-sm">
              <p className="font-bold">Denúncia recebida.</p>
              <p className="mt-2">Guarde o protocolo para acompanhar pelo suporte.</p>
              {responsavel && (
                <a
                  href={INFORMACH_CONTACT.directMessageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center font-bold text-ceu underline"
                >
                  Falar com o suporte
                </a>
              )}
              <output
                aria-label="Protocolo da denúncia"
                className="mt-1 block break-all font-mono text-xs"
              >
                {protocolo}
              </output>
              <p className="mt-3 text-tinta-suave">
                Se quiser impedir novos contatos, use Bloquear neste cartão.
              </p>
            </div>
          )}
          <ErroSocial {...acao} destino={destino} acesso={acesso} />
        </form>
      )}
    </div>
  );
}
