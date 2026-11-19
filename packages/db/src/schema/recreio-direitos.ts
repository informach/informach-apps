import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { recreioProfiles as profiles, recreio, recreioSpaces as spaces } from "./recreio";

/** Índice de privacidade, não presença nem permissão. A admissão pode deixar
 * autoria no estado mesmo para visitante sem associação de membro. Não expira
 * junto com SID/convite; só a retirada coordenada do perfil o elimina. */
export const recreioProfileWorldTraces = recreio.table(
  "profile_world_traces",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    firstRecordedAt: timestamp("first_recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "recreio_profile_world_trace", columns: [t.profileId, t.spaceId] }),
    index("recreio_world_profile_trace").on(t.spaceId, t.profileId),
  ],
);

export { recreioRightsPreparations } from "./recreio-direitos-preparacao";
