"use client";
import type {
  CategoriaDeDenuncia,
  ContatoSocial,
  ListaSocial,
  ParticipanteDoMundo,
  ParticipantesDoMundo,
  SocialDoPerfil,
} from "@informach/recreio/contrato";
import { ehErroDoRecreio } from "@informach/recreio/sdk";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { CATEGORIAS_DE_DENUNCIA } from "@/features/moderacao/categorias";
import { ProtocolosNaPartida } from "@/features/moderacao/components/protocolos-na-partida";
import {
  ConvitesNaPartida,
  EmitirConviteNaPartida,
} from "@/features/mundos/components/convites-na-partida";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { ConvidarParaVisita } from "@/features/visitas/components/convidar-na-partida";

type Executar = <T>(acao: () => Promise<T>, confirmado?: (dados: T) => void) => void;
const CAMPO =
  "mt-2 min-h-11 w-full min-w-0 rounded-controle border border-linha bg-fundo px-3 text-sm text-tinta";
function mensagem(erro: unknown) {
  if (ehErroDoRecreio(erro, "MUITAS_TENTATIVAS"))
    return "Muitas tentativas seguidas. Aguarde alguns minutos e confira seus contatos.";
  if (ehErroDoRecreio(erro, "REVISAO_DIVERGENTE") || ehErroDoRecreio(erro, "NAO_ENCONTRADO"))
    return "Este contato mudou. Atualize a lista antes de continuar.";
  return "Não recebemos a confirmação. Confira os contatos e seus protocolos antes de repetir uma ação.";
}

