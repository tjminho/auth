import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/error?reason=missing_token", req.url)
    );
  }

  const email = await verifyEmailByValueToken(token, {
    ip: new Headers(req.headers).get("x-forwarded-for") ?? undefined,
    ua: new Headers(req.headers).get("user-agent") ?? undefined,
  });

  if (!email) {
    return NextResponse.redirect(
      new URL("/auth/error?reason=invalid_or_expired", req.url)
    );
  }

  return NextResponse.redirect(new URL("/auth/verified", req.url));
}
