"use client";

import { Badge } from "@informach/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { cn } from "@informach/ui/lib/utils";
import { Camera, ClipboardPaste, Lock, Mic, Pencil, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canUseAi: boolean;
  onPickManual: () => void;
  onPickPrompt: () => void;
  onPickVoice: () => void;
  onPickText: () => void;
  onPickImage: () => void;
};

export function NewRecipeMethodDialog({
  open,
  onOpenChange,
  canUseAi,
  onPickManual,
  onPickPrompt,
  onPickVoice,
  onPickText,
  onPickImage,
}: Props) {
  const router = useRouter();

  const handleAiClick = (callback: () => void) => () => {
    if (canUseAi) {
      callback();
      return;
    }
    onOpenChange(false);
    router.push("/upgrade");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Como adicionar a receita?</DialogTitle>
          <DialogDescription>Escolha uma forma de cadastrar sua nova receita.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MethodCard
            icon={<Pencil className="size-5" aria-hidden />}
            title="Manual"
            description="Digite os campos."
            onClick={onPickManual}
          />
          <MethodCard
            icon={<Sparkles className="size-5" aria-hidden />}
            title="Por descrição"
            description={
              canUseAi ? "Diga o que quer e a IA busca a receita pra você." : "Teste grátis ou Pro."
            }
            onClick={handleAiClick(onPickPrompt)}
            badge="IA"
            locked={!canUseAi}
          />
          <MethodCard
            icon={<Mic className="size-5" aria-hidden />}
            title="Por voz"
            description={
              canUseAi ? "Fale a receita e a IA preenche pra você." : "Teste grátis ou Pro."
            }
            onClick={handleAiClick(onPickVoice)}
            badge="IA"
            locked={!canUseAi}
          />
          <MethodCard
            icon={<ClipboardPaste className="size-5" aria-hidden />}
            title="Colar texto"
            description={
              canUseAi
                ? "Cole o texto de uma receita e a IA preenche pra você."
                : "Teste grátis ou Pro."
            }
            onClick={handleAiClick(onPickText)}
            badge="IA"
            locked={!canUseAi}
          />
          <MethodCard
            icon={<Camera className="size-5" aria-hidden />}
            title="Por foto"
            description={
              canUseAi
                ? "Tire uma foto da receita e a IA preenche pra você."
                : "Teste grátis ou Pro."
            }
            onClick={handleAiClick(onPickImage)}
            badge="IA"
            locked={!canUseAi}
          />
        </div>

        {!canUseAi ? (
          <p className="pt-1 text-center text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Lock className="size-3" aria-hidden />
              Ative o teste gratuito nas receitas ou conheça o Pro —{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/upgrade");
                }}
              >
                ver planos
              </button>
            </span>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type MethodCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  badge?: string;
  locked?: boolean;
};

function MethodCard({ icon, title, description, onClick, badge, locked }: MethodCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={locked ? `${title} (IA — ver acesso)` : title}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors",
        locked
          ? "opacity-70 hover:border-primary/50 hover:bg-muted/50"
          : "hover:border-primary hover:bg-accent",
      )}
    >
      {badge ? (
        <Badge
          variant={locked ? "secondary" : "default"}
          className="absolute right-2 top-2 text-[10px] uppercase tracking-wide"
        >
          {badge}
        </Badge>
      ) : null}
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-full",
          locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-brand-ink",
        )}
      >
        {locked ? <Lock className="size-4" aria-hidden /> : icon}
      </span>
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
