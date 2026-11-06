"use client";
import { Camera, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Erro, useAcao } from "@/components/acao";
import { Estrela } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import { estrelasEmReais, precoEmEstrelas } from "@/domain/estrelas";
import { ICONES_RECOMPENSA } from "@/domain/modelos";
import { darBonusAction } from "@/features/pais/actions";
import {
  criarRecompensaAction,
  removerMetaAction,
  salvarMetaAction,
  tirarRecompensaAction,
} from "../actions";

const campo =
  "h-12 w-full rounded-xl border-2 border-linha-forte bg-white px-3 font-bold text-tinta placeholder:font-semibold placeholder:text-tinta-suave";

type CriancaCofrinho = {
  id: string;
  name: string;
  color: string;
  allowed: boolean;
  saldo: number;
  guardadas: number;
  goal: { name: string; stars: number; hasPhoto: boolean; updatedAt: Date } | null;
};

/** Reduz a foto no aparelho antes de enviar (lado maior 640 px, JPEG). */
async function reduzirFoto(arquivo: File, maximo = 640): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    await new Promise<void>((ok, falha) => {
      img.onload = () => ok();
      img.onerror = () => falha(new Error("imagem"));
      img.src = url;
    });
    const k = Math.min(1, maximo / Math.max(img.width, img.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(img.width * k);
    tela.height = Math.round(img.height * k);
    tela.getContext("2d")?.drawImage(img, 0, 0, tela.width, tela.height);
    let qualidade = 0.82;
    let dados = tela.toDataURL("image/jpeg", qualidade);
    while (dados.length > 320_000 && qualidade > 0.4) {
      qualidade -= 0.12;
      dados = tela.toDataURL("image/jpeg", qualidade);
    }
    return dados;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CofrinhoDaCrianca({
  c,
  starsPerReal,
  podeFoto,
}: {
  c: CriancaCofrinho;
  starsPerReal: number;
  podeFoto: boolean;
}) {
  const ids = useId();
  const [painel, setPainel] = useState<"meta" | "bonus" | null>(null);
  const [nome, setNome] = useState(c.goal?.name ?? "");
  const [reais, setReais] = useState(c.goal ? String(c.goal.stars / starsPerReal) : "");
  const [foto, setFoto] = useState<string | null | undefined>(undefined);
  const [bonus, setBonus] = useState(5);
  const [motivo, setMotivo] = useState("");
  const { pendente, erro, setErro, rodar } = useAcao();
  const valor = Number(reais.replace(",", ".")) || 0;
  const fotoAtual =
    foto === undefined
      ? c.goal?.hasPhoto
        ? `/api/meta/${c.id}/foto?v=${new Date(c.goal.updatedAt).getTime()}`
        : null
      : foto;
  const progresso = c.goal ? Math.min(100, Math.round((c.saldo / c.goal.stars) * 100)) : 0;

  return (
    <section className={`cartao p-4 ${c.allowed ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full font-display text-xl font-extrabold text-white"
          style={{ background: c.color }}
        >
          {c.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{c.name}</p>
          <p className="text-sm font-bold text-tinta-suave">
            {c.saldo} estrelas = {estrelasEmReais(c.saldo, starsPerReal)}
            {c.guardadas > 0 && ` · ${c.guardadas} guardadas em pedidos`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-uva-clara px-3 py-2 text-sm font-bold text-uva-escura">
        <Target className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {c.goal ? `${c.goal.name} · ${c.goal.stars} estrelas` : "Sem meta"}
        </span>
        {c.goal && <span>{progresso}%</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="bp bp-claro"
          onClick={() => setPainel(painel === "meta" ? null : "meta")}
        >
          <Target className="size-4" aria-hidden="true" /> {c.goal ? "Editar meta" : "Criar meta"}
        </button>
        <button
          type="button"
          className="bp bp-ceu"
          onClick={() => setPainel(painel === "bonus" ? null : "bonus")}
        >
          <Sparkles className="size-4" aria-hidden="true" /> Dar bônus
        </button>
      </div>

      {painel === "meta" && (
        <div className="mt-3 flex flex-col gap-3 border-t-2 border-linha pt-3">
          <label className="flex flex-col gap-1 font-bold" htmlFor={`${ids}-meta`}>
            O que {c.name} quer comprar
            <input
              id={`${ids}-meta`}
              className={campo}
              maxLength={40}
              value={nome}
              placeholder="Ex.: Lego de trem"
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 font-bold" htmlFor={`${ids}-preco`}>
            Preço (R$)
            <input
              id={`${ids}-preco`}
              className={campo}
              inputMode="decimal"
              value={reais}
              placeholder="90"
              onChange={(e) => setReais(e.target.value)}
            />
          </label>
          <p className="text-sm font-bold text-tinta-suave">
            = {Math.round(valor * starsPerReal)} estrelas
          </p>
          {podeFoto ? (
            <div className="flex items-center gap-3">
              <label
                className="grid size-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-uva bg-uva-clara text-uva-escura"
                style={
                  fotoAtual
                    ? { backgroundImage: `url(${fotoAtual})`, backgroundSize: "cover" }
                    : undefined
                }
              >
                {!fotoAtual && <Camera className="size-7" aria-hidden="true" />}
                <span className="sr-only">Escolher foto da meta</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const arquivo = e.target.files?.[0];
                    if (!arquivo) return;
                    try {
                      setFoto(await reduzirFoto(arquivo));
                    } catch {
                      setErro("Não foi possível abrir essa foto.");
                    }
                  }}
                />
              </label>
              <p className="text-sm font-semibold text-tinta-suave">
                Uma foto do que a criança quer ajuda muito a lembrar da meta.
                {fotoAtual && (
                  <button
                    type="button"
                    className="ml-1 font-extrabold text-ceu-escuro underline"
                    onClick={() => setFoto(null)}
                  >
                    Tirar foto
                  </button>
                )}
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-uva-clara p-3 text-sm font-bold text-uva-escura">
              Foto da meta é do plano Família.{" "}
              <Link href="/ajustes#plano" className="underline">
                Ver planos
              </Link>
            </p>
          )}
          <div className="flex gap-2">
            {c.goal && (
              <button
                type="button"
                className="bp bp-perigo"
                disabled={pendente}
                onClick={() =>
                  rodar(
                    () => removerMetaAction(c.id),
                    () => setPainel(null),
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden="true" /> Remover
              </button>
            )}
            <button
              type="button"
              className="bp bp-ceu flex-1"
              disabled={pendente || !nome.trim() || valor <= 0}
              onClick={() =>
                rodar(
                  () => salvarMetaAction({ childId: c.id, name: nome, reais: valor, photo: foto }),
                  () => setPainel(null),
                )
              }
            >
              Salvar meta
            </button>
          </div>
        </div>
      )}

      {painel === "bonus" && (
        <div className="mt-3 flex flex-col gap-3 border-t-2 border-linha pt-3">
          <fieldset className="flex flex-wrap gap-2 min-w-0">
            <legend className="sr-only">Quantas estrelas</legend>
            {[2, 5, 10, 20].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={bonus === n}
                onClick={() => setBonus(n)}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full px-4 font-extrabold ${
                  bonus === n ? "bg-estrela text-estrela-texto" : "bg-linha text-tinta-suave"
                }`}
              >
                +{n} <Estrela tamanho={16} />
              </button>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 font-bold" htmlFor={`${ids}-motivo`}>
            Por quê? (aparece no histórico)
            <input
              id={`${ids}-motivo`}
              className={campo}
              maxLength={60}
              value={motivo}
              placeholder="Ex.: Ajudou a arrumar a mesa"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="bp bp-ceu"
            disabled={pendente}
            onClick={() =>
              rodar(
                () => darBonusAction({ childId: c.id, stars: bonus, reason: motivo }),
                () => {
                  setPainel(null);
                  setMotivo("");
                },
              )
            }
          >
            Dar +{bonus} estrelas
          </button>
        </div>
      )}
      <Erro texto={erro} />
    </section>
  );
}