/** Só o SID do SDK. Não navega, não desmonta o jogo e não recebe autoridade da conta. */
export function PainelSocialDaPartida({
  api,
  aoFechar,
  mundoId,
}: {
  api: SocialDoPerfil;
  aoFechar: () => void;
  mundoId?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null),
    vivo = useRef(true),
    titulo = useId();
  const [lista, definirLista] = useState<ListaSocial | null>(null),
    [erro, definirErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const pagina = useRef<string | undefined>(undefined);
  useEffect(() => {
    vivo.current = true;
    const elemento = dialogo.current;
    elemento?.showModal();
    return () => {
      vivo.current = false;
      elemento?.close();
    };
  }, []);
  useEffect(() => {
    let atual = true;
    void api
      .listar()
      .then((dados) => {
        if (atual) definirLista(dados);
      })
      .catch((falha) => {
        if (atual) definirErro(mensagem(falha));
      });
    return () => {
      atual = false;
    };
  }, [api]);
  const atualizar = async () => {
    const dados = await api.listar(pagina.current);
    if (vivo.current) definirLista(dados);
  };
  const conferir = () => {
    definirErro("");
    iniciar(async () => {
      try {
        await atualizar();
      } catch (falha) {
        if (vivo.current) definirErro(mensagem(falha));
      }
    });
  };
  const executar: Executar = (acao, confirmado) => {
    definirErro("");
    iniciar(async () => {
      try {
        const dados = await acao();
        if (!vivo.current) return;
        confirmado?.(dados);
        await atualizar();
      } catch (falha) {
        if (vivo.current) definirErro(mensagem(falha));
      }
    });
  };
  return (
    <dialog
      ref={dialogo}
      aria-labelledby={titulo}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onKeyDown={(evento) => {
        if (evento.key !== "Tab") return;
        const controles = Array.from(
          evento.currentTarget.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], [tabindex]",
          ),
        ).filter(
          (elemento) =>
            elemento.tabIndex >= 0 &&
            !elemento.matches(":disabled, [inert], [hidden]") &&
            elemento.getClientRects().length > 0,
        );
        const primeiro = controles[0],
          ultimo = controles.at(-1);
        if (!primeiro || !ultimo) return;
        if (evento.shiftKey && document.activeElement === primeiro) {
          evento.preventDefault();
          ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primeiro.focus();
        }
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-controle border border-linha bg-fundo p-5 text-tinta shadow-2xl backdrop:bg-black/70 sm:p-7"
    >
      <div className="sticky top-0 z-10 -mx-1 -mt-1 flex flex-wrap items-start justify-between gap-3 bg-fundo px-1 pt-1 pb-4">
        <h2 id={titulo} className="font-display text-2xl font-extrabold">
          Amigos e proteção
        </h2>
        <button type="button" className="rb rb-vazado" onClick={aoFechar}>
          Voltar à partida
        </button>
      </div>
      <p className="mt-3 text-sm text-tinta-suave">
        A partida continua aberta e o mundo continua em execução. Para sair e salvar, use a saída do
        jogo depois de fechar este painel.
      </p>
      {erro && (
        <p
          role="alert"
          className="mt-4 rounded-controle border border-linha p-3 text-sm text-coral"
        >
          {erro}
        </p>
      )}
      <button
        type="button"
        className="mt-3 min-h-11 font-semibold text-ceu underline"
        disabled={pendente}
        onClick={conferir}
      >
        {pendente ? "Conferindo…" : "Atualizar contatos"}
      </button>
      {!lista ? (
        <p role="status" className="mt-5 text-tinta-suave">
          {erro ? "A lista ainda não foi confirmada." : "Conferindo seus contatos…"}
        </p>
      ) : (
        <>
          {mundoId && (
            <ParticipantesNaPartida
              api={api}
              mundoId={mundoId}
              conhecidos={lista.contatos.map((c) => c.perfilId)}
            />
          )}
          {lista.podeCriarContatos ? (
            <NovosContatosNaPartida api={api} executar={executar} pendente={pendente} />
          ) : (
            <p className="painel mt-5 p-4 text-sm text-tinta-suave">
              Novos contatos estão indisponíveis para este perfil agora. Você pode cuidar dos
              contatos já conhecidos.
            </p>
          )}
          <section className="mt-7" aria-labelledby={`${titulo}-contatos`}>
            <h3 id={`${titulo}-contatos`} className="font-display text-xl font-bold">
              Seus contatos e pedidos
            </h3>
            <p className="mt-2 text-sm text-tinta-suave">
              Amizade não concede acesso a mundos. Bloquear encerra a amizade e pedidos; remover não
              apaga o progresso nem as participações nos mundos.
            </p>
            {lista.contatos.length === 0 ? (
              <p className="painel mt-4 p-4">Nenhum contato ou pedido nesta página.</p>
            ) : (
              <div className="mt-4 grid gap-4">
                {lista.contatos.map((c) => (
                  <ContatoNaPartida
                    key={c.perfilId}
                    contato={c}
                    api={api}
                    executar={executar}
                    pendente={pendente}
                    podeCriar={lista.podeCriarContatos}
                    mundoId={mundoId}
                  />
                ))}
              </div>
            )}
            <nav className="mt-3 flex flex-wrap gap-4" aria-label="Páginas dos contatos na partida">
              {pagina.current && (
                <button
                  type="button"
                  className="min-h-11 font-bold text-ceu underline"
                  disabled={pendente}
                  onClick={() => {
                    pagina.current = undefined;
                    conferir();
                  }}
                >
                  Primeira página
                </button>
              )}
              {lista.proximo && (
                <button
                  type="button"
                  className="min-h-11 font-bold text-ceu underline"
                  disabled={pendente}
                  onClick={() => {
                    pagina.current = lista.proximo ?? undefined;
                    conferir();
                  }}
                >
                  Próximos contatos
                </button>
              )}
            </nav>
          </section>
          <section className="painel mt-6 p-4" aria-labelledby={`${titulo}-presenca`}>
            <h3 id={`${titulo}-presenca`} className="font-display text-lg font-bold">
              Sua presença
            </h3>
            {lista.presencaEditavel ? (
              <label
                className="mt-3 block text-sm font-semibold"
                htmlFor={`${titulo}-visibilidade`}
              >
                Quem pode ver que você está jogando
                <select
                  id={`${titulo}-visibilidade`}
                  className={CAMPO}
                  value={lista.presenca}
                  disabled={pendente}
                  onChange={(evento) => {
                    const modo = (["friends", "online", "invisible"] as const).find(
                      (m) => m === evento.target.value,
                    );
                    if (modo) executar(() => api.presenca(modo));
                  }}
                >
                  <option value="friends">Só amigos</option>
                  <option value="online">Online</option>
                  <option value="invisible">Invisível</option>
                </select>
              </label>
            ) : (
              <p className="mt-2 text-sm text-tinta-suave">
                Seu responsável cuida da visibilidade na supervisão do perfil.
              </p>
            )}
            <p className="mt-2 text-sm text-tinta-suave">
              O Recreio não mostra o nome do mundo nem onde você está jogando.
            </p>
          </section>
        </>
      )}
      <ProtocolosNaPartida api={api} />
      {api.convitesDeMundo && <ConvitesNaPartida api={api.convitesDeMundo} />}
    </dialog>
  );
}

function NovosContatosNaPartida({
  api,
  executar,
  pendente,
}: {
  api: SocialDoPerfil;
  executar: Executar;
  pendente: boolean;
}) {
  const id = useId(),
    tentativa = useRef<{ codigo: string; id: string } | null>(null);
  const [codigo, definirCodigo] = useState<{ codigo: string; expiraEm: string } | null>(null),
    [recebido, definirRecebido] = useState("");
  return (
    <div className="mt-5 grid gap-4">
      <section className="painel p-4" aria-labelledby={`${id}-codigo`}>
        <h3 id={`${id}-codigo`} className="font-display text-lg font-bold">
          Seu código de amizade
        </h3>
        <p className="mt-2 text-sm text-tinta-suave">
          Compartilhe só com quem você conhece. Vale por trinta minutos e recebe um pedido; gerar
          outro invalida o anterior.
        </p>
        <button
          type="button"
          className="rb rb-sol mt-3"
          disabled={pendente}
          onClick={() => executar(() => api.codigo(), definirCodigo)}
        >
          Gerar código
        </button>
        {codigo && (
          <>
            <output
              aria-label="Código de amizade da partida"
              className="mt-3 block break-all font-mono text-xl font-bold tracking-widest"
            >
              {codigo.codigo}
            </output>
            <p className="mt-2 text-sm text-tinta-suave">
              Válido até{" "}
              {new Date(codigo.expiraEm).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              , no horário deste aparelho.
            </p>
          </>
        )}
      </section>
      <form
        className="painel p-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          const normalizado = recebido.trim().toUpperCase().replace(/[\s-]/g, "");
          if (!tentativa.current || tentativa.current.codigo !== normalizado)
            tentativa.current = { codigo: normalizado, id: crypto.randomUUID() };
          const pedidoId = tentativa.current.id;
          executar(
            () => api.pedir(recebido, pedidoId),
            () => definirRecebido(""),
          );
        }}
      >
        <label className="font-display text-lg font-bold" htmlFor={`${id}-recebido`}>
          Código que você recebeu
        </label>
        <input
          id={`${id}-recebido`}
          value={recebido}
          maxLength={48}
          required
          className={CAMPO}
          disabled={pendente}
          onChange={(evento) => definirRecebido(evento.target.value)}
        />
        <p className="mt-2 text-sm text-tinta-suave">
          O pedido precisa do aceite e das aprovações necessárias.
        </p>
        <button type="submit" className="rb rb-vazado mt-3" disabled={pendente}>
          Enviar pedido
        </button>
      </form>
    </div>
  );
}

