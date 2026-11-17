"use client";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { trocarPerfilComPinAction } from "../actions";

type Perfil = { id: string; apelido: string; avatar: string; atual: boolean };
type Alvo = { tipo: "perfil"; perfil: Perfil } | { tipo: "gestao" };
export function EscolherComPin({ perfis, gestao }: { perfis: Perfil[]; gestao: boolean }) {
  const [alvo, definirAlvo] = useState<Alvo | null>(null);
  const [pin, definirPin] = useState("");
  const [erro, definirErro] = useState("");
  const [entrar, definirEntrar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();
  const campoDoPin = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (alvo) campoDoPin.current?.focus();
  }, [alvo]);
  function escolher(proximo: Alvo) {
    definirAlvo(proximo);
    definirPin("");
    definirErro("");
    definirEntrar(false);
  }
  return (
    <div>
      <fieldset disabled={!interativo || pendente}>
        <legend className="sr-only">Escolher com PIN</legend>
        <ul className="grid gap-3 sm:grid-cols-2">
          {perfis.map((perfil) => (
            <li key={perfil.id}>
              <button
                type="button"
                onClick={() => escolher({ tipo: "perfil", perfil })}
                className="painel flex min-h-24 w-full items-center gap-4 p-4 text-left hover:bg-painel-2"
                aria-label={`Escolher ${perfil.apelido} com PIN`}
              >
                <AvatarDoPerfil avatar={perfil.avatar} apelido={perfil.apelido} />
                <span className="min-w-0">
                  <span className="block font-display text-xl font-bold [overflow-wrap:anywhere]">
                    {perfil.apelido}
                  </span>
                  <span className="mt-1 block text-sm text-tinta-suave">
                    {perfil.atual
                      ? "Neste aparelho · PIN do perfil"
                      : "Entrar com o PIN deste perfil"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {gestao && (
          <button
            type="button"
            className="rb rb-vazado mt-5"
            onClick={() => escolher({ tipo: "gestao" })}
          >
            Abrir área do adulto
          </button>
        )}
      </fieldset>
      {alvo && (
        <section aria-labelledby="pin-destino-titulo" className="painel mt-6 p-5 sm:p-6">
          <h2
            id="pin-destino-titulo"
            className="font-display text-xl font-bold [overflow-wrap:anywhere]"
          >
            {alvo.tipo === "gestao" ? "PIN da área do adulto" : `PIN de ${alvo.perfil.apelido}`}
          </h2>
          <p className="mt-2 text-sm text-tinta-suave">
            {alvo.tipo === "gestao"
              ? "Use o PIN da conta do adulto para voltar à gestão."
              : "Cada perfil tem seu próprio PIN. O PIN infantil não abre a área do adulto."}
          </p>
          <form
            className="mt-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              definirErro("");
              definirEntrar(false);
              iniciar(async () => {
                try {
                  const resultado = await trocarPerfilComPinAction({
                    pin,
                    destino:
                      alvo.tipo === "gestao"
                        ? { tipo: "gestao" }
                        : { tipo: "perfil", perfilId: alvo.perfil.id },
                  });
                  definirPin("");
                  if (resultado.ok) window.location.assign(resultado.data.destination);
                  else {
                    definirErro(resultado.error);
                    definirEntrar(resultado.code === "AUTH");
                  }
                } catch {
                  definirPin("");
                  definirErro("Não foi possível confirmar a escolha. Tente novamente.");
                }
              });
            }}
          >
            <fieldset disabled={!interativo || pendente}>
              <Label htmlFor="pin-escolha">PIN de seis números</Label>
              <Input
                id="pin-escolha"
                ref={campoDoPin}
                name="pin-escolha"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                value={pin}
                onChange={(e) => definirPin(e.target.value)}
                className="mt-1.5 h-12 max-w-xs bg-fundo"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="submit" className="rb rb-sol">
                  {pendente ? "Conferindo…" : "Confirmar escolha"}
                </button>
                <button
                  type="button"
                  className="rb rb-vazado"
                  onClick={() => {
                    definirAlvo(null);
                    definirPin("");
                    definirErro("");
                  }}
                >
                  Cancelar escolha
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <p role="status" className="mt-3 min-h-5 text-sm font-semibold text-coral">
        {erro}
      </p>
      {entrar && (
        <Link href="/entrar?recente=1&next=%2Fconta" className="font-bold text-ceu underline">
          O adulto precisa entrar novamente
        </Link>
      )}
    </div>
  );
}
