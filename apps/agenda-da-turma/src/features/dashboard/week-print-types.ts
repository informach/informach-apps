/**
 * A forma da semana para imprimir, sem dependência nenhuma.
 *
 * Fica fora de `week-print.ts` porque aquele módulo é `server-only` e o PDF é
 * montado no navegador: um import de valor por descuido levaria o banco para o
 * bundle do cliente.
 */
/** Uma linha da folha impressa: só texto, já com os nomes que a família lê. */
export type PrintRow = {
  title: string;
  details: string | null;
  type: string;
  subject: string | null;
  child: string;
  time: string | null;
  dueAt: string | null;
  done: boolean;
};

export type WeekPrintout = {
  todayIso: string;
  days: Array<{ iso: string; rows: PrintRow[] }>;
  /** O que passou do prazo e continua por fazer, até ontem. */
  late: PrintRow[];
  /** Sem data, por fazer: vai junto para não sumir da porta da geladeira. */
  undated: PrintRow[];
};
