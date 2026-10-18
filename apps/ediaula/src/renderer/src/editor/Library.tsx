import {
  CATEGORY_LABEL,
  LIBRARY_CATEGORIES,
  type LibraryCategory,
  type LibraryMedia,
  TARGET_LABEL,
} from "@shared/library";
import type { Asset } from "@shared/types";
import {
  AlertTriangle,
  BookmarkPlus,
  Film,
  FolderSearch,
  Image,
  Loader,
  Music,
  Palette,
  Plus,
  Replace,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { actions } from "@/lib/actions";
import { duration } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { rerecordGuided } from "@/lib/recording";
import { needsRelink, relinkAsset, relinkMissingInFolder } from "@/lib/relink";
import { replaceMedia } from "@/lib/replaceMedia";
import {
  addLibraryMedia,
  applyStyle,
  loadSharedLibrary,
  removeFromLibrary,
  saveMediaToLibrary,
  setMediaCategory,
  useSharedLibrary,
} from "@/lib/sharedLibrary";
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
  const [scope, setScope] = useState<"lesson" | "all">("lesson");
  const missing = assets.filter(needsRelink).length;

  const shown = assets.filter(
    (a) =>
      !a.generated &&
      (filter === "all" || a.kind === filter) &&
      (!query || a.name.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <section className="library">
      <div className="row-6">
        <Chip active={scope === "lesson"} onClick={() => setScope("lesson")}>
          Desta aula
        </Chip>
        <Chip active={scope === "all"} onClick={() => setScope("all")}>
          Todas as aulas
        </Chip>
      </div>
      {scope === "all" ? (
        <SharedLibrary />
      ) : (
        <LessonMedia
          assets={assets}
          usage={usage}
          shown={shown}
          missing={missing}
          query={query}
          setQuery={setQuery}
          filter={filter}
          set={set}
          selected={selected}
          setSelected={setSelected}
        />
      )}
    </section>
  );
}

function LessonMedia({
  assets,
  usage,
  shown,
  missing,
  query,
  setQuery,
  filter,
  set,
  selected,
  setSelected,
}: {
  assets: Asset[];
  usage: { assetId: string }[] | undefined;
  shown: Asset[];
  missing: number;
  query: string;
  setQuery: (q: string) => void;
  filter: LibraryFilter;
  set: (s: { libraryFilter: LibraryFilter }) => void;
  selected: string | null;
  setSelected: (id: string) => void;
}): ReactNode {
  return (
    <>
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
      {missing > 0 && (
        <div className="lib-missing">
          <AlertTriangle size={13} />
          <span className="spacer">
            {missing === 1
              ? "1 arquivo não foi encontrado"
              : `${missing} arquivos não foram encontrados`}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void relinkMissingInFolder()}
            title="Escolha a pasta para onde os arquivos foram movidos; procuro pelo nome e pelo tamanho"
          >
            <FolderSearch size={13} /> Procurar em uma pasta…
          </button>
        </div>
      )}
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
              uses={usage?.filter((c) => c.assetId === a.id).length ?? 0}
              onSelect={() => setSelected(a.id)}
            />
          ))}
        </div>
      )}
      <p className="lib-hint muted">
        Arraste para a timeline ou dê dois cliques para colocar no final.
      </p>
    </>
  );
}

/**
 * The library of every lesson (shared/library.ts): openings, logos, music and cards kept with
 * "Salvar na biblioteca", and the favorite styles of annotations, captions and the pointer.
 */
