import { Role, UserStatus } from "@prisma/client";
import { DefaultSession } from "next-auth";
declare module "next-auth" {
  interface User {
    id: string;
    role?: Role | null;
    status?: UserStatus | null;
    unverified?: boolean | null;
    trustedEmail?: string | null;
    subscriptionExpiresAt?: Date | null; // ✅ 세션/유저에서는 Date
    name?: string | null;
    email?: string | null;
    lastProvider?: string | null;
    emailVerified?: Date | null; // ✅ 세션/유저에서는 Date
  }
  interface Session {
    user: User & DefaultSession["user"];
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string | null;
    name?: string | null;
    trustedEmail?: string | null;
    role?: Role | null;
    status?: UserStatus | null;
    unverified?: boolean;
    subscriptionExpiresAt?: string | null; // ✅ JWT에는 string (ISO)
    lastProvider?: string | null;
    emailVerified?: string | null; // ✅ JWT에는 string (ISO)
  }
}
