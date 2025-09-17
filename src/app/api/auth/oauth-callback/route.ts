import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";

export async function POST(req: Request) {
  try {
    const { email, name, provider, providerAccountId, type } = await req.json();

    if (!email || !provider || !providerAccountId || !type) {
      return NextResponse.json(
        {
          error: "email, provider, providerAccountId, type 필드는 필수입니다.",
        },
        { status: 400 }
      );
    }

    let user = await prisma.user.findUnique({ where: { email } });

    // 신규 가입
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          emailVerified: null,
          provider,
          password: null,
          accounts: {
            create: {
              type,
              provider,
              providerAccountId,
            },
          },
        },
      });

      await createAndEmailVerificationToken(email);

      // 인증 페이지로 리다이렉트
      return NextResponse.redirect(
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/auth/verify?email=${encodeURIComponent(email)}`
      );
    }

    // 기존 유저인데 이메일 미인증
    if (!user.emailVerified) {
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId,
          },
        },
      });

      if (!existingAccount) {
        await prisma.account.create({
          data: {
            userId: user.id,
            type,
            provider,
            providerAccountId,
          },
        });
      }

      await createAndEmailVerificationToken(email);

      return NextResponse.redirect(
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/auth/verify?email=${encodeURIComponent(email)}`
      );
    }

    // 이미 인증된 유저 → Account 없으면 생성
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
    });

    if (!existingAccount) {
      await prisma.account.create({
        data: {
          userId: user.id,
          type,
          provider,
          providerAccountId,
        },
      });
    }

    // 정상 로그인 → 대시보드로 이동
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    );
  } catch (err) {
    console.error("[OAuth Callback Error]", err);
    return NextResponse.json({ error: "OAuth 처리 중 오류" }, { status: 500 });
  }
}
