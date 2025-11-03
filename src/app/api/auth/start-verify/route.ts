import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto"; // ✅ SSE용 vid 생성

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // ✅ SSE용 VerificationSession 생성
  const vid = randomUUID();
  await prisma.verificationSession.create({
    data: {
      vid,
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30분 유효
    },
  });

  return NextResponse.json({ verificationId: vid });
}
