import { Role, UserStatus } from "@prisma/client";
declare module "next-auth" {
  interface User {
    id: string;
    role?: Role | null; // Prisma enum 타입으로 변경
    status?: UserStatus | null; // Prisma enum 타입으로 변경
    unverified?: boolean | null;
    trustedEmail?: string | null;
    subscriptionExpiresAt?: string | null;
    name?: string | null;
    userid?: string | null;
    email?: string | null;
    lastProvider?: string | null;
    emailVerified?: Date | null;
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
    role?: Role;
    status?: UserStatus;
    unverified?: boolean;
    subscriptionExpiresAt?: string | null;
    lastProvider?: string | null;
    emailVerified?: Date | null; // ✅ 추가
  }
}
