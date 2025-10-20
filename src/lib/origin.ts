export function isAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // 서버-서버 호출 허용
  try {
    const url = new URL(origin);
    const allowed = [
      process.env.NEXTAUTH_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean) as string[];
    return allowed.some((base) => {
      try {
        const b = new URL(base);
        return b.host === url.host && b.protocol === url.protocol;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
