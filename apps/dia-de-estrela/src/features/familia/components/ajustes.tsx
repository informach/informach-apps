"use client";
import {
  Bell,
  Copy,
  Download,
  LogOut,
  Minus,
  Plus,
  Smartphone,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { encode } from "uqr";
import { Erro, useAcao } from "@/components/acao";
import { brl } from "@/domain/estrelas";
import { CORES_CRIANCA } from "@/domain/modelos";
import { assinarAction, portalAction, reativarAction } from "@/features/billing/actions";
import { desconectarEsteAparelhoAction } from "@/features/crianca/actions";
import { authClient } from "@/lib/auth-client";
import {
  adicionarCriancaAction,
  apagarCriancaAction,
  ativarPushAction,
  cancelarConviteAction,
  convidarResponsavelAction,
  desativarPushAction,
  desconectarAparelhoAction,
  editarCriancaAction,
  escolherCriancaDoPlanoAction,
  gerarCodigoAparelhoAction,
  removerResponsavelAction,
  sairDaFamiliaAction,
  salvarAjustesAction,
  trocarPinAction,
} from "../actions";

const campo =
  "h-12 w-full rounded-xl border-2 border-linha-forte bg-white px-3 font-bold text-tinta placeholder:font-semibold placeholder:text-tinta-suave";

function Secao({
  id,
  titulo,
  descricao,
  children,
}: {
  id?: string;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="cartao flex scroll-mt-4 flex-col gap-3 p-4">
      <div>
        <h2 className="font-display text-xl font-extrabold">{titulo}</h2>
        {descricao && <p className="text-sm font-semibold text-tinta-suave">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/** Com o PIN no aparelho da criança, os ajustes da conta ficam de fora. */
export function AjustesNoAparelho() {
  const { pendente, erro, rodar } = useAcao();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-extrabold">Ajustes</h1>
      <Secao
        titulo="Este aparelho é da criança"
        descricao="Para mudar a assinatura, o PIN, os aparelhos ou o segundo responsável, entre com a sua conta no seu celular."
      >
        <button
          type="button"
          className="bp bp-perigo"
          disabled={pendente}
          onClick={() =>
            rodar(desconectarEsteAparelhoAction, (d) => window.location.assign(d.destination))
          }
        >
          Desconectar este aparelho
        </button>
        <Erro texto={erro} />
      </Secao>
    </div>
  );
}

export function Plano({
  titular,
  pago,
  assinatura,
  precos,
  criancas,
}: {
  titular: boolean;
  pago: boolean;
  assinatura: {
    productId: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
  precos: Record<string, number>;
  criancas: { id: string; name: string; allowed: boolean }[];
}) {
  const { pendente, erro, rodar } = useAcao();
  const ir = (d: { url: string | null | undefined }) => d.url && window.location.assign(d.url);
  return (
    <Secao id="plano" titulo={pago ? "Plano Família" : "Plano gratuito"}>
      {pago ? (
        <>
          <p className="font-semibold text-tinta-suave">
            Até 4 crianças, segundo responsável, alertas no celular, voz dos pais, loja completa e
            foto da meta.
            {assinatura?.cancelAtPeriodEnd && assinatura.currentPeriodEnd
              ? ` A assinatura termina em ${new Date(assinatura.currentPeriodEnd).toLocaleDateString("pt-BR")}.`
              : ""}
          </p>
          {titular && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="bp bp-claro"
                disabled={pendente}
                onClick={() => rodar(portalAction, ir)}
              >
                Gerenciar pagamento
              </button>
              {assinatura?.cancelAtPeriodEnd && (
                <button
                  type="button"
                  className="bp bp-ceu"
                  disabled={pendente}
                  onClick={() => rodar(reativarAction)}
                >
                  Manter a assinatura
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="font-semibold text-tinta-suave">
            Uma criança, rotinas, passo a passo, lembretes no tablet, estrelas e cofrinho. O Família
            libera até 4 crianças, segundo responsável, alertas no celular, voz dos pais, itens
            próprios na loja e foto da meta.
          </p>
          {titular ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="b3 b3-estrela normal-case tracking-normal"
                disabled={pendente}
                onClick={() => rodar(() => assinarAction("estrela_family_monthly"), ir)}
              >
                Família · {brl(precos.estrela_family_monthly ?? 0)}/mês
              </button>
              <button
                type="button"
                className="b3 b3-claro normal-case tracking-normal"
                disabled={pendente}
                onClick={() => rodar(() => assinarAction("estrela_family_annual"), ir)}
              >
                Família · {brl(precos.estrela_family_annual ?? 0)}/ano
              </button>
            </div>
          ) : (
            <p className="text-sm font-bold">Só o titular da conta pode assinar.</p>
          )}
          {titular && criancas.length > 1 && <EscolherCriancaDoPlano criancas={criancas} />}
        </>
      )}
      <Erro texto={erro} />
    </Secao>
  );
}

function EscolherCriancaDoPlano({
  criancas,
}: {
  criancas: { id: string; name: string; allowed: boolean }[];
}) {
  const { pendente, erro, rodar } = useAcao();
  return (
    <div className="rounded-xl bg-ceu-claro p-3">
      <p className="text-sm font-bold">
        No gratuito, uma criança fica ativa. As outras continuam guardadas e voltam com o Família.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {criancas.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.allowed}
            disabled={pendente || c.allowed}
            onClick={() => rodar(() => escolherCriancaDoPlanoAction(c.id))}
            className={`bp ${c.allowed ? "bp-ceu" : "bp-claro"}`}
          >
            {c.name}
            {c.allowed ? " (ativa)" : ""}
          </button>
        ))}
      </div>
      <Erro texto={erro} />
    </div>
  );
}

export function Criancas({
  titular,
  limite,
  criancas,
}: {
  titular: boolean;
  limite: number;
  criancas: { id: string; name: string; color: string }[];
}) {
  const ids = useId();
  const [nova, setNova] = useState("");
  const { pendente, erro, rodar } = useAcao();
  return (
    <Secao
      titulo="Crianças"
      descricao="Só o apelido e uma cor. Nada de idade, foto ou data de nascimento."
    >
      <ul className="flex flex-col gap-3">
        {criancas.map((c) => (
          <LinhaCrianca key={c.id} c={c} titular={titular} />
        ))}
      </ul>
      {criancas.length < limite ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(
              () =>
                adicionarCriancaAction({
                  name: nova,
                  color: CORES_CRIANCA[criancas.length % CORES_CRIANCA.length],
                }),
              () => setNova(""),
            );
          }}
        >
          <label className="sr-only" htmlFor={`${ids}-nova`}>
            Nome da nova criança
          </label>
          <input
            id={`${ids}-nova`}
            className={campo}
            maxLength={24}
            value={nova}
            placeholder="Nome da criança"
            onChange={(e) => setNova(e.target.value)}
          />
          <button type="submit" className="bp bp-ceu shrink-0" disabled={pendente || !nova.trim()}>
            <Plus className="size-4" aria-hidden="true" /> Adicionar
          </button>
        </form>
      ) : (
        <p className="text-sm font-bold text-tinta-suave">
          {limite === 1
            ? "O plano gratuito tem uma criança. O Família tem até quatro."
            : "A família já tem quatro crianças, o máximo do plano."}
        </p>
      )}
      <Erro texto={erro} />
    </Secao>
  );
}

