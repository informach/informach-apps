import { pruneUnreachable } from "@shared/compress";
import {
  addBookmark,
  addLink,
  attachments,
  type Bookmark,
  bookmarks,
  editBookmark,
  links,
  moveBookmark,
  type PdfAttachment,
  type PdfLink,
  removeAttachment,
  removeLink,
  safeAttachmentName,
} from "@shared/pdf-navigation";
import { PDFDocument } from "pdf-lib";
import { useEffect, useState } from "react";
import { z } from "zod";
import { buildDoc } from "../lib/document-output";
import { finishDraft } from "../lib/editing";
import { getSource } from "../lib/pdf";
import { replaceDocumentBytes } from "../lib/structural-edit";
import { type DocState, useApp } from "../state/store";
import { destinationIndex } from "../viewer/LinkLayer";
import { scrollToPage } from "../viewer/Viewer";
import { Modal } from "./Dialogs";

type Tab = "bookmarks" | "links" | "attachments";
interface Navigation {
  bytes?: Uint8Array;
  bookmarks: Bookmark[];
  links: PdfLink[];
  attachments: PdfAttachment[];
}
const outlineSchema: z.ZodType<{
  title: string;
  dest?: string | unknown[] | null;
  items?: unknown[];
}> = z.object({
  title: z.string(),
  dest: z
    .union([z.string(), z.array(z.unknown())])
    .nullable()
    .optional(),
  items: z.array(z.unknown()).optional(),
});
async function readNavigation(doc: DocState): Promise<Navigation> {
  if (!doc.readOnly) {
    const bytes = await buildDoc(doc),
      document = await PDFDocument.load(bytes, { updateMetadata: false });
    return {
      bytes,
      bookmarks: bookmarks(document),
      links: links(document),
      attachments: attachments(document),
    };
  }
  const source = getSource(doc.primary ?? "");
  if (!source) throw new Error("Fonte do documento indisponível.");
  const list: Bookmark[] = [];
  const walk = async (raw: unknown[], level: number): Promise<void> => {
    if (level > 100 || list.length > 10000) throw new Error("Marcadores acima do limite local.");
    for (const item of raw) {
      const value = outlineSchema.parse(item),
        page = await destinationIndex(source.id, value.dest);
      list.push({ id: String(list.length), title: value.title, level, page });
      if (value.items) await walk(value.items, level + 1);
    }
  };
  await walk((await source.pdf.getOutline()) ?? [], 0);
  const embedded = await source.pdf.getAttachments(),
    files: PdfAttachment[] = [];
  if (embedded)
    for (const [id, attachment] of embedded) {
      const bytes = attachment.content ?? (await source.pdf.getAttachmentContent(id));
      if (!(bytes instanceof Uint8Array)) throw new Error("Formato do anexo não suportado.");
      files.push({
        id,
        name: attachment.filename,
        description: attachment.description ?? "",
        bytes,
      });
    }
  return { bookmarks: list, links: [], attachments: files };
}
export function NavigationDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [tab, setTab] = useState<Tab>("bookmarks"),
    [data, setData] = useState<Navigation | null>(null),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false);
  const [title, setTitle] = useState(""),
    [parent, setParent] = useState(""),
    [target, setTarget] = useState(doc.currentPage + 1),
    [url, setUrl] = useState("");
  const [area, setArea] = useState({ x: 40, y: 40, w: 180, h: 24 });
  const [editingLink, setEditingLink] = useState<{ id: string; page: number } | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    if (!finishDraft(doc.id)) {
      setError("Corrija o texto pendente antes de abrir a estrutura.");
      return;
    }
    void readNavigation(doc)
      .then((value) => {
        if (live) setData(value);
      })
      .catch((failure) => {
        if (live) setError(failure instanceof Error ? failure.message : "Falha ao ler estrutura.");
      });
    return () => {
      live = false;
    };
  }, [doc]);
  const close = () => {
    if (!running) useApp.setState({ dialog: null });
  };
  const operate = async (operation: (document: PDFDocument) => void | Promise<void>) => {
    if (!data?.bytes || doc.readOnly || running) return;
    setRunning(true);
    setError("");
    try {
      const document = await PDFDocument.load(data.bytes, { updateMetadata: false });
      await operation(document);
      pruneUnreachable(document);
      await replaceDocumentBytes(
        doc.id,
        doc.content,
        await document.save({ updateFieldAppearances: false }),
      );
      setTitle("");
      setParent("");
      setEditingLink(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Alteração não aplicada.");
    } finally {
      setRunning(false);
    }
  };
  const jump = (page: number | undefined) => {
    if (page !== undefined) {
      close();
      scrollToPage(doc.id, page);
    }
  };
  return (
    <Modal
      title="Marcadores, links e anexos"
      width={820}
      onClose={close}
      footer={
        <>
          <span className="muted small">Alterações entram no histórico de desfazer</span>
          <div className="spacer" />
          <button type="button" className="btn ghost" disabled={running} onClick={close}>
            Fechar
          </button>
        </>
      }
    >
      <div className="seg">
        {(
          [
            ["bookmarks", "Marcadores"],
            ["links", "Links"],
            ["attachments", "Anexos"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            className={`seg-btn${tab === key ? " on" : ""}`}
            aria-pressed={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Lendo estrutura…</p>}
      {tab === "bookmarks" && (
        <>
          <ul className="navigation-list">
            {data?.bookmarks.map((bookmark) => (
              <li key={bookmark.id} style={{ paddingLeft: bookmark.level * 16 }}>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={bookmark.page === undefined || running}
                  onClick={() => jump(bookmark.page)}
                >
                  {bookmark.title || "Sem título"}{" "}
                  {bookmark.page !== undefined ? `· p. ${bookmark.page + 1}` : "· destino especial"}
                </button>
                {!doc.readOnly && (
                  <>
                    <input
                      className="input"
                      aria-label={`Renomear marcador ${bookmark.title}`}
                      defaultValue={bookmark.title}
                      key={`${bookmark.id}:${bookmark.title}`}
                      onBlur={(event) => {
                        if (event.target.value !== bookmark.title)
                          void operate((document) =>
                            editBookmark(document, bookmark.id, { title: event.target.value }),
                          );
                      }}
                    />
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={running}
                      onClick={() =>
                        void operate((document) =>
                          editBookmark(document, bookmark.id, { page: doc.currentPage }),
                        )
                      }
                    >
                      Usar página atual
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={running}
                      onClick={() =>
                        void operate((document) => editBookmark(document, bookmark.id, "remove"))
                      }
                    >
                      Excluir ramo
                    </button>
                    {(
                      [
                        ["up", "Subir marcador"],
                        ["down", "Descer marcador"],
                      ] as const
                    ).map(([direction, label]) => (
                      <button
                        type="button"
                        className="btn ghost sm"
                        key={direction}
                        disabled={running}
                        onClick={() =>
                          void operate((document) => moveBookmark(document, bookmark.id, direction))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
          {!doc.readOnly && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void operate((document) =>
                  addBookmark(document, { title, page: target - 1, parent: parent || undefined }),
                );
              }}
            >
              <div className="preferences-grid">
                <label className="local-field">
                  Título
                  <input
                    className="input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </label>
                <label className="local-field">
                  Página de destino
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={doc.content.pages.length}
                    value={target}
                    onChange={(event) => setTarget(event.target.valueAsNumber)}
                    required
                  />
                </label>
                <label className="local-field">
                  Marcador pai
                  <select
                    className="input"
                    value={parent}
                    onChange={(event) => setParent(event.target.value)}
                  >
                    <option value="">Nível principal</option>
                    {data?.bookmarks.map((item) => (
                      <option value={item.id} key={item.id}>
                        {"—".repeat(item.level)} {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" className="btn primary" disabled={!data || running}>
                Adicionar marcador
              </button>
            </form>
          )}
        </>
      )}
      {tab === "links" && (
        <>
          {doc.readOnly && <p>Use os links diretamente na página em modo leitura.</p>}
          <ul className="navigation-list">
            {data?.links.map((link) => (
              <li key={link.id}>
                <span>
                  p. {link.page + 1} →{" "}
                  {link.url ??
                    (link.targetPage !== undefined
                      ? `p. ${link.targetPage + 1}`
                      : "destino especial preservado")}
                </span>
                <button type="button" className="btn ghost sm" onClick={() => jump(link.page)}>
                  Mostrar página
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={running || link.unsupported}
                  onClick={() => {
                    setEditingLink({ id: link.id, page: link.page });
                    setArea(link.box);
                    setUrl(link.url ?? "");
                    setTarget((link.targetPage ?? 0) + 1);
                  }}
                >
                  Editar link
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={running}
                  onClick={() => void operate((document) => removeLink(document, link.id))}
                >
                  Excluir link
                </button>
              </li>
            ))}
          </ul>
          {!doc.readOnly && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void operate((document) => {
                  if (editingLink) removeLink(document, editingLink.id);
                  addLink(document, {
                    page: editingLink?.page ?? doc.currentPage,
                    box: area,
                    target: url.trim() ? { url: url.trim() } : { page: target - 1 },
                  });
                });
              }}
            >
              <p>
                Área na página {(editingLink?.page ?? doc.currentPage) + 1}, em pontos a partir do
                canto superior esquerdo.
              </p>
              <div className="preferences-grid">
                {(["x", "y", "w", "h"] as const).map((key) => (
                  <label className="local-field" key={key}>
                    {{ x: "Esquerda", y: "Topo", w: "Largura", h: "Altura" }[key]}
                    <input
                      className="input"
                      type="number"
                      min={key === "w" || key === "h" ? 1 : 0}
                      value={area[key]}
                      onChange={(event) => setArea({ ...area, [key]: event.target.valueAsNumber })}
                      required
                    />
                  </label>
                ))}
                <label className="local-field">
                  Endereço web (opcional)
                  <input
                    className="input"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <label className="local-field">
                  Página de destino (sem endereço)
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={doc.content.pages.length}
                    value={target}
                    onChange={(event) => setTarget(event.target.valueAsNumber)}
                  />
                </label>
              </div>
              <button type="submit" className="btn primary" disabled={!data || running}>
                {editingLink ? "Salvar alteração do link" : "Adicionar link"}
              </button>
              {editingLink && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setEditingLink(null);
                    setUrl("");
                  }}
                >
                  Cancelar edição do link
                </button>
              )}
            </form>
          )}
        </>
      )}
      {tab === "attachments" && (
        <>
          <p className="muted small">
            Anexos são exportados como arquivos. O EdiPDF não executa o conteúdo.
          </p>
          <ul className="navigation-list">
            {data?.attachments.map((file) => (
              <li key={file.id}>
                <span>
                  {file.name} · {(file.bytes.length / 1024).toFixed(1)} KB
                  <br />
                  {file.description}
                </span>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={running || doc.canCopy === false}
                  onClick={async () => {
                    setRunning(true);
                    setError("");
                    try {
                      const path = await window.api.saveDataDialog(safeAttachmentName(file.name));
                      if (path) await window.api.writeCopy(path, file.bytes);
                    } catch (failure) {
                      setError(
                        failure instanceof Error ? failure.message : "Falha ao exportar anexo.",
                      );
                    } finally {
                      setRunning(false);
                    }
                  }}
                >
                  Exportar
                </button>
                {!doc.readOnly && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={running}
                    onClick={() => void operate((document) => removeAttachment(document, file.id))}
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!doc.readOnly && (
            <button
              type="button"
              className="btn primary"
              disabled={!data || running}
              onClick={async () => {
                setError("");
                try {
                  const file = await window.api.pickData("attachment");
                  if (file)
                    await operate((document) =>
                      document.attach(file.bytes, safeAttachmentName(file.name), {
                        description: "Anexo adicionado no EdiPDF",
                      }),
                    );
                } catch (failure) {
                  setError(
                    failure instanceof Error ? failure.message : "Falha ao adicionar anexo.",
                  );
                }
              }}
            >
              Adicionar anexo local
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
