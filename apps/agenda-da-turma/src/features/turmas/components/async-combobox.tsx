"use client";

import { Button } from "@informach/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@informach/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@informach/ui/components/popover";
import { cn } from "@informach/ui/lib/utils";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { type ComponentPropsWithRef, useEffect, useId, useRef, useState } from "react";

export type ComboboxOption = { value: string; label: string };

type Props = Pick<
  ComponentPropsWithRef<"button">,
  "id" | "ref" | "onBlur" | "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid"
> & {
  value: string | null;
  onChange: (value: string | null, option: ComboboxOption | null) => void;
  fetchOptions: (query: string) => Promise<ComboboxOption[]>;
  placeholder: string;
  emptyText: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  // Reset signal — when this changes, fetched cache is cleared.
  resetKey?: string;
  /**
   * Label conhecido pelo pai para o `value` atual. Exibido imediatamente
   * quando o componente monta com um valor pré-selecionado, sem precisar
   * esperar o popover abrir e o `fetchOptions` rodar. Útil em formulários
   * que vêm pré-preenchidos (ex.: batch confirm dialog com matéria já
   * resolvida pela IA).
   */
  initialLabel?: string | null;
};

export function AsyncCombobox({
  value,
  onChange,
  fetchOptions,
  placeholder,
  emptyText,
  searchPlaceholder = "Buscar...",
  disabled = false,
  resetKey,
  initialLabel = null,
  ...controlProps
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(initialLabel);
  const id = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    if (resetKey !== lastResetKey.current) {
      lastResetKey.current = resetKey;
      setOptions([]);
      setQuery("");
      // Após reset (ex.: troca de turma), o pai já calculou o novo
      // initialLabel — usa o valor recebido em vez de null pra evitar
      // flicker (botão mostra placeholder por 1 frame e depois o label).
      setSelectedLabel(initialLabel);
    }
  }, [resetKey, initialLabel]);

  // Mantém `selectedLabel` em sincronia quando o pai informa um label novo
  // (ex.: form reset, value externo mudou). Sem isso o botão mostra
  // placeholder até o popover abrir.
  useEffect(() => {
    if (initialLabel) setSelectedLabel(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    if (!open || disabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetchOptions(query)
        .then((opts) => setOptions(opts))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, fetchOptions, disabled]);

  // Track label of selected value across separate fetches (e.g. when initial value is set externally).
  useEffect(() => {
    if (!value) {
      setSelectedLabel(null);
      return;
    }
    const found = options.find((o) => o.value === value);
    if (found) setSelectedLabel(found.label);
  }, [value, options]);

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          {...controlProps}
          id={controlProps.id ?? id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Carregando...
              </div>
            ) : options.length === 0 ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : (
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => {
                      onChange(opt.value, opt);
                      setSelectedLabel(opt.label);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === opt.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
