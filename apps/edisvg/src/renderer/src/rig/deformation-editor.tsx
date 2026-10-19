import { type RigDocument, rigOwners, upgradeRigVersion } from "@informach/edi-motion/rig";
import { useState } from "react";
import { pathFromNode } from "../../../shared/pathGeometry.js";
import type { Artboard } from "../../../shared/project";
import { flattenScene } from "../../../shared/scene.js";
import { numberValue, textValue } from "./constraint-editor";

export function DeformationEditor({
  board,
  rig,
  selectedId,
  save,
  report,
}: {
  board: Artboard;
  rig: RigDocument;
  selectedId: string | null;
  save(value: RigDocument): void;
  report(error: unknown): void;
}) {
  const entries = flattenScene(board.scene),
    selected = entries.find(({ node }) => node.id === selectedId),
    paths = entries.filter(({ node }) => node.tag === "path"),
    [poseId, setPoseId] = useState(paths.find(({ node }) => node.id !== selectedId)?.node.id ?? ""),
    morphs = (rig.morphs ?? []).filter((morph) => morph.targetId === selectedId),
    solo = rig.solos?.find((solo) => solo.targetId === selectedId);
  const attempt = (callback: () => void) => {
    try {
      callback();
    } catch (error) {
      report(error);
    }
  };
  return (
    <section aria-label="Deformação e expressões">
      <h3>MORPH E EXPRESSÕES</h3>
      {selected?.node.tag === "path" ? (
        <>
          <p className="micro">
            Capture a geometria local de outra pose com os mesmos contornos, vértices e alças. Use a
            edição vetorial para preparar essa pose. Os pesos animam deltas da base; não modificam o
            desenho original.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              attempt(() => {
                const data = new FormData(event.currentTarget),
                  pose = paths.find(({ node }) => node.id === poseId);
                if (!pose) throw new Error("Selecione o caminho da pose.");
                save({
                  ...rig,
                  version: upgradeRigVersion(rig.version, 2),
                  morphs: [
                    ...(rig.morphs ?? []),
                    {
                      id: `morph-${crypto.randomUUID()}`,
                      targetId: selected.node.id,
                      name: textValue(data, "name"),
                      geometry: pathFromNode(pose.node),
                      weight: numberValue(data, "weight") / 100,
                    },
                  ],
                });
              });
            }}
          >
            <label className="scene-field">
              Nome da pose
              <input
                name="name"
                aria-label="Nome da pose morph"
                defaultValue="Expressão"
                maxLength={120}
                required
              />
            </label>
            <label className="scene-field">
              Caminho da pose
              <select
                aria-label="Caminho da pose morph"
                value={poseId}
                onChange={(event) => setPoseId(event.target.value)}
              >
                {paths
                  .filter(({ node }) => node.id !== selectedId)
                  .map(({ node }) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="scene-field">
              Peso inicial (%)
              <input
                aria-label="Peso inicial do morph (%)"
                name="weight"
                type="number"
                min="0"
                max="100"
                step="any"
                defaultValue="0"
                required
              />
            </label>
            <button type="submit" disabled={!poseId || selected.locked}>
              Capturar pose morph
            </button>
          </form>
          {morphs.map((morph) => (
            <form
              key={morph.id}
              onSubmit={(event) => {
                event.preventDefault();
                attempt(() => {
                  const data = new FormData(event.currentTarget);
                  save({
                    ...rig,
                    morphs: rig.morphs?.map((value) =>
                      value.id === morph.id
                        ? {
                            ...value,
                            name: textValue(data, "name"),
                            weight: numberValue(data, "weight") / 100,
                          }
                        : value,
                    ),
                  });
                });
              }}
            >
              <label className="scene-field">
                Nome
                <input
                  name="name"
                  aria-label={`Nome ${morph.name}`}
                  defaultValue={morph.name}
                  maxLength={120}
                  required
                />
              </label>
              <label className="scene-field">
                Peso da pose (%)
                <input
                  name="weight"
                  aria-label={`Peso ${morph.name} (%)`}
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  defaultValue={morph.weight * 100}
                  required
                />
              </label>
              <button type="submit" disabled={selected.locked}>
                Aplicar pose morph
              </button>
              <button
                type="button"
                disabled={selected.locked}
                onClick={() =>
                  attempt(() =>
                    save({
                      ...rig,
                      morphs: rig.morphs?.filter((value) => value.id !== morph.id),
                      parameterClips: rig.parameterClips?.map((clip) => ({
                        ...clip,
                        tracks: clip.tracks.filter((track) => track.targetId !== morph.id),
                      })),
                    }),
                  )
                }
              >
                Excluir pose {morph.name} e seus canais
              </button>
            </form>
          ))}
        </>
      ) : (
        <p className="micro">Selecione um caminho para capturar/editar morphs.</p>
      )}
      {selected?.node.tag === "g" &&
      !selected.node.instance &&
      selected.node.children.length > 0 ? (
        <fieldset disabled={selected.locked}>
          <legend>Grupo solo · expressão exclusiva</legend>
          <p className="micro">
            Somente um filho direto é mostrado. −1 esconde todos. As chaves deste canal são
            discretas; visibilidade original e bindings continuam respeitados.
          </p>
          {!solo ? (
            <button
              type="button"
              onClick={() =>
                attempt(() =>
                  save({
                    ...rig,
                    version: upgradeRigVersion(rig.version, 2),
                    solos: [
                      ...(rig.solos ?? []),
                      {
                        id: `solo-${crypto.randomUUID()}`,
                        targetId: selected.node.id,
                        children: selected.node.children.map((node) => node.id),
                        activeIndex: 0,
                      },
                    ],
                  }),
                )
              }
            >
              Criar grupo solo
            </button>
          ) : (
            <>
              <label className="scene-field">
                Filho solo inicial
                <select
                  aria-label="Filho solo inicial"
                  value={solo.activeIndex}
                  onChange={(event) =>
                    attempt(() =>
                      save({
                        ...rig,
                        solos: rig.solos?.map((value) =>
                          value.id === solo.id
                            ? { ...value, activeIndex: Number(event.target.value) }
                            : value,
                        ),
                      }),
                    )
                  }
                >
                  <option value={-1}>Nenhum</option>
                  {selected.node.children.map((node, index) => (
                    <option key={node.id} value={index}>
                      {index} · {node.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  attempt(() =>
                    save({
                      ...rig,
                      solos: rig.solos?.filter((value) => value.id !== solo.id),
                      parameterClips: rig.parameterClips?.map((clip) => ({
                        ...clip,
                        tracks: clip.tracks.filter((track) => track.targetId !== solo.id),
                      })),
                    }),
                  )
                }
              >
                Remover grupo solo e seus canais
              </button>
            </>
          )}
        </fieldset>
      ) : (
        <p className="micro">Selecione um grupo com filhos para editar expressões solo.</p>
      )}
      {rigOwners(rig).size === 0 && <p className="micro">Este artboard ainda não tem rig.</p>}
    </section>
  );
}
