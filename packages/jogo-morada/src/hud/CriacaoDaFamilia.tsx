import {
  type CatalogoDeAparencias,
  type ImpedimentoDaFundacao,
  impedimentoDaFundacao,
} from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  conferirRascunho,
  descricaoDaPrevia,
  type EditorDaFamilia,
  familiaDeExemplo,
  iniciarEditorDaFamilia,
  NOMES_DAS_FASES,
  novoMoradorDoRascunho,
  removerMoradorDoRascunho,
} from "../modelo/criacao";
import { textoDaRecusa } from "../modelo/textos";
import type { Controle } from "./controle";
import { EditarMorador } from "./EditarMorador";

const IMPEDIMENTOS: Record<ImpedimentoDaFundacao, string> = {
  limite_de_moradores: "Esta família passou do limite de moradores.",
  sem_adulto: "Escolha pelo menos um adulto ou idoso para a família.",
  tracos_repetidos: "Escolha cada traço uma única vez.",
  referencia_invalida: "Uma relação precisa de dois moradores diferentes.",
  relacao_repetida: "Revise as relações repetidas entre os mesmos moradores.",
  fase_incompativel: "Revise as fases de vida dos pais e dos filhos.",
  genitores_excedidos: "Cada morador pode ter até dois pais ou mães.",
  parentesco_ciclico: "Revise o parentesco: alguém não pode ser seu próprio antepassado.",
  parentesco_incompativel: "Esses vínculos de parentesco não combinam.",
  casal_repetido: "Cada morador pode estar em um casal por vez.",
  parentes_com_casal: "Um casal não pode ter vínculo de parentesco.",
};
const TIPOS_DE_RELACAO: { tipo: EditorDaFamilia["relacoes"][number]["tipo"]; rotulo: string }[] = [
  { tipo: "genitor", rotulo: "É pai ou mãe de" },
  { tipo: "irmaos", rotulo: "É irmão ou irmã de" },
  { tipo: "namoro", rotulo: "Namora com" },
  { tipo: "casamento", rotulo: "É casado com" },
];
const ETAPAS = ["Moradores", "Relações", "Seu novo lar"];

export function AguardandoFamilia({ controle }: { controle: Controle }) {
  return (
    <section
      className="morada-criacao morada-criacao-espera"
      aria-labelledby="morada-espera-familia"
    >
      <span className="morada-criacao-selo">Um novo começo</span>
      <h1 id="morada-espera-familia">A família está sendo criada</h1>
      <p>
        Quem abriu este mundo está escolhendo os moradores. Quando a família estiver salva, vocês
        poderão jogar juntos.
      </p>
      <button type="button" onClick={controle.sair}>
        Voltar à estante
      </button>
    </section>
  );
}

