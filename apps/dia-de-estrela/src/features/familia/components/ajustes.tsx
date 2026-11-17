"use client";
import { getAppUrl } from "@informach/config/domains";
import { Bell, Download, LogOut, Minus, Plus, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { encode } from "uqr";
import { Erro, useAcao } from "@/components/acao";

import { desconectarEsteAparelhoAction } from "@/features/crianca/actions";
import { authClient, ssoEnvironment } from "@/lib/auth-client";
import {
  adicionarCriancaAction,
  apagarCriancaAction,
  ativarPushAction,
  desativarPushAction,
  desconectarAparelhoAction,
  escolherCriancaDoPlanoAction,
  gerarCodigoAparelhoAction,
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
  familyGroupId,
  pago,
  limite,
  administrador,
  criancas,
}: {
  familyGroupId: string;
  pago: boolean;
  limite: number;
  administrador: boolean;
  criancas: { id: string; name: string; allowed: boolean; canManage: boolean }[];
}) {
  const { pendente, erro, rodar } = useAcao();
  return (
    <Secao
      titulo={pago ? "Acesso da família" : "Acesso gratuito"}
      descricao={`Até ${limite} ${limite === 1 ? "criança" : "crianças"}. Assinatura e pagamentos ficam na Minha conta.`}
    >
      <a
        className="bp bp-ceu"
        href={`${getAppUrl("conta", ssoEnvironment)}/?familia=${familyGroupId}#compasso`}
      >
        Ver Compasso na Minha conta
      </a>
      {administrador &&
        limite === 1 &&
        criancas.every((c) => c.canManage) &&
        criancas.length > 1 && (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">
              Escolha quem usa a vaga gratuita. Os outros históricos ficam guardados.
            </p>
            {criancas.map((c) => (
              <button
                key={c.id}
                type="button"
                className="bp bp-claro"
                disabled={pendente || c.allowed}
                onClick={() => rodar(() => escolherCriancaDoPlanoAction(c.id))}
              >
                {c.name}
                {c.allowed ? " · ativa" : " · ativar"}
              </button>
            ))}
          </div>
        )}
      <Erro texto={erro} />
    </Secao>
  );
}
export function Criancas({
  administrador,
  limite,
  criancas,
  pessoas,
  contaUrl,
}: {
  administrador: boolean;
  limite: number;
  contaUrl: string;
  criancas: { id: string; name: string; color: string; canManage: boolean }[];
  pessoas: { id: string; name: string }[];
}) {
  const [personId, setPersonId] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const { pendente, erro, rodar } = useAcao();
  const selectId = useId();
  return (
    <Secao
      titulo="Crianças e históricos"
      descricao="Nome e cor são compartilhados com os outros aplicativos. As rotinas e estrelas ficam no Dia de Estrela."
    >
      {criancas.map((c) => (
        <div key={c.id} className="rounded-xl border-2 border-linha-forte p-3">
          <div className="flex items-center gap-3">
            <span
              className="size-8 rounded-full"
              style={{ background: c.color }}
              aria-hidden="true"
            />
            <span className="flex-1 font-bold">{c.name}</span>
            {c.canManage && (
              <button
                type="button"
                className="bp bp-claro"
                disabled={pendente}
                onClick={() => setRemoving(c.id)}
              >
                Apagar histórico
              </button>
            )}
          </div>
          {removing === c.id && (
            <div className="mt-3 flex flex-wrap gap-2">
              <p className="w-full font-semibold">
                Apagar as rotinas, estrelas e pedidos de {c.name} neste app? A pessoa e os outros
                aplicativos serão preservados.
              </p>
              <button
                type="button"
                className="bp bp-claro"
                disabled={pendente}
                onClick={() => setRemoving(null)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="bp bp-ceu"
                disabled={pendente}
                onClick={() =>
                  rodar(
                    () => apagarCriancaAction(c.id),
                    () => setRemoving(null),
                  )
                }
              >
                Confirmar exclusão do histórico
              </button>
            </div>
          )}
        </div>
      ))}
      {administrador && pessoas.length > 0 && criancas.length < limite && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(
              () => adicionarCriancaAction(personId),
              () => setPersonId(""),
            );
          }}
        >
          <label htmlFor={selectId} className="font-bold">
            Ativar uma criança cadastrada
          </label>
          <select
            id={selectId}
            className={campo}
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            <option value="">Escolha uma pessoa</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="bp bp-ceu" disabled={pendente || !personId}>
            Ativar no Dia de Estrela
          </button>
        </form>
      )}
      <a className="bp bp-claro" href={contaUrl}>
        Pessoas e permissões na Minha conta
      </a>
      <Erro texto={erro} />
    </Secao>
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
          Os alertas no celular são do Compasso. No gratuito, eles aparecem no Início.
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

export function Conta({ email }: { email: string }) {
  const { pendente, erro, rodar } = useAcao();
  return (
    <Secao titulo="Conta" descricao={email}>
      <div className="flex flex-wrap gap-2">
        <a href="/api/conta/exportar" className="bp bp-claro">
          <Download className="size-4" aria-hidden="true" /> Baixar históricos autorizados
        </a>
        <button
          type="button"
          className="bp bp-claro"
          disabled={pendente}
          onClick={() =>
            rodar(async () => {
              const result = await authClient.signOut();
              if (result.error)
                return {
                  ok: false as const,
                  code: "SIGN_OUT_FAILED",
                  error: "Não foi possível sair agora.",
                };
              window.location.replace("/");
              return { ok: true as const, data: null };
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
      <p className="text-sm">
        Nome, e-mail, senha, segurança e exclusão da conta compartilhada são gerenciados na central
        da conta.
      </p>
      <a href={getAppUrl("conta", ssoEnvironment)}>Gerenciar minha conta compartilhada</a>
      <Erro texto={erro} />
    </Secao>
  );
}
