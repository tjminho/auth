import NextAuth from "next-auth";
import { CustomAdapter } from "@/lib/custom-adapter";
import { prisma } from "@/lib/prisma";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import Credentials from "next-auth/providers/credentials";
import { UserStatus, Role } from "@prisma/client";
import { sessionCache } from "@/lib/session-cache";
import { logger } from "@/lib/logger";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { compare } from "bcryptjs";
import { getGeoLocation } from "@/lib/geoip";
import { sendLoginAlertEmail, sendVerificationEmail } from "@/lib/mail";
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

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 2) + "***@" + domain;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: CustomAdapter(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 2 },
  trustHost: true,
  secret: AUTH_SECRET,

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

        if (user.status === UserStatus.PENDING) {
          try {
            await createAndEmailVerificationToken(user, normalizedEmail);
            logger.info("authorize: 이메일 미인증 → 인증 메일 재발송", {
              userId: user.id,
              email: maskEmail(normalizedEmail),
            });
          } catch (err: any) {
            logger.error("authorize: 인증 메일 재발송 실패", {
              userId: user.id,
              error: err?.message,
            });
          }
          return { ...user };
        }

        if (user.status === UserStatus.SUSPENDED)
          throw new Error("ACCOUNT_SUSPENDED");
        if (user.status === UserStatus.BLOCKED)
          throw new Error("ACCOUNT_BLOCKED");
        if (user.status === UserStatus.DELETED)
          throw new Error("ACCOUNT_DELETED");
        if (user.status !== UserStatus.ACTIVE)
          throw new Error("ACCOUNT_INACTIVE");

        return { ...user };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // ✅ OAuth 로그인 시 병합/redirect 처리
      if (account && account.type === "oauth") {
        const email = user?.email?.toLowerCase();
        if (!email) return false;

        const existingUser = await prisma.user.findFirst({
          where: { OR: [{ email }, { trustedEmail: email }] },
        });

        if (existingUser) {
          if (existingUser.emailVerified) {
            // 병합: Account 연결
            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId!,
                },
              },
              update: {},
              create: {
                userId: existingUser.id,
                provider: account.provider,
                providerAccountId: account.providerAccountId!,
                type: account.type,
                email,
              },
            });
            return true;
          } else {
            // 미인증 → VerificationSession 생성 후 메일 발송
            const verificationSession = await prisma.verificationSession.create(
              {
                data: {
                  userId: existingUser.id,
                  email,
                  type: "EMAIL",
                  expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30분 유효
                },
              }
            );

            await sendVerificationEmail(
              email,
              existingUser.id,
              verificationSession.vid
            );

            // Verify 페이지로 redirect
            throw new Error(
              `REDIRECT:/auth/verify?email=${encodeURIComponent(email)}`
            );
          }
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role ?? null;
        token.status = user.status ?? null;
        token.name = user.name ?? null;
        token.email = user.email ?? "";
        token.lastProvider = user.lastProvider ?? null;
        token.trustedEmail = user.trustedEmail ?? null;
        token.subscriptionExpiresAt = user.subscriptionExpiresAt
          ? new Date(user.subscriptionExpiresAt).toISOString()
          : null;
        token.emailVerified = user.emailVerified
          ? new Date(user.emailVerified).toISOString()
          : null;
        token.unverified = !user.emailVerified;
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

        // 새로운 디바이스 여부 확인
        const isNewDevice = recent.every(
          (r) => r.ip !== ip || r.userAgent !== userAgent
        );

        // 새로운 디바이스라면 알림 메일 발송
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
