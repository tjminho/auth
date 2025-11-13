import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { NextResponse } from "next/server";

const SESSION_NAME = "app_session";
const SESSION_SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);
const SESSION_TTL = 60 * 60 * 24 * 7; // 7일

export interface SessionPayload extends JWTPayload {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  provider: string;
}

/**
 * 세션 발급
 */
export async function issueSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(SESSION_SECRET);

  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: SESSION_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });

  return response;
}

/**
 * 세션 검증
 */
export async function getSession(
  cookieValue?: string
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;

  try {
    const { payload } = await jwtVerify(cookieValue, SESSION_SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * 세션 삭제
 */
export function clearSession() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
