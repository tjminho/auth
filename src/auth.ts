// src/auth.ts
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
import { SignJWT, jwtVerify } from "jose";
import type { JWT } from "next-auth/jwt";

const isProd = process.env.NODE_ENV === "production";
const AUTH_SECRET = process.env.AUTH_SECRET;

if (!AUTH_SECRET || AUTH_SECRET.length < 32) {
  logger.warn(
    "AUTH_SECRET is missing or too short. Set a strong secret (>=32 chars)."
  );
}

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 2 },
  trustHost: true,
  secret: AUTH_SECRET,

  // ✅ v5: encode/decode 오버라이드 (JWS 기반)
  jwt: {
    async encode({ token, secret }) {
      if (!token) return "";
      const sec = Array.isArray(secret) ? secret[0] : (secret ?? "");
      return await new SignJWT(token as any)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("2h")
        .sign(new TextEncoder().encode(sec));
    },
    async decode({ token, secret }) {
      if (!token) return null;
      try {
        const sec = Array.isArray(secret) ? secret[0] : (secret ?? "");
        const { payload } = await jwtVerify(
          token,
          new TextEncoder().encode(sec)
        );
        return payload as JWT;
      } catch {
        return null;
      }
    },
  },

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

        if (user.status !== UserStatus.ACTIVE)
          throw new Error("ACCOUNT_SUSPENDED");
        if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");

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
    async signIn({ user, account }) {
      try {
        if (!user.email) {
          user.email = `${account?.provider}-${account?.providerAccountId}@placeholder.local`;
          (user as any).unverified = true;
        }
        if (account?.provider) (user as any).lastProvider = account.provider;

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

        if ((user as any).status && (user as any).status !== UserStatus.ACTIVE)
          return false;

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
      // 로그인 직후: user 객체가 있을 때
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
          ? new Date(u.emailVerified).toISOString()
          : null;

        if (token.sub) {
          await sessionCache.set(`session:user:${token.sub}`, {
            role: token.role,
            status: token.status,
            subscriptionExpiresAt: token.subscriptionExpiresAt
              ? new Date(token.subscriptionExpiresAt)
              : null,
            lastProvider: token.lastProvider,
            emailVerified: token.emailVerified
              ? new Date(token.emailVerified)
              : null,
          });
        }
      } else if (token.sub) {
        // ✅ 로그인 이후 세션 갱신 시점: DB에서 최신값 반영
        const freshUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { emailVerified: true, trustedEmail: true },
        });
        if (freshUser) {
          token.emailVerified = freshUser.emailVerified
            ? new Date(freshUser.emailVerified).toISOString()
            : null;
          token.trustedEmail = freshUser.trustedEmail ?? token.trustedEmail;
          token.unverified = !freshUser.emailVerified;
        }
      }

      return token;
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
        name: (token.name as string | null) ?? null,
        email: token.email ?? "",
        lastProvider: token.lastProvider as string | null,
        emailVerified: token.emailVerified
          ? new Date(token.emailVerified)
          : null,
      };
      return session;
    },
  },

  events: {
    async signIn({ user, account }) {
      try {
        if (!user.id) return;
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
        ? "__Secure-next-auth.session-token-2"
        : "next-auth.session-token-2",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        path: "/",
      },
    },
  },
});
