import {
  ASSET_BYTES,
  type Asset,
  assetDataUri,
  assetFontFamily,
  CATALOG_BYTES,
  type FontAsset,
  fontAssetCss,
} from "@informach/edi-motion/assets";
import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Artboard } from "../../shared/project";
import { type AssetImport, completeAssetImport, prepareAssetImport } from "./asset-import";
import "./asset-panel.css";
import { AudioPanel } from "./audio-panel";
import type { EditorCommand } from "./command-palette";
import { openMenu } from "./menu-popover";

/** What an asset tile carries when dragged onto the artboard (app.js drops it there). */
export const ASSET_DRAG_TYPE = "application/x-edisvg-asset";
const FORMATS =
  "PNG estático, WAV PCM16 (até 30 s) e fontes TTF/OTF, WOFF ou uma face de coleção TTC/OTC, até 4 MB cada. WOFF2 não é aceito.";
const ACCEPT = ".png,.wav,.ttf,.otf,.woff,.ttc,.otc";
const KINDS = [
  { kind: "image", title: "Imagens" },
  { kind: "font", title: "Fontes" },
  { kind: "audio", title: "Áudio" },
] as const;
type Kind = Asset["kind"];
type Input = { name: string; bytes: Uint8Array };
/** A file waiting to enter the catalog, or to take the place of `replaceId`. */
type Queued = Input & { replaceId?: string };
type Pending = { prepared: AssetImport; replaceId?: string };

interface Props {
  assets: Asset[];
  /** How many places use each asset (shared/assets.ts assetUsage). */
  usage: Map<string, number>;
  importNative?: () => Promise<Input | null>;
  execute(commands: unknown[]): void;
  selectedTextId?: string;
  board?: Artboard;
}

/**
 * The panel is rebuilt on every editor render (each edit), so what the person is doing in it
 * lives here: the selected asset, the closed sections, the files still to import and the
 * confirmation open.
 */
