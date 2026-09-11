"use client";
import { toast } from "@informach/ui/components/sonner";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { handleAiHttpError } from "./_ai-http-errors";

export const parsedRecipeFieldsSchema = z.object({
  name: z.string().min(1),
  ingredients: z.string().min(1),
  preparation: z.string().min(1),
  finishing: z.string(),
  servings: z.number().nullable().optional(),
  totalMinutes: z.number().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  sourceName: z.string().nullable().optional(),
});
export type ParsedRecipeFields = z.infer<typeof parsedRecipeFieldsSchema>;
const responseSchema = z.discriminatedUnion("isValidRecipe", [
  z.object({ isValidRecipe: z.literal(true), recipe: parsedRecipeFieldsSchema }),
  z.object({ isValidRecipe: z.literal(false), reason: z.string().optional() }),
]);

export function useAiRequest() {
  return useRecoverableAiRequest(responseSchema);
}

export function useRecoverableAiRequest<T>(resultSchema: z.ZodType<T>) {
  const active = useRef(true);
  const busy = useRef(false);
  const operation = useRef<{ identity: string | Blob; endpoint: string; key: string } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return async (
    endpoint: string,
    body: string | FormData,
    identity: string | Blob = typeof body === "string" ? body : "audio",
  ) => {
    if (busy.current) return null;
    busy.current = true;
    if (
      !operation.current ||
      operation.current.identity !== identity ||
      operation.current.endpoint !== endpoint
    )
      operation.current = { identity, endpoint, key: crypto.randomUUID() };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body,
        headers: {
          ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}),
          "Idempotency-Key": operation.current.key,
        },
      });
      if (!active.current) return null;
      if (response.status === 409) {
        toast.info(
          "Esta tarefa ainda está em andamento. Aguarde e tente novamente para recuperar o mesmo resultado, sem nova cobrança.",
        );
        return null;
      }
      const json: unknown = await response.json();
      if (!response.ok) {
        // A gateway/database failure can happen after a charge. Keep the key until
        // the server confirms it stored the terminal response.
        if (
          response.status < 500 ||
          response.headers.get("Idempotency-Complete") === "true" ||
          response.headers.get("Idempotency-Replayed") === "true"
        )
          operation.current = null;
        const errorResponse = Response.json(json, { status: response.status });
        if (handleAiHttpError(errorResponse))
          toast.error(
            response.status === 410
              ? "A recuperação desta tarefa expirou. Confira o saldo antes de iniciar outra."
              : "Não foi possível concluir. Seu conteúdo foi mantido; tente novamente.",
          );
        return null;
      }
      const data = resultSchema.parse(json);
      operation.current = null;
      return data;
    } catch {
      if (active.current)
        toast.error("A conexão foi interrompida. Seu conteúdo foi mantido.", {
          description: "Tente novamente para recuperar esta tarefa sem repeti-la.",
        });
      return null;
    } finally {
      busy.current = false;
    }
  };
}
