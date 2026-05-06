"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@informach/ui/components/form";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { Switch } from "@informach/ui/components/switch";
import { Textarea } from "@informach/ui/components/textarea";
import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { createRecipeAction } from "../actions";
import { FREE_RECIPE_LIMIT } from "../limits";
import { type RecipeFormValues, recipeInputSchema } from "../schemas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPro: boolean;
  currentCount: number;
};

export function RecipeFormDialog({ open, onOpenChange, isPro, currentCount }: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const limitReached = !isPro && currentCount >= FREE_RECIPE_LIMIT;

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeInputSchema),
    defaultValues: {
      name: "",
      ingredients: "",
      preparation: "",
      finishing: "",
      isFavorite: false,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      const result = await createRecipeAction(values);
      if (!result.ok) {
        if (result.error.code === "PLAN_LIMIT_REACHED") {
          toast.error("Limite do plano Free atingido", {
            description: `Você já cadastrou ${result.error.current} de ${result.error.limit} receitas. Atualize para Pro pra cadastrar receitas ilimitadas.`,
            action: { label: "Ver planos", onClick: () => router.push("/upgrade") },
          });
          return;
        }
        toast.error("Não foi possível salvar a receita.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      toast.success("Receita criada");
      form.reset();
      onOpenChange(false);
      router.refresh();
    });
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova receita</DialogTitle>
          <DialogDescription>
            Salve sua receita no Cozya com ingredientes, preparo e finalização.
          </DialogDescription>
        </DialogHeader>

        {limitReached ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  Você atingiu o limite do plano Free
                </p>
                <p className="text-sm text-muted-foreground">
                  {FREE_RECIPE_LIMIT} receitas é o máximo no plano gratuito. Atualize pra Pro e
                  cadastre sem limite.
                </p>
              </div>
              <Button asChild>
                <Link href="/upgrade">Ver planos Pro</Link>
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        autoFocus
                        placeholder="Ex: Bolo de cenoura com cobertura de chocolate"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ingredients"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ingredientes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        placeholder={"Um ingrediente por linha\n200g de farinha\n3 ovos"}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Liste um ingrediente por linha.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="preparation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modo de preparo</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        placeholder="Descreva o passo a passo da receita."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="finishing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Finalização{" "}
                      <span className="font-normal text-muted-foreground">(opcional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Cobertura, decoração, dicas finais…"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFavorite"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Marcar como favorita</FormLabel>
                      <FormDescription className="text-xs">
                        Favoritas ficam destacadas na sua listagem.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
