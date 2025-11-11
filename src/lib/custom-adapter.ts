import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import type { AdapterUser } from "next-auth/adapters";

export function CustomAdapter() {
  const base = PrismaAdapter(prisma);

  return {
    ...base,
    async createUser(user: AdapterUser): Promise<AdapterUser> {
      // 이메일 없으면 가상 이메일 생성
      const email = user.email ?? `${crypto.randomUUID()}@placeholder.local`;

      // Prisma User 모델에 정의된 필드만 넣기
      const created = await prisma.user.create({
        data: {
          email,
          trustedEmail: null,
          name: user.name,
          image: user.image,
          // role, status는 스키마에 기본값(@default) 있으므로 생략 가능
          // emailVerified도 기본적으로 null 가능
        },
      });

      // Prisma 결과를 AdapterUser 형태로 매핑
      return {
        id: created.id,
        email: created.email ?? "",
        emailVerified: created.emailVerified,
        name: created.name,
        image: created.image,
      };
    },
  };
}
