export type LogFn = (msg: string, ctx?: object) => void;

export type Logger = {
  debug?: LogFn;
  info?: LogFn;
  warn?: LogFn;
  error?: LogFn;
};