function LinhaCrianca({
  c,
  titular,
}: {
  c: { id: string; name: string; color: string };
  titular: boolean;
}) {
  const [nome, setNome] = useState(c.name);
  const [apagando, setApagando] = useState(false);
  const { pendente, erro, rodar } = useAcao();
  const salvar = (patch: { name?: string; color?: string }) =>
    rodar(() =>
      editarCriancaAction({ id: c.id, name: patch.name ?? c.name, color: patch.color ?? c.color }),
    );
  return (
    <li className="rounded-xl border-2 border-linha p-3">
      <div className="flex items-center gap-2">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full font-display text-lg font-extrabold text-white"
          style={{ background: c.color }}
        >
          {(nome || "?").charAt(0).toUpperCase()}
        </span>
        <input
          aria-label={`Nome de ${c.name}`}
          className={campo}
          maxLength={24}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome.trim() && nome !== c.name && salvar({ name: nome.trim() })}
        />
        {titular && (
          <button
            type="button"
            aria-label={`Apagar ${c.name}`}
            className="grid size-11 shrink-0 place-items-center text-tinta-suave"
            onClick={() => setApagando(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <fieldset className="mt-2 flex min-w-0 gap-2">
        <legend className="sr-only">Cor de {c.name}</legend>
        {CORES_CRIANCA.map((cor) => (
          <button
            key={cor}
            type="button"
            aria-pressed={cor === c.color}
            aria-label={`Cor ${cor}`}
            disabled={pendente}
            onClick={() => salvar({ color: cor })}
            className={`size-9 rounded-full ${cor === c.color ? "ring-4 ring-ceu-borda" : ""}`}
            style={{ background: cor }}
          />
        ))}
      </fieldset>
      {apagando && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-[#fde8e6] p-3">
          <p className="flex-1 text-sm font-bold text-[#8f1d14]">
            Apagar {c.name}? A rotina, as estrelas e a meta dela também saem.
          </p>
          <button type="button" className="bp bp-claro" onClick={() => setApagando(false)}>
            Não
          </button>
          <button
            type="button"
            className="bp bp-perigo"
            disabled={pendente}
            onClick={() => rodar(() => apagarCriancaAction(c.id))}
          >
            Apagar
          </button>
        </div>
      )}
      <Erro texto={erro} />
    </li>
  );
}

function Qr({ texto }: { texto: string }) {
  const { data, size } = useMemo(() => encode(texto, { border: 1 }), [texto]);
  const caminho = useMemo(() => {
    let d = "";
    data.forEach((linha, y) => {
      linha.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return d;
  }, [data]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Código QR para conectar"
      className="size-40"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={caminho} fill="#1F2D45" />
    </svg>
  );
}

export function Aparelhos({
  criancas,
  aparelhos,
  nomes,
}: {
  criancas: { id: string; name: string }[];
  aparelhos: {
    id: string;
    label: string;
    childIds: string[];
    lastSeenAt: string | null;
    ativo: boolean;
  }[];
  nomes: Record<string, string>;
}) {
  const ids = useId();
  const [escolhidas, setEscolhidas] = useState<string[]>(criancas.map((c) => c.id));
  const [rotulo, setRotulo] = useState("Tablet da sala");
  const [codigo, setCodigo] = useState<{ code: string; url: string; expiresAt: string } | null>(
    null,
  );
  const [neste, setNeste] = useState(false);
  const { pendente, erro, setErro, rodar } = useAcao();
  const entrada = { childIds: escolhidas, label: rotulo };

  async function usarEste() {
    setErro(null);
    const r = await fetch("/api/aparelho/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entrada),
    });
    const corpo = (await r.json().catch(() => null)) as
      | { ok: true; data: { destination: string } }
      | { ok: false; error: string }
      | null;
    if (corpo?.ok) window.location.assign(corpo.data.destination);
    else setErro(corpo && !corpo.ok ? corpo.error : "Não foi possível usar este aparelho.");
  }

  const ativos = aparelhos.filter((a) => a.ativo);
  return (
    <Secao
      id="aparelhos"
      titulo="Aparelhos das crianças"
      descricao="O tablet (ou celular) em que a criança vê a rotina. Fica conectado por 30 dias, renovados enquanto ela usa."
    >
      {ativos.length > 0 && (
        <ul className="divide-y-2 divide-linha">
          {ativos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <Smartphone className="size-5 shrink-0 text-tinta-suave" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{a.label}</p>
                <p className="text-sm font-bold text-tinta-suave">
                  {a.childIds
                    .map((id) => nomes[id])
                    .filter(Boolean)
                    .join(", ")}
                  {a.lastSeenAt &&
                    ` · visto ${new Date(a.lastSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
                </p>
              </div>
              <button
                type="button"
                className="bp bp-claro"
                disabled={pendente}
                onClick={() => rodar(() => desconectarAparelhoAction(a.id))}
              >
                Desconectar
              </button>
            </li>
          ))}
        </ul>
      )}
      {codigo ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-ceu-claro p-4 text-center">
          <p className="font-bold">
            No aparelho da criança, abra <strong>{new URL(codigo.url).host}/conectar</strong> e
            digite:
          </p>
          <p className="font-display text-4xl font-extrabold tracking-[0.15em]">{codigo.code}</p>
          <Qr texto={codigo.url} />
          <p className="text-sm font-bold text-tinta-suave">
            Ou leia o código com a câmera do tablet. Vale por 10 minutos, uma vez só.
          </p>
          <button type="button" className="bp bp-claro" onClick={() => setCodigo(null)}>
            Pronto
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-linha-forte p-3">
          <p className="font-extrabold">Conectar um aparelho</p>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1 text-sm font-bold text-tinta-suave">Quem vai usar</legend>
            {criancas.map((c) => {
              const on = escolhidas.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setEscolhidas(on ? escolhidas.filter((x) => x !== c.id) : [...escolhidas, c.id])
                  }
                  className={`bp ${on ? "bp-ceu" : "bp-claro"}`}
                >
                  {c.name}
                </button>
              );
            })}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-bold" htmlFor={`${ids}-rotulo`}>
            Nome do aparelho
            <input
              id={`${ids}-rotulo`}
              className={campo}
              maxLength={60}
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="bp bp-ceu"
              disabled={pendente || !escolhidas.length || rotulo.trim().length < 2}
              onClick={() => rodar(() => gerarCodigoAparelhoAction(entrada), setCodigo)}
            >
              Gerar código para outro aparelho
            </button>
            {neste ? (
              <div className="flex flex-col gap-2 rounded-xl bg-estrela-clara p-3 text-sm font-bold">
                Você vai sair da sua conta neste aparelho e ele vira o da criança. Continuar?
                <div className="flex gap-2">
                  <button type="button" className="bp bp-claro" onClick={() => setNeste(false)}>
                    Não
                  </button>
                  <button type="button" className="bp bp-tinta" onClick={() => void usarEste()}>
                    Sim, usar este
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="bp bp-claro"
                disabled={!escolhidas.length || rotulo.trim().length < 2}
                onClick={() => setNeste(true)}
              >
                Usar este aparelho para as crianças
              </button>
            )}
          </div>
        </div>
      )}
      <Erro texto={erro} />
    </Secao>
  );
}

type Casa = {
  timezone: string;
  starsPerReal: number;
  warnBefore: number;
  repeatEvery: number;
  alertAfter: number;
  sound: boolean;
  voice: boolean;
  calm: boolean;
  chestBonus: number;
};

function Passo({
  rotulo,
  valor,
  min,
  max,
  sufixo,
  aoMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  sufixo?: string;
  aoMudar: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 font-bold">{rotulo}</span>
      <button
        type="button"
        aria-label={`Menos: ${rotulo}`}
        className="grid size-11 place-items-center rounded-xl border-2 border-linha-forte bg-white"
        onClick={() => aoMudar(Math.max(min, valor - 1))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-20 text-center font-display text-lg font-extrabold">
        {valor}
        {sufixo ? ` ${sufixo}` : ""}
      </span>
      <button
        type="button"
        aria-label={`Mais: ${rotulo}`}
        className="grid size-11 place-items-center rounded-xl border-2 border-linha-forte bg-white"
        onClick={() => aoMudar(Math.min(max, valor + 1))}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function Liga({
  rotulo,
  ligado,
  aoMudar,
}: {
  rotulo: string;
  ligado: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 font-bold">{rotulo}</span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={() => aoMudar(!ligado)}
        className={`relative h-8 w-14 shrink-0 rounded-full ${ligado ? "bg-folha-botao" : "bg-linha-forte"}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white ${ligado ? "left-7" : "left-1"}`}
        />
      </button>
    </div>
  );
}

export function AjustesDaCasa({ inicial }: { inicial: Casa }) {
  const [c, setC] = useState(inicial);
  const { pendente, erro, rodar } = useAcao();
  const [salvo, setSalvo] = useState(false);
  const muda = (patch: Partial<Casa>) => {
    setC((x) => ({ ...x, ...patch }));
    setSalvo(false);
  };
  const fusoDoAparelho =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : c.timezone;
  return (
    <Secao titulo="Lembretes e estrelas">
      <Passo
        rotulo="Aviso antes da tarefa"
        valor={c.warnBefore}
        min={0}
        max={30}
        sufixo="min"
        aoMudar={(v) => muda({ warnBefore: v })}
      />
      <Passo
        rotulo="Repetir o lembrete a cada"
        valor={c.repeatEvery}
        min={1}
        max={30}
        sufixo="min"
        aoMudar={(v) => muda({ repeatEvery: v })}
      />
      <Passo
        rotulo="Avisar os pais depois de"
        valor={c.alertAfter}
        min={1}
        max={10}
        sufixo="toques"
        aoMudar={(v) => muda({ alertAfter: v })}
      />
      <Passo
        rotulo="Estrelas para R$ 1,00"
        valor={c.starsPerReal}
        min={1}
        max={100}
        aoMudar={(v) => muda({ starsPerReal: v })}
      />
      <Passo
        rotulo="Surpresa do baú do dia"
        valor={c.chestBonus}
        min={0}
        max={50}
        sufixo="estrelas"
        aoMudar={(v) => muda({ chestBonus: v })}
      />
      <Liga rotulo="Som do sino" ligado={c.sound} aoMudar={(v) => muda({ sound: v })} />
      <Liga rotulo="Falar em voz alta" ligado={c.voice} aoMudar={(v) => muda({ voice: v })} />
      <Liga
        rotulo="Modo calmo (sem animação nem confete)"
        ligado={c.calm}
        aoMudar={(v) => muda({ calm: v })}
      />
      <p className="text-sm font-semibold text-tinta-suave">
        Fuso da casa: <strong>{c.timezone}</strong>
        {fusoDoAparelho && fusoDoAparelho !== c.timezone && (
          <button
            type="button"
            className="ml-2 font-extrabold text-ceu-escuro underline"
            onClick={() => muda({ timezone: fusoDoAparelho })}
          >
            Usar {fusoDoAparelho}
          </button>
        )}
      </p>
      <button
        type="button"
        className="bp bp-ceu"
        disabled={pendente}
        onClick={() =>
          rodar(
            () => salvarAjustesAction(c),
            () => setSalvo(true),
          )
        }
      >
        {pendente ? "Salvando…" : salvo ? "Salvo" : "Salvar ajustes"}
      </button>
      <Erro texto={erro} />
    </Secao>
  );
}

function base64ParaBytes(base64: string) {
  const limpo = base64.replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(limpo + "=".repeat((4 - (limpo.length % 4)) % 4));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

export function Push({
  disponivel,
  permitido,
  ativo,
  chavePublica,
}: {
  disponivel: boolean;
  permitido: boolean;
  ativo: boolean;
  chavePublica: string;
}) {
  const { pendente, erro, setErro, rodar } = useAcao();
  // Ligado *neste* navegador: o servidor só sabe se há alerta em algum aparelho.
  const [aqui, setAqui] = useState(false);
  useEffect(() => {
    if (!disponivel || !("serviceWorker" in navigator)) return;
    let vivo = true;
    void navigator.serviceWorker
      .getRegistration()
      .then((registro) => registro?.pushManager.getSubscription())
      .then((sub) => {
        if (vivo) setAqui(Boolean(sub));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [disponivel]);
  async function ativar() {
    setErro(null);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setErro(
        "Este navegador não recebe alertas. No iPhone, adicione o app à tela de início primeiro.",
      );
      return;
    }
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      setErro("Os alertas foram bloqueados. Libere as notificações nos ajustes do navegador.");
      return;
    }
    const registro = await navigator.serviceWorker.ready;
    const sub = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ParaBytes(chavePublica),
    });
    setAqui(true);
    rodar(() => ativarPushAction(sub.toJSON()));
  }
  async function desativar() {
    const registro = await navigator.serviceWorker?.getRegistration();
    const sub = await registro?.pushManager.getSubscription();
    setAqui(false);
    if (!sub) return;
    const { endpoint } = sub;
    await sub.unsubscribe();
    // Só a inscrição deste navegador sai; os outros aparelhos continuam recebendo.
    rodar(() => desativarPushAction(endpoint));
  }
  return (
    <Secao
      titulo="Alertas no celular"
      descricao="Quando uma tarefa passa do horário sem ser marcada. A tela bloqueada não mostra o nome da criança."
    >
      {!permitido ? (
        <p className="rounded-xl bg-uva-clara p-3 text-sm font-bold text-uva-escura">
          Os alertas no celular são do plano Família. No gratuito, eles aparecem no Início.
        </p>
      ) : !disponivel ? (
        <p className="text-sm font-bold text-tinta-suave">
          Os alertas no celular ainda não estão ligados neste servidor.
        </p>
      ) : aqui ? (
        <button
          type="button"
          className="bp bp-claro"
          disabled={pendente}
          onClick={() => void desativar()}
        >
          <Bell className="size-4" aria-hidden="true" /> Desligar neste celular
        </button>
      ) : (
        <button
          type="button"
          className="bp bp-ceu"
          disabled={pendente}
          onClick={() => void ativar().catch(() => setErro("Não foi possível ligar os alertas."))}
        >
          <Bell className="size-4" aria-hidden="true" /> Ligar neste celular
        </button>
      )}
      {permitido && disponivel && ativo && !aqui && (
        <p className="mt-2 text-sm font-bold text-tinta-suave">
          Já estão ligados em outro aparelho da família.
        </p>
      )}
      <Erro texto={erro} />
    </Secao>
  );
}

export function TrocarPin() {
  const ids = useId();
  const [pin, setPin] = useState("");
  const [ok, setOk] = useState(false);
  const { pendente, erro, rodar } = useAcao();
  return (
    <Secao
      titulo="PIN dos pais"
      descricao="Abre a área dos pais no aparelho da criança por 10 minutos. Cinco erros travam o PIN por 15 minutos."
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(
            () => trocarPinAction(pin),
            () => {
              setPin("");
              setOk(true);
            },
          );
        }}
      >
        <label className="sr-only" htmlFor={`${ids}-pin`}>
          Novo PIN
        </label>
        <input
          id={`${ids}-pin`}
          className={`${campo} font-display text-lg tracking-[0.3em]`}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4,6}"
          maxLength={6}
          value={pin}
          placeholder="Novo PIN"
          onChange={(e) => {
            setOk(false);
            if (/^\d{0,6}$/.test(e.target.value)) setPin(e.target.value);
          }}
        />
        <button type="submit" className="bp bp-ceu shrink-0" disabled={pendente || pin.length < 4}>
          Trocar
        </button>
      </form>
      {ok && <p className="text-sm font-bold text-folha-escura">PIN trocado.</p>}
      <Erro texto={erro} />
    </Secao>
  );
}

export function SegundoResponsavel({
  titular,
  permitido,
  estado,
}: {
  titular: boolean;
  permitido: boolean;
  estado: {
    guardian: { email: string; name: string | null } | null;
    invite: { email: string; expiresAt: string } | null;
  };
}) {
  const ids = useId();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const { pendente, erro, rodar } = useAcao();
  if (!titular)
    return (
      <Secao titulo="Família" descricao="Você é segundo responsável desta família.">
        <button
          type="button"
          className="bp bp-claro"
          disabled={pendente}
          onClick={() => rodar(sairDaFamiliaAction, (d) => window.location.assign(d.destination))}
        >
          Sair desta família
        </button>
        <Erro texto={erro} />
      </Secao>
    );
  return (
    <Secao
      titulo="Segundo responsável"
      descricao="Outro adulto da casa acompanha todas as crianças, recebe os alertas e aprova tarefas. A assinatura continua sua."
    >
      {!permitido ? (
        <p className="rounded-xl bg-uva-clara p-3 text-sm font-bold text-uva-escura">
          O segundo responsável é do plano Família.
        </p>
      ) : estado.guardian ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 font-bold">{estado.guardian.name || estado.guardian.email}</p>
          <button
            type="button"
            className="bp bp-claro"
            disabled={pendente}
            onClick={() => rodar(removerResponsavelAction)}
          >
            Remover
          </button>
        </div>
      ) : link ? (
        <div className="flex flex-col gap-2 rounded-xl bg-ceu-claro p-3">
          <p className="text-sm font-bold">Envie este link para {email}. Vale por 3 dias.</p>
          <p className="break-all rounded-lg bg-white p-2 text-xs font-bold">{link}</p>
          <button
            type="button"
            className="bp bp-ceu"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopiado(true))}
          >
            <Copy className="size-4" aria-hidden="true" /> {copiado ? "Copiado" : "Copiar link"}
          </button>
        </div>
      ) : (
        <>
          {estado.invite && (
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="flex-1">
                Convite para {estado.invite.email}, vale até{" "}
                {new Date(estado.invite.expiresAt).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
                .
              </span>
              <button
                type="button"
                className="bp bp-claro"
                disabled={pendente}
                onClick={() => rodar(cancelarConviteAction)}
              >
                Cancelar convite
              </button>
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              rodar(
                () => convidarResponsavelAction(email),
                (d) => setLink(d.url),
              );
            }}
          >
            <label className="sr-only" htmlFor={`${ids}-email`}>
              E-mail do segundo responsável
            </label>
            <input
              id={`${ids}-email`}
              type="email"
              className={campo}
              value={email}
              placeholder="E-mail do outro adulto"
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="submit"
              className="bp bp-ceu shrink-0"
              disabled={pendente || !email.includes("@")}
            >
              <UserPlus className="size-4" aria-hidden="true" /> Convidar
            </button>
          </form>
        </>
      )}
      <Erro texto={erro} />
    </Secao>
  );
}

export function Conta({ email, titular }: { email: string; titular: boolean }) {
  const { pendente, erro, setErro, rodar } = useAcao();
  const [aviso, setAviso] = useState<string | null>(null);
  const [excluir, setExcluir] = useState(false);
  return (
    <Secao titulo="Conta" descricao={email}>
      <div className="flex flex-wrap gap-2">
        {titular && (
          <a href="/api/conta/exportar" className="bp bp-claro">
            <Download className="size-4" aria-hidden="true" /> Baixar meus dados
          </a>
        )}
        <button
          type="button"
          className="bp bp-claro"
          disabled={pendente}
          onClick={() =>
            void authClient.signOut().then((r) => {
              if (r.error) setErro("Não foi possível sair agora.");
              else window.location.replace("/");
            })
          }
        >
          <LogOut className="size-4" aria-hidden="true" /> Sair da conta
        </button>
        <Link href="/termos" className="bp bp-claro">
          Termos
        </Link>
        <Link href="/privacidade" className="bp bp-claro">
          Privacidade
        </Link>
      </div>
      {excluir ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#fde8e6] p-3 text-sm font-bold text-[#8f1d14]">
          <span className="flex-1">
            A conta Informach é a mesma dos outros apps. Vamos mandar um e-mail para confirmar a
            exclusão.
          </span>
          <button type="button" className="bp bp-claro" onClick={() => setExcluir(false)}>
            Não
          </button>
          <button
            type="button"
            className="bp bp-perigo"
            disabled={pendente}
            onClick={() =>
              rodar(async () => {
                const r = await authClient.deleteUser({ callbackURL: "/" });
                setAviso(
                  r.error
                    ? "Não foi possível pedir a exclusão agora."
                    : "Enviamos um e-mail para confirmar a exclusão da conta.",
                );
                setExcluir(false);
                return { ok: true as const, data: null };
              })
            }
          >
            Excluir conta
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="self-start text-sm font-extrabold text-[#8f1d14] underline"
          onClick={() => setExcluir(true)}
        >
          Excluir a conta
        </button>
      )}
      {aviso && <p className="text-sm font-bold">{aviso}</p>}
      <Erro texto={erro} />
    </Secao>
  );
}
