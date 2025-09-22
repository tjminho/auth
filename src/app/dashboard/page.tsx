import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/auth/signout-button";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 내 정보 카드 */}
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

      {/* 예시 데이터 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>서비스 현황</CardTitle>
          <CardDescription>최근 사용량 및 상태</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>이번 달 API 호출: <span className="font-semibold">1,245회</span></div>
          <div>이번 달 결제 금액: <span className="font-semibold">₩49,000</span></div>
          <div>마지막 로그인: {new Date().toLocaleString()}</div>
        </CardContent>
      </Card>
    </div>
  );
}