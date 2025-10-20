const isProd = process.env.NODE_ENV === "production";
type Level = "debug" | "info" | "warn" | "error";
function log(level: Level, ...args: any[]) {
  if (isProd && level === "debug") return;
  const tag = `[${level.toUpperCase()}]`;
  console[level === "debug" ? "log" : level](tag, ...args);
}
export const logger = {
  debug: (...a: any[]) => log("debug", ...a),
  info: (...a: any[]) => log("info", ...a),
  warn: (...a: any[]) => log("warn", ...a),
  error: (...a: any[]) => log("error", ...a),
};
