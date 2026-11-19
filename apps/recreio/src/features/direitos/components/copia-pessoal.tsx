"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { prepararArquivoPessoalAction, revogarArquivoPessoalAction } from "../actions";
import type { prepararArquivoPessoal } from "../exportacao-service";
import type { consultarMeusDireitos } from "../service";

export function CopiaPessoal({
  perfis,
}: {
  perfis: Awaited<ReturnType<typeof consultarMeusDireitos>>["perfis"];
}) {
  const hidratado = useHydrated(),
    [pendente, iniciar] = useTransition();
  const [perfilId, escolher] = useState("");
  const [pedido, definirPedido] = useState<{ copiaId: string; perfilId: string } | null>(null);
  const [copia, definirCopia] = useState<Awaited<ReturnType<typeof prepararArquivoPessoal>> | null>(
    null,
  );
  const [erro, definirErro] = useState(""),
    [recente, definirRecente] = useState(false);
  const [mensagem, informar] = useState("");
  const url = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  const bloqueado = !hidratado || pendente;
  function tratar(r: { error: string; code: string }) {
    definirErro(r.error);
    definirRecente(r.code === "AUTH" || r.code === "LOGIN_RECENTE");
  }
  return (
    <section aria-labelledby="copia-pessoal" className="painel mt-8 space-y-4 p-5 sm:p-6">
      <h2 id="copia-pessoal" className="font-display text-2xl font-bold">
        Uma cópia dos dados do perfil
      </h2>
      <p className="text-tinta-suave">
        Prepare um arquivo com cadastro, proteção, supervisão, progresso pessoal, versões,
        conflitos, conquistas e vínculos do perfil. O arquivo não inclui o conteúdo compartilhado
        dos mundos, contratos financeiros ou sua conta Informach.
      </p>
      <p className="text-sm text-tinta-suave">
        A cópia fica disponível por dez minutos neste login e aparelho. Preparar outra cópia
        substitui a anterior. Você também pode revogá-la antes do prazo.
      </p>
      {!perfis.length ? (
        <p>Você não tem perfil próprio ou sob sua responsabilidade para esta cópia.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (bloqueado || !perfilId) return;
            const atual = pedido ?? { copiaId: crypto.randomUUID(), perfilId };
            definirPedido(atual);
            definirErro("");
            definirRecente(false);
            informar("");
            iniciar(async () => {
              try {
                const r = await prepararArquivoPessoalAction(atual);
                if (r.ok) definirCopia(r.data);
                else tratar(r);
              } catch {
                definirErro(
                  "A resposta não chegou. Confira a mesma cópia antes de preparar outra.",
                );
              }
            });
          }}
        >
          <label htmlFor="perfil-copia-pessoal" className="block font-semibold">
            Perfil da cópia
          </label>
          <select
            id="perfil-copia-pessoal"
            value={perfilId}
            disabled={bloqueado || pedido !== null}
            required
            onChange={(e) => escolher(e.target.value)}
            className="h-12 w-full rounded-controle border border-linha-forte bg-fundo px-3 text-tinta"
          >
            <option value="">Escolha um perfil</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.apelido}
                {p.tipo === "minor" ? " — sob minha responsabilidade" : " — meu perfil"}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-3">
            <button className="rb rb-sol" type="submit" disabled={bloqueado || !perfilId}>
              {pendente
                ? "Conferindo…"
                : pedido
                  ? "Conferir esta cópia"
                  : "Preparar cópia do perfil"}
            </button>
            {pedido && (
              <button
                className="rb rb-vazado"
                type="button"
                disabled={bloqueado}
                onClick={() => {
                  definirPedido(null);
                  definirCopia(null);
                  definirErro("");
                  informar("");
                }}
              >
                Escolher outra cópia
              </button>
            )}
          </div>
        </form>
      )}
      {copia && (
        <div className="space-y-3 border-t border-linha-forte pt-4">
          <p className="font-semibold">Cópia preparada</p>
          <p className="text-sm text-tinta-suave">
            Válida até{" "}
            <time dateTime={copia.expiraEm}>
              {new Date(copia.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </time>
            . Arquivo de {Math.ceil(copia.bytes / 1024)} KB em JSON Lines.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rb rb-sol"
              disabled={bloqueado}
              onClick={() => {
                definirErro("");
                definirRecente(false);
                informar("");
                iniciar(async () => {
                  try {
                    const r = await fetch("/api/conta/dados/copia", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ copiaId: copia.copiaId }),
                    });
                    if (!r.ok) {
                      const falha: unknown = await r.json();
                      if (
                        falha &&
                        typeof falha === "object" &&
                        "error" in falha &&
                        typeof falha.error === "string" &&
                        "code" in falha &&
                        typeof falha.code === "string"
                      )
                        tratar({ error: falha.error, code: falha.code });
                      else
                        definirErro(
                          "Não foi possível baixar a cópia. Confira o prazo ou prepare outra.",
                        );
                      return;
                    }
                    const arquivo = await r.blob();
                    if (url.current) URL.revokeObjectURL(url.current);
                    url.current = URL.createObjectURL(arquivo);
                    const a = document.createElement("a");
                    a.href = url.current;
                    a.download = "recreio-perfil.jsonl";
                    document.body.append(a);
                    a.click();
                    a.remove();
                    informar("Arquivo entregue ao navegador. Confira seus downloads.");
                  } catch {
                    definirErro(
                      "Não foi possível receber o arquivo. Você pode tentar novamente dentro do prazo.",
                    );
                  }
                });
              }}
            >
              Baixar cópia do perfil
            </button>
            <button
              type="button"
              className="rb rb-vazado"
              disabled={bloqueado}
              onClick={() => {
                definirErro("");
                informar("");
                iniciar(async () => {
                  try {
                    const r = await revogarArquivoPessoalAction({ copiaId: copia.copiaId });
                    if (r.ok) {
                      definirCopia(null);
                      definirPedido(null);
                      informar("Cópia revogada. O arquivo temporário foi retirado do servidor.");
                    } else tratar(r);
                  } catch {
                    definirErro("A resposta não chegou. Tente revogar esta mesma cópia novamente.");
                  }
                });
              }}
            >
              Revogar cópia
            </button>
          </div>
        </div>
      )}
      {mensagem && (
        <p role="status" className="font-semibold">
          {mensagem}
        </p>
      )}
      {erro && (
        <p role="alert" className="font-semibold text-erro">
          {erro}
        </p>
      )}
      {recente && (
        <Link href="/entrar?recente=1&next=%2Fconta%2Fdados" className="rb rb-vazado">
          Entrar novamente para continuar
        </Link>
      )}
    </section>
  );
}
