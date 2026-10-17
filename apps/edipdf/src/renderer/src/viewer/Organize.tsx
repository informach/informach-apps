import {
  Copy,
  FilePlus2,
  FileUp,
  ImageDown,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  deletePages,
  duplicatePages,
  extractPages,
  insertBlank,
  insertFromFiles,
  rotatePages,
} from "../lib/actions";
import { type DocState, patchDoc, useApp } from "../state/store";
import { pageSizeAt, ThumbGrid } from "./ThumbGrid";

/** Full-window page grid: the "Organizar páginas" tool. */
export function Organize({ doc }: { doc: DocState }): React.ReactElement {
  const [size, setSize] = useState(170);
  const ids = doc.selection;
  const n = ids.length;
  const lastSel = n
    ? Math.max(...ids.map((id) => doc.content.pages.findIndex((p) => p.id === id)))
    : doc.content.pages.length - 1;
  const allSelected = n === doc.content.pages.length;
  return (
    <div className="organize">
      <div className="organize-bar">
        <span className="organize-count">
          {n
            ? `${n} de ${doc.content.pages.length} ${doc.content.pages.length === 1 ? "página selecionada" : "páginas selecionadas"}`
            : `${doc.content.pages.length} ${doc.content.pages.length === 1 ? "página" : "páginas"}`}
        </span>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() =>
            patchDoc(doc.id, { selection: allSelected ? [] : doc.content.pages.map((p) => p.id) })
          }
        >
          {allSelected ? "Limpar seleção" : "Selecionar tudo"}
        </button>
        <div className="bar-sep" />
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => rotatePages(doc.id, ids, -90)}
          title="Girar à esquerda"
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => rotatePages(doc.id, ids, 90)}
          title="Girar à direita"
        >
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => deletePages(doc.id, ids)}
          title="Excluir"
        >
          <Trash2 size={15} />
        </button>
        <div className="bar-sep" />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => insertBlank(doc.id, lastSel + 1, pageSizeAt(doc, lastSel))}
        >
          <FilePlus2 size={15} /> Página em branco
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => void insertFromFiles(doc.id, lastSel + 1)}
        >
          <FileUp size={15} /> Inserir de arquivo
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => duplicatePages(doc.id, ids)}
        >
          <Copy size={15} /> Duplicar
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => extractPages(doc.id, ids)}
        >
          <Scissors size={15} /> Extrair
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => useApp.setState({ dialog: { kind: "split" } })}
        >
          <SplitSquareHorizontal size={15} /> Dividir
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => useApp.setState({ dialog: { kind: "exportImages" } })}
        >
          <ImageDown size={15} /> Exportar imagens
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="icon-btn"
          title="Miniaturas menores"
          onClick={() => setSize((s) => Math.max(110, s - 30))}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Miniaturas maiores"
          onClick={() => setSize((s) => Math.min(320, s + 30))}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="btn primary sm"
          onClick={() => patchDoc(doc.id, { view: "pages" })}
        >
          Concluir
        </button>
      </div>
      <p className="organize-hint">
        Arraste para reordenar · Ctrl/Shift+clique para selecionar várias · solte PDFs ou imagens
        aqui para inserir · botão direito para mais opções
      </p>
      <ThumbGrid doc={doc} layout="grid" width={size} />
    </div>
  );
}