type Item = {
  id: string;
  kind: "money" | "custom";
  name: string;
  icon: string;
  priceStars: number | null;
  moneyCents: number | null;
};

export function LojaDaFamilia({
  itens,
  starsPerReal,
  podeItensProprios,
}: {
  itens: Item[];
  starsPerReal: number;
  podeItensProprios: boolean;
}) {
  const ids = useId();
  const [novo, setNovo] = useState<"custom" | "money" | null>(null);
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState<string>("gift");
  const [preco, setPreco] = useState(30);
  const [reais, setReais] = useState(5);
  const { pendente, erro, rodar } = useAcao();
  const fechar = () => {
    setNovo(null);
    setNome("");
  };
  return (
    <section className="cartao p-4">
      <h2 className="font-display text-xl font-extrabold">Loja de recompensas</h2>
      <p className="text-sm font-bold text-tinta-suave">
        O que as crianças podem pedir com as estrelas. O pagamento e a entrega são com vocês.
      </p>
      <ul className="mt-3 divide-y-2 divide-linha">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-estrela-clara text-estrela-texto">
              <Icone nome={i.icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1 font-extrabold">{i.name}</span>
            <span className="inline-flex items-center gap-1 text-sm font-extrabold text-estrela-texto">
              <Estrela tamanho={14} />
              {i.kind === "money" ? precoEmEstrelas(i.moneyCents ?? 0, starsPerReal) : i.priceStars}
            </span>
            <button
              type="button"
              aria-label={`Tirar ${i.name} da loja`}
              className="grid size-10 place-items-center text-tinta-suave"
              disabled={pendente}
              onClick={() => rodar(() => tirarRecompensaAction(i.id))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
        {!itens.length && <li className="py-3 font-bold text-tinta-suave">A loja está vazia.</li>}
      </ul>

      {novo === null ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="bp bp-claro" onClick={() => setNovo("money")}>
            <Plus className="size-4" aria-hidden="true" /> Dinheiro
          </button>
          <button
            type="button"
            className="bp bp-ceu"
            onClick={() => setNovo("custom")}
            disabled={!podeItensProprios}
            title={podeItensProprios ? undefined : "Itens próprios são do plano Família"}
          >
            <Plus className="size-4" aria-hidden="true" /> Outro item
          </button>
          {!podeItensProprios && (
            <p className="col-span-2 text-sm font-bold text-uva-escura">
              Tempo de tela, passeio, escolher o jantar… são do plano Família.{" "}
              <Link href="/ajustes#plano" className="underline">
                Ver planos
              </Link>
            </p>
          )}
        </div>
      ) : novo === "money" ? (
        <div className="mt-3 flex flex-col gap-2 border-t-2 border-linha pt-3">
          <label className="flex items-center gap-3 font-bold" htmlFor={`${ids}-reais`}>
            <span className="flex-1">Valor em reais</span>
            <input
              id={`${ids}-reais`}
              type="number"
              min={1}
              max={1000}
              className={`${campo} w-28`}
              value={reais}
              onChange={(e) => setReais(Number(e.target.value))}
            />
          </label>
          <p className="text-sm font-bold text-tinta-suave">= {reais * starsPerReal} estrelas</p>
          <div className="flex gap-2">
            <button type="button" className="bp bp-claro" onClick={fechar}>
              Cancelar
            </button>
            <button
              type="button"
              className="bp bp-ceu flex-1"
              disabled={pendente || reais < 1}
              onClick={() => rodar(() => criarRecompensaAction({ kind: "money", reais }), fechar)}
            >
              Pôr na loja
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 border-t-2 border-linha pt-3">
          <label className="flex flex-col gap-1 font-bold" htmlFor={`${ids}-nome`}>
            Nome do item
            <input
              id={`${ids}-nome`}
              className={campo}
              maxLength={40}
              value={nome}
              placeholder="Ex.: 30 min de videogame"
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <fieldset className="flex flex-wrap gap-1.5 min-w-0">
            <legend className="sr-only">Ícone do item</legend>
            {ICONES_RECOMPENSA.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={icone === n}
                aria-label={n}
                onClick={() => setIcone(n)}
                className={`grid size-11 place-items-center rounded-xl border-2 ${
                  icone === n
                    ? "border-ceu-escuro bg-ceu-escuro text-white"
                    : "border-linha bg-white text-tinta-suave"
                }`}
              >
                <Icone nome={n} className="size-5" />
              </button>
            ))}
          </fieldset>
          <label className="flex items-center gap-3 font-bold" htmlFor={`${ids}-preco`}>
            <span className="flex-1">Preço em estrelas</span>
            <input
              id={`${ids}-preco`}
              type="number"
              min={1}
              max={100000}
              className={`${campo} w-28`}
              value={preco}
              onChange={(e) => setPreco(Number(e.target.value))}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className="bp bp-claro" onClick={fechar}>
              Cancelar
            </button>
            <button
              type="button"
              className="bp bp-ceu flex-1"
              disabled={pendente || !nome.trim() || preco < 1}
              onClick={() =>
                rodar(
                  () =>
                    criarRecompensaAction({
                      kind: "custom",
                      name: nome,
                      icon: icone,
                      priceStars: preco,
                    }),
                  fechar,
                )
              }
            >
              Pôr na loja
            </button>
          </div>
        </div>
      )}
      <Erro texto={erro} />
    </section>
  );
}
