import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 });
  }

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    select: { provider: true, providerAccountId: true },
  });

  return NextResponse.json(accounts);
}
