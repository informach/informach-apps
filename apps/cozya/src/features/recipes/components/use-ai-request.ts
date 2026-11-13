"use client";
import { prepareSpeechAudio } from "@informach/ai-core/speech-audio";
import { toast } from "@informach/ui/components/sonner";
import { useEffect, useRef } from "react";
import { z } from "zod";
import type { AiCostAcceptance } from "@/features/ai/costs";
import { useCozyaAiFamily } from "@/features/family/ai-context";
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
  const familyGroupId = useCozyaAiFamily();
  const active = useRef(true);
  const busy = useRef(false);
  const operation = useRef<{
    identity: string | Blob;
    endpoint: string;
    familyGroupId: string;
    key: string;
    body: string | FormData;
  } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return async (
    endpoint: string,
    body: string | FormData,
    acceptedCost: AiCostAcceptance,
    identity: string | Blob = typeof body === "string" ? body : "audio",
  ) => {
    if (busy.current) return null;
    if (!familyGroupId) {
      toast.error("Escolha a família do Compasso antes de usar os créditos.", {
        action: {
          label: "Escolher",
          onClick: () => {
            window.location.href = "/contexto";
          },
        },
      });
      return null;
    }
    busy.current = true;
    try {
      if (
        !operation.current ||
        operation.current.identity !== identity ||
        operation.current.endpoint !== endpoint ||
        operation.current.familyGroupId !== familyGroupId
      ) {
        let wireBody = body;
        if (body instanceof FormData) {
          const audio = body.get("audio");
          if (audio instanceof Blob) {
            let normalized: Blob;
            try {
              normalized = await prepareSpeechAudio(audio);
            } catch {
              if (active.current)
                toast.error(
                  "Não foi possível preparar esse áudio. Grave novamente, por até 2 minutos.",
                );
              return null;
            }
            const form = new FormData();
            for (const [key, value] of body.entries()) form.append(key, value);
            form.set("audio", normalized, "audio.wav");
            wireBody = form;
          }
        }
        operation.current = {
          identity,
          endpoint,
          familyGroupId,
          key: crypto.randomUUID(),
          body: wireBody,
        };
      }
      const response = await fetch(endpoint, {
        method: "POST",
        body: operation.current.body,
        headers: {
          ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}),
          "Idempotency-Key": operation.current.key,
          "X-Compasso-Family": familyGroupId,
          "X-Compasso-AI-Tariff": acceptedCost.version,
          "X-Compasso-AI-Credits": String(acceptedCost.maxCredits),
        },
      });
      if (!active.current) return null;
      const json: unknown = await response.json();
      if (response.status === 409) {
        const code = z.object({ code: z.string() }).safeParse(json).data?.code;
        if (code === "FAMILY_CONTEXT_CHANGED")
          toast.error(
            "A família selecionada mudou. Recarregue a página e confira o contexto antes de usar a IA.",
          );
        else if (code === "AI_PRICE_CHANGED")
          toast.error(
            "O custo desta tarefa mudou. Reabra a tela para conferir o novo valor antes de continuar.",
          );
        else if (code === "OPERATION_CONFLICT")
          toast.error(
            "Esta tentativa não corresponde à tarefa original. Reabra a tela para iniciar outra.",
          );
        else
          toast.info(
            "Esta tarefa está sendo processada ou recuperada. Tente novamente para receber o mesmo resultado, sem nova cobrança.",
          );
        return null;
      }
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