function ParticipantesNaPartida({
  api,
  mundoId,
  conhecidos,
}: {
  api: SocialDoPerfil;
  mundoId: string;
  conhecidos: readonly string[];
}) {
  const vivo = useRef(true),
    pagina = useRef<string | undefined>(undefined);
  const [dados, definirDados] = useState<ParticipantesDoMundo | null>(null),
    [erro, definirErro] = useState("");
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    vivo.current = true;
    let atual = true;
    void api
      .participantes(mundoId)
      .then((r) => {
        if (atual) definirDados(r);
      })
      .catch((falha) => {
        if (atual) definirErro(mensagem(falha));
      });
    return () => {
      atual = false;
      vivo.current = false;
    };
  }, [api, mundoId]);
  const executar: Executar = (acao, confirmado) => {
    definirErro("");
    iniciar(async () => {
      try {
        const valor = await acao();
        if (!vivo.current) return;
        confirmado?.(valor);
        const atual = await api.participantes(mundoId, pagina.current);
        if (vivo.current) definirDados(atual);
      } catch (falha) {
        if (vivo.current) definirErro(mensagem(falha));
      }
    });
  };
  return (
    <section className="mt-6" aria-label="Participantes deste mundo">
      <h3 className="font-display text-xl font-bold">Participantes deste mundo</h3>
      <p className="mt-2 text-sm text-tinta-suave">
        Você pode bloquear, silenciar ou denunciar sem amizade. Isso não remove a participação nem
        apaga progresso.
      </p>
      {erro && (
        <p role="alert" className="mt-3 text-sm text-coral">
          {erro}
        </p>
      )}
      {!dados ? (
        <p role="status" className="mt-3">
          {erro ? "A lista ainda não foi confirmada." : "Conferindo participantes…"}
        </p>
      ) : (
        <>
          {dados.participantes.filter((p) => !conhecidos.includes(p.perfilId)).length === 0 ? (
            <p className="mt-3">Nenhum outro participante nesta página.</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {dados.participantes
                .filter((p) => !conhecidos.includes(p.perfilId))
                .map((p) => (
                  <ContatoNaPartida
                    key={p.perfilId}
                    contato={p}
                    api={api}
                    executar={executar}
                    pendente={pendente}
                    podeCriar={false}
                  />
                ))}
            </div>
          )}
          <nav className="mt-3 flex flex-wrap gap-3" aria-label="Páginas de participantes">
            <button
              type="button"
              className="rb rb-vazado"
              disabled={pendente}
              onClick={() =>
                executar(
                  async () => {},
                  () => {
                    pagina.current = undefined;
                  },
                )
              }
            >
              Atualizar participantes
            </button>
            {dados.proximo && (
              <button
                type="button"
                className="rb rb-vazado"
                disabled={pendente}
                onClick={() =>
                  executar(
                    async () => {},
                    () => {
                      pagina.current = dados.proximo ?? undefined;
                    },
                  )
                }
              >
                Mais participantes
              </button>
            )}
          </nav>
        </>
      )}
    </section>
  );
}

