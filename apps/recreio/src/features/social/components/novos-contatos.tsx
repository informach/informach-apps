"use client";
import { Input } from "@informach/ui/components/input";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useId, useRef, useState } from "react";
import { codigoSocialAction, pedirAmizadeAction } from "../actions";
import { ErroSocial, useAcaoSocial } from "./acao";

export function NovosContatos({ perfilId, acesso }: { perfilId: string; acesso: string }) {
  const hidratado = useHydrated(),
    id = useId();
  const emitir = useAcaoSocial("/amigos"),
    pedir = useAcaoSocial("/amigos");
  const [codigo, definirCodigo] = useState<{ codigo: string; expiraEm: string } | null>(null);
  const [copiado, definirCopiado] = useState("");
  const tentativa = useRef<{ codigo: string; pedidoId: string } | null>(null);
  return (
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      <section aria-labelledby={`${id}-meu-codigo`} className="painel p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-sol">
          Para alguém que você conhece
        </p>
        <h2 id={`${id}-meu-codigo`} className="mt-2 font-display text-2xl font-bold">
          Seu código de amizade
        </h2>
        <p className="mt-3 text-sm text-tinta-suave">
          Compartilhe só com a pessoa que você quer adicionar. Vale por 30 minutos e recebe um único
          pedido.
        </p>
        <fieldset disabled={!hidratado || emitir.pendente} className="mt-5">
          <legend className="sr-only">Preparar código de amizade</legend>
          <button
            type="button"
            className="rb rb-sol"
            onClick={() => {
              definirCodigo(null);
              definirCopiado("");
              emitir.executar(
                () => codigoSocialAction(perfilId),
                (novo) => definirCodigo({ codigo: novo.codigo, expiraEm: novo.expiraEm }),
              );
            }}
          >
            {emitir.pendente ? "Preparando…" : codigo ? "Gerar outro código" : "Gerar código"}
          </button>
          {codigo && (
            <div className="mt-5 rounded-controle border border-linha bg-painel-2 p-4">
              <output
                aria-label="Código de amizade"
                className="block break-all font-mono text-xl font-bold tracking-widest"
              >
                {codigo.codigo}
              </output>
              <p className="mt-2 text-xs text-tinta-suave">
                Válido até{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                }).format(new Date(codigo.expiraEm))}
                , horário de Brasília.
              </p>
              <button
                type="button"
                className="mt-2 min-h-11 font-bold text-ceu underline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(codigo.codigo);
                    definirCopiado("Código copiado.");
                  } catch {
                    definirCopiado("Selecione o código acima e copie para compartilhar.");
                  }
                }}
              >
                Copiar código
              </button>
              {copiado && (
                <p role="status" className="mt-2 text-sm">
                  {copiado}
                </p>
              )}
            </div>
          )}
        </fieldset>
        <p className="mt-3 text-xs text-tinta-suave">
          Gerar outro invalida o código anterior. Não desfaz pedidos já recebidos.
        </p>
        <ErroSocial {...emitir} destino="/amigos" acesso={acesso} />
      </section>
      <section aria-labelledby={`${id}-recebido`} className="painel p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-ceu">
          A pessoa compartilhou com você
        </p>
        <h2 id={`${id}-recebido`} className="mt-2 font-display text-2xl font-bold">
          Adicionar por código
        </h2>
        <p className="mt-3 text-sm text-tinta-suave">
          O pedido só vira amizade depois do aceite e das aprovações necessárias.
        </p>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget),
              lido = String(dados.get("codigo") ?? "");
            const normal = lido.trim().toUpperCase().replace(/[\s-]/g, "");
            if (!tentativa.current || tentativa.current.codigo !== normal)
              tentativa.current = { codigo: normal, pedidoId: crypto.randomUUID() };
            const atual = tentativa.current;
            pedir.executar(() =>
              pedirAmizadeAction(perfilId, { codigo: lido, pedidoId: atual.pedidoId }),
            );
          }}
        >
          <fieldset disabled={!hidratado || pedir.pendente}>
            <legend className="sr-only">Enviar pedido de amizade</legend>
            <label htmlFor={`${id}-codigo`} className="text-sm font-semibold">
              Código que você recebeu
            </label>
            <Input
              id={`${id}-codigo`}
              name="codigo"
              className="mt-2 font-mono uppercase tracking-widest"
              required
              minLength={12}
              maxLength={48}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={`${id}-ajuda`}
            />
            <p id={`${id}-ajuda`} className="mt-2 text-xs text-tinta-suave">
              São 12 letras e números. Espaços e traços são aceitos.
            </p>
            <button type="submit" className="rb rb-vazado mt-4">
              {pedir.pendente ? "Enviando…" : "Enviar pedido"}
            </button>
          </fieldset>
        </form>
        <ErroSocial {...pedir} destino="/amigos" acesso={acesso} />
      </section>
    </div>
  );
}
