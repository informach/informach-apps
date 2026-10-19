/** Bound transaction work before recursively cloning command payloads. These
 * are operation budgets, independent of the size of the resulting document. */
export function assertCommandBudget(input: unknown) {
  if (!Array.isArray(input)) return;
  if (input.length > 100) throw new Error("Orçamento de comandos excedido.");
  let keys = 0,
    tracks = 0;
  for (const command of input) {
    if (typeof command !== "object" || command === null) continue;
    if ("keyIds" in command && Array.isArray(command.keyIds)) keys += command.keyIds.length;
    if ("references" in command && Array.isArray(command.references))
      keys += command.references.length;
    if ("vertices" in command && Array.isArray(command.vertices)) keys += command.vertices.length;
    if ("type" in command && command.type === "set-key") keys++;
    if ("poses" in command && Array.isArray(command.poses)) {
      if (command.poses.length > 2000) throw new Error("Orçamento de poses excedido.");
      for (const pose of command.poses)
        if (
          typeof pose === "object" &&
          pose !== null &&
          "transform" in pose &&
          typeof pose.transform === "object" &&
          pose.transform !== null
        )
          keys += Object.keys(pose.transform).length;
    }
    if (
      "animation" in command &&
      typeof command.animation === "object" &&
      command.animation !== null &&
      "tracks" in command.animation &&
      Array.isArray(command.animation.tracks)
    ) {
      tracks += command.animation.tracks.length;
      if (tracks > 12000) throw new Error("Orçamento de trilhas em comandos excedido.");
      for (const track of command.animation.tracks) {
        if (
          typeof track === "object" &&
          track !== null &&
          "keys" in track &&
          Array.isArray(track.keys)
        )
          keys += track.keys.length;
        if (keys > 100000) throw new Error("Orçamento de chaves em comandos excedido.");
      }
    }
    if (keys > 100000) throw new Error("Orçamento de operações de chave excedido.");
  }
}
