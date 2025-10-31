import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/auth/signout-button";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // ✅ 최근 로그인 기록 API 호출
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/last-oauth`, {
    headers: { Cookie: "" }, // 서버 컴포넌트에서 세션 전달 필요 시 next-auth fetch helper 사용 가능
    cache: "no-store",
  });
  const lastLogin = res.ok ? await res.json() : null;

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

      {/* 서비스 현황 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>서비스 현황</CardTitle>
          <CardDescription>최근 사용량 및 상태</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>
            이번 달 API 호출: <span className="font-semibold">1,245회</span>
          </div>
          <div>
            이번 달 결제 금액: <span className="font-semibold">₩49,000</span>
          </div>
          <div>
            마지막 로그인:{" "}
            {lastLogin?.date
              ? new Date(lastLogin.date).toLocaleString("ko-KR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "기록 없음"}
          </div>
          {lastLogin?.provider && (
            <div>
              로그인 방식: <span className="font-semibold">{lastLogin.provider}</span>
            </div>
          )}
          {lastLogin?.location && (
            <div>
              접속 위치: <span className="font-semibold">{lastLogin.location}</span>
            </div>
          )}
          {lastLogin?.ip && (
            <div>
              IP: <span className="font-semibold">{lastLogin.ip}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}