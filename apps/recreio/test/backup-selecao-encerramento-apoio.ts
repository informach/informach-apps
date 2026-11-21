import { createHash } from "node:crypto";
import { db } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioProfileDataKeys as keys,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { criarPerfilProprio } from "@/features/perfis/service";
import { exigir } from "../scripts/backup/provas-arquivos";
import { prepararMundoDoEncerramento } from "./backup-encerramento-mundo-apoio";
import { familiaSocial } from "./social-apoio";

/** Native profiles, accepted guardianship, shared adult world and synthetic
 * opaque payloads. Called before capture; consent is a separate phase. */
export async function prepararSelecaoDoEncerramento() {
  const familia = await familiaSocial(15);
  const proprio = await criarPerfilProprio(familia.autor, {
    apelido: "Adulto A",
    avatar: "sol",
  });
  const perfisSelecionados = [familia.perfil.id, proprio.perfil.id].sort();
  const mundo = await prepararMundoDoEncerramento(
    familia.autor,
    familia.conta.email,
    proprio.perfil.id,
  );
  for (const profileId of perfisSelecionados) {
    const [key] = await db
      .insert(keys)
      .values({ profileId, gameId: "historico-privado", key: "progresso", revision: 1 })
      .returning();
    exigir(key, "DADOS_NATIVOS_AUSENTES");
    const bytes = Buffer.from(`Dados sintéticos da seleção ${profileId}`);
    try {
      await db.insert(versions).values({
        dataId: key.id,
        profileId,
        gameId: key.gameId,
        baseRevision: 0,
        revision: 1,
        kind: "accepted",
        bytes,
        digest: createHash("sha256").update(bytes).digest("hex"),
      });
      await db.insert(achievements).values({
        profileId,
        gameId: key.gameId,
        achievementId: "primeiro",
        keyHash: createHash("sha256").update(profileId).digest("hex"),
      });
    } finally {
      bytes.fill(0);
    }
  }
  return { familia, perfisSelecionados, mundo };
}
