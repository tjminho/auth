import { NextResponse } from "next/server";
import { notifyVerified } from "@/server/ws";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const vid = url.searchParams.get("vid");
  const email = url.searchParams.get("email");
  if (!vid || !email) return NextResponse.redirect("/auth/error");
  // DB 업데이트: emailVerified = true
  // await prisma.user.update({ where: { email }, data: { emailVerified: new Date() } });
  // PC에 알림
  notifyVerified(vid, email);
  return NextResponse.redirect("/auth/verified-success");
}
