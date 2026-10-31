"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatares";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { useServerAction } from "@/lib/use-server-action";
import { createCompetitionAction } from "../actions";
import { type Area, areas, LIMITES, PONTOS } from "../constantes";

type Perfil = {
  id: string;
  apelido: string;
  avatar: string;
  ano: string;
  areas: Record<Area, { elegivel: true; nivel: string } | { elegivel: false; motivo: string }>;
};

const rotuloTempo = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);

function Contador({
  rotulo,
  valor,
  min,
  max,
  aoMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  aoMudar: (v: number) => void;
}) {
  const botao =
    "grid size-12 place-items-center rounded-controle border-2 border-sombra bg-creme text-2xl font-bold text-tinta disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold">{rotulo}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          className={botao}
          aria-label={`Menos: ${rotulo}`}
          disabled={valor <= min}
          onClick={() => aoMudar(valor - 1)}
        >
          −
        </button>
        <output
          aria-live="polite"
          className="min-w-10 text-center font-display text-2xl font-semibold"
        >
          {valor}
        </output>
        <button
          type="button"
          className={botao}
          aria-label={`Mais: ${rotulo}`}
          disabled={valor >= max}
          onClick={() => aoMudar(valor + 1)}
        >
          +
        </button>
      </span>
    </div>
  );
}

