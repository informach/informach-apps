import { useEffect, useMemo, useRef, useState } from "react";
import { closeDoc, newBlankDocument, openDialog, printDoc, saveDoc } from "../lib/actions";
import { openPageDecorations } from "../lib/page-decorations";
import { activeDoc, redo, setTool, undo, useApp } from "../state/store";
import { Modal } from "./Dialogs";

interface Command {
  id: string;
  label: string;
  words: string;
  key?: string;
  run: () => void;
  disabled?: boolean;
}
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function CommandPalette(): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const doc = activeDoc();
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "scanner",
        label: "Digitalizar com scanner",
        words: "wia mesa alimentador folha digitalizacao",
        run: () => useApp.setState({ dialog: { kind: "scanning" } }),
      },
      {
        id: "tasks",
        label: "Tarefas e resultados preparados",
        words: "fila retomar recuperar conversao pendente protegido",
        run: () => useApp.setState({ dialog: { kind: "tasks" } }),
      },
      {
        id: "importOffice",
        label: "Converter arquivo para PDF",
        words: "word excel docx xlsx tiff tif documento planilha importar local",
        run: () => useApp.setState({ dialog: { kind: "conversion", mode: "import" } }),
      },
      {
        id: "versions",
        label: "Histórico local de versões",
        words: "restaurar recuperar backup revisoes anteriores",
        run: () => useApp.setState({ dialog: { kind: "versions" } }),
      },
      {
        id: "preferences",
        label: "Abrir preferências",
        words: "tema claro escuro atalhos privacidade miniaturas recentes fontes",
        run: () => useApp.setState({ dialog: { kind: "preferences" } }),
      },
      {
        id: "open",
        label: "Abrir documento",
        words: "arquivo pdf foto imagem",
        key: "Ctrl+O",
        run: () => void openDialog(),
      },
      {
        id: "new",
        label: "Criar PDF em branco",
        words: "novo documento pagina",
        run: newBlankDocument,
      },
      {
        id: "combine",
        label: "Juntar PDFs",
        words: "combinar mesclar unir arquivos",
        run: () => useApp.setState({ dialog: { kind: "combine" } }),
      },
      {
        id: "compressFiles",
        label: "Compactar arquivos",
        words: "reduzir tamanho email menor",
        run: () => useApp.setState({ dialog: { kind: "compress", mode: "files" } }),
      },
    ];
    if (!doc) return list;
    const edit = doc.readOnly === true;
    list.push(
      {
        id: "exportOffice",
        label: "Exportar documento",
        words: "converter word docx texto txt office local",
        disabled: doc.canCopy === false,
        run: () => useApp.setState({ dialog: { kind: "conversion", mode: "export" } }),
      },
      {
        id: "compressDoc",
        label: "Compactar documento",
        words: "reduzir tamanho atual meta qualidade copia",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "compress", mode: "doc" } }),
      },
      {
        id: "signature",
        label: "Inserir assinatura gráfica",
        words: "desenhar digitar nome foto assinar data girar",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "signature" } }),
      },
      {
        id: "annotations",
        label: "Anotações e comentários",
        words:
          "selecionar varias copiar colar duplicar ordem agrupar bloquear filtrar autor resolver",
        run: () => useApp.setState({ dialog: { kind: "annotations" } }),
      },
      {
        id: "forms",
        label: "Preparar formulário",
        words: "criar editar campos obrigatorios caixa selecao importar exportar dados json csv",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "forms" } }),
      },
      {
        id: "navigation",
        label: "Marcadores, links e anexos",
        words: "sumario estrutura navegar arquivo incorporado favoritos hiperlink",
        run: () => useApp.setState({ dialog: { kind: "navigation" } }),
      },
      {
        id: "paragraph",
        label: "Caixa de texto e parágrafos",
        words: "texto listas marcadores numeracao alinhamento largura quebra automatica",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "paragraph" } }),
      },
      {
        id: "save",
        label: "Salvar documento",
        words: "gravar arquivo",
        key: "Ctrl+S",
        disabled: edit,
        run: () => void saveDoc(doc.id),
      },
      {
        id: "saveAs",
        label: "Salvar como cópia",
        words: "exportar pdf original",
        key: "Ctrl+Shift+S",
        disabled: edit,
        run: () => void saveDoc(doc.id, true),
      },
      {
        id: "print",
        label: "Imprimir documento",
        words: "impressora papel",
        key: "Ctrl+P",
        run: () => void printDoc(doc.id),
      },
      {
        id: "close",
        label: "Fechar documento",
        words: "aba sair",
        key: "Ctrl+W",
        run: () => void closeDoc(doc.id),
      },
      {
        id: "undo",
        label: "Desfazer alteração",
        words: "voltar recuperar",
        key: "Ctrl+Z",
        disabled: !doc.past.length,
        run: () => undo(doc.id),
      },
      {
        id: "redo",
        label: "Refazer alteração",
        words: "reaplicar",
        key: "Ctrl+Y",
        disabled: !doc.future.length,
        run: () => redo(doc.id),
      },
      {
        id: "reading",
        label: doc.reading ? "Voltar à edição" : "Entrar no modo leitura",
        words: "ler revisar visualizador",
        run: () =>
          useApp.setState((state) => ({
            tool: "select",
            docs: state.docs.map((item) =>
              item.id === doc.id ? { ...item, reading: !item.reading } : item,
            ),
          })),
      },
      {
        id: "organize",
        label: "Organizar páginas",
        words: "excluir apagar girar duplicar mover reordenar",
        disabled: edit,
        run: () =>
          useApp.setState((state) => ({
            docs: state.docs.map((item) =>
              item.id === doc.id ? { ...item, view: "organize" } : item,
            ),
          })),
      },
      {
        id: "text",
        label: "Adicionar texto",
        words: "escrever digitar anotar",
        key: "T",
        disabled: edit,
        run: () => setTool("text"),
      },
      {
        id: "edittext",
        label: "Editar texto original",
        words: "substituir corrigir alterar fonte",
        key: "E",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "localTools", mode: "content" } }),
      },
      {
        id: "ocr",
        label: "Reconhecer texto — OCR local",
        words: "digitalizado imagem portugues pesquisar reconhecimento",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "ocr" } }),
      },
      {
        id: "redact",
        label: "Remover conteúdo permanentemente",
        words: "redacao censurar confidencial ocultar segredo apagar texto",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "localTools", mode: "redact" } }),
      },
      {
        id: "redactSearch",
        label: "Remover conteúdo por busca",
        words: "redacao pesquisar ocorrencias palavras sigilo confidencial",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "redactSearch" } }),
      },
      {
        id: "sanitize",
        label: "Sanitizar documento",
        words: "limpar metadados anexos javascript privacidade",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "localTools", mode: "sanitize" } }),
      },
      {
        id: "password",
        label: "Proteger cópia por senha",
        words: "criptografar seguranca aes permissoes",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "localTools", mode: "security" } }),
      },
      {
        id: "geometry",
        label: "Recortar ou redimensionar página",
        words: "tamanho margem crop escala",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "localTools", mode: "geometry" } }),
      },
      {
        id: "signature",
        label: "Inserir assinatura gráfica",
        words: "assinar desenhar iniciais",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "signature" } }),
      },
      {
        id: "watermark",
        label: "Adicionar marca d’água",
        words: "carimbo fundo rascunho",
        disabled: edit,
        run: () => openPageDecorations("watermark"),
      },
      {
        id: "numbers",
        label: "Numerar páginas",
        words: "numeracao cabecalho rodape",
        disabled: edit,
        run: () => openPageDecorations("pageNumbers"),
      },
      {
        id: "split",
        label: "Dividir documento",
        words: "separar partes extrair paginas",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "split" } }),
      },
      {
        id: "images",
        label: "Exportar páginas como imagens",
        words: "png jpg foto",
        disabled: edit,
        run: () => useApp.setState({ dialog: { kind: "exportImages" } }),
      },
    );
    return list;
  }, [doc]);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const filtered = commands.filter((command) =>
    words.every((word) => normalize(`${command.label} ${command.words}`).includes(word)),
  );
  const enabled = filtered.filter((command) => !command.disabled);
  useEffect(() => input.current?.focus(), []);
  const execute = (command: Command | undefined) => {
    if (!command || command.disabled) return;
    useApp.setState({ dialog: null });
    command.run();
  };
  return (
    <Modal
      title="Encontrar uma ação"
      width={600}
      footer={
        <span className="muted small">
          ↑ ↓ escolher · Enter executar · Esc fechar · Ctrl+K abrir
        </span>
      }
    >
      <input
        ref={input}
        className="input"
        aria-label="Buscar ação"
        role="combobox"
        aria-expanded="true"
        aria-autocomplete="list"
        aria-controls="command-results"
        aria-activedescendant={enabled[selected] ? `command-${enabled[selected].id}` : undefined}
        autoComplete="off"
        placeholder="Ex.: apagar texto, juntar, senha…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (enabled.length)
              setSelected(
                (index) =>
                  (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length,
              );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            execute(enabled[selected]);
          }
        }}
      />
      <div
        id="command-results"
        role="listbox"
        aria-label="Ações disponíveis"
        className="command-results"
      >
        {filtered.map((command) => (
          <button
            type="button"
            key={command.id}
            id={`command-${command.id}`}
            role="option"
            aria-selected={enabled[selected]?.id === command.id}
            disabled={command.disabled}
            className={enabled[selected]?.id === command.id ? "active" : ""}
            onClick={() => execute(command)}
          >
            <span>{command.label}</span>
            {command.key && <kbd>{command.key}</kbd>}
          </button>
        ))}
      </div>
      {!filtered.length && <p className="muted">Nenhuma ação encontrada. Tente outro termo.</p>}
    </Modal>
  );
}
