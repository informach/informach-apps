"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import { salvarCoberturaAction } from "../actions";
import type { consultarGrupo } from "../service";

type Grupo = Awaited<ReturnType<typeof consultarGrupo>>;

export function CoberturaDoGrupo({
  grupo,
  novasCoberturas,
}: {
  grupo: Grupo;
  novasCoberturas: boolean;
}) {
  const [escolhas, definirEscolhas] = useState(() =>
    grupo.perfis.map((p) => ({ perfilId: p.perfilId, versao: p.versao, cobrir: p.selecionado })),
  );
  const [reconheco, definirReconheco] = useState(false);
  const [erro, definirErro] = useState("");
  const [recente, definirRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const hidratado = useHydrated();
  const aumenta = escolhas.some(
    (p) =>
      p.cobrir &&
      grupo.perfis.some((anterior) => anterior.perfilId === p.perfilId && !anterior.selecionado),
  );
  const excede =
    (aumenta || grupo.revisaoDaSelecao !== null) &&
    escolhas.filter((p) => p.cobrir).length > grupo.limite;
  const mudou = escolhas.some((p) =>
    grupo.perfis.some(
      (anterior) => anterior.perfilId === p.perfilId && anterior.selecionado !== p.cobrir,
    ),
  );

  return (
    <form
      className="mt-6"
      aria-busy={pendente}
      onSubmit={(e) => {
        e.preventDefault();
        definirErro("");
        definirRecente(false);
        if (!reconheco || excede || (!mudou && grupo.revisaoDaSelecao === null)) return;
        iniciar(async () => {
          try {
            const resultado = await salvarCoberturaAction({
              grupoId: grupo.grupoId,
              perfis: escolhas,
              ...(grupo.revisaoDaSelecao !== null
                ? { revisaoDoContrato: grupo.revisaoDaSelecao }
                : {}),
            });
            if (resultado.ok) window.location.assign(resultado.data.destination);
            else {
              definirErro(resultado.error);
              definirRecente(resultado.code === "LOGIN_RECENTE" || resultado.code === "AUTH");
            }
          } catch {
            definirErro(
              "Não foi possível confirmar a seleção. Reabra a cobertura para conferir o estado atual.",
            );
          }
        });
      }}
    >
      <fieldset disabled={!hidratado || pendente}>
        <legend className="font-display text-xl font-bold">Quem fica na cobertura</legend>
        {grupo.revisaoDaSelecao !== null && (
          <p role="status" className="painel mt-4 p-4 text-sm text-tinta-suave">
            A seleção precisa ser conferida: os perfis foram alterados desde a escolha anterior.
            Confira até {grupo.limite} {grupo.limite === 1 ? "perfil" : "perfis"} para continuar. O
            progresso permanece guardado. O acesso também depende do pagamento confirmado.
          </p>
        )}
        <div className="mt-4 grid gap-3">
          {grupo.perfis.map((p) => (
            <label
              key={p.perfilId}
              className="painel flex min-h-16 cursor-pointer items-center gap-4 p-4"
            >
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-ceu"
                checked={escolhas.some((e) => e.perfilId === p.perfilId && e.cobrir)}
                disabled={
                  (!novasCoberturas && !p.selecionado) ||
                  (!p.ativo && !escolhas.some((e) => e.perfilId === p.perfilId && e.cobrir))
                }
                onChange={(e) => {
                  const cobrir = e.target.checked;
                  definirEscolhas((anteriores) =>
                    anteriores.map((a) => (a.perfilId === p.perfilId ? { ...a, cobrir } : a)),
                  );
                  definirReconheco(false);
                }}
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="block font-bold">{p.apelido}</span>
                <span className="mt-1 block text-sm text-tinta-suave">
                  {!p.ativo
                    ? "Perfil suspenso: retire da cobertura"
                    : p.efetivo
                      ? "Na cobertura atual"
                      : "Sem cobertura para jogar neste momento"}
                </span>
              </span>
            </label>
          ))}
        </div>
        {excede && (
          <p role="alert" className="mt-4 text-sm font-semibold text-coral">
            Selecione até {grupo.limite} {grupo.limite === 1 ? "perfil" : "perfis"} para confirmar.
          </p>
        )}
        <p className="mt-5 text-sm text-tinta-suave">
          Alterar a cobertura encerra as partidas dos perfis alterados. O progresso já salvo
          continua guardado. A seleção não cancela cobranças nem muda a responsabilidade pelos
          perfis. Ao recolocar uma criança ou adolescente, o responsável precisa conferir sua
          supervisão.
        </p>
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
          <input
            type="checkbox"
            required
            className="mt-0.5 h-5 w-5 shrink-0 accent-ceu"
            checked={reconheco}
            onChange={(e) => definirReconheco(e.target.checked)}
          />
          <span>
            Conferi a seleção e entendo que as partidas dos perfis alterados serão encerradas.
          </span>
        </label>
        <button
          type="submit"
          className="rb rb-sol mt-4"
          disabled={!reconheco || excede || (!mudou && grupo.revisaoDaSelecao === null)}
        >
          {pendente ? "Confirmando…" : "Salvar cobertura"}
        </button>
      </fieldset>
      {erro && (
        <p role="alert" className="mt-4 text-sm font-semibold text-coral">
          {erro}
        </p>
      )}
      {recente && (
        <Link
          className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
          href="/entrar?recente=1&next=%2Fconta%2Fgrupo"
        >
          Entrar novamente para confirmar
        </Link>
      )}
      {erro && !recente && (
        <Link
          className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
          href="/conta/grupo"
        >
          Reabrir cobertura
        </Link>
      )}
    </form>
  );
}
