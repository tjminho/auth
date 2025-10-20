import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
// 유효한 실제 이메일인지 검사 (placeholder 방지)
function isRealEmail(email?: string | null) {
  if (!email) return false;
  if (email.endsWith("@placeholder.local")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
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
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    // 유저 조회: trustedEmail 또는 provider email로
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ trustedEmail: email }, { email }],
      },
    });
    // 1️⃣ 신규 가입
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          emailVerified: null,
          trustedEmail: null,
          provider,
          password: null,
          accounts: {
            create: { type, provider, providerAccountId },
          },
        },
      });
      if (isRealEmail(email)) {
        try {
          await createAndEmailVerificationToken(user, email, { ip, ua });
        } catch (err) {
          console.warn("[OAuth Callback] 인증 메일 발송 실패:", err);
        }
      }
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?email=${encodeURIComponent(email)}`
      );
    }
    // 2️⃣ 기존 유저인데 이메일 미인증
    if (!user.emailVerified) {
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: { provider, providerAccountId },
        },
      });
      if (!existingAccount) {
        await prisma.account.create({
          data: { userId: user.id, type, provider, providerAccountId },
        });
      }
      if (isRealEmail(email)) {
        try {
          await createAndEmailVerificationToken(user, email, { ip, ua }); // ✅ user, email
        } catch (err) {
          console.warn("[OAuth Callback] 인증 메일 발송 실패:", err);
        }
      }
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?email=${encodeURIComponent(email)}`
      );
    }
    // 3️⃣ 이미 인증된 유저 → Account 없으면 생성
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId },
      },
    });
    if (!existingAccount) {
      await prisma.account.create({
        data: { userId: user.id, type, provider, providerAccountId },
      });
    }
    // 4️⃣ 정상 로그인 → 대시보드로 이동
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    );
  } catch (err) {
    console.error("[OAuth Callback Error]", err);
    return NextResponse.json({ error: "OAuth 처리 중 오류" }, { status: 500 });
  }
}
