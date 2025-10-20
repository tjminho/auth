import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import Credentials from "next-auth/providers/credentials";
import { UserStatus, User as PrismaUser, Role } from "@prisma/client";
import { sessionCache } from "@/lib/session-cache";
import { logger } from "@/lib/logger";
import { createAndEmailVerificationToken } from "@/lib/verification";
const isProd = process.env.NODE_ENV === "production";
export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 2 },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { scope: "openid email profile" } },
    }),
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET!,
    }),
    Naver({
      clientId: process.env.NAVER_CLIENT_ID!,
      clientSecret: process.env.NAVER_CLIENT_SECRET!,
    }),
    Credentials({
      authorize: async () => null, // 직접 /api/auth/signin/route.ts에서 처리
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      try {
        // ✅ 이메일 없으면 placeholder 생성
        if (!user.email) {
          user.email = `${account?.provider}-${account?.providerAccountId}@placeholder.local`;
          (user as any).unverified = true;
        }
        if (account?.provider) {
          (user as any).lastProvider = account.provider;
        }
        // ✅ 상태 체크
        if (
          (user as any).status &&
          (user as any).status !== UserStatus.ACTIVE
        ) {
          return false; // 비활성/정지 계정 로그인 차단
        }
        // ✅ 이메일 인증 안 된 경우 → 여기서 메일 발송
        const emailIsPlaceholder = user.email?.endsWith("@placeholder.local");
        if (
          (!user.emailVerified || emailIsPlaceholder) &&
          user.email &&
          !emailIsPlaceholder
        ) {
          try {
            const existing = await prisma.user.findUnique({
              where: { email: user.email },
            });
            if (existing) {
              await createAndEmailVerificationToken(existing, user.email);
              logger.info("signIn: 인증 메일 발송", { email: user.email });
            }
          } catch (e) {
            logger.warn("signIn: 인증 메일 발송 실패", e);
          }
        }
        return true;
      } catch (err) {
        logger.error("signIn error", err);
        return false;
      }
    },
    async jwt({ token, user }) {
      try {
        if (user) {
          const u = user as PrismaUser & {
            unverified?: boolean;
            lastProvider?: string | null;
          };
          token.id = u.id;
          token.role = u.role ?? undefined;
          token.status = u.status ?? undefined;
          const emailIsPlaceholder =
            u.email?.endsWith("@placeholder.local") ?? false;
          token.unverified =
            !u.emailVerified ||
            !u.trustedEmail ||
            emailIsPlaceholder ||
            u.unverified === true;
          token.trustedEmail = u.trustedEmail ?? null;
          token.subscriptionExpiresAt = u.subscriptionExpiresAt
            ? new Date(u.subscriptionExpiresAt).toISOString()
            : null;
          token.name = u.name ?? null;
          token.email = u.email ?? null;
          token.lastProvider = u.lastProvider ?? null;
          token.emailVerified = u.emailVerified ?? null;
          // ✅ 세션 캐시 저장
          if (token.id) {
            await sessionCache.set(`session:user:${token.id}`, {
              role: token.role,
              status: token.status,
              subscriptionExpiresAt: token.subscriptionExpiresAt ?? null,
              lastProvider: token.lastProvider ?? null,
              emailVerified: token.emailVerified
                ? new Date(token.emailVerified as any)
                : null,
            });
          }
        }
        if (!token.id) return {};
        return token;
      } catch (err) {
        logger.error("jwt callback error", err);
        return token;
      }
    },
    async session({ session, token }) {
      if (!token.id) return { ...session, user: undefined as any };
      session.user = {
        id: token.id ?? null,
        role: token.role ?? null,
        status: token.status ?? null,
        unverified: token.unverified ?? false,
        trustedEmail: token.trustedEmail ?? null,
        subscriptionExpiresAt: token.subscriptionExpiresAt ?? null,
        name: token.name ?? null,
        email: token.email ?? null,
        lastProvider: token.lastProvider ?? null,
        emailVerified: token.emailVerified
          ? new Date(token.emailVerified as any)
          : null,
      };
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  cookies: {
    sessionToken: {
      name: isProd
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        path: "/",
      },
    },
  },
});
