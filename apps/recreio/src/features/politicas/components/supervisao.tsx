"use client";
import "@/lib/zod-sem-eval";
import { type JanelaSemanal, type Supervisao, SupervisaoSchema } from "@informach/recreio";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import { salvarSupervisaoAction } from "../actions";

const dias = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const campo = "mt-1.5 h-12 w-full rounded-xl border border-ceu/50 bg-fundo px-3 text-tinta";
function hora(minuto: number) {
  return `${String(Math.floor(minuto / 60) % 24).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;
}
function minutos(horario: string) {
  const [h, m] = horario.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
type JanelaEditavel = { chave: string; dia: number; inicio: string; fim: string };
function editavel(janela: JanelaSemanal, n: number): JanelaEditavel {
  return {
    chave: `horario-${n}`,
    dia: janela.diaDaSemana,
    inicio: hora(janela.inicioMinuto),
    fim: hora(janela.fimMinuto),
  };
}

export function SupervisaoDoPerfil({
  perfilId,
  configuracao,
  versao,
  reconhecida,
  faixa,
  adolescente,
}: {
  perfilId: string;
  configuracao: Supervisao;
  versao: number;
  reconhecida: boolean;
  faixa: string;
  adolescente: boolean;
}) {
  const [regras, definirRegras] = useState(configuracao);
  const [limite, definirLimite] = useState(configuracao.minutosPorDia?.toString() ?? "");
  const [comAgenda, definirComAgenda] = useState(configuracao.horarios !== null);
  const [janelas, definirJanelas] = useState<JanelaEditavel[]>(() =>
    (configuracao.horarios ?? []).map(editavel),
  );
  const [reconheco, definirReconheco] = useState(false);
  const [erro, definirErro] = useState("");
  const [recente, definirRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();
  const volta = `/conta/perfis/${perfilId}/supervisao`;
  return (
    <form
      className="mt-8"
      onSubmit={(evento) => {
        evento.preventDefault();
        definirErro("");
        definirRecente(false);
        const entrada = SupervisaoSchema.safeParse({
          ...regras,
          minutosPorDia: limite === "" ? null : Number(limite),
          horarios: !comAgenda
            ? null
            : janelas.map((j) => ({
                diaDaSemana: j.dia,
                inicioMinuto: minutos(j.inicio),
                fimMinuto: j.fim === "00:00" ? 1440 : minutos(j.fim),
              })),
        });
        if (!entrada.success) {
          definirErro(
            "Confira os horários: o fim deve vir depois do início, sem sobreposição no mesmo dia. O limite diário vai de 1 a 1.440 minutos.",
          );
          return;
        }
        iniciar(async () => {
          try {
            const resultado = await salvarSupervisaoAction({
              perfilId,
              versao,
              configuracao: entrada.data,
              reconheco,
            });
            if (resultado.ok) {
              window.location.assign(`${volta}?salvo=1`);
            } else {
              definirErro(resultado.error);
              definirRecente(resultado.code === "AUTH" || resultado.code === "LOGIN_RECENTE");
            }
          } catch {
            definirErro(
              "Não foi possível confirmar as regras. Tente novamente; suas escolhas continuam neste formulário.",
            );
          }
        });
      }}
    >
      <fieldset disabled={!interativo || pendente} className="grid gap-6">
        <section className="painel p-5 sm:p-6" aria-labelledby="conteudo-supervisionado">
          <h2 id="conteudo-supervisionado" className="font-display text-xl font-bold">
            Conteúdo e companhia
          </h2>
          <p className="mt-2 text-sm text-tinta-suave">
            O limite calculado para este perfil é {faixa === "L" ? "Livre" : `${faixa} anos`}. Você
            pode escolher um limite menor.
          </p>
          <div className="mt-5 max-w-sm">
            <Label htmlFor="limite-conteudo">Limite de conteúdo</Label>
            <select
              id="limite-conteudo"
              className={campo}
              value={regras.limiteDeConteudo ?? "idade"}
              onChange={(e) =>
                definirRegras({
                  ...regras,
                  limiteDeConteudo:
                    e.target.value === "idade"
                      ? null
                      : SupervisaoSchema.shape.limiteDeConteudo.parse(e.target.value),
                })
              }
            >
              <option value="idade">Acompanhar a faixa etária</option>
              {["L", "6", "10", "12", "14", "16"].map((f) => (
                <option key={f} value={f}>
                  {f === "L" ? "Livre" : `${f} anos`}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="flex items-start gap-3">
              <input
                className="mt-1 size-5 shrink-0 accent-sol"
                type="checkbox"
                checked={regras.multiplayer}
                onChange={(e) => definirRegras({ ...regras, multiplayer: e.target.checked })}
              />
              <span>Permitir jogar com amigos aprovados</span>
            </label>
            <label className="flex items-start gap-3">
              <input
                className="mt-1 size-5 shrink-0 accent-sol"
                type="checkbox"
                checked={regras.contatos}
                onChange={(e) => definirRegras({ ...regras, contatos: e.target.checked })}
              />
              <span>
                Permitir pedidos de contato
                <small className="mt-1 block text-tinta-suave">
                  {adolescente
                    ? "Somente por código, sem busca por nome."
                    : "Cada pedido depende da aprovação do responsável."}
                </small>
              </span>
            </label>
            {(adolescente || regras.textoLivre) && (
              <label className="flex items-start gap-3">
                <input
                  className="mt-1 size-5 shrink-0 accent-sol"
                  type="checkbox"
                  checked={regras.textoLivre}
                  onChange={(e) => definirRegras({ ...regras, textoLivre: e.target.checked })}
                />
                <span>Permitir texto livre nos jogos compatíveis</span>
              </label>
            )}
            {!adolescente && (
              <p className="text-sm text-tinta-suave">
                Texto livre fica desativado para crianças de até 12 anos.
                {regras.textoLivre &&
                  " Esta configuração antiga precisa ser corrigida. Desmarque o texto livre para confirmar."}
              </p>
            )}
          </div>
          <div className="mt-5 max-w-sm">
            <Label htmlFor="presenca-perfil">Quem pode ver que está jogando</Label>
            <select
              id="presenca-perfil"
              className={campo}
              value={regras.presenca}
              onChange={(e) =>
                definirRegras({
                  ...regras,
                  presenca: e.target.value === "invisible" ? "invisible" : "friends",
                })
              }
            >
              <option value="friends">Somente amigos aprovados</option>
              <option value="invisible">Ninguém</option>
            </select>
          </div>
        </section>
        <section className="painel p-5 sm:p-6" aria-labelledby="tempo-supervisionado">
          <h2 id="tempo-supervisionado" className="font-display text-xl font-bold">
            Tempo de brincar
          </h2>
          <p className="mt-2 text-sm text-tinta-suave">
            Horários de Brasília. O tempo diário é do perfil, somando todos os aparelhos.
          </p>
          <label className="mt-5 flex items-start gap-3">
            <input
              className="mt-1 size-5 shrink-0 accent-sol"
              type="checkbox"
              checked={regras.pausado}
              onChange={(e) => definirRegras({ ...regras, pausado: e.target.checked })}
            />
            <span>Pausar o acesso aos jogos</span>
          </label>
          <div className="mt-5 max-w-sm">
            <Label htmlFor="minutos-dia">Limite diário em minutos</Label>
            <Input
              id="minutos-dia"
              className="mt-1.5 h-12 bg-fundo"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={limite}
              onChange={(e) => definirLimite(e.target.value)}
              aria-describedby="minutos-ajuda"
            />
            <p id="minutos-ajuda" className="mt-2 text-sm text-tinta-suave">
              Deixe em branco para não definir um limite diário.
            </p>
          </div>
          <label className="mt-6 flex items-start gap-3">
            <input
              className="mt-1 size-5 shrink-0 accent-sol"
              type="checkbox"
              checked={comAgenda}
              onChange={(e) => definirComAgenda(e.target.checked)}
            />
            <span>Jogar somente nos horários definidos</span>
          </label>
          {comAgenda && (
            <div className="mt-4">
              <p className="text-sm text-tinta-suave">
                Sem nenhum horário, os jogos ficam bloqueados. Use 00:00 no campo “Até” para
                permitir até o fim do dia.
              </p>
              <ul className="mt-4 grid gap-4">
                {janelas.map((j) => (
                  <li key={j.chave} className="rounded-xl border border-ceu/30 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_7rem_7rem]">
                      <div className="col-span-2 sm:col-span-1">
                        <Label htmlFor={`${j.chave}-dia`}>Dia</Label>
                        <select
                          id={`${j.chave}-dia`}
                          className={campo}
                          value={j.dia}
                          onChange={(e) =>
                            definirJanelas(
                              janelas.map((atual) =>
                                atual.chave === j.chave
                                  ? { ...atual, dia: Number(e.target.value) }
                                  : atual,
                              ),
                            )
                          }
                        >
                          {dias.map((dia, n) => (
                            <option key={dia} value={n}>
                              {dia}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`${j.chave}-de`}>De</Label>
                        <Input
                          id={`${j.chave}-de`}
                          className="mt-1.5 h-12 min-w-0 bg-fundo"
                          type="time"
                          required
                          value={j.inicio}
                          onChange={(e) =>
                            definirJanelas(
                              janelas.map((atual) =>
                                atual.chave === j.chave
                                  ? { ...atual, inicio: e.target.value }
                                  : atual,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${j.chave}-ate`}>Até</Label>
                        <Input
                          id={`${j.chave}-ate`}
                          className="mt-1.5 h-12 min-w-0 bg-fundo"
                          type="time"
                          required
                          value={j.fim}
                          onChange={(e) =>
                            definirJanelas(
                              janelas.map((atual) =>
                                atual.chave === j.chave ? { ...atual, fim: e.target.value } : atual,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-3 min-h-11 font-bold text-ceu underline"
                      aria-label={`Remover horário de ${dias[j.dia]}, ${j.inicio} até ${j.fim}`}
                      onClick={() =>
                        definirJanelas(janelas.filter((atual) => atual.chave !== j.chave))
                      }
                    >
                      Remover horário
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="rb rb-vazado mt-4"
                disabled={janelas.length >= 14}
                onClick={() =>
                  definirJanelas([
                    ...janelas,
                    { chave: crypto.randomUUID(), dia: 1, inicio: "16:00", fim: "18:00" },
                  ])
                }
              >
                Adicionar horário
              </button>
            </div>
          )}
        </section>
        <section className="painel p-5 sm:p-6" aria-labelledby="confirmacao-supervisao">
          <h2 id="confirmacao-supervisao" className="font-display text-xl font-bold">
            Confirme as regras
          </h2>
          <p className="mt-2 text-sm text-tinta-suave">
            {reconhecida
              ? "Esta revisão já foi confirmada. Mudanças nas regras encerram as permissões anteriores do jogo."
              : "Confira as regras calculadas para este perfil antes de confirmar."}
          </p>
          <label className="mt-4 flex items-start gap-3">
            <input
              className="mt-1 size-5 shrink-0 accent-sol"
              type="checkbox"
              required
              checked={reconheco}
              onChange={(e) => definirReconheco(e.target.checked)}
            />
            <span>Revisei e confirmo estas regras para o perfil.</span>
          </label>
          <button className="rb rb-sol mt-5" type="submit">
            {pendente ? "Confirmando…" : "Salvar supervisão"}
          </button>
        </section>
      </fieldset>
      <p role="status" className="mt-4 min-h-5 font-semibold text-coral">
        {erro}
      </p>
      {recente && (
        <Link
          className="mt-2 inline-block font-bold text-ceu underline"
          href={`/entrar?recente=1&next=${encodeURIComponent(volta)}`}
        >
          Entrar novamente para confirmar
        </Link>
      )}
    </form>
  );
}