function SharedLibrary(): ReactNode {
  const { library, loaded } = useSharedLibrary();
  const [category, setCategory] = useState<LibraryCategory | "all">("all");
  useEffect(() => {
    if (!useSharedLibrary.getState().loaded) void loadSharedLibrary();
  }, []);
  const media = library.media.filter((m) => category === "all" || m.category === category);
  return (
    <>
      <div className="lib-header">
        <h2>Biblioteca de todas as aulas</h2>
      </div>
      <div className="row-6 row-wrap">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          Tudo
        </Chip>
        {LIBRARY_CATEGORIES.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </div>
      {!loaded ? (
        <p className="muted">Abrindo a biblioteca…</p>
      ) : media.length === 0 ? (
        <p className="lib-hint muted">
          Use o botão de marcador num item de Desta aula para guardar vinhetas, logos, músicas e
          cartelas que você usa em todas as aulas.
        </p>
      ) : (
        <ul className="shared-list">
          {media.map((m) => (
            <SharedMediaRow key={m.id} media={m} />
          ))}
        </ul>
      )}
      <div className="lib-header">
        <h2>
          <Palette size={13} /> Estilos favoritos
        </h2>
      </div>
      {library.styles.length === 0 ? (
        <p className="lib-hint muted">
          Em Propriedades, use Favoritar estilo numa anotação, na legenda ou no cursor de uma
          gravação.
        </p>
      ) : (
        <ul className="shared-list">
          {library.styles.map((s) => (
            <li key={s.id} className="shared-row">
              <span className="spacer">
                <strong>{s.name}</strong>
                <span className="muted"> · {TARGET_LABEL[s.target]}</span>
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => applyStyle(s)}
              >
                Aplicar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Tirar dos favoritos"
                onClick={() => void removeFromLibrary(s.id)}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SharedMediaRow({ media }: { media: LibraryMedia }): ReactNode {
  const Icon = KIND_ICON[media.kind];
  const add = async (): Promise<void> => {
    const [asset] = await addLibraryMedia(media.path);
    if (asset) actions.appendAssets([asset]);
  };
  return (
    <li className={`shared-row ${media.missing ? "is-missing" : ""}`} title={media.path}>
      <Icon size={14} />
      <span className="spacer shared-name">{media.name}</span>
      <select
        className="select select-sm"
        aria-label={`Tipo de ${media.name}`}
        value={media.category}
        onChange={(e) => void setMediaCategory(media.id, e.target.value as LibraryCategory)}
      >
        {LIBRARY_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={media.missing}
        title={media.missing ? "O arquivo não está mais neste computador" : "Coloca no fim da aula"}
        onClick={() => void add()}
      >
        <Plus size={12} /> Usar
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title="Tirar da biblioteca (o arquivo continua no disco)"
        onClick={() => void removeFromLibrary(media.id)}
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
}

function AssetCard({
  asset,
  selected,
  uses,
  onSelect,
}: {
  asset: Asset;
  selected: boolean;
  /** Clips on the timeline playing this media. */
  uses: number;
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
          {(asset.missing || asset.cursorMissing) && (
            <button
              type="button"
              className="badge badge-amber badge-button"
              title={
                asset.missing
                  ? "Mostrar onde está o arquivo agora. Os cortes e ajustes continuam."
                  : "Mostrar onde estão os dados do cursor desta gravação (cursor.json)."
              }
              onClick={(e) => {
                e.stopPropagation();
                void relinkAsset(asset.id);
              }}
            >
              <AlertTriangle size={10} /> {asset.missing ? "Arquivo sumiu" : "Cursor sumiu"} ·
              Reconectar…
            </button>
          )}
          {asset.guidedRun && !asset.missing && (
            <button
              type="button"
              className="badge badge-muted badge-button"
              title="Grava a demonstração de novo com o mesmo plano. Os clipes que usam esta mídia passam a mostrar o novo take nos mesmos pontos."
              onClick={(e) => {
                e.stopPropagation();
                void rerecordGuided(asset.id);
              }}
            >
              <RotateCcw size={10} /> Regravar e substituir
            </button>
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
        {!asset.generated && !asset.missing && (
          <span className="media-tools">
            <button
              type="button"
              className="media-tool"
              title="Salvar na biblioteca de todas as aulas"
              aria-label={`Salvar ${asset.name} na biblioteca`}
              onClick={(e) => {
                e.stopPropagation();
                void saveMediaToLibrary(asset);
              }}
            >
              <BookmarkPlus size={12} />
            </button>
            <button
              type="button"
              className="media-tool"
              title="Substituir mídia: outro arquivo no lugar, os clipes mantêm as edições"
              aria-label={`Substituir ${asset.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void replaceMedia(asset.id);
              }}
            >
              <Replace size={12} />
            </button>
          </span>
        )}
        <button
          type="button"
          className="media-remove"
          style={{ zIndex: 2 }}
          title={uses ? "Remover da biblioteca e da timeline" : "Remover da biblioteca"}
          onClick={(e) => {
            e.stopPropagation();
            if (
              uses &&
              !confirm(
                `Remover ${asset.name}? ${uses === 1 ? "1 clipe da timeline usa esta mídia e também será removido" : `${uses} clipes da timeline usam esta mídia e também serão removidos`}. Ctrl+Z desfaz.`,
              )
            )
              return;
            actions.removeAsset(asset.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <span className="media-name" title={asset.name}>
        {asset.name}
      </span>
    </fieldset>
  );
}