function Opcoes({
  legenda,
  opcoes,
  valor,
  aoMudar,
}: {
  legenda: string;
  opcoes: readonly number[];
  valor: number;
  aoMudar: (v: number) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 font-semibold">{legenda}</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((s) => (
          <label
            key={s}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-controle border-2 px-3.5 font-bold",
              valor === s
                ? "border-uva-solido bg-uva-solido text-sobre-uva"
                : "border-sombra bg-creme",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={legenda}
              checked={valor === s}
              onChange={() => aoMudar(s)}
            />
            {rotuloTempo(s)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function NovaCompeticao({ perfis }: { perfis: Perfil[] }) {
  const router = useRouter();
  const pronto = useHydrated();
  const [titulo, setTitulo] = useState("Competição da família");
  const [area, setArea] = useState<Area>("matematica");
  const [escolhidos, setEscolhidos] = useState<string[]>(() => perfis.map((p) => p.id));
  const [problemas, setProblemas] = useState(6);
  const [desafios, setDesafios] = useState(1);
  const [segundosProblema, setSegundosProblema] = useState(90);
  const [segundosDesafio, setSegundosDesafio] = useState(300);
  const [erro, setErro] = useState("");
  const [reentrar, setReentrar] = useState(false);
  const [enviando, enviar] = useServerAction();
  // Uma chave por tentativa: tocar duas vezes não cria duas competições.
  const [chave, setChave] = useState(() => crypto.randomUUID());

  const jogam = perfis.filter((p) => escolhidos.includes(p.id) && p.areas[area].elegivel);
  const minutos = useMemo(
    () =>
      Math.ceil(
        (jogam.length * (problemas * (segundosProblema + 30) + desafios * (segundosDesafio + 60))) /
          60,
      ),
    [jogam.length, problemas, desafios, segundosProblema, segundosDesafio],
  );
  const vezes = jogam.length * (problemas + desafios);
  const nomes =
    jogam.length <= 1
      ? jogam.map((p) => p.apelido).join("")
      : `${jogam
          .slice(0, -1)
          .map((p) => p.apelido)
          .join(", ")} e ${jogam.at(-1)?.apelido}`;

  const alternar = (id: string) =>
    setEscolhidos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  const criar = (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro("");
    setReentrar(false);
    void enviar(async () => {
      const resultado = await createCompetitionAction({
        titulo,
        area,
        perfis: jogam.map((p) => p.id),
        problemas,
        desafios,
        segundosProblema,
        segundosDesafio,
        requestKey: chave,
      });
      if (resultado.ok) {
        router.push(`/familia/competicoes/${resultado.data.id}`);
        return;
      }
      setErro(resultado.error);
      setReentrar(resultado.code === "REAUTH" || resultado.code === "AUTH");
      setChave(crypto.randomUUID());
    });
  };

  if (!perfis.length)
    return (
      <p className="rounded-card border border-sombra bg-creme p-5">
        Primeiro prepare o perfil de quem vai jogar.{" "}
        <Link href="/familia/preparar" className="font-semibold underline">
          Preparar um perfil
        </Link>
      </p>
    );

  return (
    <form onSubmit={criar} className="grid gap-7">
      <label className="grid gap-2 font-semibold">
        Nome da competição
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={60}
          minLength={2}
          required
          className="min-h-12 rounded-controle border-2 border-sombra bg-creme px-4 text-lg font-semibold"
        />
      </label>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-3 font-display text-xl font-semibold">Área</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(areas) as Area[]).map((id) => (
            <label
              key={id}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-card border-[3px] p-5",
                area === id
                  ? "border-uva-solido bg-uva-claro shadow-chapa"
                  : "border-sombra bg-creme",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name="area"
                checked={area === id}
                onChange={() => setArea(id)}
              />
              <span className="font-display text-xl font-semibold">{areas[id].nome}</span>
              <span className="text-tinta-suave">{areas[id].fonte}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-3 font-display text-xl font-semibold">Quem joga</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perfis.map((perfil) => {
            const nivel = perfil.areas[area];
            const marcado = nivel.elegivel && escolhidos.includes(perfil.id);
            return (
              <label
                key={perfil.id}
                className={cn(
                  "flex flex-col gap-3 rounded-card border-[3px] p-4",
                  !nivel.elegivel
                    ? "cursor-not-allowed border-dashed border-sombra bg-papel opacity-80"
                    : marcado
                      ? "cursor-pointer border-verde-solido bg-verde-claro shadow-chapa"
                      : "cursor-pointer border-sombra bg-creme",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={marcado}
                  disabled={!nivel.elegivel}
                  onChange={() => alternar(perfil.id)}
                />
                <span className="flex items-center gap-3">
                  <Avatar id={perfil.avatar} tamanho="p" />
                  <span>
                    <span className="block font-display text-lg font-semibold">
                      {perfil.apelido}
                    </span>
                    <span className="block text-sm text-tinta-suave">{perfil.ano}</span>
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {nivel.elegivel ? `Nível: ${nivel.nivel}` : nivel.motivo}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid gap-4 rounded-card border border-sombra bg-creme p-5">
          <h2 className="font-display text-lg font-semibold">Problemas</h2>
          <Contador
            rotulo="Problemas por criança"
            valor={problemas}
            min={LIMITES.problemas.min}
            max={LIMITES.problemas.max}
            aoMudar={setProblemas}
          />
          <Opcoes
            legenda="Tempo para responder"
            opcoes={LIMITES.segundosProblema}
            valor={segundosProblema}
            aoMudar={setSegundosProblema}
          />
        </section>
        <section className="grid gap-4 rounded-card border border-sombra bg-creme p-5">
          <h2 className="font-display text-lg font-semibold">Desafios de peças</h2>
          <Contador
            rotulo="Desafios por criança"
            valor={desafios}
            min={LIMITES.desafios.min}
            max={LIMITES.desafios.max}
            aoMudar={setDesafios}
          />
          <Opcoes
            legenda="Tempo para montar"
            opcoes={LIMITES.segundosDesafio}
            valor={segundosDesafio}
            aoMudar={setSegundosDesafio}
          />
          <p className="text-sm text-tinta-suave">
            Cada criança recebe um desafio diferente, sorteado na faixa da idade dela.
          </p>
        </section>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-verde-claro p-5">
        <div>
          <p className="font-display text-lg font-semibold">
            {jogam.length
              ? `${nomes} · ${vezes} ${vezes === 1 ? "vez" : "vezes"} · cerca de ${minutos} min`
              : "Escolha quem joga"}
          </p>
          <p className="text-sm">
            Acerto em problema vale {PONTOS.problema} ponto. Desafio montado no tempo vale{" "}
            {PONTOS.desafio}.
          </p>
        </div>
        <BotaoChapa
          type="submit"
          medida="g"
          disabled={!pronto || enviando || !jogam.length || problemas + desafios === 0}
        >
          {enviando ? "Sorteando…" : "Sortear e abrir a sala"}
        </BotaoChapa>
      </section>
      {erro && (
        <p role="alert" className="rounded-card border-2 border-coral bg-coral-claro p-4">
          {erro}{" "}
          {reentrar && (
            <Link
              href="/entrar?next=%2Ffamilia%2Fcompeticoes%2Fnova"
              className="font-semibold underline"
            >
              Confirmar acesso e continuar
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
