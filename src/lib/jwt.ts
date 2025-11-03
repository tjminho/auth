import { SignJWT, jwtVerify, decodeJwt } from "jose";

export type SessionClaims = {
  uid: string;
  email?: string | null;
  emailVerified?: string | null;
  role?: "USER" | "ADMIN";
};

export type JwtIssueOptions = {
  expiresIn?: string; // "30m", "1h", "7d"
  issuer?: string;
  audience?: string;
};

export type JwtVerifyOptions = {
  issuer?: string;
  audience?: string;
};

const DEFAULT_ISSUER = process.env.JWT_ISSUER || "app";
const DEFAULT_AUDIENCE = process.env.JWT_AUDIENCE || "app-users";
const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30m";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

// 문자열("30m") → 초 단위 변환
function parseDurationToSeconds(dur: string): number {
  const m = dur.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`Invalid expiresIn format: ${dur}`);
  const value = Number(m[1]);
  const unit = m[2];
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      throw new Error(`Unsupported unit: ${unit}`);
  }
}

export async function signJwt(
  claims: SessionClaims,
  options: JwtIssueOptions = {}
): Promise<string> {
  const secret = getSecret();
  const issuer = options.issuer ?? DEFAULT_ISSUER;
  const audience = options.audience ?? DEFAULT_AUDIENCE;
  const expiresIn = options.expiresIn ?? DEFAULT_EXPIRES_IN;

  return await new SignJWT(claims as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyJwt<
  T extends Record<string, unknown> = SessionClaims,
>(token: string, options: JwtVerifyOptions = {}): Promise<T | null> {
  try {
    const secret = getSecret();
    const issuer = options.issuer ?? DEFAULT_ISSUER;
    const audience = options.audience ?? DEFAULT_AUDIENCE;

    const { payload } = await jwtVerify(token, secret, { issuer, audience });
    return payload as T;
  } catch {
    return null;
  }
}

export function decodeJwtUnsafe<T = unknown>(token: string): T | null {
  try {
    return decodeJwt(token) as T;
  } catch {
    return null;
  }
}

// 쿠키 관련 로직은 여기서 제거 → Route Handler에서 NextResponse.cookies.set() 사용
