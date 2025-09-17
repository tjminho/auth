import NextAuth from "next-auth";
import { Role, UserStatus } from "@prisma/client";
declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    status: UserStatus;
    unverified?: boolean;
  }
  interface Session {
    user?: User;
  }
}
