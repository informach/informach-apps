"use client";
import { APELIDO, VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormularioDoPerfil } from "@/features/perfis/components/formulario-do-perfil";
import { cadastrarMenorAction, cancelarMenorAction, prepararMenorAction } from "../actions";

const meses = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function CadastrarMenor({ anoAtual }: { anoAtual: number }) {
  const [intencao, setIntencao] = useState<string | null>(null);
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [assumo, setAssumo] = useState(false);
  const [erro, setErro] = useState("");
  const [recente, setRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();

  function abrir() {
    setErro("");
    iniciar(async () => {
      try {
        const resultado = await prepararMenorAction();
        if (resultado.ok) setIntencao(resultado.data.id);
        else {
          setErro(resultado.error);
          setRecente(resultado.code === "LOGIN_RECENTE" || resultado.code === "AUTH");
        }
      } catch {
        setErro("Não foi possível abrir o cadastro. Tente novamente.");
      }
    });
  }

  function cancelar() {
    if (!intencao) return;
    setErro("");
    iniciar(async () => {
      try {
        const resultado = await cancelarMenorAction(intencao);
        if (resultado.ok) window.location.assign(resultado.data.destination);
        else setErro(resultado.error);
      } catch {
        setErro("Não foi possível cancelar. Tente novamente.");
      }
    });
  }

  return (
    <section aria-labelledby="novo-perfil-menor" className="painel mt-6 p-5 sm:p-6">
      <h2 id="novo-perfil-menor" className="font-display text-xl font-bold">
        Cadastrar criança ou adolescente
      </h2>
      <p className="mt-2 text-tinta-suave">
        Você será responsável por este perfil. O mês e ano de nascimento definem os limites de idade
        e ficam fora dos jogos.
      </p>
      {!intencao ? (
        <button
          type="button"
          onClick={abrir}
          disabled={!interativo || pendente}
          className="rb rb-sol mt-4"
        >
          {pendente ? "Abrindo…" : "Adicionar perfil"}
        </button>
      ) : (
        <div className="mt-6">
          <FormularioDoPerfil
            inicial={{ apelido: "", avatar: "padrao" }}
            limites={APELIDO}
            textoDoBotao="Confirmar cadastro"
            textoPendente="Cadastrando…"
            aoEnviar={async (perfil) => {
              const resultado = await cadastrarMenorAction({
                intencaoId: intencao,
                perfil,
                nascimento: { mes: Number(mes), ano: Number(ano) },
                assumoResponsabilidade: assumo,
                versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
              });
              if (!resultado.ok)
                setRecente(resultado.code === "LOGIN_RECENTE" || resultado.code === "AUTH");
              return resultado;
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="nascimento-mes">Mês de nascimento</Label>
                <select
                  id="nascimento-mes"
                  name="nascimento-mes"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  required
                  className="mt-1.5 h-12 w-full rounded-controle border border-linha-forte bg-fundo px-3 text-tinta"
                >
                  <option value="">Escolha o mês</option>
                  {meses.map((nome, indice) => (
                    <option key={nome} value={indice + 1}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="nascimento-ano">Ano de nascimento</Label>
                <Input
                  id="nascimento-ano"
                  name="nascimento-ano"
                  type="number"
                  inputMode="numeric"
                  min={anoAtual - 18}
                  max={anoAtual}
                  value={ano}
                  onChange={(e) => setAno(e.target.value)}
                  required
                  className="mt-1.5 h-12 rounded-controle bg-fundo"
                />
              </div>
            </div>
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={assumo}
                onChange={(e) => setAssumo(e.target.checked)}
                required
                className="mt-1 size-5 shrink-0 accent-sol"
              />
              <span>
                Declaro que tenho 18 anos ou mais, sou responsável por esta criança ou adolescente e
                autorizo o uso do Recreio com os limites e cuidados descritos nos{" "}
                <Link href="/termos" target="_blank" className="font-bold text-ceu underline">
                  Termos
                </Link>{" "}
                e na{" "}
                <Link href="/privacidade" target="_blank" className="font-bold text-ceu underline">
                  Privacidade
                </Link>
                .
              </span>
            </label>
          </FormularioDoPerfil>
          <button
            type="button"
            onClick={cancelar}
            disabled={pendente}
            className="rb rb-vazado mt-3"
          >
            {pendente ? "Cancelando…" : "Cancelar cadastro"}
          </button>
        </div>
      )}
      <p role="status" className="mt-2 text-sm font-semibold text-coral">
        {erro}
      </p>
      {recente && (
        <Link
          href="/entrar?recente=1&next=%2Fconta%2Fperfis"
          className="mt-3 inline-block font-bold text-ceu underline"
        >
          Entrar novamente para confirmar
        </Link>
      )}
    </section>
  );
}
