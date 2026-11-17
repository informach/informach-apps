import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { eq } from "@informach/db";
import { recreioSocialPreferences as preferences } from "@informach/db/schema";
import type { ListaSocial } from "@informach/recreio/contrato";
import { assertAllowed } from "@/lib/errors";
import { type AutorSocial, comJogadorSocial } from "./autoridade-repository";

export async function salvarPreferenciaDePresenca(
  autor: AutorSocial,
  presenca: ListaSocial["presenca"],
) {
  return comJogadorSocial(autor, null, async (tx, atual) => {
    assertAllowed(
      atual.origem.tipo === "adulto",
      "PERMISSAO",
      "A presença protegida é definida na supervisão pelo responsável.",
    );
    const [anterior] = await tx
      .select()
      .from(preferences)
      .where(eq(preferences.profileId, autor.perfilId))
      .for("update");
    if ((anterior?.presenceMode ?? "friends") === presenca) return { presenca };
    await tx
      .insert(preferences)
      .values({
        profileId: autor.perfilId,
        presenceMode: presenca,
        updatedAt: await atual.conferirPrazo(),
      })
      .onConflictDoUpdate({
        target: preferences.profileId,
        set: { presenceMode: presenca, updatedAt: await atual.conferirPrazo() },
      });
    await logAuditEventStrict(
      "recreio.social_presence_changed",
      atual.contaId,
      { app: "recreio", profileId: autor.perfilId, presenceMode: presenca },
      { writer: tx },
    );
    return { presenca };
  });
}
