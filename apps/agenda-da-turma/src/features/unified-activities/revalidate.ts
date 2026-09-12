import "server-only";
import { refresh, revalidatePath } from "next/cache";

export function refreshActivityViews() {
  for (const path of ["/dashboard", "/atividades", "/calendario", "/recados"])
    revalidatePath(path, "layout");
  refresh();
}