const session = {
  selected: null as string | null,
  closed: new Set<string>(),
  queue: [] as Queued[],
  pending: null as Pending | null,
  effectsOpen: false,
};
const injectedFonts = new Set<string>();
/** The font's own "Aa" in its tile: its @font-face once per asset in the document. */
function useFontFaces(fonts: FontAsset[]) {
  useEffect(() => {
    for (const font of fonts) {
      if (injectedFonts.has(font.id)) continue;
      injectedFonts.add(font.id);
      const style = document.createElement("style");
      style.dataset.assetFont = font.id;
      style.textContent = fontAssetCss(font);
      document.head.append(style);
    }
  }, [fonts]);
}
const kb = (bytes: number) =>
  bytes < 1000000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1000000).toFixed(1)} MB`;
const seconds = (asset: Extract<Asset, { kind: "audio" }>) =>
  `${(asset.frames / asset.sampleRate).toFixed(1).replace(".", ",")} s`;
function detail(asset: Asset) {
  if (asset.kind === "image") return `${asset.width} × ${asset.height} px`;
  if (asset.kind === "audio")
    return `${seconds(asset)} · ${asset.channels === 1 ? "mono" : "estéreo"}`;
  return `${asset.family} · ${asset.weight}${asset.italic ? " itálico" : ""}`;
}
const usedText = (count: number) =>
  count ? `usado ${count === 1 ? "1 vez" : `${count} vezes`}` : "sem uso";
const failure = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function AssetTile({
  asset,
  used,
  selected,
  select,
  primary,
  menu,
  keys,
}: {
  asset: Asset;
  used: number;
  selected: boolean;
  select(): void;
  primary(): void;
  menu(point: { x: number; y: number }): void;
  keys(event: KeyboardEvent): void;
}) {
  const more = useRef<HTMLButtonElement | null>(null);
  return (
    <div className={`asset-tile${selected ? " selected" : ""}${used ? "" : " unused"}`}>
      <button
        type="button"
        className="asset-thumb"
        aria-label={asset.name}
        aria-pressed={selected}
        title={`${asset.name}\n${detail(asset)} · ${kb(asset.byteLength)} · ${usedText(used)}`}
        draggable={asset.kind === "image"}
        onDragStart={(event) => {
          event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
          event.dataTransfer.effectAllowed = "copy";
          const image = event.currentTarget.querySelector("img");
          if (image) event.dataTransfer.setDragImage(image, 24, 24);
        }}
        onClick={select}
        onDoubleClick={primary}
        onKeyDown={keys}
        onContextMenu={(event) => {
          event.preventDefault();
          select();
          menu({ x: event.clientX, y: event.clientY });
        }}
      >
        {asset.kind === "image" ? (
          <img
            src={assetDataUri(asset)}
            alt=""
            draggable={false}
            // Small pictures (icons, pixel art) are enlarged with sharp pixels.
            className={Math.max(asset.width, asset.height) < 64 ? "pixelated" : undefined}
          />
        ) : asset.kind === "font" ? (
          <span
            className="asset-glyph"
            style={{
              fontFamily: `"${assetFontFamily(asset)}"`,
              fontWeight: asset.weight,
              fontStyle: asset.italic ? "italic" : "normal",
            }}
          >
            Aa
          </span>
        ) : (
          <span className="asset-glyph asset-audio">
            ♪<small>{seconds(asset)}</small>
          </span>
        )}
        {used > 0 && (
          <span className="asset-used" aria-hidden="true">
            {used}
          </span>
        )}
      </button>
      <button
        ref={more}
        type="button"
        className="asset-more"
        aria-label={`Ações de ${asset.name}`}
        aria-haspopup="menu"
        onClick={() => {
          select();
          const box = more.current?.getBoundingClientRect();
          menu({ x: box?.left ?? 0, y: box?.bottom ?? 0 });
        }}
      >
        ⋯
      </button>
      <span className="asset-name">{asset.name}</span>
    </div>
  );
}

function AssetPanel({ assets, usage, importNative, execute, selectedTextId, board }: Props) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPendingState] = useState<Pending | null>(session.pending),
    [rights, setRights] = useState(false),
    [notice, setNotice] = useState(""),
    [selected, setSelectedState] = useState<string | null>(
      assets.some((asset) => asset.id === session.selected) ? session.selected : null,
    ),
    [closed, setClosed] = useState(() => new Set(session.closed)),
    [dropping, setDropping] = useState(false),
    [reading, setReading] = useState<FontAsset | null>(null),
    controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    file = useRef<HTMLInputElement | null>(null),
    replacing = useRef<string | undefined>(undefined),
    nameInput = useRef<HTMLInputElement | null>(null),
    confirm = useRef<HTMLDialogElement | null>(null),
    noticeDialog = useRef<HTMLDialogElement | null>(null);
  const setPending = (value: Pending | null) => {
    session.pending = value;
    setPendingState(value);
  };
  const setSelected = (id: string | null) => {
    session.selected = id;
    setSelectedState(id);
  };
  useFontFaces(assets.filter((asset): asset is FontAsset => asset.kind === "font"));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const dialog = confirm.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
  }, [pending]);
  useEffect(() => {
    const dialog = noticeDialog.current;
    if (reading && dialog && !dialog.open) dialog.showModal();
  }, [reading]);
  const apply = (commands: unknown[]) => {
    try {
      execute(commands);
      return true;
    } catch (error) {
      setError(failure(error, "Operação recusada."));
      return false;
    }
  };
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    const task = new AbortController();
    controller.current = task;
    setBusy(true);
    setError("");
    try {
      await work(task.signal);
    } catch (error) {
      if (!task.signal.aborted) setError(failure(error, "Importação recusada."));
    } finally {
      if (controller.current === task) controller.current = null;
      if (mounted.current) {
        setBusy(false);
        // Files still waiting (dropped together, or left by a cancelled confirmation) go next.
        if (session.queue.length && !session.pending) queueMicrotask(() => void drain());
      }
    }
  };
  /**
   * Takes the files waiting in order: those that need no confirmation go in together (one undo
   * step); the first that asks (a font, a converted PNG) stops the line in the dialog.
   */
  const drain = () =>
    run(async (signal) => {
      const commands: unknown[] = [];
      try {
        while (session.queue.length && !session.pending) {
          const next = session.queue[0];
          if (!next) break;
          const prepared = await prepareAssetImport(next.bytes, next.name, signal).catch(
            (error: unknown) => {
              signal.throwIfAborted();
              // One bad file does not stop the others.
              session.queue.shift();
              setError(`${next.name}: ${failure(error, "Importação recusada.")}`);
              return null;
            },
          );
          if (!prepared) continue;
          session.queue.shift();
          if (prepared.conversion) {
            setPending({ prepared, ...(next.replaceId ? { replaceId: next.replaceId } : {}) });
            setRights(false);
            setNotice("");
          } else
            commands.push(
              next.replaceId
                ? {
                    type: "asset",
                    operation: "replace",
                    assetId: next.replaceId,
                    value: prepared.asset,
                  }
                : { type: "asset", operation: "put", value: prepared.asset },
            );
        }
      } finally {
        if (commands.length && !signal.aborted) apply(commands);
      }
    });
  // A queue left by the panel before this one (an edit rebuilt it mid-way) carries on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    if (session.queue.length && !session.pending) void drain();
  }, []);
  const enqueue = (inputs: Queued[]) => {
    session.queue.push(...inputs);
    if (!session.pending) void drain();
  };
  const pick = (replaceId?: string) => {
    if (importNative)
      void run(async (signal) => {
        const input = await importNative();
        signal.throwIfAborted();
        if (input) session.queue.push({ ...input, ...(replaceId ? { replaceId } : {}) });
      });
    else {
      replacing.current = replaceId;
      file.current?.click();
    }
  };
  const readFiles = async (files: File[], replaceId?: string) => {
    const inputs: Queued[] = [];
    for (const selected of files) {
      if (selected.size > ASSET_BYTES) {
        setError(`${selected.name}: arquivo excede 4 MB.`);
        continue;
      }
      inputs.push({
        name: selected.name,
        bytes: new Uint8Array(await selected.arrayBuffer()),
        ...(replaceId ? { replaceId } : {}),
      });
    }
    if (inputs.length) enqueue(inputs);
  };
  const cancelPending = () => {
    controller.current?.abort();
    setPending(null);
    setRights(false);
    // The files after it continue (once a running step ends, run() takes them).
    if (!controller.current && session.queue.length) void drain();
  };
  const confirmPending = (current: Pending) =>
    run(async (signal) => {
      const { prepared, replaceId } = current;
      if (prepared.kind === "font" && !rights) throw new Error("Confirme os direitos da fonte.");
      const asset = await completeAssetImport(
        prepared,
        signal,
        prepared.kind === "font" ? { rightsConfirmed: true, licenseNotice: notice } : undefined,
      );
      session.pending = null;
      apply([
        replaceId
          ? { type: "asset", operation: "replace", assetId: replaceId, value: asset }
          : { type: "asset", operation: "put", value: asset },
      ]);
      if (mounted.current) {
        setPendingState(null);
        setRights(false);
      }
    });

  const insert = (asset: Asset) => {
    if (asset.kind === "image")
      apply([{ type: "asset", operation: "insert-image", assetId: asset.id }]);
    else if (asset.kind === "font" && selectedTextId)
      apply([
        { type: "asset", operation: "set-font", assetId: asset.id, targetId: selectedTextId },
      ]);
  };
  const remove = (asset: Asset) => {
    if (apply([{ type: "asset", operation: "remove", assetId: asset.id }])) setSelected(null);
  };
  const rename = (asset: Asset) => {
    setSelected(asset.id);
    requestAnimationFrame(() => {
      nameInput.current?.focus();
      nameInput.current?.select();
    });
  };
  const menu = (asset: Asset, point: { x: number; y: number }) => {
    const used = usage.get(asset.id) ?? 0,
      items: (EditorCommand | { separator: true })[] = [];
    if (asset.kind === "image")
      items.push({
        id: "insert",
        label: "Inserir na prancheta",
        group: "Recurso",
        shortcut: "Enter",
      });
    if (asset.kind === "font")
      items.push(
        {
          id: "insert",
          label: "Aplicar ao texto selecionado",
          group: "Recurso",
          shortcut: "Enter",
          ...(selectedTextId ? {} : { reason: "Selecione um texto na prancheta." }),
        },
        { id: "notice", label: "Ver aviso da licença", group: "Recurso" },
      );
    if (items.length) items.push({ separator: true });
    items.push(
      { id: "replace", label: "Substituir arquivo…", group: "Recurso" },
      { id: "rename", label: "Renomear", group: "Recurso", shortcut: "F2" },
      { separator: true },
      {
        id: "remove",
        label: "Excluir",
        group: "Recurso",
        shortcut: "Delete",
        ...(used
          ? {
              reason: `Em uso (${usedText(used)}). Remova as imagens, textos, vínculos de áudio ou fontes padrão que usam este recurso antes de excluí-lo.`,
            }
          : {}),
      },
    );
    openMenu({
      key: "asset",
      label: `Recurso ${asset.name}`,
      items,
      point,
      select(id) {
        if (id === "insert") insert(asset);
        else if (id === "notice" && asset.kind === "font") setReading(asset);
        else if (id === "replace") pick(asset.id);
        else if (id === "rename") rename(asset);
        else if (id === "remove") remove(asset);
      },
    });
  };
  const keys = (asset: Asset, event: KeyboardEvent) => {
    // The editor's own keys (Delete removes the selected object) must not act behind the panel.
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      insert(asset);
    } else if (event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      rename(asset);
    } else if (event.key === "Delete") {
      event.preventDefault();
      event.stopPropagation();
      if (usage.get(asset.id))
        setError(`${asset.name} está em uso: ${usedText(usage.get(asset.id) ?? 0)}.`);
      else remove(asset);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      event.stopPropagation();
      const box = (event.target as Element).getBoundingClientRect();
      menu(asset, { x: box.left, y: box.bottom });
    }
  };
  const files = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");

  const size = assets.reduce((sum, asset) => sum + asset.byteLength, 0),
    current = assets.find((asset) => asset.id === selected),
    hasAudio = assets.some((asset) => asset.kind === "audio");
  return (
    <section
      className={`asset-panel${dropping ? " is-dropping" : ""}`}
      aria-label="Catálogo de recursos"
      data-asset-drop
      onDragOver={(event) => {
        if (!files(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        if (!files(event)) return;
        event.preventDefault();
        setDropping(false);
        void readFiles([...event.dataTransfer.files]);
      }}
    >
      <div className="asset-heading">
        <h3>RECURSOS</h3>
        <button
          type="button"
          className="asset-add"
          aria-label="Importar recurso"
          title={`Importar recurso… Ou arraste arquivos para cá.\n${FORMATS}`}
          disabled={busy || pending !== null}
          onClick={() => pick()}
        >
          +
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept={ACCEPT}
        multiple
        aria-label="Arquivo de recurso"
        hidden
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])],
            replaceId = replacing.current;
          event.target.value = "";
          replacing.current = undefined;
          void readFiles(replaceId ? chosen.slice(0, 1) : chosen, replaceId);
        }}
      />
      {busy && !pending && (
        <p className="asset-busy micro">
          Lendo arquivo…{" "}
          <button
            type="button"
            onClick={() => {
              session.queue.length = 0;
              controller.current?.abort();
            }}
          >
            Cancelar importação
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="asset-error">
          {error}
        </p>
      )}
      {!assets.length && (
        <p className="asset-empty micro">
          Arraste PNG, WAV ou fontes para cá, ou use <b>+</b>.
        </p>
      )}
      {KINDS.map(({ kind, title }) => {
        const items = assets.filter((asset) => asset.kind === kind);
        if (!items.length) return null;
        return (
          <details
            key={kind}
            className="asset-group"
            open={!closed.has(kind)}
            onToggle={(event) => {
              const next = new Set(closed);
              if (event.currentTarget.open) next.delete(kind);
              else next.add(kind);
              session.closed = next;
              setClosed(next);
            }}
          >
            <summary>
              {title} <span>{items.length}</span>
            </summary>
            <div className={`asset-grid asset-grid-${kind satisfies Kind}`}>
              {items.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  used={usage.get(asset.id) ?? 0}
                  selected={asset.id === selected}
                  select={() => setSelected(asset.id)}
                  primary={() => insert(asset)}
                  menu={(point) => menu(asset, point)}
                  keys={(event) => keys(asset, event)}
                />
              ))}
            </div>
          </details>
        );
      })}
      {current && (
        <section className="asset-detail" aria-label="Recurso selecionado">
          <input
            key={current.id}
            ref={nameInput}
            aria-label={`Nome de ${current.name}`}
            defaultValue={current.name}
            maxLength={120}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = current.name;
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (name && name !== current.name)
                apply([{ type: "asset", operation: "rename", assetId: current.id, name }]);
              else event.target.value = current.name;
            }}
          />
          <p className="micro">
            {detail(current)} · {kb(current.byteLength)} · {usedText(usage.get(current.id) ?? 0)}
          </p>
          {current.kind === "image" && (
            <p className="micro">
              Arraste para a prancheta, ou duplo clique para inserir no centro.
            </p>
          )}
          {current.kind === "font" && (
            <p className="micro">
              {selectedTextId
                ? "Duplo clique aplica ao texto selecionado."
                : "Selecione um texto para aplicar esta fonte."}
            </p>
          )}
        </section>
      )}
      <p className="asset-footer micro" title={FORMATS}>
        {(size / 1000000).toFixed(1).replace(".", ",")} / {CATALOG_BYTES / 1000000} MB ·{" "}
        {assets.length} / 256
      </p>
      {board && hasAudio && (
        <details
          className="asset-effects"
          open={session.effectsOpen}
          onToggle={(event) => {
            session.effectsOpen = event.currentTarget.open;
          }}
        >
          <summary>Efeitos de áudio por evento</summary>
          <AudioPanel board={board} assets={assets} execute={execute} />
        </details>
      )}
      <dialog
        ref={confirm}
        className="asset-confirm"
        aria-label={pending?.replaceId ? "Confirmar substituição" : "Confirmar conversão"}
        onCancel={(event) => {
          event.preventDefault();
          cancelPending();
        }}
      >
        {pending && (
          <section>
            <h3>
              {pending.replaceId
                ? "Substituir recurso"
                : pending.prepared.kind === "font"
                  ? "Importar fonte"
                  : "Importar com conversão"}
            </h3>
            <p>{pending.prepared.conversion}</p>
            {pending.prepared.kind === "font" && pending.prepared.collection && (
              <label>
                Face da coleção
                <select
                  aria-label="Face da coleção"
                  value={pending.prepared.collection.face}
                  disabled={busy}
                  onChange={(event) => {
                    const prepared = pending.prepared,
                      collection = prepared.kind === "font" ? prepared.collection : undefined,
                      face = Number(event.target.value);
                    if (!collection) return;
                    void run(async (signal) => {
                      setPending({
                        ...pending,
                        prepared: await prepareAssetImport(
                          collection.source,
                          collection.name,
                          signal,
                          face,
                        ),
                      });
                      setRights(false);
                    });
                  }}
                >
                  {pending.prepared.collection.faces.map((face) => (
                    <option key={face.index} value={face.index}>
                      {face.family} · {face.weight}
                      {face.italic ? " itálico" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {pending.prepared.kind === "font" && (
              <>
                <details>
                  <summary>Avisos da fonte {pending.prepared.asset.family}</summary>
                  <pre>
                    {pending.prepared.asset.notice ||
                      "Nenhum aviso textual encontrado; consulte a licença original."}
                  </pre>
                </details>
                <label className="asset-check">
                  <input
                    type="checkbox"
                    checked={rights}
                    onChange={(event) => setRights(event.target.checked)}
                  />
                  Confirmo que posso incorporar e redistribuir esta fonte
                </label>
                <label>
                  Aviso de licença adicional
                  <textarea
                    value={notice}
                    maxLength={16000}
                    onChange={(event) => setNotice(event.target.value)}
                  />
                </label>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="asset-confirm-actions">
              <button type="button" onClick={cancelPending}>
                {pending.prepared.kind === "font" ? "Cancelar" : "Cancelar conversão"}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || (pending.prepared.kind === "font" && !rights)}
                onClick={() => void confirmPending(pending)}
              >
                {pending.replaceId
                  ? "Confirmar e substituir"
                  : pending.prepared.kind === "font"
                    ? "Confirmar e importar fonte"
                    : "Aceitar conversão e importar"}
              </button>
            </div>
          </section>
        )}
      </dialog>
      <dialog
        ref={noticeDialog}
        className="asset-confirm"
        aria-label="Aviso da licença"
        onClose={() => setReading(null)}
      >
        {reading && (
          <section>
            <h3>Aviso da licença · {reading.family}</h3>
            <pre>
              {[reading.notice, reading.licenseNotice].filter(Boolean).join("\n\n") ||
                "Nenhum aviso textual encontrado; consulte a licença original."}
            </pre>
            <div className="asset-confirm-actions">
              <button type="button" onClick={() => noticeDialog.current?.close()}>
                Fechar
              </button>
            </div>
          </section>
        )}
      </dialog>
    </section>
  );
}
export function mountAssetPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<AssetPanel {...props} />);
  return () => root.unmount();
}
