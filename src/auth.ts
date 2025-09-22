import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { compare } from "bcryptjs";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { Role, UserStatus, VerificationType } from "@prisma/client";
import { hitLogin } from "@/lib/rate-limit";
import { sessionCache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const CredentialsSchema = z.object({
  email: z.string().email("이메일 형식이 다릅니다."),
  password: z.string().min(8).optional(),
  tokenLogin: z.string().optional(),
});

const isProd = process.env.NODE_ENV === "production";

export const { handlers, signIn, signOut, auth } = NextAuth({
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
      authorization: { params: { scope: "account_email" } },
    }),
    Naver({
      clientId: process.env.NAVER_CLIENT_ID!,
      clientSecret: process.env.NAVER_CLIENT_SECRET!,
    }),
    Credentials({
      async authorize(credentials, req) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password, tokenLogin } = parsed.data;
        const forwarded = req.headers.get("x-forwarded-for");
        const ip =
          forwarded?.split(",")[0]?.trim() ||
          req.headers.get("x-real-ip") ||
          "unknown";

        const limit = await hitLogin(ip, email);
        if (limit.limited) {
          const minutes = Math.floor(limit.reset / 60);
          const seconds = limit.reset % 60;
          throw new Error(
            `로그인 시도가 너무 많습니다. ${minutes > 0 ? `${minutes}분 ` : ""}${seconds}초 후 다시 시도해주세요.`
          );
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        if (tokenLogin === "1") {
          if (user.status !== UserStatus.ACTIVE || !user.emailVerified)
            return null;
          const TEN_MIN = 10 * 60 * 1000;
          if (
            user.emailVerified &&
            Date.now() - new Date(user.emailVerified).getTime() < TEN_MIN
          ) {
            return {
              ...user,
              subscriptionExpiresAt: user.subscriptionExpiresAt
                ? new Date(user.subscriptionExpiresAt).toISOString()
                : null,
            } as any;
          }
          return null;
        }

        if (
          !user.password ||
          user.status !== UserStatus.ACTIVE ||
          !user.emailVerified
        )
          return null;

        const ok = await compare(password!, user.password);
        return ok
          ? ({
              ...user,
              subscriptionExpiresAt: user.subscriptionExpiresAt
                ? new Date(user.subscriptionExpiresAt).toISOString()
                : null,
            } as any)
          : null;
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      try {
        let dbUser: any = null;

        // 1) 이메일 없는 OAuth 로그인 처리 (일부 제공자)
        if (!user?.email) {
          if (account?.provider && account?.providerAccountId) {
            // 기존 Account가 고아 상태인지 확인
            const existingAccount = await prisma.account.findUnique({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                },
              },
            });
            if (existingAccount) {
              const linkedUser = await prisma.user.findUnique({
                where: { id: existingAccount.userId },
              });
              if (!linkedUser) {
                await prisma.account.delete({
                  where: { id: existingAccount.id },
                });
              } else {
                dbUser = linkedUser;
              }
            }
          }

          if (!dbUser) {
            const tempEmail = `${account?.provider}-${account?.providerAccountId}@placeholder.local`;
            dbUser = await prisma.user.create({
              data: {
                email: tempEmail,
                status: UserStatus.PENDING,
                role: Role.USER,
              },
            });
          }

          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account!.provider!,
                providerAccountId: account!.providerAccountId!,
              },
            },
            update: { userId: dbUser.id },
            create: {
              userId: dbUser.id,
              type: account!.type || "oauth",
              provider: account!.provider!,
              providerAccountId: account!.providerAccountId!,
            },
          });

          // userId를 쿼리로 넘기지 않고 페이지에서 세션 기반으로 식별
          return `/auth/set-email`;
        }

        // 2) 이메일 있는 OAuth 로그인 처리
        dbUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email: user.email!,
              name: user.name || null,
              status: UserStatus.PENDING,
              role: Role.USER,
            },
          });

          // 최초 OAuth 유입 마커(선택)
          await prisma.verification.create({
            data: {
              identifier: dbUser.email,
              value: "initial-oauth-login",
              type: VerificationType.EMAIL,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            },
          });
        }

        // Account <-> User 연결 보장
        await prisma.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: account!.provider!,
              providerAccountId: account!.providerAccountId!,
            },
          },
          update: { userId: dbUser.id },
          create: {
            userId: dbUser.id,
            type: account!.type || "oauth",
            provider: account!.provider!,
            providerAccountId: account!.providerAccountId!,
          },
        });

        const targetEmail = dbUser.trustedEmail ?? dbUser.email;

        // 이메일 미인증/비활성 사용자에게 검증 메일 발송
        if (dbUser.status !== UserStatus.ACTIVE || !dbUser.emailVerified) {
          await createAndEmailVerificationToken(targetEmail);
          return `/auth/verify?email=${encodeURIComponent(targetEmail)}`;
        }

        return true;
      } catch (err) {
        logger.error("signIn error", err);
        return "/auth/error";
      }
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role as Role | undefined;
        token.status = (user as any).status as UserStatus | undefined;
        token.email = (user as any).email ?? token.email;
        token.unverified = !(user as any).emailVerified;
        token.subscriptionExpiresAt =
          (user as any).subscriptionExpiresAt ?? null;

        if (token.id) {
          await sessionCache.set(`session:user:${token.id}`, {
            role: token.role,
            status: token.status,
            subscriptionExpiresAt: token.subscriptionExpiresAt ?? null,
          });
        }
      }

      if (
        !token.role ||
        !token.status ||
        token.subscriptionExpiresAt === undefined
      ) {
        if (token.id) {
          const cached = await sessionCache.get<{
            role: Role | undefined;
            status: UserStatus | undefined;
            subscriptionExpiresAt: string | null;
          }>(`session:user:${token.id}`);

          if (cached) {
            token.role = cached.role;
            token.status = cached.status;
            token.subscriptionExpiresAt = cached.subscriptionExpiresAt;
          } else {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: { role: true, status: true, subscriptionExpiresAt: true },
            });

            if (dbUser) {
              token.role = dbUser.role;
              token.status = dbUser.status;
              token.subscriptionExpiresAt = dbUser.subscriptionExpiresAt
                ? new Date(dbUser.subscriptionExpiresAt).toISOString()
                : null;

              await sessionCache.set(`session:user:${token.id}`, {
                role: token.role,
                status: token.status,
                subscriptionExpiresAt: token.subscriptionExpiresAt ?? null,
              });
            }
          }
        }
      }

      // 구독 만료 처리
      if (
        token.role === Role.SUBSCRIBER &&
        token.subscriptionExpiresAt &&
        new Date(token.subscriptionExpiresAt) < new Date()
      ) {
        token.role = Role.USER;
        token.subscriptionExpiresAt = null;
        if (token.id) {
          await sessionCache.set(`session:user:${token.id}`, {
            role: token.role,
            status: token.status,
            subscriptionExpiresAt: token.subscriptionExpiresAt,
          });
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (!session.user) session.user = {} as any;
      session.user.id = token.id as string;
      session.user.role = token.role as any;
      session.user.status = token.status as any;
      session.user.unverified = token.unverified as boolean;
      session.user.subscriptionExpiresAt = token.subscriptionExpiresAt ?? null;
      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.includes("/auth/signin")) return baseUrl;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
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
