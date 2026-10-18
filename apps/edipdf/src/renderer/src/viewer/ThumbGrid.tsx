import { type PageRef, totalRotation, viewSize } from "@shared/model";
import {
  Copy,
  FilePlus2,
  FileUp,
  ImageDown,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  A4,
  deletePages,
  droppedFiles,
  duplicatePages,
  extractPages,
  insertBlank,
  insertFilesAt,
  insertFromFiles,
  movePages,
  rotatePages,
} from "../lib/actions";
import { documentThumbnail } from "../lib/document-preview";
import { pageInfo } from "../lib/pdf";
import { type DocState, patchDoc, useApp } from "../state/store";
import { type MenuItem, openMenu } from "../ui/Menu";
import { scrollToPage } from "./Viewer";

const PAGE_MIME = "application/x-edipdf-pages";

const Thumb = memo(function Thumb({
  doc,
  page,
  width,
  root,
}: {
  doc: DocState;
  page: PageRef;
  width: number;
  root: HTMLElement | null;
}) {
  const { id, name, content, primary, sourceIds, readOnly } = doc;
  const document = useMemo(
    () => ({ id, name, content, primary, sourceIds, readOnly }),
    [id, name, content, primary, sourceIds, readOnly],
  );
  const info = pageInfo(page);
  const { w, h } = viewSize(page, info);
  const height = Math.round((width * h) / w);
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), {
      root,
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  useEffect(() => {
    if (!seen) return;
    let live = true;
    setError("");
    const timer = setTimeout(() => {
      void documentThumbnail(document, page.id, width)
        .then((url) => live && setSrc(url))
        .catch((failure) => {
          if (live) setError(failure instanceof Error ? failure.message : "Falha na miniatura.");
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [seen, page, width, document]);
  return (
    <div
      ref={ref}
      className="thumb-paper"
      style={{ width, height }}
      data-rot={totalRotation(page, info)}
    >
      {src && <img src={src} alt="" draggable={false} />}
      {error && (
        <span className="thumb-error" role="status" title={error}>
          Prévia indisponível
        </span>
      )}
    </div>
  );
});

export function pageMenu(doc: DocState, ids: string[], at: number): MenuItem[] {
  const n = ids.length;
  const many = n > 1 ? ` (${n})` : "";
  return [
    {
      label: `Girar à direita${many}`,
      icon: <RotateCw size={14} />,
      run: () => rotatePages(doc.id, ids, 90),
    },
    {
      label: `Girar à esquerda${many}`,
      icon: <RotateCcw size={14} />,
      run: () => rotatePages(doc.id, ids, -90),
    },
    { label: `Duplicar${many}`, icon: <Copy size={14} />, run: () => duplicatePages(doc.id, ids) },
    {
      label: "Mover antes da página anterior",
      disabled: at === 0,
      run: () => movePages(doc.id, ids, Math.max(0, at - 1)),
    },
    {
      label: "Mover depois da próxima página",
      disabled: at + 1 >= doc.content.pages.length,
      run: () => movePages(doc.id, ids, Math.min(doc.content.pages.length, at + 2)),
    },
    { separator: true },
    {
      label: "Inserir página em branco depois",
      icon: <FilePlus2 size={14} />,
      run: () => insertBlank(doc.id, at + 1, pageSizeAt(doc, at)),
    },
    {
      label: "Inserir páginas de arquivo depois…",
      icon: <FileUp size={14} />,
      run: () => void insertFromFiles(doc.id, at + 1),
    },
    { separator: true },
    {
      label: `Extrair para novo documento${many}`,
      icon: <Scissors size={14} />,
      run: () => extractPages(doc.id, ids),
    },
    {
      label: `Exportar como imagem${many}…`,
      icon: <ImageDown size={14} />,
      run: () => useApp.setState({ dialog: { kind: "exportImages" } }),
    },
    { separator: true },
    {
      label: `Excluir${many}`,
      icon: <Trash2 size={14} />,
      danger: true,
      hint: "Del",
      run: () => deletePages(doc.id, ids),
    },
  ];
}

/** Size of the page at `i` (unrotated), so inserted blank pages match their neighbours. */
export function pageSizeAt(doc: DocState, i: number): { w: number; h: number } {
  const p = doc.content.pages[i];
  if (!p) return { ...A4 };
  const s = viewSize(p, pageInfo(p));
  return { w: s.w, h: s.h };
}

export function ThumbGrid({
  doc,
  layout,
  width,
}: {
  doc: DocState;
  layout: "list" | "grid";
  width: number;
}): React.ReactElement {
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const anchor = useRef<number>(0);
  const dragIds = useRef<string[] | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const pages = doc.content.pages;
  const selection = new Set(doc.selection);

  useEffect(() => setRoot(rootRef.current), []);

  // Keep the current page visible in the sidebar while scrolling the document.
  useEffect(() => {
    if (layout !== "list") return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-index="${doc.currentPage}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [doc.currentPage, layout]);

  const click = (e: React.MouseEvent, i: number): void => {
    const id = pages[i].id;
    if (e.shiftKey) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      patchDoc(doc.id, { selection: pages.slice(a, b + 1).map((p) => p.id) });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      patchDoc(doc.id, {
        selection: selection.has(id)
          ? doc.selection.filter((x) => x !== id)
          : [...doc.selection, id],
      });
      anchor.current = i;
      return;
    }
    anchor.current = i;
    patchDoc(doc.id, { selection: [id] });
    if (layout === "list") scrollToPage(doc.id, i);
  };

  const indexFor = (e: React.DragEvent, i: number): number => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before =
      layout === "list" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
    return before ? i : i + 1;
  };

  const accepts = (e: React.DragEvent): boolean =>
    e.dataTransfer.types.includes(PAGE_MIME) || e.dataTransfer.types.includes("Files");

  const drop = async (e: React.DragEvent, at: number): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    setDropAt(null);
    if (dragIds.current) {
      movePages(doc.id, dragIds.current, at);
      dragIds.current = null;
    } else if (e.dataTransfer.files.length) {
      await insertFilesAt(doc.id, at, await droppedFiles(e.dataTransfer.files));
    }
  };

  return (
    <fieldset
      ref={rootRef}
      className={`thumbs thumbs-${layout}`}
      aria-label="Miniaturas das páginas"
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        if (e.target === e.currentTarget) setDropAt(pages.length);
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null);
      }}
      onDrop={(e) => void drop(e, dropAt ?? pages.length)}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) patchDoc(doc.id, { selection: [] });
      }}
    >
      {pages.map((p, i) => {
        const isSel = selection.has(p.id);
        const isCur = layout === "list" && i === doc.currentPage;
        return (
          <button
            type="button"
            key={p.id}
            aria-label={`Página ${i + 1}`}
            aria-pressed={isSel}
            data-index={i}
            className={`thumb${isSel ? " selected" : ""}${isCur ? " current" : ""}${dropAt === i ? " drop-before" : ""}${dropAt === pages.length && i === pages.length - 1 ? " drop-after" : ""}`}
            draggable
            onClick={(e) => click(e, i)}
            onContextMenu={(e) => {
              e.preventDefault();
              const ids = isSel ? doc.selection : [p.id];
              if (!isSel) patchDoc(doc.id, { selection: [p.id] });
              openMenu(e.clientX, e.clientY, pageMenu(doc, ids, i));
            }}
            onKeyDown={(event) => {
              if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                openMenu(
                  bounds.left,
                  bounds.bottom,
                  pageMenu(doc, isSel ? doc.selection : [p.id], i),
                );
              }
            }}
            onDragStart={(e) => {
              dragIds.current = isSel
                ? pages.filter((x) => selection.has(x.id)).map((x) => x.id)
                : [p.id];
              e.dataTransfer.setData(PAGE_MIME, "1");
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              dragIds.current = null;
              setDropAt(null);
            }}
            onDragOver={(e) => {
              if (!accepts(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDropAt(indexFor(e, i));
            }}
            onDrop={(e) => void drop(e, indexFor(e, i))}
          >
            <Thumb doc={doc} page={p} width={width} root={root} />
            <span className="thumb-label">{i + 1}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
