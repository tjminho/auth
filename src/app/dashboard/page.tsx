// src/app/dashboard/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/auth/signout-button";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  // 예시: 최근 로그인 기록 (세션 테이블에서)
  const recentSessions = await prisma.session.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>내 정보</CardTitle>
          <CardDescription>로그인된 사용자 정보</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            안녕하세요,{" "}
            <span className="font-semibold">
              {session.user.name ?? session.user.email}
            </span>{" "}
            님
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">역할: {session.user.role}</Badge>
            <Badge variant="outline">상태: {session.user.status}</Badge>
          </div>
          <SignOutButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 로그인 기록</CardTitle>
          <CardDescription>마지막 5회 로그인</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          {recentSessions.length === 0 && <p>기록이 없습니다.</p>}
          {recentSessions.map((s) => (
            <div key={s.id}>
              {new Date(s.createdAt).toLocaleString()} — {s.sessionToken.slice(0, 8)}...
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}