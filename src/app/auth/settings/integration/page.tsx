"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type LinkedAccount = {
  provider: string;
  providerAccountId: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
};

export default function IntegrationSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // ✅ 로그인 안 된 경우 접근 차단
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin");
    }
  }, [status, router]);

  // ✅ 연결된 계정 목록 불러오기
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/user/accounts");
      if (res.ok) {
        const data = await res.json();
        setLinkedAccounts(data);
      } else {
        toast.error("계정 목록을 불러오지 못했습니다.");
      }
    } catch (e) {
      console.error("계정 목록 불러오기 실패", e);
      toast.error("서버 오류가 발생했습니다.");
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      fetchAccounts();
    }
  }, [session?.user?.id, fetchAccounts]);

  // ✅ 계정 연결
  async function handleLink(provider: string) {
    setLoadingProvider(provider);
    try {
      await signIn(provider, {
        callbackUrl: "/auth/settings/integration",
      });
    } finally {
      setLoadingProvider(null);
    }
  }

  // ✅ 계정 해제
  async function handleUnlink(provider: string) {
    try {
      const res = await fetch("/api/user/accounts/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (res.ok) {
        toast.success(`${PROVIDER_LABELS[provider]} 계정 연결 해제 완료`);
        await fetchAccounts(); // ✅ 서버 상태와 동기화
      } else {
        toast.error("계정 해제 실패");
      }
    } catch (e) {
      console.error("계정 해제 실패", e);
      toast.error("서버 오류가 발생했습니다.");
    }
  }

  if (status === "loading") {
    return <p className="text-center text-sm text-muted-foreground">로딩 중...</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>소셜 계정 연동</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            현재 계정: {session?.user?.email}
          </p>

          {["google", "kakao", "naver"].map((provider) => {
            const linked = linkedAccounts.some(
              (acc) => acc.provider === provider
            );
            return (
              <div
                key={provider}
                className="flex items-center justify-between border p-2 rounded"
              >
                <span>{PROVIDER_LABELS[provider]}</span>
                {linked ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleUnlink(provider)}
                  >
                    연결 해제
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingProvider === provider}
                    onClick={() => handleLink(provider)}
                  >
                    {loadingProvider === provider ? "연결 중..." : "연결하기"}
                  </Button>
                )}
              </div>
            );
          })}

          {linkedAccounts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              아직 연결된 소셜 계정이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}