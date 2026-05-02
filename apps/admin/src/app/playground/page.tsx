"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@informach/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@informach/ui/components/dialog";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import { Progress } from "@informach/ui/components/progress";
import { Separator } from "@informach/ui/components/separator";
import { toast } from "@informach/ui/components/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@informach/ui/components/tabs";

export default function PlaygroundPage() {
  return (
    <section className="container mx-auto max-w-4xl space-y-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Design System Playground</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Smoke test de tokens, componentes shadcn e dark mode.
          </p>
        </div>
        <ModeToggle />
      </header>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Botões e variantes</CardTitle>
          <CardDescription>
            Variantes shadcn padrão — `default` consome `--primary` flat.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inputs e badges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" placeholder="alguem@exemplo.com" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress + Tabs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={62} />
          <Separator />
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">Aba A</TabsTrigger>
              <TabsTrigger value="b">Aba B</TabsTrigger>
              <TabsTrigger value="c">Aba C</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="text-sm">
              Conteúdo da aba A.
            </TabsContent>
            <TabsContent value="b" className="text-sm">
              Conteúdo da aba B.
            </TabsContent>
            <TabsContent value="c" className="text-sm">
              Conteúdo da aba C.
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overlays e toasts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Abrir Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog com tokens</DialogTitle>
                <DialogDescription>
                  Fundo: popover. Borda: border. Foreground: popover-foreground.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm">Sem cores literais. Tudo deriva do design system.</p>
            </DialogContent>
          </Dialog>

          <Button onClick={() => toast.success("Salvo com sucesso")}>Toast success</Button>
          <Button variant="destructive" onClick={() => toast.error("Algo deu errado")}>
            Toast error
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipografia</CardTitle>
          <CardDescription>Hierarquia em Plus Jakarta Sans.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-3xl font-bold tracking-tight">Título 28/700</div>
          <div className="text-lg font-semibold">Card 18/700</div>
          <div className="text-base">Body 16/500 — texto corrido para leitura confortável.</div>
          <div className="text-sm text-muted-foreground">Caption 14/400 — meta info.</div>
        </CardContent>
      </Card>
    </section>
  );
}
