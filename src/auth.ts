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
import { compare } from "bcryptjs";
import { getGeoLocation } from "@/lib/geoip";
import { sendLoginAlertEmail } from "@/lib/mail";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

// ✅ Zod 스키마로 credentials 검증
const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
      name: "Credentials",
      credentials: {
        email: { label: "이메일", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          logger.debug("authorize: 입력값 검증 실패", {
            issues: parsed.error.issues,
          });
          return null;
        }

        const { email, password } = parsed.data;
        const normalizedEmail = email.trim().toLowerCase();

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: normalizedEmail }, { trustedEmail: normalizedEmail }],
          },
        });

        if (!user || !user.password) return null;

        const isValid = await compare(password, user.password);
        if (!isValid) return null;

        if (user.status !== UserStatus.ACTIVE) {
          throw new Error("ACCOUNT_SUSPENDED");
        }

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: user.id,
          email: user.email ?? "",
          name: user.name ?? null,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
          trustedEmail: user.trustedEmail,
          lastProvider: user.lastProvider,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
        };
      },
    }),
  ],

  callbacks: {
    // ✅ OAuth 계정 자동 연결 (이미 가입된 이메일이면 Account만 연결)
    async signIn({ user, account, profile }) {
      try {
        // 이메일이 없다면 placeholder 부여 (provider 기반)
        if (!user.email) {
          user.email = `${account?.provider}-${account?.providerAccountId}@placeholder.local`;
          (user as any).unverified = true;
        }

        if (account?.provider) {
          (user as any).lastProvider = account.provider;
        }

        // 이미 가입된 이메일이면 Account만 연결 (User 중복 생성 방지)
        if (account?.provider && user.email) {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
          });

          if (existingUser) {
            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                },
              },
              update: { userId: existingUser.id },
              create: {
                userId: existingUser.id,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                type: account.type,
                access_token: (account as any).access_token,
                refresh_token: (account as any).refresh_token,
                expires_at: (account as any).expires_at,
              },
            });
            return true;
          }
        }

        // 계정 상태 체크
        if (
          (user as any).status &&
          (user as any).status !== UserStatus.ACTIVE
        ) {
          return false;
        }

        // 이메일 검증 메일 발송 (placeholder 이메일은 제외)
        const emailIsPlaceholder = user.email?.endsWith("@placeholder.local");
        if (!user.emailVerified && user.email && !emailIsPlaceholder) {
          try {
            const existing = await prisma.user.findUnique({
              where: { email: user.email },
            });
            if (existing) {
              await createAndEmailVerificationToken(existing, user.email);
              logger.info("signIn: 인증 메일 발송", { email: user.email });
            }
          } catch (e: any) {
            logger.warn("signIn: 인증 메일 발송 실패", { error: e?.message });
          }
        }

        return true;
      } catch (err: any) {
        logger.error("signIn callback error", { error: err?.message });
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
          token.sub = u.id;
          token.role = u.role ?? null;
          token.status = u.status ?? null;
          token.name = u.name ?? null;
          token.email = u.email ?? "";
          token.lastProvider = u.lastProvider ?? null;
          const emailIsPlaceholder =
            u.email?.endsWith("@placeholder.local") ?? false;
          token.unverified =
            !u.emailVerified || emailIsPlaceholder || u.unverified === true;
          token.trustedEmail = u.trustedEmail ?? null;
          token.subscriptionExpiresAt = u.subscriptionExpiresAt
            ? new Date(u.subscriptionExpiresAt).toISOString()
            : null;
          token.emailVerified = u.emailVerified
            ? u.emailVerified.toISOString()
            : null;

          if (token.sub) {
            await sessionCache.set(`session:user:${token.sub}`, {
              role: token.role,
              status: token.status,
              subscriptionExpiresAt: token.subscriptionExpiresAt,
              lastProvider: token.lastProvider,
              emailVerified: token.emailVerified
                ? new Date(token.emailVerified)
                : null,
            });
          }
        }
        return token;
      } catch (err: any) {
        logger.error("jwt callback error", { error: err?.message });
        return token;
      }
    },

    async session({ session, token }) {
      if (!token.sub) return { ...session, user: undefined };

      session.user = {
        id: token.sub,
        role: token.role as Role,
        status: token.status as UserStatus,
        unverified: token.unverified as boolean,
        trustedEmail: token.trustedEmail as string | null,
        subscriptionExpiresAt: token.subscriptionExpiresAt
          ? new Date(token.subscriptionExpiresAt)
          : null,
        name: token.name as string | null,
        email: token.email ?? "",
        lastProvider: token.lastProvider as string | null,
        emailVerified: token.emailVerified
          ? new Date(token.emailVerified)
          : null,
      };

      return session;
    },
  },

  // ✅ User가 DB에 저장된 이후 실행되므로 FK 에러 없음
  events: {
    async signIn({ user, account }) {
      try {
        if (!user.id) return;

        // 클라이언트에서 전달받아 저장하고 싶으면 middleware/route에서 account 확장 가능
        const ip = (account as any)?.ip ?? "unknown";
        const userAgent = (account as any)?.userAgent ?? "unknown";
        const location = getGeoLocation(ip);

        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            provider: account?.provider ?? "credentials",
            ip,
            userAgent,
            location,
          },
        });

        // 최근 로그인 히스토리로 신규 기기 판단 후 알림
        const recent = await prisma.loginHistory.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
        const isNewDevice = recent.every(
          (r) => r.ip !== ip || r.userAgent !== userAgent
        );
        if (isNewDevice && user.email) {
          await sendLoginAlertEmail(user.email, { ip, userAgent, location });
        }
      } catch (e: any) {
        logger.error("events.signIn error", { error: e?.message });
      }
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
