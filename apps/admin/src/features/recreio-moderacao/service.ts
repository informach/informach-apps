import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { z } from "zod";
import type { Staff } from "@/lib/access";
import { lerFilaDeSeguranca } from "./repository";

export async function consultarFilaDeSeguranca(staff: Staff, protocolo?: string) {
  const id = protocolo ? z.uuid().parse(protocolo) : undefined;
  await logAuditEventStrict("admin.recreio_safety_viewed", staff.id, {
    app: "recreio",
    ...(id ? { caseId: id } : {}),
  });
  return lerFilaDeSeguranca(id);
}
