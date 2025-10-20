import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { createVerificationId } from "@/server/ws";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const vid = await createVerificationId(userId); // ✅ await + userId 전달
  return NextResponse.json({ verificationId: vid });
}
