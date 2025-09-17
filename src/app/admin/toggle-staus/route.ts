// src/app/admin/toggle-status/route.ts
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return new Response("권한 없음", { status: 403 });
  }

  const formData = await req.formData();
  const userId = formData.get("userId") as string;
  if (!userId) return new Response("잘못된 요청", { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return new Response("사용자 없음", { status: 404 });

  const newStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus },
  });

  redirect("/admin");
}
