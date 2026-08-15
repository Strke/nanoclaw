import { performance } from 'perf_hooks';

const LEVELS = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const;
type Level = keyof typeof LEVELS;

const COLORS: Record<Level, string> = {
  debug: '\x1b[34m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[41m\x1b[37m',
};
const KEY_COLOR = '\x1b[35m';
const MSG_COLOR = '\x1b[36m';
const RESET = '\x1b[39m';
const FULL_RESET = '\x1b[0m';

const threshold = LEVELS[(process.env.LOG_LEVEL as Level) || 'info'] ?? LEVELS.info;

function formatErr(err: unknown): string {
  if (err instanceof Error) {
    return `{ type: "${err.constructor.name}", message: "${err.message}", stack: ${err.stack} }`;
  }
  return JSON.stringify(err);
}

function formatData(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    parts.push(`${KEY_COLOR}${k}${RESET}=${k === 'err' ? formatErr(v) : JSON.stringify(v)}`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

function ts(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function emit(
  level: Level,
  msg: string,
  data?: Record<string, unknown>,
  namespace?: string,
  context?: Record<string, unknown>,
): void {
  if (LEVELS[level] < threshold) return;
  const tag = `${COLORS[level]}${level.toUpperCase()}${level === 'fatal' ? FULL_RESET : RESET}`;
  const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
  const prefix = namespace ? `${KEY_COLOR}[${namespace}]${RESET} ` : '';
  const merged = context ? { ...context, ...data } : data;
  stream.write(`[${ts()}] ${tag} ${prefix}${MSG_COLOR}${msg}${RESET}${merged ? formatData(merged) : ''}\n`);
}

/**
 * Structured logger. The root `log` export is a bare logger; call
 * `createLogger(namespace)` to get a namespaced child whose messages are
 * prefixed with `[namespace]`, and `.with(context)` / `.child(ns)` to
 * derive further children that attach fixed key/value context to every
 * line without repeating it at each call site.
 */
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;
  /** Derive a namespaced child logger. Namespaces compose with a dot. */
  child(namespace: string): Logger;
  /** Derive a logger that attaches fixed context fields to every line. */
  with(context: Record<string, unknown>): Logger;
}

function makeLogger(namespace?: string, context?: Record<string, unknown>): Logger {
  const logAt =
    (level: Level) =>
    (msg: string, data?: Record<string, unknown>): void =>
      emit(level, msg, data, namespace, context);

  return {
    debug: logAt('debug'),
    info: logAt('info'),
    warn: logAt('warn'),
    error: logAt('error'),
    fatal: logAt('fatal'),
    child: (ns: string) => makeLogger(namespace ? `${namespace}.${ns}` : ns, context),
    with: (ctx: Record<string, unknown>) => makeLogger(namespace, { ...context, ...ctx }),
  };
}

/** Create a namespaced child logger. */
export function createLogger(namespace: string): Logger {
  return makeLogger(namespace);
}

export const log: Logger = makeLogger();

/**
 * High-resolution monotonic timer for instrumentation. Returns a function
 * that, when called, reports elapsed milliseconds since `startTimer()` was
 * invoked. Pair with the metrics module's `observeLatency`.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

process.on('uncaughtException', (err) => {
  log.fatal('Uncaught exception', { err });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', { err: reason });
});
