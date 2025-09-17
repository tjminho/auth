// src/app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { signupSchema } from "@/lib/validation";
import { createAndEmailVerificationToken } from "@/lib/verification";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. 입력값 검증
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password, name } = parsed.data;

    // 2. 이메일 중복 체크
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "이미 가입된 이메일입니다." },
        { status: 400 }
      );
    }

    // 3. 비밀번호 해시
    const hashedPassword = await hash(password, 10);

    // 4. 사용자 생성
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        status: "ACTIVE",
        role: "USER",
      },
    });

    // 5. 인증 메일 발송
    await createAndEmailVerificationToken(email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("회원가입 오류:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
