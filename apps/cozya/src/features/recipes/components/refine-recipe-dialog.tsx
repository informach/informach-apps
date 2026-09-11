"use client";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { Label } from "@informach/ui/components/label";
import { Textarea } from "@informach/ui/components/textarea";
import Link from "next/link";
import { useState } from "react";
import type { Recipe } from "../types";
import { RecipeFormDialog } from "./recipe-form-dialog";
import { type ParsedRecipeFields, useAiRequest } from "./use-ai-request";

export function RefineRecipeDialog({
  recipe,
  canUseAi,
  isPro,
  currentCount,
}: {
  recipe: Recipe;
  canUseAi: boolean;
  isPro: boolean;
  currentCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [processing, setProcessing] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ParsedRecipeFields | null>(null);
  const [saving, setSaving] = useState(false);
  const requestAi = useAiRequest();
  const close = () => {
    if (processing || ((request || preview) && !window.confirm("Descartar esta adaptação?")))
      return;
    setOpen(false);
    setPreview(null);
    setRequest("");
    setReason("");
  };
  return (
    <>
      <Button variant="outline" className="min-h-11 print:hidden" onClick={() => setOpen(true)}>
        Adaptar com IA · 1 crédito
      </Button>
      <Dialog
        open={open && !saving}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Uma variação para sua rotina</DialogTitle>
            <DialogDescription>
              Peça uma substituição ou uma forma de preparo. Você compara as alterações e salva uma
              cópia; o original é preservado.
            </DialogDescription>
          </DialogHeader>
          {!canUseAi ? (
            <div className="space-y-3">
              <p>Ative o teste gratuito ou assine o Pro para adaptar com IA.</p>
              <Button asChild>
                <Link href="/dashboard">Ver meu acesso</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="recipe-adaptation">O que quer mudar?</Label>
                <Textarea
                  id="recipe-adaptation"
                  value={request}
                  onChange={(e) => {
                    setRequest(e.target.value);
                    setPreview(null);
                    setReason("");
                  }}
                  disabled={processing}
                  maxLength={500}
                  placeholder="Ex.: usar abobrinha no lugar da cenoura"
                />
                <p className="text-xs text-muted-foreground">
                  Para mudar apenas as porções, use o ajuste gratuito da receita. Adaptações não
                  garantem adequação a alergias ou dietas clínicas.
                </p>
              </div>
              <Button
                disabled={processing || request.trim().length < 2}
                onClick={async () => {
                  setProcessing(true);
                  setReason("");
                  setPreview(null);
                  try {
                    const data = await requestAi(
                      "/api/ai/recipes/refine",
                      JSON.stringify({
                        recipe: {
                          isValidRecipe: true,
                          name: recipe.name,
                          ingredients: recipe.ingredients,
                          preparation: recipe.preparation,
                          finishing: recipe.finishing,
                          servings: recipe.servings ?? null,
                          totalMinutes: recipe.totalMinutes ?? null,
                          sourceUrl: recipe.sourceUrl ?? null,
                          sourceName: recipe.sourceName ?? null,
                        },
                        refinementRequest: request.trim(),
                      }),
                    );
                    if (!data) return;
                    if (!data.isValidRecipe) {
                      setReason(data.reason ?? "Não consegui aplicar esta mudança.");
                      return;
                    }
                    setPreview(data.recipe);
                  } finally {
                    setProcessing(false);
                  }
                }}
              >
                {processing ? "Preparando a adaptação…" : "Ver adaptação · 1 crédito"}
              </Button>
              {reason && (
                <p role="status" className="text-sm">
                  {reason}
                </p>
              )}
              {preview && (
                <div className="space-y-4">
                  <h3 className="font-semibold">Confira o que mudou</h3>
                  {(["ingredients", "preparation"] as const).map((field) => (
                    <section key={field} className="space-y-2">
                      <h4 className="text-sm font-medium">
                        {field === "ingredients" ? "Ingredientes" : "Preparo"}
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border p-4">
                          <p className="mb-2 text-xs font-semibold text-muted-foreground">
                            ORIGINAL
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed">
                            {recipe[field]}
                          </p>
                        </div>
                        <div className="rounded-xl border bg-muted/40 p-4">
                          <p className="mb-2 text-xs font-semibold text-muted-foreground">
                            ADAPTAÇÃO
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed">
                            {preview[field]}
                          </p>
                        </div>
                      </div>
                    </section>
                  ))}
                  <Button onClick={() => setSaving(true)}>Revisar e salvar uma cópia</Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      {saving && preview && (
        <RecipeFormDialog
          open
          onOpenChange={(next) => {
            setSaving(next);
            if (!next) setOpen(false);
          }}
          isPro={isPro}
          currentCount={currentCount}
          title="Revisar adaptação"
          description="Confira as quantidades, o rendimento e os passos antes de salvar sua cópia."
          defaultValues={{
            ...preview,
            creationMethod: "prompt",
            isFavorite: false,
            sourceUrl: recipe.sourceUrl ?? null,
            sourceName: recipe.sourceName
              ? `Adaptação de ${recipe.sourceName}`.slice(0, 200)
              : "Adaptação com IA — revisar antes de preparar",
          }}
        />
      )}
    </>
  );
}
