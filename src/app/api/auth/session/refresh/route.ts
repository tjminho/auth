import { auth } from "@/auth";
import { NextResponse } from "next/server";
export async function POST() {
  // 현재 요청의 세션 가져오기
  const session = await auth();
  // 세션이 없으면 401 반환
  if (!session) {
    return NextResponse.json({ ok: false, session: null }, { status: 401 });
  }
  // 세션이 있으면 그대로 반환
  return NextResponse.json({ ok: true, session });
}