/** Criação exclusiva do estado vazio. O servidor concede a capacidade e confirma a transação. */
export function CriacaoDaFamilia({
  controle,
  catalogo,
  maximo,
}: {
  controle: Controle;
  catalogo: CatalogoDeAparencias | null;
  maximo: number;
}) {
  const [editor, definirEditor] = useState(() =>
    iniciarEditorDaFamilia(catalogo, crypto.randomUUID()),
  );
  const [modo, definirModo] = useState<"inicio" | "editor">("inicio");
  const [etapa, definirEtapa] = useState(0);
  const [selecionada, selecionar] = useState(editor.moradores[0]?.chave ?? "");
  const [erro, definirErro] = useState<string | null>(null);
  const [pendente, definirPendente] = useState(false);
  const focarTitulo = useCallback((elemento: HTMLHeadingElement | null) => {
    elemento?.focus();
  }, []);
  const aviso = useRef<HTMLParagraphElement>(null);
  const morador = editor.moradores.find((m) => m.chave === selecionada) ?? editor.moradores[0];
  const conectado = controle.sessao.loja.conexao.fase === "pronto";
  const estadoDaPrevia = controle.previa.estado();

  useEffect(() => {
    if (erro) aviso.current?.focus();
  }, [erro]);
  useEffect(() => {
    controle.previa.definir(modo === "editor" && morador ? descricaoDaPrevia(morador.dados) : null);
    return () => controle.previa.definir(null);
  }, [controle.previa, modo, morador]);

  const mudar = (proximo: EditorDaFamilia) => {
    definirEditor(proximo);
    definirErro(null);
  };
  const abrir = (exemplo: boolean) => {
    const proximo = exemplo
      ? familiaDeExemplo(
          catalogo,
          Array.from({ length: 4 }, () => crypto.randomUUID()),
        )
      : editor;
    definirEditor(proximo);
    selecionar(proximo.moradores[0]?.chave ?? "");
    definirModo("editor");
    definirEtapa(exemplo ? 2 : 0);
    definirErro(null);
  };
  const validar = () => {
    const lida = conferirRascunho(editor);
    if (!lida.success) {
      definirErro("Preencha o nome da família e o nome de cada morador, com até 24 caracteres.");
      return null;
    }
    const leitura = lida.data;
    const impedimento = impedimentoDaFundacao(leitura, maximo);
    if (impedimento) {
      definirErro(IMPEDIMENTOS[impedimento]);
      return null;
    }
    return leitura;
  };
  const confirmar = async () => {
    const rascunho = validar();
    if (!rascunho || pendente || !conectado) return;
    definirPendente(true);
    definirErro(null);
    try {
      const resultado = await controle.sessao.comandar(
        null,
        { t: "fundar_familia", rascunho },
        { silencioso: true },
      );
      if (!resultado.ok) definirErro(textoDaRecusa(resultado.motivo, resultado.detalhe));
    } catch (falha) {
      console.warn(
        "[morada] falha ao confirmar família",
        falha instanceof Error ? falha.name : "desconhecida",
      );
      definirErro("A criação ainda não foi confirmada. Confira a conexão e tente novamente.");
    } finally {
      definirPendente(false);
    }
  };
  const avancar = () => {
    if (etapa === 0 && !conferirRascunho(editor).success) {
      definirErro("Preencha o nome da família e o nome de cada morador.");
      return;
    }
    if (etapa === 1 && !validar()) return;
    definirErro(null);
    definirEtapa(Math.min(2, etapa + 1));
  };
  const inicial = BAIRRO_DA_PROVA.familias[0];
  if (!inicial) throw new Error("Casa e saldo iniciais indisponíveis");

  return (
    <>
      <section
        className="morada-criacao"
        aria-labelledby="morada-criacao-titulo"
        data-etapa={modo === "inicio" ? "inicio" : String(etapa)}
        aria-busy={pendente}
      >
        <header className="morada-criacao-cabecalho">
          <span className="morada-criacao-selo">Um novo começo</span>
          <button type="button" onClick={controle.sair}>
            Sair
          </button>
        </header>
        <h1 key={`${modo}-${etapa}`} id="morada-criacao-titulo" ref={focarTitulo} tabIndex={-1}>
          {modo === "inicio" ? "Quem vai morar aqui?" : ETAPAS[etapa]}
        </h1>
        {modo === "inicio" ? (
          <div className="morada-criacao-inicio">
            <p>
              Crie uma família do seu jeito ou conheça a família Ipê. Depois, a casa ganha vida com
              vocês.
            </p>
            <button
              className="morada-criacao-primario"
              type="button"
              disabled={!catalogo}
              onClick={() => abrir(false)}
            >
              Criar minha família
            </button>
            <button type="button" onClick={() => abrir(true)}>
              Conhecer a família de exemplo
            </button>
            {!catalogo ? (
              <p className="morada-criacao-ajuda">
                A criação personalizada está indisponível neste mundo. A família de exemplo está
                pronta para começar.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <nav className="morada-criacao-etapas" aria-label="Etapas da criação">
              {ETAPAS.map((nome, i) => (
                <span key={nome} aria-current={i === etapa ? "step" : undefined}>
                  {i + 1}. {nome}
                </span>
              ))}
            </nav>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (etapa === 2) void confirmar();
                else avancar();
              }}
            >
              <fieldset className="morada-criacao-conteudo" disabled={pendente}>
                {etapa === 0 ? (
                  <>
                    <label>
                      Nome da família
                      <input
                        required
                        maxLength={24}
                        autoComplete="off"
                        value={editor.nome}
                        onChange={(e) => mudar({ ...editor, nome: e.target.value })}
                      />
                    </label>
                    <fieldset
                      className="morada-criacao-moradores"
                      aria-label="Moradores da família"
                    >
                      {editor.moradores.map((m, i) => (
                        <button
                          key={m.chave}
                          type="button"
                          aria-pressed={m.chave === morador?.chave}
                          onClick={() => selecionar(m.chave)}
                        >
                          <b>{m.dados.nome.trim() || `Morador ${i + 1}`}</b>
                          <small>{NOMES_DAS_FASES[m.dados.fase]}</small>
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={editor.moradores.length >= maximo}
                        onClick={() => {
                          const chave = crypto.randomUUID();
                          mudar({
                            ...editor,
                            moradores: [
                              ...editor.moradores,
                              { chave, dados: novoMoradorDoRascunho(catalogo) },
                            ],
                          });
                          selecionar(chave);
                        }}
                      >
                        + Adicionar morador
                      </button>
                    </fieldset>
                    {morador ? (
                      <>
                        <EditarMorador
                          dados={morador.dados}
                          catalogo={catalogo}
                          mudar={(dados) =>
                            mudar({
                              ...editor,
                              moradores: editor.moradores.map((m) =>
                                m.chave === morador.chave ? { ...m, dados } : m,
                              ),
                            })
                          }
                        />
                        <button
                          className="morada-criacao-remover"
                          type="button"
                          disabled={editor.moradores.length <= 1}
                          onClick={() => mudar(removerMoradorDoRascunho(editor, morador.chave))}
                        >
                          Remover este morador
                        </button>
                      </>
                    ) : null}
                    <p className="morada-criacao-ajuda">
                      Até {maximo} moradores, com pelo menos um adulto ou idoso. São personagens da
                      sua história no jogo.
                    </p>
                  </>
                ) : null}
                {etapa === 1 ? (
                  <>
                    <p>Como estes moradores se conhecem? Você também pode começar sem vínculos.</p>
                    {editor.relacoes.length === 0 ? (
                      <p className="morada-criacao-ajuda">
                        Nenhuma relação inicial. As amizades podem nascer enquanto vocês jogam.
                      </p>
                    ) : null}
                    {editor.relacoes.map((r) => (
                      <div className="morada-criacao-relacao" key={r.chave}>
                        <label>
                          Primeiro morador
                          <select
                            value={r.a}
                            onChange={(e) =>
                              mudar({
                                ...editor,
                                relacoes: editor.relacoes.map((v) =>
                                  v.chave === r.chave ? { ...v, a: e.target.value } : v,
                                ),
                              })
                            }
                          >
                            {editor.moradores.map((m, i) => (
                              <option value={m.chave} key={m.chave}>
                                {m.dados.nome} ({i + 1})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Vínculo
                          <select
                            value={r.tipo}
                            onChange={(e) => {
                              const tipo = TIPOS_DE_RELACAO.find(
                                (t) => t.tipo === e.target.value,
                              )?.tipo;
                              if (tipo)
                                mudar({
                                  ...editor,
                                  relacoes: editor.relacoes.map((v) =>
                                    v.chave === r.chave ? { ...v, tipo } : v,
                                  ),
                                });
                            }}
                          >
                            {TIPOS_DE_RELACAO.map((t) => (
                              <option value={t.tipo} key={t.tipo}>
                                {t.rotulo}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Segundo morador
                          <select
                            value={r.b}
                            onChange={(e) =>
                              mudar({
                                ...editor,
                                relacoes: editor.relacoes.map((v) =>
                                  v.chave === r.chave ? { ...v, b: e.target.value } : v,
                                ),
                              })
                            }
                          >
                            {editor.moradores.map((m, i) => (
                              <option value={m.chave} key={m.chave}>
                                {m.dados.nome} ({i + 1})
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            mudar({
                              ...editor,
                              relacoes: editor.relacoes.filter((v) => v.chave !== r.chave),
                            })
                          }
                        >
                          Remover relação
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={editor.moradores.length < 2 || editor.relacoes.length >= 28}
                      onClick={() => {
                        const [a, b] = editor.moradores;
                        if (!a || !b) return;
                        mudar({
                          ...editor,
                          relacoes: [
                            ...editor.relacoes,
                            { chave: crypto.randomUUID(), a: a.chave, b: b.chave, tipo: "irmaos" },
                          ],
                        });
                      }}
                    >
                      Adicionar relação
                    </button>
                  </>
                ) : null}
                {etapa === 2 ? (
                  <div className="morada-criacao-revisao">
                    <p className="morada-criacao-ajuda">
                      Tudo começa com a família {editor.nome}. Toque em um morador para rever a
                      aparência.
                    </p>
                    <div className="morada-criacao-moradores">
                      {editor.moradores.map((m) => (
                        <button
                          key={m.chave}
                          type="button"
                          aria-pressed={m.chave === morador?.chave}
                          onClick={() => selecionar(m.chave)}
                        >
                          <b>{m.dados.nome}</b>
                          <small>{NOMES_DAS_FASES[m.dados.fase]}</small>
                        </button>
                      ))}
                    </div>
                    <div className="morada-criacao-lar">
                      <span>Seu primeiro lar</span>
                      <h2>Uma casa para começar</h2>
                      <p>
                        Casa mobiliada e {(inicial.fundo / 100).toLocaleString("pt-BR")} de saldo
                        para gastar dentro do jogo.
                      </p>
                    </div>
                    <p>
                      Os moradores e seus vínculos serão salvos neste mundo. Depois, é hora de viver
                      a história.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        definirEtapa(0);
                        definirErro(null);
                      }}
                    >
                      Rever moradores e relações
                    </button>
                  </div>
                ) : null}
              </fieldset>
              {erro ? (
                <p className="morada-criacao-erro" role="alert" ref={aviso} tabIndex={-1}>
                  {erro}
                </p>
              ) : null}
              {!conectado ? (
                <p role="status" className="morada-criacao-ajuda">
                  Aguardando a conexão. Suas escolhas continuam nesta tela.
                </p>
              ) : null}
              <footer className="morada-criacao-rodape">
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    definirErro(null);
                    if (etapa === 0) definirModo("inicio");
                    else definirEtapa(etapa - 1);
                  }}
                >
                  Voltar
                </button>
                <button
                  className="morada-criacao-primario"
                  type="submit"
                  disabled={
                    pendente ||
                    !conectado ||
                    (etapa === 2 && catalogo !== null && estadoDaPrevia !== "pronto")
                  }
                >
                  {pendente
                    ? "Salvando sua família…"
                    : etapa === 2
                      ? "Começar a jogar"
                      : "Continuar"}
                </button>
              </footer>
            </form>
          </>
        )}
      </section>
      {modo === "editor" ? (
        <aside className="morada-criacao-previa" aria-label="Prévia do morador">
          <div className="morada-criacao-previa-legenda">
            <b>{morador?.dados.nome || "Seu morador"}</b>
            <span role="status">
              {estadoDaPrevia === "pronto"
                ? "Assim vai ficar"
                : estadoDaPrevia === "falha"
                  ? "Não foi possível carregar a prévia"
                  : estadoDaPrevia === "simples"
                    ? "Prévia simplificada"
                    : "Preparando a prévia…"}
            </span>
          </div>
          <div>
            <button
              type="button"
              aria-label="Girar morador para a esquerda"
              onClick={() => controle.previa.girar(-1)}
            >
              ↶
            </button>
            <button
              type="button"
              aria-label="Girar morador para a direita"
              onClick={() => controle.previa.girar(1)}
            >
              ↷
            </button>
            {estadoDaPrevia === "falha" ? (
              <button type="button" onClick={() => controle.previa.recarregar()}>
                Tentar a prévia novamente
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
