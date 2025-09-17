import { NextResponse } from "next/server";
import { createAndEmailVerificationToken } from "@/lib/verification";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "이메일이 필요합니다." },
        { status: 400 }
      );
    }

    await createAndEmailVerificationToken(email);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "재발송 실패" },
      { status: 400 }
    );
  }
}
