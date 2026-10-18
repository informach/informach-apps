import { ASSET_BYTES, type Asset, CATALOG_BYTES } from "@informach/edi-motion/assets";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Artboard } from "../../shared/project";
import { type AssetImport, completeAssetImport, prepareAssetImport } from "./asset-import";
import { AudioPanel } from "./audio-panel";

interface Props {
  assets: Asset[];
  importNative?: () => Promise<{ name: string; bytes: Uint8Array } | null>;
  execute(commands: unknown[]): void;
  selectedTextId?: string;
  board?: Artboard;
}
function AssetPanel({ assets, importNative, execute, selectedTextId, board }: Props) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<AssetImport | null>(null),
    [rights, setRights] = useState(false),
    [notice, setNotice] = useState(""),
    controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    file = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const apply = (commands: unknown[]) => {
    try {
      execute(commands);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Operação recusada.");
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
      if (!task.signal.aborted)
        setError(error instanceof Error ? error.message : "Importação recusada.");
    } finally {
      if (controller.current === task) controller.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const cancel = () => {
    controller.current?.abort();
    setPending(null);
    setRights(false);
    if (!controller.current) setBusy(false);
  };
  const load = (source: () => Promise<{ name: string; bytes: Uint8Array } | null>) =>
    run(async (signal) => {
      const input = await source();
      signal.throwIfAborted();
      if (!input) return;
      const prepared = await prepareAssetImport(input.bytes, input.name, signal);
      if (prepared.conversion) {
        setPending(prepared);
        setRights(false);
        setNotice("");
      } else execute([{ type: "asset", operation: "put", value: prepared.asset }]);
    });
  const size = assets.reduce((sum, asset) => sum + asset.byteLength, 0);
  return (
    <section className="scene-padding" aria-label="Catálogo de recursos">
      <h3>RECURSOS DO PROJETO</h3>
      <p className="micro">
        {assets.length}/256 recursos · {(size / 1000000).toFixed(2)}/{CATALOG_BYTES / 1000000} MB.
        PNG estático, WAV PCM16 (até 30 s) e fontes TTF/OTF de face única. Fontes precisam de
        confirmação de direitos; WOFF2/coleções não são aceitos neste perfil.
      </p>
      <input
        ref={file}
        type="file"
        accept=".png,.wav,.ttf,.otf"
        aria-label="Arquivo de recurso"
        hidden
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected)
            void load(async () => {
              if (selected.size > ASSET_BYTES) throw new Error("Arquivo excede 4 MB.");
              return { name: selected.name, bytes: new Uint8Array(await selected.arrayBuffer()) };
            });
        }}
      />
      <button
        type="button"
        disabled={busy || pending !== null}
        onClick={() => (importNative ? void load(importNative) : file.current?.click())}
      >
        Importar recurso…
      </button>
      {busy && (
        <button type="button" onClick={cancel}>
          Cancelar importação
        </button>
      )}
      {pending && (
        <section aria-label="Confirmar conversão">
          <p>{pending.conversion}</p>
          {pending.kind === "font" && (
            <>
              <details>
                <summary>Avisos da fonte {pending.asset.family}</summary>
                <pre>
                  {pending.asset.notice ||
                    "Nenhum aviso textual encontrado; consulte a licença original."}
                </pre>
              </details>
              <label>
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
          <button
            type="button"
            disabled={busy || (pending.kind === "font" && !rights)}
            onClick={() =>
              void run(async (signal) => {
                if (pending.kind === "font" && !rights)
                  throw new Error("Confirme os direitos da fonte.");
                const asset = await completeAssetImport(
                  pending,
                  signal,
                  pending.kind === "font"
                    ? { rightsConfirmed: true, licenseNotice: notice }
                    : undefined,
                );
                execute([{ type: "asset", operation: "put", value: asset }]);
              })
            }
          >
            {pending.kind === "font"
              ? "Confirmar e importar fonte"
              : "Aceitar conversão e importar"}
          </button>
          <button type="button" onClick={cancel}>
            Cancelar conversão
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <ul>
        {assets.map((asset) => (
          <li key={asset.id}>
            <label>
              Nome do recurso
              <input
                aria-label={`Nome de ${asset.name}`}
                defaultValue={asset.name}
                maxLength={120}
                onBlur={(event) => {
                  if (event.target.value !== asset.name)
                    apply([
                      {
                        type: "asset",
                        operation: "rename",
                        assetId: asset.id,
                        name: event.target.value,
                      },
                    ]);
                }}
              />
            </label>
            <p className="micro">
              {asset.kind === "image"
                ? `${asset.width} × ${asset.height} px`
                : asset.kind === "audio"
                  ? `${(asset.frames / asset.sampleRate).toFixed(2)} s · ${asset.channels} canais`
                  : `${asset.family} · ${asset.weight} · ${asset.italic ? "itálico" : "normal"}`}{" "}
              · {asset.byteLength} bytes
            </p>
            {asset.kind === "image" && (
              <button
                type="button"
                onClick={() =>
                  apply([{ type: "asset", operation: "insert-image", assetId: asset.id }])
                }
              >
                Inserir imagem
              </button>
            )}
            {asset.kind === "font" && (
              <button
                type="button"
                disabled={!selectedTextId}
                onClick={() =>
                  apply([
                    {
                      type: "asset",
                      operation: "set-font",
                      assetId: asset.id,
                      targetId: selectedTextId,
                    },
                  ])
                }
              >
                Aplicar fonte ao texto selecionado
              </button>
            )}
            <button
              type="button"
              onClick={() => apply([{ type: "asset", operation: "remove", assetId: asset.id }])}
            >
              Excluir recurso
            </button>
          </li>
        ))}
      </ul>
      {board && <AudioPanel board={board} assets={assets} execute={execute} />}
    </section>
  );
}
export function mountAssetPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<AssetPanel {...props} />);
  return () => root.unmount();
}
