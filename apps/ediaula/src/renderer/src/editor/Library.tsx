import type { Asset } from "@shared/types";
import { AlertTriangle, Film, Image, Loader, Music, Plus, Search, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { actions } from "@/lib/actions";
import { duration } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { type LibraryFilter, useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Badge, Chip } from "@/ui";

export const ASSET_MIME = "application/x-ediaula-assets";

const FILTERS: [LibraryFilter, string][] = [
  ["all", "Tudo"],
  ["video", "Vídeo"],
  ["audio", "Áudio"],
  ["image", "Imagens"],
];

const KIND_ICON = { video: Film, audio: Music, image: Image };
const KIND_GRADIENT = { video: "#1F3A8A", audio: "#0E4D47", image: "#4A5A12" };

export function Library(): ReactNode {
  const assets = useProject((s) => s.project?.assets ?? []);
  const usage = useProject((s) => s.project?.clips);
  const filter = useApp((s) => s.libraryFilter);
  const set = useApp((s) => s.set);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const shown = assets.filter(
    (a) =>
      !a.generated &&
      (filter === "all" || a.kind === filter) &&
      (!query || a.name.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <section className="library">
      <div className="lib-header">
        <h2>Mídia do projeto</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void actions.importDialog()}
        >
          <Plus size={13} /> Importar
        </button>
      </div>
      <label className="search lib-search">
        <Search size={14} />
        <input
          placeholder="Buscar mídia…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="row-6">
        {FILTERS.map(([id, label]) => (
          <Chip key={id} active={filter === id} onClick={() => set({ libraryFilter: id })}>
            {label}
          </Chip>
        ))}
      </div>

      {assets.length === 0 ? (
        <button type="button" className="lib-empty" onClick={() => void actions.importDialog()}>
          <Plus size={22} />
          <strong>Importe vídeos, áudios e imagens</strong>
          <span>Clique aqui ou arraste arquivos do Windows Explorer para esta janela.</span>
        </button>
      ) : (
        <div className="media-grid">
          {shown.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              selected={selected === a.id}
              used={!!usage?.some((c) => c.assetId === a.id)}
              onSelect={() => setSelected(a.id)}
            />
          ))}
        </div>
      )}
      <p className="lib-hint muted">
        Arraste para a timeline ou dê dois cliques para colocar no final.
      </p>
    </section>
  );
}

function AssetCard({
  asset,
  selected,
  used,
  onSelect,
}: {
  asset: Asset;
  selected: boolean;
  used: boolean;
  onSelect: () => void;
}): ReactNode {
  const Icon = KIND_ICON[asset.kind];
  const is4k = asset.height >= 2160;
  return (
    <fieldset
      aria-label={asset.name}
      className={`media-card ${selected ? "is-selected" : ""} ${asset.missing ? "is-missing" : ""}`}
      draggable={!asset.missing}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_MIME, JSON.stringify([asset.id]));
        e.dataTransfer.effectAllowed = "copy";
      }}
      style={{ position: "relative" }}
      title={asset.path}
    >
      <button
        type="button"
        className="card-open"
        aria-label={`Selecionar ${asset.name}`}
        aria-pressed={selected}
        title="Selecionar; duplo clique ou Enter para adicionar à timeline"
        onClick={onSelect}
        onDoubleClick={() => !asset.missing && actions.appendAssets([asset])}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !asset.missing) {
            event.preventDefault();
            onSelect();
            actions.appendAssets([asset]);
          }
        }}
      />
      <div
        className="media-thumb"
        style={{ background: `linear-gradient(200deg, ${KIND_GRADIENT[asset.kind]}, #0D0E11)` }}
      >
        {asset.thumb ? (
          <img src={mediaUrl(asset.thumb)} alt="" draggable={false} />
        ) : (
          <Icon size={22} className="media-icon" />
        )}
        <div className="media-badges">
          {asset.missing && (
            <Badge tone="amber">
              <AlertTriangle size={10} /> Arquivo sumiu
            </Badge>
          )}
          {is4k && <Badge tone="muted">4K</Badge>}
          {asset.vfr && <Badge tone="muted">VFR</Badge>}
          {asset.proxyStatus === "pending" && (
            <Badge tone="muted">
              <Loader size={10} className="spin" /> Proxy
            </Badge>
          )}
          {asset.proxyStatus === "ready" && <Badge tone="accent">Proxy</Badge>}
        </div>
        {asset.kind !== "image" && (
          <span className="media-dur mono">{duration(asset.duration)}</span>
        )}
        <button
          type="button"
          className="media-remove"
          style={{ zIndex: 2 }}
          title={used ? "Remover da biblioteca e da timeline" : "Remover da biblioteca"}
          onClick={(e) => {
            e.stopPropagation();
            actions.removeAsset(asset.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <span className="media-name">{asset.name}</span>
    </fieldset>
  );
}