function ContatoNaPartida({
  contato: c,
  api,
  executar,
  pendente,
  podeCriar,
  mundoId,
}: {
  contato: ContatoSocial | ParticipanteDoMundo;
  api: SocialDoPerfil;
  executar: Executar;
  pendente: boolean;
  podeCriar: boolean;
  mundoId?: string;
}) {
  const social = "amizade" in c ? c : null;
  const pedido = social?.pedido;
  const id = useId(),
    tentativa = useRef<{ categoria: CategoriaDeDenuncia; id: string } | null>(null);
  const [denuncia, definirDenuncia] = useState(false),
    [categoria, definirCategoria] = useState<CategoriaDeDenuncia>("contato_indesejado"),
    [protocolo, definirProtocolo] = useState("");
  const proteger = (bloqueado: boolean, silenciado: boolean) =>
    executar(() =>
      api.proteger({
        perfilId: c.perfilId,
        bloqueado,
        silenciado,
        anterior: { bloqueado: c.bloqueado, silenciado: c.silenciado },
      }),
    );
  return (
    <article className="painel p-4" aria-labelledby={`${id}-contato`}>
      <div className="flex items-start gap-3">
        <AvatarDoPerfil avatar={c.avatar ?? "padrao"} apelido={c.apelido ?? "Contato"} />
        <div className="min-w-0">
          <h4
            id={`${id}-contato`}
            className="font-display text-lg font-bold [overflow-wrap:anywhere]"
          >
            {c.apelido ?? "Contato conhecido"}
          </h4>
          <p className="mt-1 text-sm text-tinta-suave">
            {c.bloqueado
              ? "Bloqueado por você"
              : social?.amizade
                ? "Amizade confirmada"
                : social?.pedido?.aguardaAprovacao
                  ? "Aguardando aprovação do responsável"
                  : social
                    ? "Pedido de amizade"
                    : "Participante deste mundo"}
          </p>
          {social?.amizade && !c.bloqueado && (
            <p className="mt-1 text-xs text-tinta-suave">
              {social.online ? "Online" : "Presença não informada"}
            </p>
          )}
          {c.silenciado && <p className="mt-1 text-xs text-tinta-suave">Silenciado</p>}
        </div>
      </div>
      <fieldset disabled={pendente} className="mt-4 flex flex-wrap gap-2">
        <legend className="sr-only">Cuidados deste contato</legend>
        {pedido?.direcao === "recebido" && !pedido.aceito && (
          <button
            type="button"
            className="rb rb-sol"
            disabled={!podeCriar}
            onClick={() => executar(() => api.aceitar(pedido.id))}
          >
            Aceitar pedido
          </button>
        )}
        {pedido && (
          <button
            type="button"
            className="rb rb-vazado"
            onClick={() =>
              executar(() =>
                api.encerrar(pedido.id, pedido.direcao === "recebido" ? "recusar" : "revogar"),
              )
            }
          >
            {pedido.direcao === "recebido" ? "Recusar pedido" : "Cancelar pedido"}
          </button>
        )}
        {social?.podeRemover && (
          <button
            type="button"
            className="rb rb-vazado"
            onClick={() => executar(() => api.remover(c.perfilId))}
          >
            Remover amizade
          </button>
        )}
        <button
          type="button"
          className="rb rb-vazado"
          onClick={() => proteger(!c.bloqueado, c.silenciado)}
        >
          {c.bloqueado ? "Desbloquear" : "Bloquear"}
        </button>
        <button
          type="button"
          className="rb rb-vazado"
          onClick={() => proteger(c.bloqueado, !c.silenciado)}
        >
          {c.silenciado ? "Retirar silêncio" : "Silenciar"}
        </button>
        <button
          type="button"
          className="min-h-11 font-semibold text-coral underline"
          aria-expanded={denuncia}
          aria-controls={`${id}-denuncia`}
          onClick={() => definirDenuncia(!denuncia)}
        >
          {denuncia ? "Fechar denúncia" : "Denunciar contato"}
        </button>
      </fieldset>
      {social?.amizade && !c.bloqueado && mundoId && podeCriar && api.convitesDeMundo && (
        <EmitirConviteNaPartida
          key={`${mundoId}:${c.perfilId}`}
          api={api.convitesDeMundo}
          mundoId={mundoId}
          perfilId={c.perfilId}
          disabled={pendente}
        />
      )}
      {social?.amizade && !c.bloqueado && mundoId && podeCriar && api.visitas && (
        <ConvidarParaVisita
          key={`visita:${mundoId}:${c.perfilId}`}
          api={api.visitas}
          mundoId={mundoId}
          perfilId={c.perfilId}
          disabled={pendente}
        />
      )}
      {denuncia && (
        <form
          id={`${id}-denuncia`}
          className="mt-4 border-t border-linha pt-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (!tentativa.current || tentativa.current.categoria !== categoria)
              tentativa.current = { categoria, id: crypto.randomUUID() };
            const denunciaId = tentativa.current.id;
            executar(
              () => api.denunciar({ perfilId: c.perfilId, categoria, denunciaId }),
              (recibo) => definirProtocolo(recibo.protocolo),
            );
          }}
        >
          <p className="text-sm text-tinta-suave">
            A equipe recebe a categoria e a referência do contato. Denunciar não bloqueia nem aplica
            punição automaticamente.
          </p>
          <label className="mt-3 block text-sm font-semibold" htmlFor={`${id}-categoria`}>
            O que aconteceu?
            <select
              id={`${id}-categoria`}
              value={categoria}
              className={CAMPO}
              disabled={pendente || !!protocolo}
              onChange={(evento) => {
                const item = CATEGORIAS_DE_DENUNCIA.find((c) => c.valor === evento.target.value);
                if (item) definirCategoria(item.valor);
              }}
            >
              {CATEGORIAS_DE_DENUNCIA.map((m) => (
                <option value={m.valor} key={m.valor}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rb rb-vazado mt-3" disabled={pendente || !!protocolo}>
            Enviar denúncia
          </button>
          {protocolo && (
            <div role="status" className="mt-3 text-sm">
              <p className="font-semibold">Denúncia recebida.</p>
              <output
                aria-label="Protocolo da denúncia na partida"
                className="mt-2 block break-all font-mono text-xs"
              >
                {protocolo}
              </output>
              <p className="mt-2 text-tinta-suave">
                Guarde o protocolo e acompanhe a resposta em “Seus protocolos”, neste painel.
              </p>
            </div>
          )}
        </form>
      )}
    </article>
  );
}
