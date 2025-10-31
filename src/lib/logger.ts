const isProd = process.env.NODE_ENV === "production";

type Level = "debug" | "info" | "warn" | "error";

function formatArgs(args: any[]) {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return { message: arg.message, stack: arg.stack };
    }
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return arg;
  });
}

function log(level: Level, ...args: any[]) {
  if (isProd && level === "debug") return;

  const timestamp = new Date().toISOString();
  const tag = `[${level.toUpperCase()}]`;

  const formatted = formatArgs(args);

  // 콘솔 출력
  const method = level === "debug" ? "log" : level;
  console[method](`${timestamp} ${tag}`, ...formatted);

  // TODO: 운영 환경에서 외부 로깅 서비스 연동 가능 (예: Sentry, Datadog)
}

export const logger = {
  debug: (...a: any[]) => log("debug", ...a),
  info: (...a: any[]) => log("info", ...a),
  warn: (...a: any[]) => log("warn", ...a),
  error: (...a: any[]) => log("error", ...a),
};
