import type { EditorCommand } from "./command-palette";

interface Availability {
  scene: boolean;
  selection: boolean;
  locked: boolean;
  clip: boolean;
  key: boolean;
  keys: boolean;
  group: boolean;
  undo: boolean;
  redo: boolean;
}
export function editorCommands(available: Availability, tools: EditorCommand[]): EditorCommand[] {
  const objectReason = !available.scene
    ? "Crie ou importe uma cena."
    : !available.selection
      ? "Selecione objetos."
      : available.locked
        ? "Desbloqueie a seleção."
        : undefined;
  return [
    {
      id: "undo",
      label: "Desfazer",
      group: "Editar",
      shortcut: "Ctrl/Cmd+Z",
      reason: available.undo ? undefined : "Nenhuma edição para desfazer.",
    },
    {
      id: "redo",
      label: "Refazer",
      group: "Editar",
      shortcut: "Ctrl/Cmd+Shift+Z",
      reason: available.redo ? undefined : "Nenhuma edição para refazer.",
    },
    { id: "import-svg", label: "Importar SVG em nova prancheta", group: "Arquivo" },
    { id: "export", label: "Exportar projeto ou animação", group: "Arquivo" },
    { id: "machine", label: "Editar máquinas de estados", group: "Exibir" },
    {
      id: "object-duplicate",
      label: "Duplicar seleção",
      group: "Objeto",
      shortcut: "Ctrl/Cmd+D",
      reason: objectReason,
    },
    {
      id: "object-delete",
      label: "Excluir seleção",
      group: "Objeto",
      shortcut: "Delete",
      reason: objectReason,
    },
    { id: "object-front", label: "Trazer seleção à frente", group: "Objeto", reason: objectReason },
    { id: "object-back", label: "Enviar seleção ao fundo", group: "Objeto", reason: objectReason },
    {
      id: "object-group",
      label: "Agrupar seleção",
      group: "Objeto",
      shortcut: "Ctrl/Cmd+G",
      reason: objectReason,
    },
    {
      id: "object-ungroup",
      label: "Desagrupar",
      group: "Objeto",
      shortcut: "Ctrl/Cmd+Shift+G",
      reason: objectReason ?? (available.group ? undefined : "Selecione um grupo sem instância."),
    },
    {
      id: "clip-new",
      label: "Nova animação por objeto",
      group: "Animação",
      reason: available.scene ? undefined : "Crie uma prancheta própria.",
    },
    {
      id: "clip-settings",
      label: "Configurar animação",
      group: "Animação",
      reason: available.clip ? undefined : "Selecione uma animação por objeto.",
    },
    {
      id: "clip-duplicate",
      label: "Duplicar animação",
      group: "Animação",
      reason: available.clip ? undefined : "Selecione uma animação por objeto.",
    },
    {
      id: "edit-key",
      label: "Editar chave selecionada",
      group: "Animação",
      reason: available.clip && available.key ? undefined : "Selecione uma animação e uma chave.",
    },
    {
      id: "retime-keys",
      label: "Mover ou copiar chaves",
      group: "Animação",
      reason: available.clip && available.keys ? undefined : "Selecione uma animação e chaves.",
    },
    { id: "design", label: "Modo Design", group: "Exibir" },
    { id: "animate", label: "Modo Animar", group: "Exibir" },
    { id: "clean", label: "Alternar prévia limpa", group: "Exibir" },
    {
      id: "onion",
      label: "Alternar onion skin",
      group: "Exibir",
      reason: available.clip ? undefined : "Selecione uma animação por objeto.",
    },
    {
      id: "artboards",
      label: "Abrir pranchetas",
      group: "Exibir",
      reason: available.scene ? undefined : "Crie uma prancheta própria.",
    },
    { id: "hierarchy", label: "Abrir hierarquia", group: "Exibir" },
    { id: "viewport-reset", label: "Centralizar área de trabalho", group: "Exibir" },
    { id: "help", label: "Ajuda e atalhos", group: "Ajuda", shortcut: "F1" },
    ...tools,
  ];
}
