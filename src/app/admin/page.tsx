import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const totalUsers = await prisma.user.count();
  const activeUsers = await prisma.user.count({ where: { status: "ACTIVE" } });
  const suspendedUsers = await prisma.user.count({ where: { status: "SUSPENDED" } });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>시스템 통계</CardTitle>
          <CardDescription>전체 사용자 현황</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-6">
          <Stat label="전체 사용자" value={totalUsers} />
          <Stat label="활성" value={activeUsers} />
          <Stat label="정지" value={suspendedUsers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>사용자 관리</CardTitle>
          <CardDescription>최근 가입자 50명</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b pb-2">
              <div>
                <div className="font-medium">{u.name ?? u.email}</div>
                <div className="text-xs text-muted-foreground">
                  가입일: {new Date(u.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={u.status === "ACTIVE" ? "secondary" : "outline"}>
                  {u.status}
                </Badge>
                <form action={`/admin/toggle-status`} method="POST">
                  <input type="hidden" name="userId" value={u.id} />
                  <Button type="submit" size="sm" variant="outline">
                    {u.status === "ACTIVE" ? "정지" : "활성"}
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}