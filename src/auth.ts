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
import { VerificationType } from "@prisma/client";

const CredentialsSchema = z.object({
  email: z.string().email("이메일 형식이 다릅니다."),
  password: z.string().min(8),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 60 * 60 * 2 },

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
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });

        // 보안: 상태/인증 여부는 내부 로깅만, 사용자에겐 동일 응답
        if (!user?.password) return null;
        if (user.status !== "ACTIVE") return null;
        if (!user.emailVerified) return null;

        const ok = await compare(password, user.password);
        return ok ? user : null;
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      try {
        if (!user?.email) {
          // OAuth에서 이메일이 없으면 trustedEmail 입력 페이지로
          return "/auth/set-email";
        }

        let dbUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || null,
              status: "PENDING",
              emailVerified: null,
              accounts: account
                ? {
                    create: {
                      type: account.type || "oauth",
                      provider: account.provider,
                      providerAccountId: account.providerAccountId,
                    },
                  }
                : undefined,
            },
          });

          // 첫 OAuth 로그인 시 verification 레코드 생성
          await prisma.verification.create({
            data: {
              identifier: dbUser.email,
              value: "initial-oauth-login",
              type: VerificationType.EMAIL,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            },
          });
        }

        const targetEmail = dbUser.trustedEmail ?? dbUser.email;

        if (dbUser.status !== "ACTIVE" || !dbUser.emailVerified) {
          await createAndEmailVerificationToken(targetEmail);
          return `/auth/verify?email=${encodeURIComponent(targetEmail)}`;
        }

        if (account?.provider && account?.providerAccountId) {
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
          });

          if (!existingAccount) {
            await prisma.account.create({
              data: {
                userId: dbUser.id,
                type: account.type || "oauth",
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            });
          }
        }

        return true;
      } catch (err) {
        console.error("signIn error", err);
        return "/auth/error"; // 보안: false 대신 에러 페이지로
      }
    },

    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as any).role;
        session.user.status = (user as any).status;
        session.user.unverified = !user.emailVerified;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
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
      name: "__Secure-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
      },
    },
  },

  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
});
