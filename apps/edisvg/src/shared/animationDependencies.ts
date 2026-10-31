import type { MotionCommand } from "@informach/edi-motion";
import { rigCost } from "@informach/edi-motion/rig";
import { applyBehavior } from "./behavior";
import type { Project } from "./project";
import { applyRig } from "./rig";

/** Clip-owned channels/events follow its lifecycle; references from machines or
 * components do not. Called on the transaction draft after motion validation. */
export function applyAnimationDependencies(
  project: Project,
  command: Extract<MotionCommand, { type: "duplicate-animation" | "delete-animation" }>,
) {
  const plans = project.artboards.map((board) => {
    const clip = board.rig?.parameterClips?.find(
        (clip) => clip.animationId === command.animationId,
      ),
      events =
        board.behavior?.events.filter((event) => event.animationId === command.animationId) ?? [],
      eventIds = new Set(events.map((event) => event.id)),
      audio = board.audio?.bindings.filter((binding) => eventIds.has(binding.eventId)) ?? [];
    if (command.type === "duplicate-animation") {
      const cost = rigCost(board.rig),
        addedKeys = clip?.tracks.reduce((sum, track) => sum + track.keys.length, 0) ?? 0;
      if (
        (clip && (board.rig?.parameterClips?.length ?? 0) >= 100) ||
        cost.tracks + (clip?.tracks.length ?? 0) > 12000 ||
        cost.keys + addedKeys > 100000 ||
        (board.behavior?.events.length ?? 0) + events.length > 10000 ||
        (board.audio?.bindings.length ?? 0) + audio.length > 256
      )
        throw new Error("A duplicação excede orçamento de canais/eventos/áudio da animação.");
    }
    return { board, clip, events, eventIds, audio };
  });
  for (const { board, clip, events, eventIds, audio } of plans) {
    // Vertex keys belong to their animation, like its rig channels.
    const vertexClips = board.vertexClips?.filter(
      (value) => value.animationId === command.animationId,
    );
    if (vertexClips?.length) {
      if (command.type === "delete-animation") {
        board.vertexClips = board.vertexClips?.filter(
          (value) => value.animationId !== command.animationId,
        );
        if (!board.vertexClips?.length) delete board.vertexClips;
      } else
        board.vertexClips?.push(
          ...vertexClips.map((value) => ({
            ...structuredClone(value),
            id: `track-${crypto.randomUUID()}`,
            animationId: command.id,
            keys: value.keys.map((key) => ({
              ...structuredClone(key),
              id: `key-${crypto.randomUUID()}`,
            })),
          })),
        );
    }
    if (board.rig && clip) {
      const parameterClips =
        command.type === "delete-animation"
          ? board.rig.parameterClips?.filter((value) => value.animationId !== command.animationId)
          : [
              ...(board.rig.parameterClips ?? []),
              {
                animationId: command.id,
                tracks: clip.tracks.map((track) => ({
                  ...structuredClone(track),
                  id: `track-${crypto.randomUUID()}`,
                  keys: track.keys.map((key) => ({
                    ...structuredClone(key),
                    id: `key-${crypto.randomUUID()}`,
                  })),
                })),
              },
            ];
      // Reuse owner/ancestor locks and rig validation, not a privileged writer.
      applyRig(project, board, {
        type: "rig",
        operation: "replace",
        value: { ...board.rig, parameterClips },
      });
    }
    if (!board.behavior || !events.length) continue;
    if (command.type === "delete-animation") {
      applyBehavior(project, board, {
        type: "behavior",
        operation: "replace",
        value: {
          ...board.behavior,
          events: board.behavior.events.filter((event) => !eventIds.has(event.id)),
        },
      });
      if (board.audio)
        board.audio.bindings = board.audio.bindings.filter(
          (binding) => !eventIds.has(binding.eventId),
        );
    } else {
      const mapping = new Map(events.map((event) => [event.id, `event-${crypto.randomUUID()}`]));
      function copiedEvent(id: string) {
        const copied = mapping.get(id);
        if (!copied) throw new Error("Evento não mapeado na cópia da animação.");
        return copied;
      }
      applyBehavior(project, board, {
        type: "behavior",
        operation: "replace",
        value: {
          ...board.behavior,
          events: [
            ...board.behavior.events,
            ...events.map((event) => ({
              ...structuredClone(event),
              id: copiedEvent(event.id),
              animationId: command.id,
            })),
          ],
        },
      });
      board.audio?.bindings.push(
        ...audio.map((binding) => ({
          ...binding,
          id: `audio-${crypto.randomUUID()}`,
          eventId: copiedEvent(binding.eventId),
        })),
      );
    }
  }
}
